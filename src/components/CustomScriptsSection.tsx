"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import {
  deleteCustomScript,
  getCustomScriptsSnapshot,
  subscribeCustomScripts,
  type StoredCustomScript,
} from "@/lib/customScripts";

import { AddScriptDialog } from "./AddScriptDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import styles from "./CustomScriptsSection.module.css";

const EMPTY: never[] = [];

export function CustomScriptsSection() {
  const scripts = useSyncExternalStore(
    subscribeCustomScripts,
    getCustomScriptsSnapshot,
    () => EMPTY,
  );
  const [pendingRemove, setPendingRemove] = useState<StoredCustomScript | null>(
    null,
  );

  function confirmRemove() {
    if (!pendingRemove) return;
    deleteCustomScript(pendingRemove.id);
    setPendingRemove(null);
  }

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
                onClick={() => setPendingRemove(script)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <AddScriptDialog onAdded={() => {}} />
      {pendingRemove && (
        <ConfirmDialog
          title="Remove script"
          message={`Remove "${pendingRemove.name}"? This can't be undone.`}
          confirmLabel="Remove"
          destructive
          onConfirm={confirmRemove}
          onCancel={() => setPendingRemove(null)}
        />
      )}
    </section>
  );
}
