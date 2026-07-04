"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import {
  deleteCustomScript,
  getCustomScriptsSnapshot,
  subscribeCustomScripts,
} from "@/lib/customScripts";

import { AddScriptDialog } from "./AddScriptDialog";
import styles from "./CustomScriptsSection.module.css";

const EMPTY: never[] = [];

export function CustomScriptsSection() {
  const scripts = useSyncExternalStore(
    subscribeCustomScripts,
    getCustomScriptsSnapshot,
    () => EMPTY,
  );

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>Your scripts</h2>
      {scripts.length > 0 && (
        <ul className={styles.list}>
          {scripts.map((script) => (
            <li key={script.id} className={styles.item}>
              <Link
                href={`/scripts/custom?id=${script.id}`}
                className={styles.link}
              >
                {script.name}
                {script.author && (
                  <span className={styles.author}> by {script.author}</span>
                )}
              </Link>
              <button
                type="button"
                className={styles.remove}
                onClick={() => deleteCustomScript(script.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <AddScriptDialog onAdded={() => {}} />
    </section>
  );
}
