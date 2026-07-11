"use client";

import Link from "next/link";
import { useState } from "react";

import type { ScriptSummary } from "@/lib/scripts";

import { Checkbox } from "./Checkbox";
import styles from "./ScriptLibrarySection.module.css";
import { TeensyvilleBadge } from "./TeensyvilleBadge";

export function ScriptLibrarySection({
  scripts,
}: {
  scripts: ScriptSummary[];
}) {
  const [teensyvilleOnly, setTeensyvilleOnly] = useState(false);

  if (scripts.length === 0) return null;

  const visibleScripts = teensyvilleOnly
    ? scripts.filter((script) => script.isTeensyville)
    : scripts;

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.heading}>Script library</h2>
        <label className={styles.toggle}>
          <Checkbox checked={teensyvilleOnly} onChange={setTeensyvilleOnly} />
          Teensyville only
        </label>
      </div>
      {visibleScripts.length > 0 ? (
        <ul className={styles.list}>
          {visibleScripts.map((script) => (
            <li key={script.id}>
              <Link href={`/scripts/${script.id}`} className={styles.row}>
                <span className={styles.name}>
                  {script.name}
                  {script.isTeensyville && <TeensyvilleBadge />}
                </span>
                <span className={styles.meta}>
                  {script.author && `By ${script.author} — `}
                  {script.characterCount} characters +{" "}
                  {script.travellerCount} travellers
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>No Teensyville scripts in your library.</p>
      )}
    </section>
  );
}
