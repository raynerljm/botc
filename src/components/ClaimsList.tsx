import type { Character } from "@/lib/characters";
import type { Player } from "@/lib/gameDocument";

import { CollapsibleSection } from "./CollapsibleSection";
import styles from "./ClaimsList.module.css";

export interface ClaimsListProps {
  players: Player[];
  characterById: Map<string, Character>;
  collapsed: boolean;
  onToggleCollapsed: (collapsed: boolean) => void;
}

// A scannable player → current claim list (CONTEXT.md: Claim — current claim
// only, no history), so the storyteller can see every claim at a glance
// instead of opening each token's menu in turn.
export function ClaimsList({
  players,
  characterById,
  collapsed,
  onToggleCollapsed,
}: ClaimsListProps) {
  const sorted = [...players].sort((a, b) => a.seat - b.seat);

  return (
    <section className={styles.panel} aria-label="Claims">
      <CollapsibleSection
        title="Claims"
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
      >
        <ul className={styles.list}>
          {sorted.map((player) => {
            const claimName = player.claim
              ? (characterById.get(player.claim)?.name ?? player.claim)
              : null;
            return (
              <li key={player.id} className={styles.row}>
                <span className={styles.name}>{player.name}</span>
                <span className={styles.claim}>{claimName ?? "No claim"}</span>
              </li>
            );
          })}
        </ul>
      </CollapsibleSection>
    </section>
  );
}
