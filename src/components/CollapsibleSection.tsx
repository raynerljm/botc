import type { ReactNode } from "react";

import styles from "./CollapsibleSection.module.css";

export interface CollapsibleHeadingProps {
  title: string;
  collapsed: boolean;
  onToggleCollapsed: (collapsed: boolean) => void;
}

// Split out from CollapsibleSection so BottomSheet (issue #247) can pin just
// the heading — alongside the drag handle and `above` slot — while the body
// scrolls separately underneath. Every other caller keeps using
// CollapsibleSection, which composes this with its body unchanged.
export function CollapsibleHeading({
  title,
  collapsed,
  onToggleCollapsed,
}: CollapsibleHeadingProps) {
  return (
    // The button nests inside the heading, not the other way around — a
    // heading can't be button content (HTML content model: button only
    // takes phrasing content), and burying it would also cost screen
    // readers' heading-navigation landmark for this panel title (code
    // review finding).
    <h2 className={styles.title}>
      <button
        type="button"
        className={styles.heading}
        aria-expanded={!collapsed}
        onClick={() => onToggleCollapsed(!collapsed)}
      >
        {title}
        <span className={styles.chevron} aria-hidden="true">
          {collapsed ? "▸" : "▾"}
        </span>
      </button>
    </h2>
  );
}

export interface CollapsibleSectionProps {
  title: string;
  collapsed: boolean;
  onToggleCollapsed: (collapsed: boolean) => void;
  children: ReactNode;
}

// Shared disclosure header for the board's secondary panels (Demon bluffs,
// Game) — issue #79: their content used to always render, pushing
// mid-game controls several screen-heights below the board. The heading
// stays visible collapsed or not, so the panel is still scannable at a
// glance; only the body underneath is hidden.
export function CollapsibleSection({
  title,
  collapsed,
  onToggleCollapsed,
  children,
}: CollapsibleSectionProps) {
  return (
    <>
      <CollapsibleHeading
        title={title}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
      />
      {!collapsed && children}
    </>
  );
}
