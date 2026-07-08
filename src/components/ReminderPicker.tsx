"use client";

import { useRef, useState } from "react";

import type { Character } from "@/lib/characters";

import { DialogOverlay } from "./DialogOverlay";
import { PickerCustomTextForm } from "./PickerCustomTextForm";
import { PickerGroup } from "./PickerGroup";
import styles from "./ReminderPicker.module.css";
import { useDialogDismiss } from "./useDialogDismiss";

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

export function ReminderPicker({
  characterById,
  inPlayCharacterIds,
  onAdd,
  onCancel,
}: ReminderPickerProps) {
  const [showAll, setShowAll] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // The Tab trap is what keeps board controls (Re-circle, Hide grimoire)
  // unreachable behind the new backdrop (issue #122).
  useDialogDismiss(dialogRef, cancelButtonRef, onCancel);

  const characters = Array.from(characterById.values());
  const inPlay = characters.filter((c) => inPlayCharacterIds.has(c.id));
  const others = characters.filter((c) => !inPlayCharacterIds.has(c.id));

  // Global reminders (e.g. the Drunk's stand-in note) are offered regardless
  // of who's in play — they're not gated by the in-play/show-all split at
  // all.
  const globalReminders = characters.flatMap((character) =>
    character.remindersGlobal.map((label) => ({ character, label })),
  );

  return (
    <DialogOverlay onCancel={onCancel}>
      <div
        ref={dialogRef}
        className={styles.picker}
        role="dialog"
        aria-label="Add reminder"
        aria-modal="true"
      >
        <button
          type="button"
          ref={cancelButtonRef}
          className={styles.cancelButton}
          onClick={onCancel}
        >
          Cancel
        </button>

        <PickerGroup
          legend="Global reminders"
          items={globalReminders.map(({ character, label }) => ({
            label,
            onClick: () => onAdd({ characterId: character.id, label }),
          }))}
        />

        {inPlay.map((character) => (
          <PickerGroup
            key={character.id}
            legend={character.name}
            items={character.reminders.map((label) => ({
              label,
              onClick: () => onAdd({ characterId: character.id, label }),
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
            <PickerGroup
              key={character.id}
              legend={character.name}
              items={character.reminders.map((label) => ({
                label,
                onClick: () => onAdd({ characterId: character.id, label }),
              }))}
            />
          ))}

        <PickerCustomTextForm
          label="Custom reminder text"
          submitLabel="Add custom reminder"
          onSubmit={(label) => onAdd({ characterId: null, label })}
        />
      </div>
    </DialogOverlay>
  );
}
