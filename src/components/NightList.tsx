"use client";

import { useState } from "react";

import type { Character } from "@/lib/characters";
import type { GameDocument } from "@/lib/gameDocument";
import { computeNightList, phaseForNight, type NightPhase } from "@/lib/nightList";

import { CharacterToken } from "./CharacterToken";
import styles from "./NightList.module.css";

export interface NightListProps {
  game: GameDocument;
  characterById: Map<string, Character>;
  onChange: (next: GameDocument) => void;
}

function phaseLabel(phase: NightPhase, nightNumber: number): string {
  return phase === "first" ? "First night" : `Night ${nightNumber}`;
}

function toggleInArray(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((entryId) => entryId !== id) : [...list, id];
}

export function NightList({ game, characterById, onChange }: NightListProps) {
  const [showAll, setShowAll] = useState(false);

  // The night currently open, or the one "Start night" would open next.
  const nightNumber = game.night + 1;
  const phase = phaseForNight(nightNumber);

  function startNight() {
    onChange({ ...game, nightOpen: true, nightChecked: [], nightUnskipped: [] });
  }

  function endNight() {
    onChange({
      ...game,
      nightOpen: false,
      night: game.night + 1,
      nightChecked: [],
      nightUnskipped: [],
      // Ending a night starts the next day, and nomination eligibility
      // resets at dawn (issue #20 AC) — today's nominations don't carry
      // over (CONTEXT.md: "tracked for the current day only").
      nominations: [],
    });
  }

  function toggleChecked(entryId: string) {
    onChange({ ...game, nightChecked: toggleInArray(game.nightChecked, entryId) });
  }

  function toggleUnskipped(entryId: string) {
    onChange({ ...game, nightUnskipped: toggleInArray(game.nightUnskipped, entryId) });
  }

  if (!game.nightOpen) {
    return (
      <section className={styles.panel} aria-label="Night list">
        <h2 className={styles.heading}>Night list</h2>
        <button type="button" className={styles.startNight} onClick={startNight}>
          Start {phaseLabel(phase, nightNumber)}
        </button>
      </section>
    );
  }

  const checkedIds = new Set(game.nightChecked);
  const entries = computeNightList({
    game,
    characterById,
    phase,
    showAll,
    unskippedIds: new Set(game.nightUnskipped),
  });
  const countable = entries.filter((entry) => !entry.skipped);
  const checkedCount = countable.filter((entry) => checkedIds.has(entry.id)).length;

  return (
    <section className={styles.panel} aria-label="Night list">
      <div className={styles.header}>
        <h2 className={styles.heading}>{phaseLabel(phase, nightNumber)}</h2>
        <p className={styles.progress} role="status">
          {checkedCount}/{countable.length} done
        </p>
      </div>

      <label className={styles.showAll}>
        <input
          type="checkbox"
          checked={showAll}
          onChange={(event) => setShowAll(event.target.checked)}
        />
        Show all
      </label>

      <ol className={styles.entries}>
        {entries.map((entry) => {
          const character = entry.characterId
            ? characterById.get(entry.characterId)
            : undefined;
          const accessibleName = entry.playerName
            ? `${entry.label} — ${entry.playerName}`
            : entry.label;

          return (
            <li
              key={entry.id}
              className={styles.entry}
              data-dead={entry.dead || undefined}
              data-skipped={entry.skipped || undefined}
            >
              <label className={styles.entryMain}>
                <input
                  type="checkbox"
                  aria-label={accessibleName}
                  checked={checkedIds.has(entry.id)}
                  // A skipped (dead, not un-skipped) entry isn't part of
                  // tonight's checklist — un-skip it first to act on it,
                  // rather than letting it silently check off "done" state
                  // for something the storyteller never actually did.
                  disabled={entry.skipped}
                  onChange={() => toggleChecked(entry.id)}
                />
                <span className={styles.entryToken}>
                  {character && <CharacterToken character={character} />}
                </span>
                <span className={styles.entryBody}>
                  <span className={styles.entryTitle}>
                    {entry.label}
                    {entry.playerName && (
                      <span className={styles.entryPlayer}>
                        {" "}
                        — {entry.playerName}
                      </span>
                    )}
                    {entry.isDrunk && (
                      <span className={styles.note}> (actually the Drunk)</span>
                    )}
                    {entry.skipped && (
                      <span className={styles.skippedBadge}> (skipped)</span>
                    )}
                  </span>
                  <span className={styles.entryReminder}>{entry.reminderText}</span>
                </span>
              </label>
              {entry.dead && (
                <button
                  type="button"
                  className={styles.unskip}
                  onClick={() => toggleUnskipped(entry.id)}
                >
                  {entry.skipped ? "Un-skip" : "Skip"}
                </button>
              )}
            </li>
          );
        })}
      </ol>

      <button type="button" className={styles.endNight} onClick={endNight}>
        End {phaseLabel(phase, nightNumber)}
      </button>
    </section>
  );
}
