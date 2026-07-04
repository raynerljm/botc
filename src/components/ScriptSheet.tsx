import {
  getCharacter,
  groupByTeam,
  teamNames,
  wikiUrl,
  type Character,
} from "@/lib/characters";
import type { ActiveJinx, ScriptMeta } from "@/lib/scriptParser";

import { CharacterToken } from "./CharacterToken";
import styles from "./ScriptSheet.module.css";

export interface ScriptSheetProps {
  meta: ScriptMeta;
  characters: Character[];
  jinxes: ActiveJinx[];
}

function characterName(characters: Character[], id: string): string {
  return characters.find((c) => c.id === id)?.name ?? id;
}

export function ScriptSheet({ meta, characters, jinxes }: ScriptSheetProps) {
  const groups = groupByTeam(characters);

  return (
    <>
      {meta.author && (
        <p className={styles.meta}>
          <span>By {meta.author}</span>
          {meta.almanac && (
            <a
              href={meta.almanac}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.almanacLink}
            >
              Almanac ↗
            </a>
          )}
        </p>
      )}
      {meta.bootlegger && (
        <p className={styles.bootlegger}>{meta.bootlegger}</p>
      )}
      {groups.map((group) => (
        <section key={group.team} className={styles.teamSection}>
          <h2 className={styles.teamName} data-team={group.team}>
            {teamNames[group.team]}
          </h2>
          <ul className={styles.characters}>
            {group.characters.map((character) => {
              // A script can reskin an official character (same id, custom
              // name/ability), so the wiki link — when it exists at all —
              // must point to the official record, not the local one.
              const official = getCharacter(character.id);
              return (
                <li key={character.id}>
                  <details className={styles.character}>
                    <summary className={styles.characterSummary}>
                      <CharacterToken character={character} />
                      <span className={styles.characterName}>
                        {character.name}
                      </span>
                    </summary>
                    <div className={styles.characterDetail}>
                      <p className={styles.ability}>{character.ability}</p>
                      {official && (
                        <a
                          href={wikiUrl(official)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.wikiLink}
                        >
                          {official.name} on the wiki ↗
                        </a>
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {jinxes.length > 0 && (
        <section className={styles.jinxes}>
          <h2 className={styles.teamName}>Jinxes</h2>
          <ul className={styles.jinxList}>
            {jinxes.map((jinx) => (
              <li
                key={`${jinx.characterId}-${jinx.targetId}`}
                className={styles.jinx}
              >
                <p className={styles.jinxNames}>
                  {characterName(characters, jinx.characterId)} &amp;{" "}
                  {characterName(characters, jinx.targetId)}
                </p>
                <p className={styles.jinxReason}>{jinx.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
