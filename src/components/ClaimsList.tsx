import { useMemo } from "react";

import { groupByTeam, teamNames, type Character } from "@/lib/characters";
import type { Player } from "@/lib/gameDocument";

import { CollapsibleSection } from "./CollapsibleSection";
import styles from "./ClaimsList.module.css";

export interface ClaimsListProps {
  players: Player[];
  // The script's full character list, offered as claim options — the exact
  // same source GrimoireBoard's per-token claim select uses, so this panel
  // can never drift out of scope with it (issue #75).
  claimOptions: Character[];
  collapsed: boolean;
  onToggleCollapsed: (collapsed: boolean) => void;
  onSetClaim: (playerId: string, characterId: string | null) => void;
}

// A scannable, editable player → current claim list (CONTEXT.md: Claim —
// current claim only, no history), so the storyteller can set or check every
// claim at a glance instead of opening each token's menu in turn.
export function ClaimsList({
  players,
  claimOptions,
  collapsed,
  onToggleCollapsed,
  onSetClaim,
}: ClaimsListProps) {
  const sorted = useMemo(
    () => [...players].sort((a, b) => a.seat - b.seat),
    [players],
  );
  const claimGroups = useMemo(() => groupByTeam(claimOptions), [claimOptions]);
  const claimIds = useMemo(
    () => new Set(claimOptions.map((c) => c.id)),
    [claimOptions],
  );

  return (
    <section className={styles.panel} aria-label="Claims">
      <CollapsibleSection
        title="Claims"
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
      >
        <ul className={styles.list}>
          {sorted.map((player) => (
            <li key={player.id} className={styles.row}>
              <span className={styles.name}>{player.name}</span>
              <select
                aria-label={`Claim for ${player.name}`}
                className={styles.claimSelect}
                value={player.claim ?? ""}
                onChange={(event) =>
                  onSetClaim(player.id, event.target.value || null)
                }
              >
                <option value="">No claim</option>
                {/* A claim recorded before the script last changed can
                    reference a character no longer in claimOptions — keep it
                    selectable/visible by id rather than silently resetting
                    the row to "No claim" out from under the storyteller. */}
                {player.claim && !claimIds.has(player.claim) && (
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
            </li>
          ))}
        </ul>
      </CollapsibleSection>
    </section>
  );
}
