"use client";

import { useState, type FormEvent } from "react";

import styles from "./PickerCustomTextForm.module.css";

export interface PickerCustomTextFormProps {
  label: string;
  submitLabel: string;
  onSubmit: (text: string) => void;
}

// The "type your own" fallback every picker dialog offers alongside its
// curated list (ReminderPicker's custom reminder, InfoTokenLibrary's custom
// card text).
export function PickerCustomTextForm({
  label,
  submitLabel,
  onSubmit,
}: PickerCustomTextFormProps) {
  const [text, setText] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText("");
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label>
        {label}
        <input
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <button type="submit">{submitLabel}</button>
    </form>
  );
}
