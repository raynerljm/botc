"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { saveCustomScript } from "@/lib/customScripts";
import {
  describeScriptParseError,
  parseScript,
  parseScriptMeta,
} from "@/lib/scriptParser";

import styles from "./AddScriptDialog.module.css";
import { Button } from "./Button";
import { FilePickerButton } from "./FilePickerButton";

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export interface AddScriptDialogProps {
  onAdded: (id: string) => void;
}

export function AddScriptDialog({ onAdded }: AddScriptDialogProps) {
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const nameTouchedRef = useRef(false);
  const router = useRouter();

  function applyText(newText: string) {
    setText(newText);
    if (nameTouchedRef.current) return;
    setName(parseScriptMeta(newText).name ?? "");
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      applyText(await readFileAsText(file));
    } catch {
      setErrors([
        "Couldn't read that file. Try a different file or paste the JSON instead.",
      ]);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = parseScript(text);
    if (!result.ok) {
      setErrors(result.errors.map(describeScriptParseError));
      return;
    }
    setErrors([]);
    const saved = saveCustomScript({
      rawText: text,
      name: name.trim() || "Untitled script",
      author: result.script.meta.author,
    });
    setText("");
    setName("");
    nameTouchedRef.current = false;
    if (detailsRef.current) detailsRef.current.open = false;
    onAdded(saved.id);
    router.push(`/scripts/custom?id=${saved.id}`);
  }

  return (
    <details className={styles.dialog} ref={detailsRef}>
      <summary className={styles.summary}>Add a script</summary>
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <FilePickerButton
            id="script-file"
            buttonLabel="Upload a script-tool JSON file"
            accept=".json,application/json"
            onChange={handleFile}
          />
        </div>
        <label htmlFor="script-text" className={styles.field}>
          Or paste script-tool JSON
          <textarea
            id="script-text"
            className={styles.textarea}
            rows={6}
            value={text}
            onChange={(event) => applyText(event.target.value)}
          />
        </label>
        <label htmlFor="script-name" className={styles.field}>
          Name (optional)
          <input
            id="script-name"
            type="text"
            className={styles.control}
            value={name}
            onChange={(event) => {
              nameTouchedRef.current = true;
              setName(event.target.value);
            }}
            placeholder="Untitled script"
          />
        </label>
        {errors.length > 0 && (
          <ul className={styles.errors} role="alert">
            {errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        )}
        <Button type="submit" variant="primary" className={styles.submit}>
          Add script
        </Button>
      </form>
    </details>
  );
}
