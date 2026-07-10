"use client";

import { useRef, type ReactNode } from "react";

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

interface HandleDrag {
  pointerId: number;
  startY: number;
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

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    // Without capture, a fast swipe carries the pointer off the handle's own
    // small hit area within the first few pixels of movement — the browser
    // then stops delivering pointermove/pointerup to it entirely, dropping
    // the gesture. GrimoireBoard's own token drag captures for the same
    // reason; code review (issue #194) caught this handle missing it.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startY: event.clientY };
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    // The sheet has no live visual follow while dragging (unlike a token
    // being repositioned), so only the start/end positions matter — no
    // pointermove tracking needed in between (code review simplification).
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
  }

  return (
    <section className={styles.panel} aria-label={ariaLabel} data-bottom-sheet>
      {/* Decorative drag handle — a bottom sheet's standard pointer/touch
          affordance (issue #194). Screen-reader users still get an
          accessible expand/collapse control via the heading button below,
          so this is aria-hidden rather than a second, redundant control. */}
      <div
        className={styles.handle}
        data-handle
        aria-hidden="true"
        onPointerDown={handlePointerDown}
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
