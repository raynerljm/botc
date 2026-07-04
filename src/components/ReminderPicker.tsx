"use client";

import { useState, type FormEvent } from "react";

import type { Character } from "@/lib/characters";

import styles from "./ReminderPicker.module.css";

export interface ReminderPickerProps {
  // The universe to pick from — a script's characterPool, so homebrew
  // characters offer their reminders exactly like official ones (issue #14
  // AC).
  characterById: Map<string, Character>;
  // Characters currently held by a player, shown before the "show all"
  // toggle reveals everything else.
  inPlayCharacterIds: Set<string>;
  onAdd: (input: { characterId: string | null; label: string }) => void;
  onCancel: () => void;
}

// Shared by every fieldset in the picker (global reminders and each
// character's own). Reminder text can repeat within one character (e.g. the
// Knight's two "Know" reminders), so items are keyed by position, not label.
function ReminderGroup({
  legend,
  items,
}: {
  legend: string;
  items: { label: string; onAdd: () => void }[];
}) {
  if (items.length === 0) return null;
  return (
    <fieldset className={styles.group}>
      <legend>{legend}</legend>
      <div className={styles.reminders}>
        {items.map((item, index) => (
          <button key={index} type="button" onClick={item.onAdd}>
            {item.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function ReminderPicker({
  characterById,
  inPlayCharacterIds,
  onAdd,
  onCancel,
}: ReminderPickerProps) {
  const [showAll, setShowAll] = useState(false);
  const [customText, setCustomText] = useState("");

  const characters = Array.from(characterById.values());
  const inPlay = characters.filter((c) => inPlayCharacterIds.has(c.id));
  const others = characters.filter((c) => !inPlayCharacterIds.has(c.id));

  // Global reminders (e.g. the Drunk's stand-in note) are offered regardless
  // of who's in play — they're not gated by the in-play/show-all split at
  // all.
  const globalReminders = characters.flatMap((character) =>
    character.remindersGlobal.map((label) => ({ character, label })),
  );

  function submitCustom(event: FormEvent) {
    event.preventDefault();
    const label = customText.trim();
    if (!label) return;
    onAdd({ characterId: null, label });
    setCustomText("");
  }

  return (
    <div className={styles.picker} role="dialog" aria-label="Add reminder">
      <button type="button" onClick={onCancel}>
        Cancel
      </button>

      <ReminderGroup
        legend="Global reminders"
        items={globalReminders.map(({ character, label }) => ({
          label,
          onAdd: () => onAdd({ characterId: character.id, label }),
        }))}
      />

      {inPlay.map((character) => (
        <ReminderGroup
          key={character.id}
          legend={character.name}
          items={character.reminders.map((label) => ({
            label,
            onAdd: () => onAdd({ characterId: character.id, label }),
          }))}
        />
      ))}

      <label>
        <input
          type="checkbox"
          checked={showAll}
          onChange={(event) => setShowAll(event.target.checked)}
        />
        Show all characters
      </label>

      {showAll &&
        others.map((character) => (
          <ReminderGroup
            key={character.id}
            legend={character.name}
            items={character.reminders.map((label) => ({
              label,
              onAdd: () => onAdd({ characterId: character.id, label }),
            }))}
          />
        ))}

      <form className={styles.customForm} onSubmit={submitCustom}>
        <label>
          Custom reminder text
          <input
            type="text"
            value={customText}
            onChange={(event) => setCustomText(event.target.value)}
          />
        </label>
        <button type="submit">Add custom reminder</button>
      </form>
    </div>
  );
}
