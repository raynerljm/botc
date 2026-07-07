"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { BagBuilder } from "@/components/BagBuilder";
import { resolveStoredScript } from "@/lib/customScripts";
import { describeScriptParseError } from "@/lib/scriptParser";

import styles from "./page.module.css";

function CustomBagContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const { stored, result } = resolveStoredScript(id);

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <Link
          href={id ? `/scripts/custom?id=${id}` : "/"}
          className={styles.back}
        >
          ← {stored ? stored.name : "Scripts"}
        </Link>
        {/* Same name the script's own sheet page titles itself with
            (custom/page.tsx) — the storyteller's locally-assigned name,
            not the uploaded JSON's possibly-absent/possibly-different
            _meta.name — so the two pages, and the game this bag creates,
            never disagree about which script this is. */}
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
            <li key={index}>{describeScriptParseError(error)}</li>
          ))}
        </ul>
      )}
      {result && result.ok && stored && (
        <BagBuilder
          key={stored.id}
          characters={result.script.characters}
          scriptId={stored.id}
          scriptName={stored.name}
          almanacUrl={result.script.meta.almanac}
          firstNightOrder={result.script.meta.firstNight}
          otherNightOrder={result.script.meta.otherNight}
        />
      )}
    </main>
  );
}

export default function CustomBagPage() {
  return (
    <Suspense fallback={null}>
      <CustomBagContent />
    </Suspense>
  );
}
