"use client";

import {
  useCallback,
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

// The token *icon* keeps shrinking at high player counts (visual density,
// not a tap target) — growing it to a 44px floor was tried (issue #82) and
// measured to actually overlap adjacent seats' icons on common phone widths
// at 20 players, since the circle's diameter is capped by viewport width
// while the icon floor isn't. The real tap target is .tokenSummary, the
// <summary> wrapping the icon and name text — that's widened to 44px
// instead (below), leaving the icon's own visual size untouched.
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

// A circle any smaller than this stops reading as "the board" regardless of
// how little viewport is left — better to require a small scroll in that
// extreme case than to shrink the circle into illegibility.
const MIN_BOARD_PX = 320;
// Previous width-only cap (`min(90vw, 40rem)`), kept as a sane ceiling so the
// circle doesn't balloon on a large desktop display once it's no longer
// bottlenecked by viewport height.
const MAX_BOARD_REM = 40;
// Breathing room between the circle's bottom edge and the viewport edge.
const BOARD_BOTTOM_RESERVE_PX = 16;

// The circle previously sized itself from viewport *width* alone
// (`min(90vw, 40rem)`), so on a short landscape viewport it overflowed
// vertically and clipped seats below the fold (issue #78). Fitting it to
// whatever space is actually available in both dimensions keeps the whole
// circle on screen without scrolling, using genuinely spare width instead of
// capping early.
function fitBoardSizePx(
  availableWidthPx: number,
  availableHeightPx: number,
  rootFontSizePx: number,
): number {
  const maxPx = MAX_BOARD_REM * rootFontSizePx;
  return Math.max(MIN_BOARD_PX, Math.min(availableWidthPx, availableHeightPx, maxPx));
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
  const boardRef = useRef<HTMLDivElement | null>(null);
  const boardMeasureCleanupRef = useRef<(() => void) | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const justDraggedRef = useRef<string | null>(null);
  const [hidden, setHidden] = useState(false);

  // A plain `useEffect(() => {...}, [])` would only ever attach to the very
  // first `.board` node — this component's "Info tokens" show mode (below)
  // swaps in a whole different subtree, unmounting and later remounting a
  // *new* `.board` div, and a mount-only effect keeps measuring the old,
  // detached one forever after (getBoundingClientRect on a detached node
  // reads all zeros, locking the circle at MIN_BOARD_PX). A ref callback
  // fires on every attach/detach, so it naturally re-runs against whichever
  // node is actually current.
  const setBoardRef = useCallback((node: HTMLDivElement | null) => {
    boardRef.current = node;
    boardMeasureCleanupRef.current?.();
    boardMeasureCleanupRef.current = null;
    if (!node) return;
    const wrapper = node.parentElement;
    if (!wrapper) return;

    // Root font-size doesn't change over a mount's lifetime (short of a
    // browser zoom/text-size change), so it's read once here rather than on
    // every measurement.
    const rootFontSizePx =
      parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    // The last size actually written to the DOM — skipping a no-op write
    // avoids forcing more layout than necessary and avoids feeding a
    // same-value change back into the ResizeObserver below on every tick.
    let lastSize: number | null = null;

    function measure() {
      const rect = node!.getBoundingClientRect();
      // A mid-scroll resize (iOS Safari's chrome collapsing, iOS overscroll)
      // can read a negative `rect.top`, which would otherwise overstate how
      // much height is left below the board.
      const topPx = Math.max(0, rect.top);
      const availableHeightPx = window.innerHeight - topPx - BOARD_BOTTOM_RESERVE_PX;
      const size = fitBoardSizePx(wrapper!.clientWidth, availableHeightPx, rootFontSizePx);
      if (size === lastSize) return;
      lastSize = size;
      node!.style.width = `${size}px`;
      node!.style.height = `${size}px`;
    }

    measure();
    window.addEventListener("resize", measure);
    // `wrapper` alone catches its own box changing size (the containing
    // column narrowing/widening) but not the board's top offset shifting
    // because something rendered *above* it grew without resizing wrapper
    // itself (the toolbar wrapping to a second row, a banner appearing) —
    // and document.body alone catches top-offset shifts but can miss a
    // column-width-only change that doesn't alter body's own box. Observing
    // both covers each other's blind spot.
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      observer.observe(wrapper);
      observer.observe(document.body);
    }
    boardMeasureCleanupRef.current = () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, []);

  // "Script's characters first, then everything in the dataset" (issue #15
  // AC) — the script pool is whatever's already resolvable on this board.
  const scriptPool = useMemo(
    () => [...characterById.values()],
    [characterById],
  );
  // Restricted the same way as the mid-game "Add character" flow: Fabled/
  // Loric are never held by a player (they get their own Fabled slot below),
  // and a Traveller's alignment is a separate explicit field a plain swap
  // can't set — swapping a non-traveller seat to one would leave
  // isTraveller/travellerAlignment stale and the export unable to derive an
  // alignment.
  const swapOptions = useMemo(
    () =>
      groupByTeam(
        characterPickerPool(scriptPool).filter((c) =>
          SEAT_HOLDING_TEAMS.includes(c.team),
        ),
      ),
    [scriptPool],
  );
  // A Traveller's own seat swaps within the traveller team instead —
  // isTraveller/travellerAlignment are already set and untouched by a plain
  // swap, so offering another traveller-team character here is safe (unlike
  // the non-traveller list above) and is what lets this select actually
  // show the player's current character as its initial value (issue #70).
  const travellerSwapOptions = useMemo(
    () => groupByTeam(characterPickerPool(scriptPool, "traveller")),
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
  // Which single seat/reminder popover is open, if any — native <details>
  // has no built-in notion of "only one of these," so this is the one
  // source of truth every menu's `open` prop is derived from (issue #70:
  // opening one must close any other, and a tap outside must close it too).
  const [openMenu, setOpenMenu] = useState<{ kind: TokenKind; id: string } | null>(
    null,
  );
  const openMenuElRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    if (!openMenu) return;
    function handlePointerDownOutside(event: PointerEvent) {
      // A pad-level overlay (reminder picker, info token library) can be
      // opened from inside a seat's own menu — e.g. its "Add reminder"
      // button — and renders outside that seat's <details>. Without this
      // guard, the very first tap inside that overlay reads as "outside"
      // the seat menu and closes it as a surprising side effect, even
      // though the storyteller never left that seat's workflow.
      if (activeOverlay) return;
      const target = event.target as Node | null;
      if (openMenuElRef.current && target && openMenuElRef.current.contains(target)) {
        return;
      }
      openMenuElRef.current = null;
      setOpenMenu(null);
    }
    document.addEventListener("pointerdown", handlePointerDownOutside);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDownOutside);
  }, [openMenu, activeOverlay]);

  function handleMenuToggle(
    kind: TokenKind,
    id: string,
    event: React.SyntheticEvent<HTMLDetailsElement>,
  ) {
    const details = event.currentTarget;
    if (details.open) {
      openMenuElRef.current = details;
      setOpenMenu({ kind, id });
    } else if (openMenu?.kind === kind && openMenu.id === id) {
      openMenuElRef.current = null;
      setOpenMenu(null);
    }
  }
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
    // While a reminder is armed for tap-to-place, a seat tap must always
    // land as a clean click — never a drag — so ordinary finger jitter past
    // the drag threshold can't get read as "reposition this seat" and
    // silently swallow the attach (code review finding). Placement is a
    // single quick tap; there's no legitimate reason to reposition a seat
    // in the middle of it.
    if (placingReminderId && kind === "player") return;
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
  // unsaved coordinate once the board is shown again. Hiding (or showing
  // the info token library) unmounts every seat's <details>, so an open
  // menu's `openMenu` state must go with it too — otherwise a keyboard
  // activation of these controls (which fires no pointerdown, so the
  // outside-tap-close effect never runs) leaves it stale, and the next
  // mount reopens the same seat's menu unprompted (issue #70 code review).
  function cancelActiveDrag() {
    dragRef.current = null;
    setLiveDrag(null);
    openMenuElRef.current = null;
    setOpenMenu(null);
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
        ref={setBoardRef}
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
            const swapOptionsForPlayer = player.isTraveller
              ? travellerSwapOptions
              : swapOptions;
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
                <details
                  className={styles.menu}
                  open={openMenu?.kind === "player" && openMenu.id === player.id}
                  onToggle={(event) => handleMenuToggle("player", player.id, event)}
                >
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
                      {/* Always mounted (not conditional on player.dead) so
                          the CSS opacity transition it drives plays both
                          ways — draping over on death, fading off on a
                          revive — instead of only ever popping in. Its
                          visibility keys off the ancestor summary's own
                          data-dead (above) rather than repeating that state
                          on a second attribute here. */}
                      <span className={styles.shroud} aria-hidden="true" />
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
                      <span className={styles.note}>Nominator</span>
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

                    <button
                      type="button"
                      className={styles.markDead}
                      onClick={() => onToggleDead(player.id)}
                    >
                      {player.dead ? "Mark alive" : "Mark dead"}
                    </button>

                    <label
                      className={styles.field}
                      htmlFor={`swap-character-${player.id}`}
                    >
                      Swap character
                      <select
                        id={`swap-character-${player.id}`}
                        className={styles.select}
                        value={player.characterId ?? ""}
                        onChange={(event) =>
                          onSwapCharacter(player.id, event.target.value)
                        }
                      >
                        {swapOptionsForPlayer.map((group) => (
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
                        className={styles.claimSelect}
                        value={player.claim ?? ""}
                        onChange={(event) =>
                          onSetClaim(player.id, event.target.value || null)
                        }
                      >
                        <option value="">No claim</option>
                        {/* A claim recorded before the script last changed can
                            reference a character no longer in claimOptions —
                            keep it selectable/visible by id rather than
                            silently resetting the row to "No claim". */}
                        {player.claim && !claimById.has(player.claim) && (
                          <option value={player.claim}>{player.claim}</option>
                        )}
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
                        <summary className={styles.detailSummary}>
                          Character detail
                        </summary>
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
                <details
                  className={styles.menu}
                  open={openMenu?.kind === "reminder" && openMenu.id === reminder.id}
                  onToggle={(event) => handleMenuToggle("reminder", reminder.id, event)}
                >
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
