import Link from "next/link";

import { baseEditions, getEditionCharacters } from "@/lib/characters";

import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>BotC Grimoire</h1>
        <p className={styles.subtitle}>Pick a script</p>
      </header>
      <ul className={styles.editions}>
        {baseEditions.map((edition) => {
          const characters = getEditionCharacters(edition.id);
          const travellers = characters.filter(
            (c) => c.team === "traveller",
          ).length;
          return (
            <li key={edition.id}>
              <Link
                href={`/scripts/${edition.id}`}
                className={styles.editionCard}
                data-edition={edition.id}
              >
                <span className={styles.editionName}>{edition.name}</span>
                <span className={styles.editionMeta}>
                  {characters.length - travellers} characters + {travellers}{" "}
                  travellers
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
