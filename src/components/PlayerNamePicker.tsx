"use client";

import { useState, type KeyboardEvent } from "react";

import { REGULAR_PLAYERS } from "@/lib/players";

import { Button } from "./Button";
import { PickerGroup } from "./PickerGroup";
import styles from "./PlayerNamePicker.module.css";

export interface PlayerNamePickerProps {
  onSelect: (name: string) => void;
  // Names already assigned to another seat this game (issue #185) — kept out
  // of the "Regular players" quick-pick so the storyteller can't re-offer a
  // name that's already seated. Typing a custom name is unaffected.
  excludeNames?: string[];
}

// One input for both filtering the curated list and naming yourself
// (issue #157) — the same text drives both, rather than a separate
// search box and custom-name form. The predefined list is REGULAR_PLAYERS
// — a hardcoded array until player profiles are database-backed.
export function PlayerNamePicker({ onSelect, excludeNames = [] }: PlayerNamePickerProps) {
  const [query, setQuery] = useState("");

  const trimmedQuery = query.trim();
  const normalizedQuery = trimmedQuery.toLowerCase();
  const excludedLower = new Set(excludeNames.map((name) => name.toLowerCase()));
  const matches = REGULAR_PLAYERS.filter(
    (name) =>
      name.toLowerCase().includes(normalizedQuery) &&
      !excludedLower.has(name.toLowerCase()),
  );
  // Filtering is substring-based (so partial typing narrows the list), but
  // "no regular player" for naming yourself must be exact-match: a substring
  // hit against an unrelated name (e.g. "an" inside "Dana") would otherwise
  // block naming yourself "an" even though no player is actually named that.
  // Excluded names don't count either — an excluded name has no quick-pick
  // button, so treating it as "still a regular player" would also block the
  // "Name yourself" fallback and leave typing that exact name a dead end
  // (code review finding, issue #185).
  const isRegularPlayer = REGULAR_PLAYERS.some(
    (name) => name.toLowerCase() === normalizedQuery && !excludedLower.has(name.toLowerCase()),
  );
  const canNameYourself = trimmedQuery.length > 0 && !isRegularPlayer;

  function select(name: string) {
    setQuery("");
    onSelect(name);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && canNameYourself) {
      event.preventDefault();
      select(trimmedQuery);
    }
  }

  return (
    <div className={styles.picker}>
      <label>
        Player name
        <input
          className={styles.input}
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </label>
      <PickerGroup
        legend="Regular players"
        items={matches.map((name) => ({ label: name, onClick: () => select(name) }))}
      />
      {canNameYourself && (
        <Button className={styles.useName} onClick={() => select(trimmedQuery)}>
          Name yourself &quot;{trimmedQuery}&quot;
        </Button>
      )}
    </div>
  );
}
