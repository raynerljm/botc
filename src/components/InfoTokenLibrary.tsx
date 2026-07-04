"use client";

import { useState, type FormEvent } from "react";

import { groupByTeam, teamNames, type Character } from "@/lib/characters";
import { STANDARD_INFO_TOKENS } from "@/lib/infoTokens";

import styles from "./InfoTokenLibrary.module.css";

export interface InfoTokenLibraryProps {
  // The game's own characterPool (homebrew-aware, same universe
  // ReminderPicker draws from) — the token(s) attachable to a card are
  // whichever characters are actually in this script.
  characterById: Map<string, Character>;
  onShow: (input: { text: string; characterIds: string[] }) => void;
  onCancel: () => void;
}

type Step =
  | { phase: "browse" }
  | { phase: "attach"; text: string };

export function InfoTokenLibrary({
  characterById,
  onShow,
  onCancel,
}: InfoTokenLibraryProps) {
  const [step, setStep] = useState<Step>({ phase: "browse" });
  const [customText, setCustomText] = useState("");
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>(
    [],
  );

  function chooseText(text: string) {
    setSelectedCharacterIds([]);
    setStep({ phase: "attach", text });
  }

  function submitCustomText(event: FormEvent) {
    event.preventDefault();
    const text = customText.trim();
    if (!text) return;
    chooseText(text);
    setCustomText("");
  }

  function toggleCharacter(characterId: string) {
    setSelectedCharacterIds((ids) =>
      ids.includes(characterId)
        ? ids.filter((id) => id !== characterId)
        : [...ids, characterId],
    );
  }

  if (step.phase === "browse") {
    return (
      <div className={styles.library} role="dialog" aria-label="Info tokens">
        <button type="button" onClick={onCancel}>
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

        <form className={styles.customForm} onSubmit={submitCustomText}>
          <label>
            Custom info token text
            <input
              type="text"
              value={customText}
              onChange={(event) => setCustomText(event.target.value)}
            />
          </label>
          <button type="submit">Use this text</button>
        </form>
      </div>
    );
  }

  const groups = groupByTeam(Array.from(characterById.values()));

  return (
    <div className={styles.library} role="dialog" aria-label="Info tokens">
      <p className={styles.chosenText}>{step.text}</p>

      {groups.map((group) => (
        <fieldset key={group.team} className={styles.group}>
          <legend>{teamNames[group.team]}</legend>
          <div className={styles.characters}>
            {group.characters.map((character) => (
              <button
                key={character.id}
                type="button"
                aria-pressed={selectedCharacterIds.includes(character.id)}
                onClick={() => toggleCharacter(character.id)}
              >
                {character.name}
              </button>
            ))}
          </div>
        </fieldset>
      ))}

      <div className={styles.attachActions}>
        <button type="button" onClick={() => setStep({ phase: "browse" })}>
          Back
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() =>
            onShow({ text: step.text, characterIds: selectedCharacterIds })
          }
        >
          Show
        </button>
      </div>
    </div>
  );
}
