"use client";

import { useMemo, useRef, useState } from "react";

import { groupByTeam, teamNames, type Character } from "@/lib/characters";
import { DEMON_BLUFF_SLOTS, heldCharacterIds, type GameDocument } from "@/lib/gameDocument";

import { CharacterToken } from "./CharacterToken";
import { CollapsibleSection } from "./CollapsibleSection";
import styles from "./DemonBluffsPanel.module.css";
import { useDialogDismiss } from "./useDialogDismiss";

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
  const inPlayIds = useMemo(
    () => new Set(game.characterPool.map((c) => c.id)),
    [game.characterPool],
  );
  const notInPlayGood = useMemo(
    () =>
      game.scriptCharacters.filter(
        (c) => GOOD_TEAMS.has(c.team) && !inPlayIds.has(c.id),
      ),
    [game.scriptCharacters, inPlayIds],
  );
  // Distinct from inPlayIds above: characterPool only ever grows (a swap or
  // an acts-as target adds to it and nothing ever removes from it), so it
  // means "ever referenced this game," not "held by a player right now."
  // The "(in play)" annotation needs the latter — flagging a bluff pick that
  // collides with what's physically at the table this moment, not a
  // character that merely used to be, or might later be, in play.
  const heldIds = useMemo(() => heldCharacterIds(game.players), [game.players]);
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

  // Picking an in-play character is never blocked — Show-all is a
  // deliberate Lunatic/Marionette escape hatch (ADR 0003) — but under ADR
  // 0003 the advisory cue itself is the safety mechanism, so an in-play
  // pick still gets flagged rather than silently accepted (issue #128).
  function optionLabel(character: Character): string {
    return heldIds.has(character.id) ? `${character.name} (in play)` : character.name;
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
        onToggleCollapsed={(collapsed) => {
          // Otherwise collapsing merely unmounts the overlay without
          // resetting the flag that opened it, so re-expanding later
          // re-shows the Demon's identity on screen with no further tap
          // (Copilot review finding).
          if (collapsed) setShowingToDemon(false);
          onChange({ ...game, demonBluffsCollapsed: collapsed });
        }}
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
                  className={styles.slotSelect}
                  value={bluffs[index] ?? ""}
                  onChange={(event) => setSlot(index, event.target.value || null)}
                >
                  <option value="">Not set</option>
                  {groupsForSlot(index).map((group) => (
                    <optgroup key={group.team} label={teamNames[group.team]}>
                      {group.characters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {optionLabel(c)}
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
          <ShowToDemonOverlay
            bluffCharacters={bluffCharacters}
            onClose={() => setShowingToDemon(false)}
          />
        )}
      </CollapsibleSection>
    </section>
  );
}

function ShowToDemonOverlay({
  bluffCharacters,
  onClose,
}: {
  bluffCharacters: (Character | undefined)[];
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // The overlay was already fully opaque and full-viewport, so nothing was
  // ever reachable behind it — this just makes Escape and the keyboard trap
  // honor that too (issue #122).
  useDialogDismiss(dialogRef, closeButtonRef, onClose);

  return (
    <div
      ref={dialogRef}
      className={styles.overlay}
      role="dialog"
      aria-label="Demon bluffs"
      aria-modal="true"
    >
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
      <button
        type="button"
        ref={closeButtonRef}
        className={styles.closeButton}
        onClick={onClose}
      >
        Close
      </button>
    </div>
  );
}
