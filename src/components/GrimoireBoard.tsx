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
  ACTS_AS_ALLOWED_TEAMS,
  ACTS_AS_CAPABLE_IDS,
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
  LUNATIC_ID,
  nextPadReminderPosition,
  parkBeside,
  rotatePosition,
  stepRotation,
  unrotatePosition,
  type Player,
  type PlayerPosition,
  type ReminderToken,
} from "@/lib/gameDocument";
import { isHttpUrl } from "@/lib/scriptParser";

import { Button } from "./Button";
import { CharacterToken } from "./CharacterToken";
import { InfoTokenLibrary } from "./InfoTokenLibrary";
import { InfoTokenShowMode } from "./InfoTokenShowMode";
import { ReminderChip } from "./ReminderChip";
import { ReminderPicker } from "./ReminderPicker";
import styles from "./GrimoireBoard.module.css";
import { Select } from "./Select";

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
  // Fired when the name field loses focus, so a normalization (trim,
  // fall back to "Player N" if left blank) can land as one committed edit
  // instead of fighting the user's cursor on every keystroke of onRename.
  onRenameCommit: (playerId: string) => void;
  onMove: (playerId: string, position: PlayerPosition) => void;
  onReCircle: () => void;
  onReorderSeat: (playerId: string, direction: "earlier" | "later") => void;
  // Current orientation of the whole grimoire circle, in degrees clockwise
  // from its default layout (issue #192). Applied to every token's position
  // at render time only — never baked into a stored position.
  rotation: number;
  onRotate: (rotation: number) => void;
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
  // Opens the mid-game "Add traveller"/"Add character" forms (owned by the
  // page that hosts this board, not this component — see the comment on
  // onOpenSetupWalkthrough above for why). Omitted entirely when there's
  // nothing valid for it to open, so no menu entry renders (issue #217).
  onOpenAddTraveller?: () => void;
  onOpenAddCharacter?: () => void;
}

// The token *icon* keeps shrinking at high player counts (visual density,
// not a tap target) — growing it to a 44px floor was tried (issue #82) and
// measured to actually overlap adjacent seats' icons on common phone widths
// at 20 players, since the circle's diameter is capped by viewport width
// while the icon floor isn't. The real tap target is .tokenSummary, the
// <summary> wrapping the icon and name text — that's widened to 44px
// instead (below), leaving the icon's own visual size untouched.
//
// MIN_TOKEN_REM (the size at MAX_TOKEN_COUNT) is left exactly at the #82
// floor — that finding was about adjacent icons at 20 players, a circle
// geometry this issue doesn't change, so raising it would reproduce the same
// overlap. MAX_TOKEN_REM and MIN_TOKEN_COUNT both move instead (issue #251,
// items 9+18): reminders no longer stack outward around the token (they now
// run in a line toward the circle's centre — see anchoredReminderPosition),
// which frees the perimeter for a visibly larger icon at low-to-mid player
// counts, and lets tokens hold that larger size through more seats before
// they start shrinking toward the same safe floor.
const MIN_TOKEN_REM = 1.9;
const MAX_TOKEN_REM = 4.2;
const MIN_TOKEN_COUNT = 8;
const MAX_TOKEN_COUNT = 20;

// Interpolates token size down as the pad gets busier, so 20 tokens don't
// overlap and 5 tokens aren't lost in all that space.
function tokenSizeRem(total: number): number {
  const clamped = Math.min(MAX_TOKEN_COUNT, Math.max(MIN_TOKEN_COUNT, total));
  const t = (clamped - MIN_TOKEN_COUNT) / (MAX_TOKEN_COUNT - MIN_TOKEN_COUNT);
  return MAX_TOKEN_REM - t * (MAX_TOKEN_REM - MIN_TOKEN_REM);
}

// A token's menuBody is centred under its summary by default, which pushes
// half its ~14rem width past the board's edge for a seat/reminder parked
// near the left or right rim — the classic phone-width overflow (issue
// #124). Flagging which hemisphere a token sits in lets CSS re-anchor the
// menu to the token's own edge instead of its centre; centred tokens (the
// 40-60 band) are unaffected since a centred menu already fits under them.
function tokenSideAttr(x: number): "left" | "right" | undefined {
  if (x < 40) return "left";
  if (x > 60) return "right";
  return undefined;
}

// Mirrors tokenSideAttr vertically: a token in the board's bottom half
// opens its menu below by default, which is the side most likely to run
// out of viewport height in landscape (issue #124) — flagging it lets CSS
// flip the menu to open above the token instead.
function tokenVSideAttr(y: number): "bottom" | undefined {
  return y > 55 ? "bottom" : undefined;
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
  return Math.max(
    MIN_BOARD_PX,
    Math.min(availableWidthPx, availableHeightPx, maxPx),
  );
}

// A real finger drag always moves a few pixels before settling — without a
// threshold, every tap-to-open-the-menu would also fire a (near-zero) move.
const DRAG_THRESHOLD_PX = 6;
// How long the "Removed" undo banner offers restoring a reminder (issue
// #14), and how long its brief exit-animation ghost fades for (issue #220,
// GrimoireBoard.module.css's --duration-slow) — kept far shorter than the
// undo window so the ghost doesn't linger looking "stuck" long after the
// removal itself has settled.
const REMOVED_UNDO_MS = 6000;
const REMINDER_EXIT_MS = 320;

type TokenKind = "player" | "reminder";
// The board's own overflow menu (issue #217) is a single instance, not one
// per token — but it closes the exact same way a token/reminder menu does
// (an outside tap, or another menu opening), so it shares their openMenu/
// isMenuOpenFor/handleMenuToggle machinery rather than growing a parallel
// open/close system of its own.
type MenuKind = TokenKind | "boardOptions";
// The single board-options menu has no per-instance id to distinguish it by
// (unlike a token/reminder's own id) — this constant fills that slot.
const BOARD_MENU_ID = "board-options";

interface DragState {
  kind: TokenKind;
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  dragged: boolean;
  boardRect: DOMRect;
  lastPosition: PlayerPosition;
  // The token's own board-percentage position at pickup — every move adds
  // the pointer's pixel delta (converted to board percent) on top of this,
  // instead of jumping the token's centre to the raw pointer position
  // (issue #167).
  startPosition: PlayerPosition;
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
  onRenameCommit,
  onMove,
  onReCircle,
  onReorderSeat,
  rotation,
  onRotate,
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
  onOpenAddTraveller,
  onOpenAddCharacter,
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

    // The bottom sheet (BottomSheet.module.css) is a fixed-position overlay
    // that floats over the circle's lower portion rather than sharing layout
    // space with it (ADR 0004: the sheet overlays the grimoire, it never
    // resizes it) — so, unlike every other panel this function already
    // accounts for via wrapper/body layout, its footprint is deliberately
    // never subtracted from the board's height budget.
    function measure() {
      const rect = node!.getBoundingClientRect();
      // A mid-scroll resize (iOS Safari's chrome collapsing, iOS overscroll)
      // can read a negative `rect.top`, which would otherwise overstate how
      // much height is left below the board.
      const topPx = Math.max(0, rect.top);
      const availableHeightPx =
        window.innerHeight - topPx - BOARD_BOTTOM_RESERVE_PX;
      const size = fitBoardSizePx(
        wrapper!.clientWidth,
        availableHeightPx,
        rootFontSizePx,
      );
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
  const [openMenu, setOpenMenu] = useState<{
    kind: MenuKind;
    id: string;
  } | null>(null);
  const openMenuElRef = useRef<HTMLDetailsElement | null>(null);
  // Shared by every site that needs to know whether a specific token's menu
  // is the open one — the <details>'s own `open` prop and the wrap's
  // `data-menu-open` (issue #117: lets CSS stack the open menu above
  // neighbours) must never drift apart, so both read this instead of each
  // re-deriving the same comparison (code review finding).
  function isMenuOpenFor(kind: MenuKind, id: string): boolean {
    return openMenu?.kind === kind && openMenu.id === id;
  }

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
      if (
        openMenuElRef.current &&
        target &&
        openMenuElRef.current.contains(target)
      ) {
        return;
      }
      closeMenu();
    }
    document.addEventListener("pointerdown", handlePointerDownOutside);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDownOutside);
  }, [openMenu, activeOverlay]);

  function handleMenuToggle(
    kind: MenuKind,
    id: string,
    event: React.SyntheticEvent<HTMLDetailsElement>,
  ) {
    const details = event.currentTarget;
    if (details.open) {
      openMenuElRef.current = details;
      setOpenMenu({ kind, id });
    } else if (openMenu?.kind === kind && openMenu.id === id) {
      closeMenu();
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
  // A just-removed reminder's brief fading ghost (issue #220), separate from
  // removedReminder above — that one lives the full undo-banner window
  // (REMOVED_UNDO_MS), far longer than an exit animation should visually
  // linger for.
  const [exitingReminder, setExitingReminder] = useState<{
    reminder: ReminderToken;
    position: PlayerPosition;
  } | null>(null);
  const exitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [infoTokenShowing, setInfoTokenShowing] = useState<{
    text: string;
    characterIds: string[];
  } | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
      if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
    };
  }, []);

  const sorted = useMemo(
    () => [...players].sort((a, b) => a.seat - b.seat),
    [players],
  );
  const total = sorted.length;
  const tokenSize = tokenSizeRem(total);
  const inPlayCharacterIds = useMemo(
    () => heldCharacterIds(players),
    [players],
  );
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
  // Every seat's rotated resting position — the seat/pad layout position
  // (never a live drag preview), with the persisted rotation applied. Split
  // out from positionByPlayerId below so a menu's anchor side (which reads
  // this directly further down) doesn't chase an in-progress drag (see that
  // comment), while still rotating together with everything else (issue
  // #192: "including hand-placed tokens").
  const restingPositionByPlayerId = useMemo(() => {
    const map = new Map<string, PlayerPosition>();
    sorted.forEach((player, index) => {
      const canonical = player.position
        ? // Re-clamped the same way anchoredReminderPosition already
          // clamps its anchor input: a hand-edited or pre-#117 exported
          // document isn't guaranteed to be within [4,96], and an
          // out-of-range stored position would otherwise make a drag's
          // grab offset (GrimoireBoard.tsx's pointer handlers) jump the
          // token to the clamp edge on pickup — the exact bug issue
          // #167 fixed, just re-triggered by out-of-range legacy data.
          { x: clampPct(player.position.x), y: clampPct(player.position.y) }
        : circlePosition(index, total);
      map.set(player.id, rotatePosition(canonical, rotation));
    });
    return map;
  }, [sorted, total, rotation]);
  const positionByPlayerId = useMemo(() => {
    const map = new Map<string, PlayerPosition>();
    sorted.forEach((player) => {
      map.set(
        player.id,
        livePlayerDrag?.id === player.id
          ? livePlayerDrag.position
          : restingPositionByPlayerId.get(player.id)!,
      );
    });
    return map;
  }, [sorted, livePlayerDrag, restingPositionByPlayerId]);
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
    position: PlayerPosition,
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
    // Captured once per gesture — the board doesn't reflow mid-drag, so
    // re-querying layout on every pointermove is wasted work.
    const boardRect = board.getBoundingClientRect();
    dragRef.current = {
      kind,
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragged: false,
      boardRect,
      lastPosition: position,
      // `position` is the token's own currently-displayed board-percentage
      // position (its seat/pad position, or an anchored reminder's offset
      // display spot — never a stale stored position (issue #167)).
      startPosition: position,
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

    // The token's pickup position plus the pointer's own pixel delta (as a
    // board percentage) — keeps the token under the finger from pickup to
    // drop instead of snapping its centre to the raw pointer position
    // (issue #167).
    const { boardRect, startPosition } = drag;
    const position = {
      x: clampPct(startPosition.x + (dx / boardRect.width) * 100),
      y: clampPct(startPosition.y + (dy / boardRect.height) * 100),
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
      // drag.lastPosition is where the token was actually dropped on
      // screen — already carrying the circle's current rotation. Persisted
      // state is always in the unrotated canonical frame (issue #192), so
      // the drop point is rotated back by the same amount before saving.
      const canonicalPosition = unrotatePosition(drag.lastPosition, rotation);
      if (drag.kind === "player") onMove(drag.id, canonicalPosition);
      else onMoveReminder(drag.id, canonicalPosition);
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

  function handleAddReminder(input: {
    characterId: string | null;
    label: string;
  }) {
    const base = reminderPicker?.base ?? null;
    const anchorPlayerId = reminderPicker?.playerId ?? null;
    const position = base
      ? parkBeside(base)
      : nextPadReminderPosition(
          reminders
            .filter((r) => r.anchorPlayerId === null)
            .map((r) => r.position),
        );
    onAddReminder({ ...input, position, anchorPlayerId });
    setActiveOverlay(null);
  }

  function handleRemoveReminder(
    reminder: ReminderToken,
    position: PlayerPosition,
  ) {
    onRemoveReminder(reminder.id);
    setRemovedReminder(reminder);
    // Its last on-board position, captured now — once removed it's no
    // longer in `reminders`/positionByPlayerId, so this is the only place
    // that position is still available (issue #220).
    setExitingReminder({ reminder, position });
    // A reminder removed while it's the one armed for tap-to-place must also
    // clear that placement state — otherwise the "Tap a seat to attach"
    // banner keeps showing and the next seat tap silently no-ops against a
    // reminder id that no longer exists (code review finding).
    if (placingReminderId === reminder.id) setPlacingReminderId(null);
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    undoTimeoutRef.current = setTimeout(
      () => setRemovedReminder(null),
      REMOVED_UNDO_MS,
    );
    if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
    exitTimeoutRef.current = setTimeout(
      () => setExitingReminder(null),
      REMINDER_EXIT_MS,
    );
  }

  function handleUndoRemove() {
    if (!removedReminder) return;
    onRestoreReminder(removedReminder);
    setRemovedReminder(null);
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    // Undo can land while the exit ghost is still mid-fade (issue #220 code
    // review finding) — without clearing it here too, the restored, live
    // reminder and its own still-fading ghost would render simultaneously
    // at the same position until the ghost's timeout catches up.
    setExitingReminder(null);
    if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
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
  // Closes whichever menu is currently open — a token/reminder's own, or
  // the board's overflow menu (issue #217) — sharing one implementation
  // rather than three copies of the same two-line reset (outside-tap-close
  // above, cancelActiveDrag below, and every board-menu item's own handler).
  function closeMenu() {
    openMenuElRef.current = null;
    setOpenMenu(null);
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
    closeMenu();
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
          .filter(
            (character): character is Character => character !== undefined,
          )}
        onClose={() => setInfoTokenShowing(null)}
      />
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.controls} data-controls>
        {!hidden && (
          <Button
            onClick={() => {
              cancelActiveDrag();
              setActiveOverlay(null);
              setPlacingReminderId(null);
              setHidden(true);
            }}
          >
            Hide grimoire
          </Button>
        )}
        {!hidden && !activeOverlay && !placingReminderId && (
          <Button
            onClick={() => {
              // The board-options menu (issue #217) is a sibling control, not
              // an ancestor of this button, so opening it doesn't close it —
              // without this, tapping straight from an open board-options
              // menu to here left it stranded open behind this overlay, with
              // no way to dismiss it (the outside-tap-close effect no-ops
              // while activeOverlay is set) until some other menu action.
              closeMenu();
              setActiveOverlay({ type: "reminder", base: null, playerId: null });
            }}
          >
            Add reminder
          </Button>
        )}
        {!hidden && !activeOverlay && !placingReminderId && (
          <Button
            onClick={() => {
              closeMenu();
              setActiveOverlay({ type: "infoTokens" });
            }}
          >
            Info tokens
          </Button>
        )}

        {/* One-time/setup actions, tucked behind a single overflow trigger
            (issue #217) so they don't compete with the frequent controls
            above as equal peers. Shares the same open/close plumbing as
            every token/reminder menu (isMenuOpenFor/handleMenuToggle) rather
            than a bespoke system of its own. */}
        <details
          className={styles.boardMenu}
          open={isMenuOpenFor("boardOptions", BOARD_MENU_ID)}
          onToggle={(event) =>
            handleMenuToggle("boardOptions", BOARD_MENU_ID, event)
          }
        >
          <summary className={styles.boardMenuSummary}>
            <span aria-hidden="true">⋯</span>
            <span className={styles.srOnly}>Board options</span>
          </summary>
          <div className={styles.boardMenuBody}>
            {onOpenAddTraveller && (
              <Button
                onClick={() => {
                  closeMenu();
                  onOpenAddTraveller();
                }}
              >
                Add traveller
              </Button>
            )}
            {onOpenAddCharacter && (
              <Button
                onClick={() => {
                  closeMenu();
                  onOpenAddCharacter();
                }}
              >
                Add character
              </Button>
            )}
            <Button
              onClick={() => {
                closeMenu();
                onRotate(stepRotation(rotation, -1));
              }}
            >
              Rotate left
            </Button>
            <Button
              onClick={() => {
                closeMenu();
                onRotate(stepRotation(rotation, 1));
              }}
            >
              Rotate right
            </Button>
            {!hidden &&
              !activeOverlay &&
              !placingReminderId &&
              onOpenSetupWalkthrough && (
                <Button
                  onClick={() => {
                    closeMenu();
                    onOpenSetupWalkthrough();
                  }}
                >
                  Setup walkthrough
                </Button>
              )}
            <Button
              onClick={() => {
                cancelActiveDrag();
                // An overlay already open holds a player's position captured
                // at open time — re-circling can move that player, so the
                // stale parked position has to be discarded along with the
                // drag. cancelActiveDrag already closes this menu too, via
                // the shared closeMenu().
                setActiveOverlay(null);
                setPlacingReminderId(null);
                onReCircle();
              }}
            >
              Re-circle
            </Button>
          </div>
        </details>
      </div>

      {!hidden && placingReminderId && (
        <div className={styles.placingBanner} role="status">
          <span>Tap a seat to attach this reminder</span>
          <Button variant="primary" onClick={() => setPlacingReminderId(null)}>
            Cancel
          </Button>
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
          <Button variant="primary" onClick={handleUndoRemove}>
            Undo
          </Button>
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
            // A menu's anchor side must not chase a live drag preview — a
            // storyteller can press-drag the very token whose menu is
            // already open (dragging doesn't close it), and if data-side/
            // data-vside tracked the in-flight position, the menu would
            // flicker between anchors every pointermove instead of staying
            // put until the drag actually settles (code review finding).
            const restingPosition = restingPositionByPlayerId.get(player.id)!;
            const official = character ? isOfficialCharacter(character) : false;
            // True only while the player is still wearing the stand-in's
            // identity — once swapped to any other character (including a
            // reveal to "drunk" itself), there's nothing left to disguise.
            const isHiddenDrunk = player.isDrunk && character?.id !== DRUNK_ID;
            // Same mechanic as isHiddenDrunk, for the Lunatic's Demon
            // stand-in (issue #163).
            const isHiddenLunatic =
              player.isLunatic && character?.id !== LUNATIC_ID;
            // Eligibility is a pure id check, so it's read straight off
            // player.characterId rather than the resolved character — a
            // hand-edited/inconsistent game document whose id doesn't
            // resolve in characterById must not silently hide the picker
            // for an otherwise-eligible character (Copilot review finding).
            const actsAsCapable = player.characterId
              ? ACTS_AS_CAPABLE_IDS.has(player.characterId)
              : false;
            // Each acts-as-capable role only resolves one team's ability
            // (Philosopher/Boffin: good, Alchemist: Minion) — scope the
            // picker's groups accordingly (issue #245).
            const actsAsAllowedTeams = player.characterId
              ? ACTS_AS_ALLOWED_TEAMS[player.characterId]
              : undefined;
            const actsAsGroups = actsAsAllowedTeams
              ? claimGroups.filter((group) => actsAsAllowedTeams.has(group.team))
              : claimGroups;
            // A target set before this filter existed (or before the script
            // last changed) can be off-spec-team or altogether missing from
            // claimOptions — keep it visible/selectable rather than silently
            // clearing it (same safeguard as the Claim select). Read off
            // claimById's O(1) team lookup rather than re-scanning
            // actsAsGroups, and gated on truthy (not just non-null) so a
            // stray empty-string value doesn't produce a second blank entry
            // alongside "Not acting as anyone".
            const actsAsTarget = player.actsAs
              ? claimById.get(player.actsAs)
              : undefined;
            const actsAsOffSpecId =
              player.actsAs &&
              (actsAsTarget === undefined ||
                (actsAsAllowedTeams !== undefined &&
                  !actsAsAllowedTeams.has(actsAsTarget.team)))
                ? player.actsAs
                : null;
            const menuOpen = isMenuOpenFor("player", player.id);

            return (
              <div
                key={player.id}
                className={styles.tokenWrap}
                data-player-id={player.id}
                data-menu-open={menuOpen ? "true" : undefined}
                data-side={tokenSideAttr(restingPosition.x)}
                data-vside={tokenVSideAttr(restingPosition.y)}
                style={{ left: `${position.x}%`, top: `${position.y}%` }}
              >
                <details
                  className={styles.menu}
                  open={menuOpen}
                  onToggle={(event) =>
                    handleMenuToggle("player", player.id, event)
                  }
                >
                  <summary
                    className={styles.tokenSummary}
                    data-dead={player.dead || undefined}
                    onPointerDown={(event) =>
                      handlePointerDown(event, "player", player.id, position)
                    }
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerCancel}
                    onClick={(event) =>
                      handleSummaryClick(event, "player", player.id)
                    }
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
                    {/* Status labels render in their own out-of-flow layer
                        below the icon, not as further .tokenSummary flex
                        children — a token accumulating labels (claim, acts
                        as, ghost vote, "(actually the X)"...) used to grow
                        .tokenSummary's own box, and since .tokenWrap
                        recentres on that box (translate(-50%,-50%)), more
                        labels silently dragged the icon itself away from its
                        anchor point and toward a neighbouring seat (issue
                        #251). Anchoring here instead means the icon's
                        position never depends on how many labels a seat
                        happens to have. */}
                    <span className={styles.tokenLabels}>
                      {character && (
                        <span className={styles.characterName}>
                          {character.name}
                        </span>
                      )}
                      <span className={styles.playerName}>
                        {player.name}
                        {player.dead && (
                          <span className={styles.srOnly}> (dead)</span>
                        )}
                      </span>
                      {isHiddenLunatic && (
                        <span className={styles.note}>
                          (actually the Lunatic)
                        </span>
                      )}
                      {player.isTraveller && (
                        <span className={styles.noteCapitalized}>
                          {player.travellerAlignment}
                        </span>
                      )}
                      {player.claim && (
                        <span
                          key={`claim-${player.claim}`}
                          className={styles.claimBadge}
                        >
                          Claims{" "}
                          {claimById.get(player.claim)?.name ?? player.claim}
                        </span>
                      )}
                      {actsAsCapable && player.actsAs && (
                        <span
                          key={`acts-as-${player.actsAs}`}
                          className={styles.claimBadge}
                        >
                          Acts as{" "}
                          {claimById.get(player.actsAs)?.name ?? player.actsAs}
                        </span>
                      )}
                      {nominatorTodayIds?.has(player.id) && (
                        <span className={styles.note}>Nominator</span>
                      )}
                      {nomineeTodayIds?.has(player.id) && (
                        <span className={styles.note}>Nominee</span>
                      )}
                    </span>
                  </summary>

                  <div className={styles.menuBody}>
                    <label
                      className={styles.field}
                      htmlFor={`token-name-${player.id}`}
                    >
                      <span className={styles.srOnly}>Seat {player.seat} </span>
                      Player name
                      <input
                        id={`token-name-${player.id}`}
                        className={styles.textInput}
                        type="text"
                        value={player.name}
                        onChange={(event) =>
                          onRename(player.id, event.target.value)
                        }
                        onBlur={() => onRenameCommit(player.id)}
                      />
                    </label>

                    <Button onClick={() => onToggleDead(player.id)}>
                      {player.dead ? "Mark alive" : "Mark dead"}
                    </Button>

                    <label
                      className={styles.field}
                      htmlFor={`swap-character-${player.id}`}
                    >
                      Swap character
                      <Select
                        id={`swap-character-${player.id}`}
                        className={styles.select}
                        value={player.characterId ?? ""}
                        onChange={(next) => onSwapCharacter(player.id, next)}
                        entries={swapOptionsForPlayer.map((group) => ({
                          label: teamNames[group.team],
                          options: group.characters.map((c) => ({
                            value: c.id,
                            label: c.name,
                          })),
                        }))}
                      />
                    </label>

                    {/* Bounds check against `index`/`total` (position in
                        seat-sorted order), not `player.seat` directly —
                        seat numbers can have gaps after a mid-game removal
                        (removePlayer never renumbers survivors), so seat
                        1/N isn't reliably first/last once that's happened. */}
                    <div className={styles.seatControls}>
                      <Button
                        disabled={index === 0}
                        onClick={() => onReorderSeat(player.id, "earlier")}
                      >
                        Move seat earlier
                      </Button>
                      <Button
                        disabled={index === total - 1}
                        onClick={() => onReorderSeat(player.id, "later")}
                      >
                        Move seat later
                      </Button>
                    </div>

                    {isHiddenDrunk && (
                      <Button onClick={() => onRevealDrunk(player.id)}>
                        Reveal Drunk
                      </Button>
                    )}

                    <Button
                      variant="destructive"
                      onClick={() => onRemovePlayer(player.id)}
                    >
                      Remove player
                    </Button>

                    {!activeOverlay && !placingReminderId && (
                      <Button
                        onClick={() =>
                          setActiveOverlay({
                            type: "reminder",
                            // Un-rotated back to the canonical frame every
                            // stored position lives in (issue #192) — this
                            // becomes the reminder's stored fallback
                            // position (used once it's ever free-standing),
                            // and storing the rotated display position here
                            // would double-rotate it at that point.
                            base: unrotatePosition(position, rotation),
                            playerId: player.id,
                          })
                        }
                      >
                        Add reminder
                      </Button>
                    )}

                    <label
                      className={styles.field}
                      htmlFor={`token-claim-${player.id}`}
                    >
                      Claim
                      <Select
                        id={`token-claim-${player.id}`}
                        className={styles.claimSelect}
                        value={player.claim ?? ""}
                        onChange={(next) => onSetClaim(player.id, next || null)}
                        entries={[
                          { value: "", label: "No claim" },
                          // A claim recorded before the script last changed can
                          // reference a character no longer in claimOptions —
                          // keep it selectable/visible by id rather than
                          // silently resetting the row to "No claim".
                          ...(player.claim && !claimById.has(player.claim)
                            ? [{ value: player.claim, label: player.claim }]
                            : []),
                          ...claimGroups.map((group) => ({
                            label: teamNames[group.team],
                            options: group.characters.map((c) => ({
                              value: c.id,
                              label: c.name,
                            })),
                          })),
                        ]}
                      />
                    </label>

                    {actsAsCapable && (
                      <label
                        className={styles.field}
                        htmlFor={`token-acts-as-${player.id}`}
                      >
                        Acts as
                        <Select
                          id={`token-acts-as-${player.id}`}
                          className={styles.select}
                          value={player.actsAs ?? ""}
                          onChange={(next) =>
                            onSetActsAs(player.id, next || null)
                          }
                          entries={[
                            { value: "", label: "Not acting as anyone" },
                            // Same "keep an orphaned/off-spec value
                            // selectable/visible" safeguard as the Claim
                            // select above — an actsAs target recorded
                            // before the script last changed, or before this
                            // team filter existed, can reference a character
                            // no longer offered by the groups below.
                            ...(actsAsOffSpecId
                              ? [
                                  {
                                    value: actsAsOffSpecId,
                                    label:
                                      actsAsTarget?.name ?? actsAsOffSpecId,
                                  },
                                ]
                              : []),
                            ...actsAsGroups.map((group) => ({
                              label: teamNames[group.team],
                              options: group.characters.map((c) => ({
                                value: c.id,
                                label: c.name,
                              })),
                            })),
                          ]}
                        />
                      </label>
                    )}

                    {character && (
                      <details className={styles.detail}>
                        <summary className={styles.detailSummary}>
                          Character detail
                          <span
                            className={styles.detailChevron}
                            aria-hidden="true"
                          >
                            ▸
                          </span>
                        </summary>
                        <div className={styles.detailBody}>
                          <p className={styles.detailAbility}>
                            {character.ability}
                          </p>
                          {official ? (
                            <a
                              href={wikiUrl(character)}
                              target="_blank"
                              rel="noreferrer"
                              className={styles.detailLink}
                            >
                              Official wiki page
                            </a>
                          ) : (
                            almanacUrl &&
                            isHttpUrl(almanacUrl) && (
                              <a
                                href={almanacUrl}
                                target="_blank"
                                rel="noreferrer"
                                className={styles.detailLink}
                              >
                                Script almanac
                              </a>
                            )
                          )}
                        </div>
                      </details>
                    )}
                  </div>
                </details>

                {player.dead && (
                  <Button
                    className={styles.ghostVote}
                    aria-pressed={player.ghostVoteSpent}
                    onClick={() => onToggleGhostVote(player.id)}
                  >
                    Ghost vote: {player.ghostVoteSpent ? "spent" : "available"}
                  </Button>
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
            // anchorSeatPosition already carries the rotation (from
            // positionByPlayerId), so an anchored reminder's offset rotates
            // along with its seat for free; a free-standing one needs the
            // same rotation applied directly to its own stored position
            // (issue #192). rotatePosition already clamps its own output
            // (the same [4,96] guarantee a free-standing reminder's stored
            // position isn't guaranteed to have for legacy/hand-edited
            // documents), so pre-clamping the un-rotated input here as well
            // would just distort a legitimately-out-of-range *canonical*
            // value — one a rotated drag can produce even from an in-bounds
            // drop, since un-rotating doesn't commute with a per-axis clamp
            // except at multiples of 90 degrees — before it ever gets
            // rotated back into display space (Copilot review finding).
            const restingPosition = anchorSeatPosition
              ? anchoredReminderPosition(anchorSeatPosition, siblingIndex)
              : rotatePosition(reminder.position, rotation);
            const position =
              liveDrag?.kind === "reminder" && liveDrag.id === reminder.id
                ? liveDrag.position
                : restingPosition;

            const menuOpen = isMenuOpenFor("reminder", reminder.id);

            return (
              <div
                key={reminder.id}
                className={styles.reminderWrap}
                data-reminder-id={reminder.id}
                data-menu-open={menuOpen ? "true" : undefined}
                data-side={tokenSideAttr(restingPosition.x)}
                data-vside={tokenVSideAttr(restingPosition.y)}
                style={{ left: `${position.x}%`, top: `${position.y}%` }}
              >
                <details
                  className={styles.menu}
                  open={menuOpen}
                  onToggle={(event) =>
                    handleMenuToggle("reminder", reminder.id, event)
                  }
                >
                  <summary
                    className={styles.tokenSummary}
                    onPointerDown={(event) =>
                      handlePointerDown(
                        event,
                        "reminder",
                        reminder.id,
                        position,
                      )
                    }
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerCancel}
                    onClick={(event) =>
                      handleSummaryClick(event, "reminder", reminder.id)
                    }
                    onDragStart={(event) => event.preventDefault()}
                  >
                    <ReminderChip
                      character={character}
                      label={reminder.label}
                    />
                  </summary>

                  <div className={styles.menuBody}>
                    {!placingReminderId && (
                      <Button
                        onClick={() => {
                          cancelActiveDrag();
                          setActiveOverlay(null);
                          setPlacingReminderId(reminder.id);
                        }}
                      >
                        Attach to seat
                      </Button>
                    )}
                    <Button
                      onClick={() => handleRemoveReminder(reminder, position)}
                    >
                      Remove reminder
                    </Button>
                  </div>
                </details>
              </div>
            );
          })}

        {!hidden && exitingReminder && (
          <div
            // Keyed on the removed reminder's own id (issue #220 code review
            // finding): without a key, removing a second reminder while the
            // first one's ghost is still mid-fade would reuse this same DOM
            // node instead of remounting it, and chip-out only replays on
            // insertion — the second ghost would silently skip its own fade
            // and pick up wherever the first one's animation had gotten to.
            key={exitingReminder.reminder.id}
            className={styles.reminderGhost}
            data-reminder-ghost
            aria-hidden="true"
            style={{
              left: `${exitingReminder.position.x}%`,
              top: `${exitingReminder.position.y}%`,
            }}
          >
            <ReminderChip
              character={
                exitingReminder.reminder.characterId
                  ? characterById.get(exitingReminder.reminder.characterId)
                  : undefined
              }
              label={exitingReminder.reminder.label}
            />
          </div>
        )}

        {hidden && (
          <div className={styles.hiddenOverlay}>
            <Button variant="primary" onClick={() => setHidden(false)}>
              Show grimoire
            </Button>
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
                <Button variant="ghost" onClick={() => onRemoveFabled(id)}>
                  Remove {character.name}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
