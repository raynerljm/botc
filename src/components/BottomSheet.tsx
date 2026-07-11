"use client";

import { useRef, useState, type ReactNode } from "react";

import { CollapsibleSection } from "./CollapsibleSection";
import styles from "./BottomSheet.module.css";

export interface BottomSheetProps {
  ariaLabel: string;
  title: string;
  collapsed: boolean;
  onToggleCollapsed: (collapsed: boolean) => void;
  // Rendered above the heading, always visible regardless of collapsed
  // state — e.g. the day timer, which must stay reachable even while the
  // sheet is peeking (issue #190).
  above?: ReactNode;
  // Rendered after the collapsible content, always visible regardless of
  // collapsed state — e.g. the night list's progress line or Day phase's
  // block-holder status, both glanceable-while-peeking summaries (issue
  // #194).
  below?: ReactNode;
  children: ReactNode;
}

// A firm swipe on the sheet's drag handle before it counts as a drag rather
// than a tap — matches GrimoireBoard's own DRAG_THRESHOLD_PX convention for
// pointer-driven UI, scaled up slightly since a thumb swipe on a handle is a
// coarser gesture than dragging a token.
const SHEET_DRAG_THRESHOLD_PX = 10;

// Mirrors BottomSheet.module.css's `--sheet-peek-height`/`--sheet-expanded-
// height` clamps. Kept in sync by hand: a CSS custom property can only be
// read back as its raw declaration text (e.g. "clamp(4.5rem, 16vh, 7.5rem)"),
// not a resolved pixel value, so live-drag clamping (issue #212 AC: "dragging
// the handle follows the finger") recomputes the same bounds in JS instead.
// The rem bounds are converted using the *actual* root font size (code review
// finding: a hardcoded 16px-per-rem assumption drifts from the real rendered
// CSS under a browser text-zoom/accessibility font-size setting, and the
// drag would visibly snap the instant the inline override is cleared) — same
// pattern GrimoireBoard.tsx already uses for its own board-sizing math.
const PEEK_MIN_REM = 4.5;
const PEEK_MAX_REM = 10;
const PEEK_VIEWPORT_FRACTION = 0.2;
const EXPANDED_VIEWPORT_FRACTION = 0.45;

function readRootFontSizePx(): number {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

function peekHeightPx(viewportHeightPx: number, rootFontSizePx: number): number {
  return Math.min(
    PEEK_MAX_REM * rootFontSizePx,
    Math.max(PEEK_MIN_REM * rootFontSizePx, viewportHeightPx * PEEK_VIEWPORT_FRACTION),
  );
}

function expandedHeightPx(viewportHeightPx: number): number {
  // `vh` units are already independent of root font size, unlike the peek
  // bound above — no conversion needed here.
  return viewportHeightPx * EXPANDED_VIEWPORT_FRACTION;
}

interface HandleDrag {
  pointerId: number;
  startY: number;
  minHeightPx: number;
  maxHeightPx: number;
}

// The single fixed bottom sheet chrome shared by the night list and Day
// phase (issue #195 — only one is ever mounted at a time, gated by game
// phase in GrimoireSetup, so `data-bottom-sheet` below always identifies
// whichever one is currently showing). Originally NightList's own markup
// (issue #194); extracted here once Day phase became a second real call
// site, per that PR's own decision to defer the extraction until then.
export function BottomSheet({
  ariaLabel,
  title,
  collapsed,
  onToggleCollapsed,
  above,
  below,
  children,
}: BottomSheetProps) {
  const dragRef = useRef<HandleDrag | null>(null);
  // Set only while an active drag is live-tracking the finger — an inline
  // override of the panel's height, bypassing the CSS `transition` (issue
  // #212 AC: "dragging the handle follows the finger", not a discrete jump).
  // Cleared on release so the panel falls back to the CSS rule for whichever
  // state `onToggleCollapsed` settles on, which is what actually animates
  // the final settle.
  const [liveHeightPx, setLiveHeightPx] = useState<number | null>(null);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    // A second finger landing on the handle while the first is already
    // dragging must not hijack the gesture (code review finding) — the
    // first pointer's later pointerup/pointercancel would then fail this
    // ref's pointerId check and never clean up, silently transferring
    // control mid-drag with no resolution of the original touch.
    if (dragRef.current) return;
    // Without capture, a fast swipe carries the pointer off the handle's own
    // small hit area within the first few pixels of movement — the browser
    // then stops delivering pointermove/pointerup to it entirely, dropping
    // the gesture. GrimoireBoard's own token drag captures for the same
    // reason; code review (issue #194) caught this handle missing it.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const viewportHeightPx = window.innerHeight;
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      minHeightPx: peekHeightPx(viewportHeightPx, readRootFontSizePx()),
      maxHeightPx: expandedHeightPx(viewportHeightPx),
    };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    // Dragging up (decreasing clientY) grows the sheet; dragging down
    // shrinks it — the panel's height tracks the finger 1:1, clamped to the
    // peek/expanded band so it can't be dragged past either extreme.
    const deltaY = event.clientY - drag.startY;
    const startHeightPx = collapsed ? drag.minHeightPx : drag.maxHeightPx;
    const nextHeightPx = Math.min(
      drag.maxHeightPx,
      Math.max(drag.minHeightPx, startHeightPx - deltaY),
    );
    setLiveHeightPx(nextHeightPx);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setLiveHeightPx(null);
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaY) >= SHEET_DRAG_THRESHOLD_PX) {
      // Dragging up (toward the top of the screen, decreasing clientY)
      // expands; dragging down collapses — always resolves to the direction
      // the thumb was actually headed, regardless of the state it started in.
      onToggleCollapsed(deltaY > 0);
    } else {
      // No meaningful movement: treat it as a tap, same as tapping the
      // heading button does.
      onToggleCollapsed(!collapsed);
    }
  }

  function handlePointerCancel(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setLiveHeightPx(null);
  }

  return (
    <section
      className={styles.panel}
      aria-label={ariaLabel}
      data-bottom-sheet
      // Drives the fixed peek/expanded heights in CSS (ADR 0004: a fixed
      // ~45vh when expanded, content scrolling internally, never resizing
      // the grimoire circle behind it).
      data-expanded={!collapsed || undefined}
      // Disables the CSS transition while a drag is live so the height
      // tracks the finger directly instead of animating toward a stale
      // target every frame.
      data-dragging={liveHeightPx !== null || undefined}
      style={liveHeightPx !== null ? { height: `${liveHeightPx}px` } : undefined}
    >
      {/* Decorative drag handle — a bottom sheet's standard pointer/touch
          affordance (issue #194). Screen-reader users still get an
          accessible expand/collapse control via the heading button below,
          so this is aria-hidden rather than a second, redundant control. */}
      <div
        className={styles.handle}
        data-handle
        aria-hidden="true"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      />
      {above}
      <CollapsibleSection
        title={title}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
      >
        {children}
      </CollapsibleSection>
      {below}
    </section>
  );
}
