"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { ScriptSheet } from "@/components/ScriptSheet";
import { getCustomScript } from "@/lib/customScripts";
import { parseScript, type ScriptParseError } from "@/lib/scriptParser";

import styles from "./page.module.css";

function describeError(error: ScriptParseError): string {
  switch (error.type) {
    case "invalid-json":
      return "That doesn't look like valid JSON.";
    case "not-array":
      return "A script must be a JSON array of characters.";
    case "unknown-character":
      return `Unknown character id: "${error.raw}".`;
    case "invalid-homebrew":
      return `Entry ${error.index + 1} is missing required fields: ${error.missingFields.join(", ")}.`;
  }
}

function CustomScriptContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const stored = id ? getCustomScript(id) : undefined;
  const result = stored ? parseScript(stored.rawText) : undefined;

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <Link href="/" className={styles.back}>
          ← Scripts
        </Link>
        {stored && <h1 className={styles.title}>{stored.name}</h1>}
      </header>
      {!stored && (
        <p className={styles.message}>
          This script isn&apos;t on this device. Custom scripts are stored
          only in the browser that added them.
        </p>
      )}
      {result && !result.ok && (
        <ul className={styles.errors} role="alert">
          {result.errors.map((error, index) => (
            <li key={index}>{describeError(error)}</li>
          ))}
        </ul>
      )}
      {result && result.ok && (
        <ScriptSheet
          meta={result.script.meta}
          characters={result.script.characters}
          jinxes={result.script.jinxes}
        />
      )}
    </main>
  );
}

export default function CustomScriptPage() {
  return (
    <Suspense fallback={null}>
      <CustomScriptContent />
    </Suspense>
  );
}
