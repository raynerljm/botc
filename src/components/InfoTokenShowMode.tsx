import type { Character } from "@/lib/characters";

import { Button } from "./Button";
import { CharacterToken } from "./CharacterToken";
import styles from "./InfoTokenShowMode.module.css";

export interface InfoTokenShowModeProps {
  // Omitted for a player's own "Show token" (issue #250) — that view has no
  // reveal-card headline, just the token itself plus its ability below.
  text?: string;
  characters: Character[];
  // Extends this view (originally reveal cards only) to also render a
  // single character's ability text, reused by "Show token" so the
  // storyteller doesn't need a second full-screen component for it.
  ability?: string;
  onClose: () => void;
}

// Full-screen card shown to players across the table (issue #19). A solid,
// full-viewport overlay — not just a visually-covering box — so nothing of
// the grimoire behind it (player names, alive/dead state) is reachable while
// it's up.
export function InfoTokenShowMode({
  text,
  characters,
  ability,
  onClose,
}: InfoTokenShowModeProps) {
  const label = text ?? characters[0]?.name ?? "";

  return (
    <div className={styles.overlay} role="dialog" aria-label={label} aria-modal="true">
      {text && <p className={styles.text}>{text}</p>}

      {characters.length > 0 && (
        <div className={styles.tokens}>
          {characters.map((character) => (
            <div key={character.id} className={styles.token}>
              <CharacterToken character={character} />
              <span>{character.name}</span>
            </div>
          ))}
        </div>
      )}

      {ability && <p className={styles.ability}>{ability}</p>}

      <Button variant="primary" onClick={onClose}>
        Done
      </Button>
    </div>
  );
}
