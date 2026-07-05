"use client";

import { useState } from "react";

import { REGULAR_PLAYERS } from "@/lib/players";

import { PickerCustomTextForm } from "./PickerCustomTextForm";
import styles from "./PlayerNamePicker.module.css";

export interface PlayerNamePickerProps {
  onSelect: (name: string) => void;
}

// Curated list + "type your own" fallback (this codebase's picker
// convention, see ReminderPicker) for naming a seat right after its token
// reveal (issue #54). The predefined list is REGULAR_PLAYERS — a hardcoded
// array until player profiles are database-backed.
export function PlayerNamePicker({ onSelect }: PlayerNamePickerProps) {
  const [query, setQuery] = useState("");

  const matches = REGULAR_PLAYERS.filter((name) =>
    name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className={styles.picker}>
      <label>
        Search players
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <ul className={styles.results}>
        {matches.map((name) => (
          <li key={name}>
            <button type="button" onClick={() => onSelect(name)}>
              {name}
            </button>
          </li>
        ))}
      </ul>
      <PickerCustomTextForm
        label="Custom player name"
        submitLabel="Use this name"
        onSubmit={onSelect}
      />
    </div>
  );
}
