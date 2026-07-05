"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  characterPickerPool,
  getCharacter,
  groupByTeam,
  isOfficialCharacter,
  SEAT_HOLDING_TEAMS,
  teamNames,
  wikiUrl,
  type Character,
} from "@/lib/characters";
import {
  anchoredReminderPosition,
  circlePosition,
  clampPct,
  DRUNK_ID,
  heldCharacterIds,
  nextPadReminderPosition,
  parkBeside,
  type Player,
  type PlayerPosition,
  type ReminderToken,
} from "@/lib/gameDocument";
import { isHttpUrl } from "@/lib/scriptParser";

import { CharacterToken } from "./CharacterToken";
import { InfoTokenLibrary } from "./InfoTokenLibrary";
import { InfoTokenShowMode } from "./InfoTokenShowMode";
import { ReminderChip } from "./ReminderChip";
import { ReminderPicker } from "./ReminderPicker";
import styles from "./GrimoireBoard.module.css";

export interface GrimoireBoardProps {
  players: Player[];
  characterById: Map<string, Character>;
  // The script's full character list, offered as claim options — a claim
  // isn't limited to in-play characters (CONTEXT.md: Claim).
  claimOptions: Character[];
  almanacUrl?: string | null;
  reminders?: ReminderToken[];
  activeFabled: string[];
  nominatorTodayIds?: ReadonlySet<string>;
  nomineeTodayIds?: ReadonlySet<string>;
  onRename: (playerId: string, name: string) => void;
  onMove: (playerId: string, position: PlayerPosition) => void;
  onReCircle: () => void;
  onReorderSeat: (playerId: string, direction: "earlier" | "later") => void;
  onToggleDead: (playerId: string) => void;
  onToggleGhostVote: (playerId: string) => void;
  onAddReminder: (input: {
    characterId: string | null;
    label: string;
    position: PlayerPosition;
    anchorPlayerId: string | null;
  }) => void;
  onMoveReminder: (reminderId: string, position: PlayerPosition) => void;
  onAttachReminder: (reminderId: string, playerId: string) => void;
  onRemoveReminder: (reminderId: string) => void;
  onRestoreReminder: (reminder: ReminderToken) => void;
  onSwapCharacter: (playerId: string, characterId: string) => void;
  onRemovePlayer: (playerId: string) => void;
  onRevealDrunk: (playerId: string) => void;
  onRemoveFabled: (characterId: string) => void;
  onSetClaim: (playerId: string, characterId: string | null) => void;
  onSetActsAs: (playerId: string, characterId: string | null) => void;
  // Reopens the post-draw setup walkthrough (issue #26). Omitted entirely
  // when there's nothing for it to show, so no button renders.
  onOpenSetupWalkthrough?: () => void;
}

const MIN_TOKEN_REM = 1.9;
const MAX_TOKEN_REM = 3.4;
const MIN_TOKEN_COUNT = 5;
const MAX_TOKEN_COUNT = 20;

// Interpolates token size down as the pad gets busier, so 20 tokens don't
// overlap and 5 tokens aren't lost in all that space.
function tokenSizeRem(total: number): number {
  const clamped = Math.min(MAX_TOKEN_COUNT, Math.max(MIN_TOKEN_COUNT, total));
  const t = (clamped - MIN_TOKEN_COUNT) / (MAX_TOKEN_COUNT - MIN_TOKEN_COUNT);
  return MAX_TOKEN_REM - t * (MAX_TOKEN_REM - MIN_TOKEN_REM);
}

// A real finger drag always moves a few pixels before settling — without a
// threshold, every tap-to-open-the-menu would also fire a (near-zero) move.
const DRAG_THRESHOLD_PX = 6;

type TokenKind = "player" | "reminder";

interface DragState {
  kind: TokenKind;
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  dragged: boolean;
  boardRect: DOMRect;
  lastPosition: PlayerPosition;
}


export function GrimoireBoard({
  players,
  characterById,
  claimOptions,
  almanacUrl,
  reminders = [],
  activeFabled,
  nominatorTodayIds,
  nomineeTodayIds,
  onRename,
  onMove,
  onReCircle,
  onReorderSeat,
  onToggleDead,
  onToggleGhostVote,
  onAddReminder,
  onMoveReminder,
  onAttachReminder,
  onRemoveReminder,
  onRestoreReminder,
  onSwapCharacter,
  onRemovePlayer,
  onRevealDrunk,
  onRemoveFabled,
  onSetClaim,
  onSetActsAs,
  onOpenSetupWalkthrough,
}: GrimoireBoardProps) {
  const claimById = useMemo(
    () => new Map(claimOptions.map((c) => [c.id, c] as const)),
    [claimOptions],
  );
  // Every player's menu offers the identical grouped list — computed once
  // per board render rather than once per token.
  const claimGroups = useMemo(() => groupByTeam(claimOptions), [claimOptions]);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const justDraggedRef = useRef<string | null>(null);
  const [hidden, setHidden] = useState(false);

  // "Script's characters first, then everything in the dataset" (issue #15
  // AC) — the script pool is whatever's already resolvable on this board.
  const scriptPool = useMemo(
    () => [...characterById.values()],
    [characterById],
  );
  // Restricted the same way as the mid-game "Add character" flow: Fabled/
  // Loric are never held by a player (they get their own Fabled slot below),
  // and a Traveller's alignment is a separate explicit field a plain swap
  // can't set — swapping one in here would leave isTraveller/
  // travellerAlignment stale and the export unable to derive an alignment.
  // Correcting a traveller's character goes through remove-and-re-add
  // instead, which sets both properly.
  const swapOptions = useMemo(
    () =>
      groupByTeam(
        characterPickerPool(scriptPool).filter((c) =>
          SEAT_HOLDING_TEAMS.includes(c.team),
        ),
      ),
    [scriptPool],
  );
  // The dragged token's position while a gesture is in progress — updated
  // every pointermove for smooth visual feedback, but never persisted until
  // the drag ends (see handlePointerUp). Persisting per pointermove would
  // mean dozens of full-document localStorage writes a second on a real
  // touch drag, which is the opposite of "must feel good on an iPad."
  const [liveDrag, setLiveDrag] = useState<{
    kind: TokenKind;
    id: string;
    position: PlayerPosition;
  } | null>(null);
  // Only one pad-level picker can be open at a time — a single tagged state
  // makes that exclusion automatic everywhere instead of needing every call
  // site to separately clear every other picker's own boolean.
  // "reminder": { base: null, playerId: null } opened from the pad (generic
  // default position); { base: <player position>, playerId } opened from a
  // token's menu, anchoring the new reminder to that seat.
  const [activeOverlay, setActiveOverlay] = useState<
    | { type: "reminder"; base: PlayerPosition | null; playerId: string | null }
    | { type: "infoTokens" }
    | null
  >(null);
  const reminderPicker =
    activeOverlay?.type === "reminder" ? activeOverlay : null;
  const infoTokenLibraryOpen = activeOverlay?.type === "infoTokens";
  // Set while the storyteller is attaching a just-picked-or-existing
  // reminder to a seat by tapping it (issue #71 AC: "a reminder can be
  // attached to a seat without a drag gesture") — the next tap on any
  // seat's token completes the attach instead of opening that seat's own
  // menu; a banner offers Cancel in the meantime.
  const [placingReminderId, setPlacingReminderId] = useState<string | null>(
    null,
  );
  const [removedReminder, setRemovedReminder] = useState<ReminderToken | null>(
    null,
  );
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [infoTokenShowing, setInfoTokenShowing] = useState<{
    text: string;
    characterIds: string[];
  } | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    };
  }, []);

  const sorted = useMemo(
    () => [...players].sort((a, b) => a.seat - b.seat),
    [players],
  );
  const total = sorted.length;
  const tokenSize = tokenSizeRem(total);
  const inPlayCharacterIds = useMemo(() => heldCharacterIds(players), [players]);
  // Every seat's rendered position, computed once per render and shared by
  // both the player-token loop and anchored-reminder placement below — an
  // anchored reminder needs the exact same live position (including any
  // in-progress drag preview) its seat is rendering at, not a second,
  // possibly-stale computation of its own.
  // Narrowed to only the player-drag preview (not the raw `liveDrag`, which
  // gets a new object identity every pointermove of *any* drag, reminders
  // included) so dragging a reminder doesn't force a full seat-position
  // Map rebuild every frame for positions that haven't actually changed.
  const livePlayerDrag = liveDrag?.kind === "player" ? liveDrag : null;
  const positionByPlayerId = useMemo(() => {
    const map = new Map<string, PlayerPosition>();
    sorted.forEach((player, index) => {
      map.set(
        player.id,
        livePlayerDrag?.id === player.id
          ? livePlayerDrag.position
          : (player.position ?? circlePosition(index, total)),
      );
    });
    return map;
  }, [sorted, total, livePlayerDrag]);
  // Stable per-seat stack order of the reminders anchored to it, so several
  // reminders on one seat stack in a consistent order instead of jittering
  // as other unrelated reminders are added/removed elsewhere on the board.
  // Keyed by reminder id and storing the index directly (rather than a
  // per-seat array the render loop would have to .indexOf() into) keeps the
  // per-reminder lookup below O(1) instead of O(reminders on that seat).
  const reminderStackIndexById = useMemo(() => {
    const nextIndexByPlayerId = new Map<string, number>();
    const map = new Map<string, number>();
    for (const reminder of reminders) {
      if (!reminder.anchorPlayerId) continue;
      const index = nextIndexByPlayerId.get(reminder.anchorPlayerId) ?? 0;
      map.set(reminder.id, index);
      nextIndexByPlayerId.set(reminder.anchorPlayerId, index + 1);
    }
    return map;
  }, [reminders]);

  function handlePointerDown(
    event: ReactPointerEvent<HTMLElement>,
    kind: TokenKind,
    id: string,
  ) {
    const board = boardRef.current;
    if (!board) return;
    // A second pointer touching any token (even the same one already being
    // dragged) must not clobber the gesture in progress — its own
    // pointerup/pointermove would then fail the pointerId check below and
    // the first drag would never resolve.
    if (dragRef.current) return;
    dragRef.current = {
      kind,
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragged: false,
      // Captured once per gesture — the board doesn't reflow mid-drag, so
      // re-querying layout on every pointermove is wasted work.
      boardRect: board.getBoundingClientRect(),
      lastPosition: { x: 0, y: 0 },
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    drag.dragged = true;

    const { boardRect } = drag;
    const position = {
      x: clampPct(((event.clientX - boardRect.left) / boardRect.width) * 100),
      y: clampPct(((event.clientY - boardRect.top) / boardRect.height) * 100),
    };
    drag.lastPosition = position;
    // Local state only, for smooth visual feedback — the game document is
    // written once, in handlePointerUp, not on every frame of the drag.
    setLiveDrag({ kind: drag.kind, id: drag.id, position });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.dragged) {
      justDraggedRef.current = `${drag.kind}:${drag.id}`;
      if (drag.kind === "player") onMove(drag.id, drag.lastPosition);
      else onMoveReminder(drag.id, drag.lastPosition);
      // Manually dragging the very reminder armed for tap-to-place is the
      // storyteller changing their mind about how to position it — leaving
      // placement armed would make the very next seat tap silently re-attach
      // it somewhere else (code review finding).
      if (drag.kind === "reminder" && placingReminderId === drag.id) {
        setPlacingReminderId(null);
      }
    }
    dragRef.current = null;
    setLiveDrag(null);
  }

  function handlePointerCancel(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setLiveDrag(null);
  }

  // <summary> toggles open on click by default — after an actual drag, that
  // click still fires, so it has to be swallowed once or every drag would
  // also pop the menu open. While a reminder is being placed (tap-to-place),
  // a tap on a seat attaches it there instead of opening that seat's menu.
  // These two are mutually exclusive: a click that's the tail end of a real
  // drag must never also be read as a placement tap, or repositioning an
  // unrelated seat while a reminder is armed for placement would silently
  // attach it to whatever seat was just dragged (code review finding).
  function handleSummaryClick(
    event: React.MouseEvent<HTMLElement>,
    kind: TokenKind,
    id: string,
  ) {
    if (justDraggedRef.current === `${kind}:${id}`) {
      event.preventDefault();
      justDraggedRef.current = null;
      return;
    }
    if (placingReminderId && kind === "player") {
      event.preventDefault();
      onAttachReminder(placingReminderId, id);
      setPlacingReminderId(null);
    }
  }

  function handleAddReminder(input: { characterId: string | null; label: string }) {
    const base = reminderPicker?.base ?? null;
    const anchorPlayerId = reminderPicker?.playerId ?? null;
    const position = base
      ? parkBeside(base)
      : nextPadReminderPosition(
          reminders.filter((r) => r.anchorPlayerId === null).map((r) => r.position),
        );
    onAddReminder({ ...input, position, anchorPlayerId });
    setActiveOverlay(null);
  }

  function handleRemoveReminder(reminder: ReminderToken) {
    onRemoveReminder(reminder.id);
    setRemovedReminder(reminder);
    // A reminder removed while it's the one armed for tap-to-place must also
    // clear that placement state — otherwise the "Tap a seat to attach"
    // banner keeps showing and the next seat tap silently no-ops against a
    // reminder id that no longer exists (code review finding).
    if (placingReminderId === reminder.id) setPlacingReminderId(null);
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    undoTimeoutRef.current = setTimeout(() => setRemovedReminder(null), 6000);
  }

  function handleUndoRemove() {
    if (!removedReminder) return;
    onRestoreReminder(removedReminder);
    setRemovedReminder(null);
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
  }

  // Re-circling or hiding the board while a drag is still in progress must
  // discard that in-progress gesture — otherwise its stale local position
  // either overrides the freshly re-circled layout, or resurfaces at an
  // unsaved coordinate once the board is shown again.
  function cancelActiveDrag() {
    dragRef.current = null;
    setLiveDrag(null);
  }

  // Full-screen show mode replaces the board outright rather than layering
  // on top of it — a fixed overlay alone would still leave player names and
  // controls mounted (and tab-reachable) underneath, which is exactly the
  // leak issue #19 rules out.
  if (infoTokenShowing) {
    return (
      <InfoTokenShowMode
        text={infoTokenShowing.text}
        characters={infoTokenShowing.characterIds
          .map((id) => characterById.get(id))
          .filter((character): character is Character => character !== undefined)}
        onClose={() => setInfoTokenShowing(null)}
      />
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.controls} data-controls>
        <button
          type="button"
          onClick={() => {
            cancelActiveDrag();
            // An overlay already open holds a player's position captured at
            // open time — re-circling can move that player, so the stale
            // parked position has to be discarded along with the drag.
            setActiveOverlay(null);
            setPlacingReminderId(null);
            onReCircle();
          }}
        >
          Re-circle
        </button>
        {!hidden && (
          <button
            type="button"
            onClick={() => {
              cancelActiveDrag();
              setActiveOverlay(null);
              setPlacingReminderId(null);
              setHidden(true);
            }}
          >
            Hide grimoire
          </button>
        )}
        {!hidden && !activeOverlay && !placingReminderId && (
          <button
            type="button"
            onClick={() =>
              setActiveOverlay({ type: "reminder", base: null, playerId: null })
            }
          >
            Add reminder
          </button>
        )}
        {!hidden && !activeOverlay && !placingReminderId && (
          <button
            type="button"
            onClick={() => setActiveOverlay({ type: "infoTokens" })}
          >
            Info tokens
          </button>
        )}
        {!hidden && !activeOverlay && !placingReminderId && onOpenSetupWalkthrough && (
          <button type="button" onClick={onOpenSetupWalkthrough}>
            Setup walkthrough
          </button>
        )}
      </div>

      {!hidden && placingReminderId && (
        <div className={styles.placingBanner} role="status">
          <span>Tap a seat to attach this reminder</span>
          <button type="button" onClick={() => setPlacingReminderId(null)}>
            Cancel
          </button>
        </div>
      )}

      {!hidden && reminderPicker && (
        <ReminderPicker
          characterById={characterById}
          inPlayCharacterIds={inPlayCharacterIds}
          onAdd={handleAddReminder}
          onCancel={() => setActiveOverlay(null)}
        />
      )}

      {!hidden && infoTokenLibraryOpen && (
        <InfoTokenLibrary
          characterById={characterById}
          onShow={(input) => {
            // Show mode replaces the whole board (see the early return
            // above), so a drag left active here would keep its pointerId
            // captured against a token that's about to unmount — no
            // pointerup could ever reach it, permanently blocking every
            // future drag. Same cleanup Re-circle/Hide grimoire do before
            // their own layout-discarding actions.
            cancelActiveDrag();
            setInfoTokenShowing(input);
            setActiveOverlay(null);
            setPlacingReminderId(null);
          }}
          onCancel={() => setActiveOverlay(null)}
        />
      )}

      {!hidden && removedReminder && (
        <div className={styles.undoBanner}>
          <span>Removed &ldquo;{removedReminder.label}&rdquo;</span>
          <button type="button" onClick={handleUndoRemove}>
            Undo
          </button>
        </div>
      )}

      <div
        ref={boardRef}
        className={styles.board}
        data-board
        data-hidden={hidden}
        style={{ "--token-size": `${tokenSize}rem` } as React.CSSProperties}
      >
        {!hidden &&
          sorted.map((player, index) => {
            const character = player.characterId
              ? characterById.get(player.characterId)
              : undefined;
            const position = positionByPlayerId.get(player.id)!;
            const official = character ? isOfficialCharacter(character) : false;
            // True only while the player is still wearing the stand-in's
            // identity — once swapped to any other character (including a
            // reveal to "drunk" itself), there's nothing left to disguise.
            const isHiddenDrunk = player.isDrunk && character?.id !== DRUNK_ID;

            return (
              <div
                key={player.id}
                className={styles.tokenWrap}
                data-player-id={player.id}
                style={{ left: `${position.x}%`, top: `${position.y}%` }}
              >
                <details className={styles.menu}>
                  <summary
                    className={styles.tokenSummary}
                    data-dead={player.dead || undefined}
                    onPointerDown={(event) =>
                      handlePointerDown(event, "player", player.id)
                    }
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerCancel}
                    onClick={(event) => handleSummaryClick(event, "player", player.id)}
                    // The character art is an <img>, which browsers make
                    // natively draggable — without this, the OS's own
                    // drag-and-drop takes over after the first pointermove
                    // and no further pointer events reach this handler.
                    onDragStart={(event) => event.preventDefault()}
                  >
                    <span className={styles.tokenVisual}>
                      {character && <CharacterToken character={character} />}
                      {player.dead && (
                        <span className={styles.shroud} aria-hidden="true" />
                      )}
                    </span>
                    {character && (
                      <span className={styles.characterName}>{character.name}</span>
                    )}
                    <span className={styles.playerName}>
                      {player.name}
                      {player.dead && (
                        <span className={styles.srOnly}> (dead)</span>
                      )}
                    </span>
                    {isHiddenDrunk && (
                      <span className={styles.note}>(actually the Drunk)</span>
                    )}
                    {player.isTraveller && (
                      <span className={styles.note}>{player.travellerAlignment}</span>
                    )}
                    {player.claim && (
                      <span className={styles.claimBadge}>
                        Claims {claimById.get(player.claim)?.name ?? player.claim}
                      </span>
                    )}
                    {player.actsAs && (
                      <span className={styles.claimBadge}>
                        Acts as {claimById.get(player.actsAs)?.name ?? player.actsAs}
                      </span>
                    )}
                    {nominatorTodayIds?.has(player.id) && (
                      <span className={styles.note}>Nominated</span>
                    )}
                    {nomineeTodayIds?.has(player.id) && (
                      <span className={styles.note}>Nominee</span>
                    )}
                  </summary>

                  <div className={styles.menuBody}>
                    <label className={styles.field} htmlFor={`token-name-${player.id}`}>
                      <span className={styles.srOnly}>Seat {player.seat} </span>
                      Player name
                      <input
                        id={`token-name-${player.id}`}
                        type="text"
                        value={player.name}
                        onChange={(event) => onRename(player.id, event.target.value)}
                      />
                    </label>

                    <button type="button" onClick={() => onToggleDead(player.id)}>
                      {player.dead ? "Mark alive" : "Mark dead"}
                    </button>

                    <label
                      className={styles.field}
                      htmlFor={`swap-character-${player.id}`}
                    >
                      Swap character
                      <select
                        id={`swap-character-${player.id}`}
                        value={player.characterId ?? ""}
                        onChange={(event) =>
                          onSwapCharacter(player.id, event.target.value)
                        }
                      >
                        {swapOptions.map((group) => (
                          <optgroup key={group.team} label={teamNames[group.team]}>
                            {group.characters.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </label>

                    {isHiddenDrunk && (
                      <button
                        type="button"
                        onClick={() => onRevealDrunk(player.id)}
                      >
                        Reveal Drunk
                      </button>
                    )}

                    <button type="button" onClick={() => onRemovePlayer(player.id)}>
                      Remove player
                    </button>

                    {!activeOverlay && !placingReminderId && (
                      <button
                        type="button"
                        onClick={() =>
                          setActiveOverlay({
                            type: "reminder",
                            base: position,
                            playerId: player.id,
                          })
                        }
                      >
                        Add reminder
                      </button>
                    )}

                    <label className={styles.field} htmlFor={`token-claim-${player.id}`}>
                      Claim
                      <select
                        id={`token-claim-${player.id}`}
                        value={player.claim ?? ""}
                        onChange={(event) =>
                          onSetClaim(player.id, event.target.value || null)
                        }
                      >
                        <option value="">No claim</option>
                        {claimGroups.map((group) => (
                          <optgroup key={group.team} label={teamNames[group.team]}>
                            {group.characters.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </label>

                    <label
                      className={styles.field}
                      htmlFor={`token-acts-as-${player.id}`}
                    >
                      Acts as
                      <select
                        id={`token-acts-as-${player.id}`}
                        value={player.actsAs ?? ""}
                        onChange={(event) =>
                          onSetActsAs(player.id, event.target.value || null)
                        }
                      >
                        <option value="">Not acting as anyone</option>
                        {claimGroups.map((group) => (
                          <optgroup key={group.team} label={teamNames[group.team]}>
                            {group.characters.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </label>

                    <div className={styles.seatControls}>
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => onReorderSeat(player.id, "earlier")}
                      >
                        Move seat earlier
                      </button>
                      <button
                        type="button"
                        disabled={index === total - 1}
                        onClick={() => onReorderSeat(player.id, "later")}
                      >
                        Move seat later
                      </button>
                    </div>

                    {character && (
                      <details className={styles.detail}>
                        <summary>Character detail</summary>
                        <p>{character.ability}</p>
                        {official ? (
                          <a
                            href={wikiUrl(character)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Official wiki page
                          </a>
                        ) : (
                          almanacUrl && isHttpUrl(almanacUrl) && (
                            <a href={almanacUrl} target="_blank" rel="noreferrer">
                              Script almanac
                            </a>
                          )
                        )}
                      </details>
                    )}
                  </div>
                </details>

                {player.dead && (
                  <button
                    type="button"
                    className={styles.ghostVote}
                    aria-pressed={player.ghostVoteSpent}
                    onClick={() => onToggleGhostVote(player.id)}
                  >
                    Ghost vote: {player.ghostVoteSpent ? "spent" : "available"}
                  </button>
                )}
              </div>
            );
          })}

        {!hidden &&
          reminders.map((reminder) => {
            const character = reminder.characterId
              ? characterById.get(reminder.characterId)
              : undefined;
            // Anchored (parked beside a still-present seat) reminders track
            // that seat's live position every render — including mid-drag —
            // rather than the last position stored on the reminder itself,
            // so they read as physically attached to it (issue #71). A
            // reminder whose anchor was removed, or that was never anchored
            // (dragged free, or added generically from the pad), falls back
            // to its own stored position.
            const anchorSeatPosition = reminder.anchorPlayerId
              ? positionByPlayerId.get(reminder.anchorPlayerId)
              : undefined;
            const siblingIndex = reminderStackIndexById.get(reminder.id) ?? 0;
            const restingPosition = anchorSeatPosition
              ? anchoredReminderPosition(anchorSeatPosition, siblingIndex)
              : reminder.position;
            const position =
              liveDrag?.kind === "reminder" && liveDrag.id === reminder.id
                ? liveDrag.position
                : restingPosition;

            return (
              <div
                key={reminder.id}
                className={styles.reminderWrap}
                data-reminder-id={reminder.id}
                style={{ left: `${position.x}%`, top: `${position.y}%` }}
              >
                <details className={styles.menu}>
                  <summary
                    className={styles.tokenSummary}
                    onPointerDown={(event) =>
                      handlePointerDown(event, "reminder", reminder.id)
                    }
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerCancel}
                    onClick={(event) =>
                      handleSummaryClick(event, "reminder", reminder.id)
                    }
                    onDragStart={(event) => event.preventDefault()}
                  >
                    <ReminderChip character={character} label={reminder.label} />
                  </summary>

                  <div className={styles.menuBody}>
                    {!placingReminderId && (
                      <button
                        type="button"
                        onClick={() => {
                          cancelActiveDrag();
                          setActiveOverlay(null);
                          setPlacingReminderId(reminder.id);
                        }}
                      >
                        Attach to seat
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveReminder(reminder)}
                    >
                      Remove reminder
                    </button>
                  </div>
                </details>
              </div>
            );
          })}

        {hidden && (
          <div className={styles.hiddenOverlay}>
            <button type="button" onClick={() => setHidden(false)}>
              Show grimoire
            </button>
          </div>
        )}
      </div>

      {/* Fabled are storyteller aids, not held by any player, so they render
          outside the circle rather than as a token on it (issue #15). */}
      {!hidden && (
        <div className={styles.fabledRow} role="region" aria-label="Fabled">
          {activeFabled.map((id) => {
            // A script rarely lists its own Fabled, so fall back to the
            // vendored dataset when the id isn't already in characterById.
            const character = characterById.get(id) ?? getCharacter(id);
            if (!character) return null;
            return (
              <div key={id} className={styles.fabledToken}>
                <CharacterToken character={character} />
                <span>{character.name}</span>
                <button type="button" onClick={() => onRemoveFabled(id)}>
                  Remove {character.name}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
