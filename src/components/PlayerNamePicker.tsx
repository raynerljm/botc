"use client";

import { useState } from "react";

import { REGULAR_PLAYERS } from "@/lib/players";

import { PickerCustomTextForm } from "./PickerCustomTextForm";
import { PickerGroup } from "./PickerGroup";
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

  const normalizedQuery = query.trim().toLowerCase();
  const matches = REGULAR_PLAYERS.filter((name) =>
    name.toLowerCase().includes(normalizedQuery),
  );

  function select(name: string) {
    setQuery("");
    onSelect(name);
  }

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
      <PickerGroup
        legend="Regular players"
        items={matches.map((name) => ({ label: name, onClick: () => select(name) }))}
      />
      <PickerCustomTextForm
        label="Custom player name"
        submitLabel="Use this name"
        onSubmit={select}
      />
    </div>
  );
}
