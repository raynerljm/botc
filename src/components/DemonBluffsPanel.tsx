"use client";

import { useMemo, useState } from "react";

import { groupByTeam, teamNames, type Character } from "@/lib/characters";
import { DEMON_BLUFF_SLOTS, type GameDocument } from "@/lib/gameDocument";

import { CharacterToken } from "./CharacterToken";
import { CollapsibleSection } from "./CollapsibleSection";
import styles from "./DemonBluffsPanel.module.css";

export interface DemonBluffsPanelProps {
  game: GameDocument;
  onChange: (next: GameDocument) => void;
}

const GOOD_TEAMS = new Set<Character["team"]>(["townsfolk", "outsider"]);

export function DemonBluffsPanel({ game, onChange }: DemonBluffsPanelProps) {
  const [showAll, setShowAll] = useState(false);
  const [showingToDemon, setShowingToDemon] = useState(false);

  const optionsById = useMemo(
    () => new Map(game.scriptCharacters.map((c) => [c.id, c] as const)),
    [game.scriptCharacters],
  );
  const notInPlayGood = useMemo(() => {
    const inPlayIds = new Set(game.characterPool.map((c) => c.id));
    return game.scriptCharacters.filter(
      (c) => GOOD_TEAMS.has(c.team) && !inPlayIds.has(c.id),
    );
  }, [game.characterPool, game.scriptCharacters]);
  // Lunatic/Marionette games legitimately break the "good, not-in-play" rule
  // (ADR 0003: advisory, never a hard restriction), so "show all" opens the
  // full script pool regardless of team or in-play status.
  const options = showAll ? game.scriptCharacters : notInPlayGood;
  const groupedOptions = useMemo(() => groupByTeam(options), [options]);

  const bluffs = game.demonBluffs;
  const bluffCharacters = bluffs.map((id) => (id ? optionsById.get(id) : undefined));
  const anyBluffSet = bluffs.some((id) => id !== null);

  // A slot's already-chosen character must stay selectable even when it
  // falls outside the current filter (e.g. an evil Marionette bluff picked
  // under "show all", then "show all" is turned back off) — otherwise the
  // <select> silently desyncs from game.demonBluffs, showing "Not set" next
  // to a token that's still very much set.
  function groupsForSlot(index: number) {
    const current = bluffCharacters[index];
    if (!current || options.some((c) => c.id === current.id)) return groupedOptions;
    return groupByTeam([...options, current]);
  }

  function setSlot(index: number, characterId: string | null) {
    const next = [...bluffs];
    next[index] = characterId;
    onChange({ ...game, demonBluffs: next });
  }

  return (
    <section className={styles.panel} aria-label="Demon bluffs">
      <CollapsibleSection
        title="Demon bluffs"
        collapsed={game.demonBluffsCollapsed}
        onToggleCollapsed={(collapsed) =>
          onChange({ ...game, demonBluffsCollapsed: collapsed })
        }
      >
        <label className={styles.showAll}>
          <input
            type="checkbox"
            checked={showAll}
            onChange={(event) => setShowAll(event.target.checked)}
          />
          Show all characters
        </label>

        <ul className={styles.slots}>
          {Array.from({ length: DEMON_BLUFF_SLOTS }, (_, index) => {
            const character = bluffCharacters[index];
            return (
              <li key={index} className={styles.slot}>
                <span className={styles.slotVisual}>
                  {character ? (
                    <CharacterToken character={character} />
                  ) : (
                    <span className={styles.emptySlot} aria-hidden="true" />
                  )}
                </span>
                <select
                  aria-label={`Bluff slot ${index + 1}`}
                  value={bluffs[index] ?? ""}
                  onChange={(event) => setSlot(index, event.target.value || null)}
                >
                  <option value="">Not set</option>
                  {groupsForSlot(index).map((group) => (
                    <optgroup key={group.team} label={teamNames[group.team]}>
                      {group.characters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          className={styles.showButton}
          disabled={!anyBluffSet}
          onClick={() => setShowingToDemon(true)}
        >
          Show to Demon
        </button>

        {showingToDemon && (
          <div className={styles.overlay} role="dialog" aria-label="Demon bluffs">
            <ul className={styles.overlaySlots}>
              {bluffCharacters.map((character, index) => (
                <li key={index} className={styles.overlaySlot}>
                  {character ? (
                    <>
                      <CharacterToken character={character} />
                      <span className={styles.overlayName}>{character.name}</span>
                    </>
                  ) : (
                    <span className={styles.overlayName}>Not set</span>
                  )}
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setShowingToDemon(false)}>
              Close
            </button>
          </div>
        )}
      </CollapsibleSection>
    </section>
  );
}
