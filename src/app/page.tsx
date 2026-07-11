import Link from "next/link";

import { CustomScriptsSection } from "@/components/CustomScriptsSection";
import { GamesList } from "@/components/GamesList";
import { ScriptLibrarySection } from "@/components/ScriptLibrarySection";
import { listScriptSummaries } from "@/lib/scripts";

import styles from "./page.module.css";

export default function Home() {
  const summaries = listScriptSummaries();
  const baseEditions = summaries.filter((script) => script.source === "base");
  const libraryScripts = summaries.filter(
    (script) => script.source === "library",
  );

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>BotC Grimoire</h1>
        <p className={styles.subtitle}>Pick a script to start a new game</p>
      </header>

      <GamesList />

      <ul className={styles.scriptList}>
        {baseEditions.map((script) => (
          <li key={script.id}>
            <Link
              href={`/scripts/${script.id}`}
              className={styles.scriptCard}
              data-edition={script.id}
            >
              <span className={styles.scriptName}>{script.name}</span>
              <span className={styles.scriptMeta}>
                {script.characterCount} characters + {script.travellerCount}{" "}
                travellers
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <ScriptLibrarySection scripts={libraryScripts} />

      <CustomScriptsSection />
    </main>
  );
}
