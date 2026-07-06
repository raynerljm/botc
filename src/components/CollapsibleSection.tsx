import type { ReactNode } from "react";

import styles from "./CollapsibleSection.module.css";

export interface CollapsibleSectionProps {
  title: string;
  collapsed: boolean;
  onToggleCollapsed: (collapsed: boolean) => void;
  children: ReactNode;
}

// Shared disclosure header for the board's secondary panels (Demon bluffs,
// Claims, Game) — issue #79: their content used to always render, pushing
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
      <button
        type="button"
        className={styles.heading}
        aria-expanded={!collapsed}
        onClick={() => onToggleCollapsed(!collapsed)}
      >
        <h2 className={styles.title}>{title}</h2>
        <span className={styles.chevron} aria-hidden="true">
          {collapsed ? "▸" : "▾"}
        </span>
      </button>
      {!collapsed && children}
    </>
  );
}
