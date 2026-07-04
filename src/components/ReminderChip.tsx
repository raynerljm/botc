import type { Character } from "@/lib/characters";

import { CharacterToken } from "./CharacterToken";
import styles from "./ReminderChip.module.css";

export interface ReminderChipProps {
  // Undefined for a free-text reminder not tied to any character.
  character?: Character;
  label: string;
}

// Smaller and visually distinct from a full CharacterToken (issue #14 AC),
// so a busy pad still reads player tokens as the primary thing on it.
export function ReminderChip({ character, label }: ReminderChipProps) {
  return (
    <span className={styles.chip}>
      <span className={styles.visual}>
        {character ? (
          <CharacterToken character={character} />
        ) : (
          <span className={styles.fallback} aria-hidden="true" />
        )}
      </span>
      <span className={styles.label}>{label}</span>
    </span>
  );
}
