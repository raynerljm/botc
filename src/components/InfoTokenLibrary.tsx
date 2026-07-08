"use client";

import { useState } from "react";

import { groupByTeam, teamNames, type Character } from "@/lib/characters";
import { STANDARD_INFO_TOKENS } from "@/lib/infoTokens";

import { PickerCustomTextForm } from "./PickerCustomTextForm";
import { PickerGroup } from "./PickerGroup";
import styles from "./InfoTokenLibrary.module.css";

export interface InfoTokenLibraryProps {
  // The game's own characterPool (homebrew-aware, same universe
  // ReminderPicker draws from) — the token(s) attachable to a card are
  // whichever characters are actually in this script.
  characterById: Map<string, Character>;
  onShow: (input: { text: string; characterIds: string[] }) => void;
  onCancel: () => void;
}

export function InfoTokenLibrary({
  characterById,
  onShow,
  onCancel,
}: InfoTokenLibraryProps) {
  // Null = browsing the library; a string = that text was chosen and the
  // storyteller is now on the attach step.
  const [chosenText, setChosenText] = useState<string | null>(null);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>(
    [],
  );

  function chooseText(text: string) {
    setSelectedCharacterIds([]);
    setChosenText(text);
  }

  function toggleCharacter(characterId: string) {
    setSelectedCharacterIds((ids) =>
      ids.includes(characterId)
        ? ids.filter((id) => id !== characterId)
        : [...ids, characterId],
    );
  }

  if (chosenText === null) {
    return (
      <div className={styles.library} role="dialog" aria-label="Info tokens">
        <button type="button" className={styles.cancelButton} onClick={onCancel}>
          Cancel
        </button>

        <div className={styles.standardCards}>
          {STANDARD_INFO_TOKENS.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => chooseText(template.text)}
            >
              {template.text}
            </button>
          ))}
        </div>

        <PickerCustomTextForm
          label="Custom info token text"
          submitLabel="Use this text"
          onSubmit={chooseText}
        />
      </div>
    );
  }

  const groups = groupByTeam(Array.from(characterById.values()));

  return (
    <div className={styles.library} role="dialog" aria-label="Info tokens">
      <p className={styles.chosenText}>{chosenText}</p>

      {groups.map((group) => (
        <PickerGroup
          key={group.team}
          legend={teamNames[group.team]}
          items={group.characters.map((character) => ({
            label: character.name,
            selected: selectedCharacterIds.includes(character.id),
            onClick: () => toggleCharacter(character.id),
          }))}
        />
      ))}

      <div className={styles.attachActions}>
        <button type="button" onClick={() => setChosenText(null)}>
          Back
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() =>
            onShow({ text: chosenText, characterIds: selectedCharacterIds })
          }
        >
          Show
        </button>
      </div>
    </div>
  );
}
