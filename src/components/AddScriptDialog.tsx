"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { saveCustomScript } from "@/lib/customScripts";
import { parseScript, type ScriptParseError } from "@/lib/scriptParser";

import styles from "./AddScriptDialog.module.css";

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

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

export interface AddScriptDialogProps {
  onAdded: (id: string) => void;
}

export function AddScriptDialog({ onAdded }: AddScriptDialogProps) {
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const router = useRouter();

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setText(await readFileAsText(file));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = parseScript(text);
    if (!result.ok) {
      setErrors(result.errors.map(describeError));
      return;
    }
    setErrors([]);
    const saved = saveCustomScript({
      rawText: text,
      name: result.script.meta.name ?? "Untitled script",
      author: result.script.meta.author,
    });
    setText("");
    if (detailsRef.current) detailsRef.current.open = false;
    onAdded(saved.id);
    router.push(`/scripts/custom?id=${saved.id}`);
  }

  return (
    <details className={styles.dialog} ref={detailsRef}>
      <summary className={styles.summary}>Add a script</summary>
      <form className={styles.form} onSubmit={handleSubmit}>
        <label htmlFor="script-file" className={styles.field}>
          Upload a script-tool JSON file
          <input
            id="script-file"
            type="file"
            accept=".json,application/json"
            onChange={handleFile}
          />
        </label>
        <label htmlFor="script-text" className={styles.field}>
          Or paste script-tool JSON
          <textarea
            id="script-text"
            className={styles.textarea}
            rows={6}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        {errors.length > 0 && (
          <ul className={styles.errors} role="alert">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
        <button type="submit" className={styles.submit}>
          Add script
        </button>
      </form>
    </details>
  );
}
