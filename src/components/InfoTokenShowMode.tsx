import type { Character } from "@/lib/characters";

import { Button } from "./Button";
import { CharacterToken } from "./CharacterToken";
import styles from "./InfoTokenShowMode.module.css";

export interface InfoTokenShowModeProps {
  text: string;
  characters: Character[];
  onClose: () => void;
}

// Full-screen card shown to players across the table (issue #19). A solid,
// full-viewport overlay — not just a visually-covering box — so nothing of
// the grimoire behind it (player names, alive/dead state) is reachable while
// it's up.
export function InfoTokenShowMode({
  text,
  characters,
  onClose,
}: InfoTokenShowModeProps) {
  return (
    <div className={styles.overlay} role="dialog" aria-label={text} aria-modal="true">
      <p className={styles.text}>{text}</p>

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

      <Button variant="primary" onClick={onClose}>
        Done
      </Button>
    </div>
  );
}
