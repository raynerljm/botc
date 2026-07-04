"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { isOfficialCharacter, wikiUrl, type Character } from "@/lib/characters";
import {
  circlePosition,
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
  almanacUrl?: string | null;
  reminders?: ReminderToken[];
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
  }) => void;
  onMoveReminder: (reminderId: string, position: PlayerPosition) => void;
  onRemoveReminder: (reminderId: string) => void;
  onRestoreReminder: (reminder: ReminderToken) => void;
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

// Keeps a dragged token's centre within the pad instead of off the edge.
function clampPct(value: number): number {
  return Math.min(96, Math.max(4, value));
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

// A reminder dropped from a player's token menu starts parked just beside
// them rather than at the pad's generic default — this is what "the
// storyteller parks it next to players" means for a freshly-added token.
function reminderDropPosition(base: PlayerPosition | null): PlayerPosition {
  if (!base) return { x: 50, y: 50 };
  return { x: clampPct(base.x + 5), y: clampPct(base.y) };
}

export function GrimoireBoard({
  players,
  characterById,
  almanacUrl,
  reminders = [],
  onRename,
  onMove,
  onReCircle,
  onReorderSeat,
  onToggleDead,
  onToggleGhostVote,
  onAddReminder,
  onMoveReminder,
  onRemoveReminder,
  onRestoreReminder,
}: GrimoireBoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const justDraggedRef = useRef<string | null>(null);
  const [hidden, setHidden] = useState(false);
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
  // null = closed; { base: null } = opened from the pad (generic default
  // position); { base: <player position> } = opened from a token's menu.
  const [picker, setPicker] = useState<{ base: PlayerPosition | null } | null>(
    null,
  );
  const [removedReminder, setRemovedReminder] = useState<ReminderToken | null>(
    null,
  );
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [infoTokenLibraryOpen, setInfoTokenLibraryOpen] = useState(false);
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
  const inPlayCharacterIds = useMemo(
    () =>
      new Set(
        players
          .map((p) => p.characterId)
          .filter((id): id is string => id !== null),
      ),
    [players],
  );

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
  // also pop the menu open.
  function handleSummaryClick(
    event: React.MouseEvent<HTMLElement>,
    kind: TokenKind,
    id: string,
  ) {
    if (justDraggedRef.current === `${kind}:${id}`) {
      event.preventDefault();
      justDraggedRef.current = null;
    }
  }

  function handleAddReminder(input: { characterId: string | null; label: string }) {
    onAddReminder({ ...input, position: reminderDropPosition(picker?.base ?? null) });
    setPicker(null);
  }

  function handleRemoveReminder(reminder: ReminderToken) {
    onRemoveReminder(reminder.id);
    setRemovedReminder(reminder);
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
            // A picker already open holds a player's position captured at
            // open time — re-circling can move that player, so the stale
            // parked position has to be discarded along with the drag.
            setPicker(null);
            setInfoTokenLibraryOpen(false);
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
              setPicker(null);
              setInfoTokenLibraryOpen(false);
              setHidden(true);
            }}
          >
            Hide grimoire
          </button>
        )}
        {!hidden && !picker && !infoTokenLibraryOpen && (
          <button type="button" onClick={() => setPicker({ base: null })}>
            Add reminder
          </button>
        )}
        {!hidden && !picker && !infoTokenLibraryOpen && (
          <button type="button" onClick={() => setInfoTokenLibraryOpen(true)}>
            Info tokens
          </button>
        )}
      </div>

      {!hidden && picker && (
        <ReminderPicker
          characterById={characterById}
          inPlayCharacterIds={inPlayCharacterIds}
          onAdd={handleAddReminder}
          onCancel={() => setPicker(null)}
        />
      )}

      {!hidden && infoTokenLibraryOpen && (
        <InfoTokenLibrary
          characterById={characterById}
          onShow={(input) => {
            setInfoTokenShowing(input);
            setInfoTokenLibraryOpen(false);
          }}
          onCancel={() => setInfoTokenLibraryOpen(false)}
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
            const position =
              liveDrag?.kind === "player" && liveDrag.id === player.id
                ? liveDrag.position
                : (player.position ?? circlePosition(index, total));
            const official = character ? isOfficialCharacter(character) : false;

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
                    {player.isDrunk && (
                      <span className={styles.note}>(actually the Drunk)</span>
                    )}
                    {player.isTraveller && (
                      <span className={styles.note}>{player.travellerAlignment}</span>
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

                    {!picker && !infoTokenLibraryOpen && (
                      <button
                        type="button"
                        onClick={() => setPicker({ base: position })}
                      >
                        Add reminder
                      </button>
                    )}

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
            const position =
              liveDrag?.kind === "reminder" && liveDrag.id === reminder.id
                ? liveDrag.position
                : reminder.position;

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
    </div>
  );
}
