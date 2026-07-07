"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useSyncExternalStore } from "react";

import { ScriptSheet } from "@/components/ScriptSheet";
import { saveCustomScript } from "@/lib/customScripts";
import { describeScriptParseError } from "@/lib/scriptParser";
import { decodeScriptForShare, scriptToRawJson } from "@/lib/scriptShare";

import styles from "./page.module.css";

// The fragment never changes after load, so there's nothing to subscribe
// to — this only exists to give useSyncExternalStore a server snapshot
// (null: "unknown yet") distinct from the client one, so hydration doesn't
// mismatch on every real visit the way reading window.location during
// render would.
function subscribe() {
  return () => {};
}

function getSnapshot() {
  return window.location.hash.slice(1);
}

function getServerSnapshot() {
  return null;
}

export default function SharedScriptPage() {
  const router = useRouter();
  const hash = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const result = hash ? decodeScriptForShare(hash) : undefined;
  const scriptName =
    result?.ok ? result.script.meta.name ?? "Shared script" : "Shared script";
  // A double tap can fire two clicks before router.push unmounts this page —
  // same non-idempotent-action hazard ConfirmDialog's respondedRef guards
  // against, since each call would otherwise mint a separate saved script.
  const savedRef = useRef(false);

  function handleSave() {
    if (!result?.ok || savedRef.current) return;
    savedRef.current = true;
    const rawText = scriptToRawJson(result.script.meta, result.script.characters);
    const saved = saveCustomScript({
      rawText,
      name: scriptName,
      author: result.script.meta.author,
    });
    router.push(`/scripts/custom?id=${saved.id}`);
  }

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>{scriptName}</h1>
        <Link href="/" className={styles.home}>
          Home
        </Link>
      </header>
      {hash === "" && (
        <p className={styles.message}>
          No script was found in this link. Ask the storyteller for a fresh
          QR code or link.
        </p>
      )}
      {result && !result.ok && (
        <ul className={styles.errors} role="alert">
          {result.errors.map((error, index) => (
            <li key={index}>{describeScriptParseError(error)}</li>
          ))}
        </ul>
      )}
      {result && result.ok && (
        <>
          <button type="button" className={styles.save} onClick={handleSave}>
            Add to Your scripts
          </button>
          <ScriptSheet
            meta={result.script.meta}
            characters={result.script.characters}
            jinxes={result.script.jinxes}
          />
        </>
      )}
    </main>
  );
}
