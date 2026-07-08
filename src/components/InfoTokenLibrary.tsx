"use client";

import { useRef, useState } from "react";

import { groupByTeam, teamNames, type Character } from "@/lib/characters";
import { visibleInfoTokens } from "@/lib/infoTokens";

import { DialogOverlay } from "./DialogOverlay";
import { PickerCustomTextForm } from "./PickerCustomTextForm";
import { PickerGroup } from "./PickerGroup";
import styles from "./InfoTokenLibrary.module.css";
import { useDialogDismiss } from "./useDialogDismiss";

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
  const dialogRef = useRef<HTMLDivElement>(null);
  // Shared by both steps' Cancel button (only one is ever mounted at a
  // time) — it's the initial-focus target on mount (always the browsing
  // step's, since that's the initial screen) and also useDialogDismiss's
  // recovery anchor if a step transition unmounts whatever was focused, so
  // it needs to stay valid on both steps, not just the first.
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // The Tab trap is what keeps board controls (Re-circle, Hide grimoire)
  // unreachable behind the new backdrop (issue #122).
  useDialogDismiss(dialogRef, cancelButtonRef, onCancel);

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

  const groups =
    chosenText !== null ? groupByTeam(Array.from(characterById.values())) : [];
  const standardTokens = visibleInfoTokens(new Set(characterById.keys()));

  return (
    <DialogOverlay onCancel={onCancel}>
      <div
        ref={dialogRef}
        className={styles.library}
        role="dialog"
        aria-label="Info tokens"
        aria-modal="true"
      >
        {chosenText === null ? (
          <>
            <button
              type="button"
              ref={cancelButtonRef}
              className={styles.cancelButton}
              onClick={onCancel}
            >
              Cancel
            </button>

            <div className={styles.standardCards}>
              {standardTokens.map((template) => (
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
          </>
        ) : (
          <>
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
              <button type="button" ref={cancelButtonRef} onClick={onCancel}>
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
          </>
        )}
      </div>
    </DialogOverlay>
  );
}
