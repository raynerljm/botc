import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CharacterToken } from "@/components/CharacterToken";
import {
  baseEditions,
  getEditionCharacters,
  groupByTeam,
  teamNames,
  wikiUrl,
} from "@/lib/characters";

import styles from "./page.module.css";

interface Props {
  params: Promise<{ editionId: string }>;
}

export async function generateStaticParams() {
  return baseEditions.map((edition) => ({ editionId: edition.id }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { editionId } = await params;
  const edition = baseEditions.find((e) => e.id === editionId);
  return { title: edition ? `${edition.name} — BotC Grimoire` : "BotC Grimoire" };
}

export default async function CharacterSheetPage({ params }: Props) {
  const { editionId } = await params;
  const edition = baseEditions.find((e) => e.id === editionId);
  if (!edition) notFound();

  const groups = groupByTeam(getEditionCharacters(edition.id));

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <Link href="/" className={styles.back}>
          ← Scripts
        </Link>
        <h1 className={styles.title}>{edition.name}</h1>
      </header>
      {groups.map((group) => (
        <section key={group.team} className={styles.teamSection}>
          <h2 className={styles.teamName} data-team={group.team}>
            {teamNames[group.team]}
          </h2>
          <ul className={styles.characters}>
            {group.characters.map((character) => (
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
                    <a
                      href={wikiUrl(character)}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.wikiLink}
                    >
                      {character.name} on the wiki ↗
                    </a>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
