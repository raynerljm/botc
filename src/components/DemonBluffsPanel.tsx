"use client";

import { useMemo, useRef, useState } from "react";

import { groupByTeam, teamNames, type Character } from "@/lib/characters";
import { DEMON_BLUFF_SLOTS, heldCharacterIds, type GameDocument } from "@/lib/gameDocument";

import { CharacterToken } from "./CharacterToken";
import { Checkbox } from "./Checkbox";
import { CollapsibleSection } from "./CollapsibleSection";
import styles from "./DemonBluffsPanel.module.css";
import { Select, type SelectEntry } from "./Select";
import { useDialogDismiss } from "./useDialogDismiss";

export interface DemonBluffsPanelProps {
  game: GameDocument;
  onChange: (next: GameDocument) => void;
  // Only DemonBluffsPanel (the board-mounted wrapper) uses this — the same
  // toggle threaded through to a plain `hidden` attribute on its root
  // `<section>` in place of a wrapper `<div>` in the caller. DemonBluffsFields
  // (the other consumer of this props type, for the setup walkthrough) has
  // no root element of its own to hide, so it just ignores the field.
  hidden?: boolean;
  // Only DemonBluffsFields uses this — the setup walkthrough passes false to
  // suppress "Show to Demon", since bluffs are revealed to the Demon during
  // the first night's night order, not during pre-game setup (issue #211).
  // Defaults to true so the board panel keeps its reveal button unchanged.
  showToDemonButton?: boolean;
}

const GOOD_TEAMS = new Set<Character["team"]>(["townsfolk", "outsider"]);

export function DemonBluffsPanel({ game, onChange, hidden }: DemonBluffsPanelProps) {
  return (
    <section className={styles.panel} aria-label="Demon bluffs" hidden={hidden}>
      <CollapsibleSection
        title="Demon bluffs"
        collapsed={game.demonBluffsCollapsed}
        onToggleCollapsed={(collapsed) =>
          onChange({ ...game, demonBluffsCollapsed: collapsed })
        }
      >
        <DemonBluffsFields game={game} onChange={onChange} />
      </CollapsibleSection>
    </section>
  );
}

// The actual bluff-picking UI (show-all toggle, three slots, Show to Demon)
// factored out so the setup walkthrough's Demon bluffs step (issue #155) can
// mount the exact same behavior — reading and writing the same
// game.demonBluffs — instead of a second, divergence-prone copy. This board
// panel is one caller; SetupWalkthrough.tsx's StepPanel is the other.
export function DemonBluffsFields({
  game,
  onChange,
  showToDemonButton = true,
}: DemonBluffsPanelProps) {
  // showingToDemon resetting on its own when this panel collapses (so
  // re-expanding never silently re-shows the Demon's identity, issue #122
  // Copilot finding) relies on CollapsibleSection actually unmounting its
  // children when collapsed (`{!collapsed && children}`) rather than just
  // hiding them — there's no explicit reset here because a fresh mount
  // already defaults this to false.
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
    <>
      <label className={styles.showAll}>
        <Checkbox checked={showAll} onChange={setShowAll} />
        Show all characters
      </label>

      <ul className={styles.slots}>
        {Array.from({ length: DEMON_BLUFF_SLOTS }, (_, index) => {
          const character = bluffCharacters[index];
          const entries: SelectEntry[] = [
            { value: "", label: "Not set" },
            ...groupsForSlot(index).map((group) => ({
              label: teamNames[group.team],
              options: group.characters.map((c) => ({
                value: c.id,
                label: optionLabel(c),
              })),
            })),
          ];
          return (
            <li key={index} className={styles.slot}>
              <span className={styles.slotVisual}>
                {character ? (
                  <CharacterToken character={character} />
                ) : (
                  <span className={styles.emptySlot} aria-hidden="true" />
                )}
              </span>
              <Select
                aria-label={`Bluff slot ${index + 1}`}
                className={styles.slotSelect}
                value={bluffs[index] ?? ""}
                onChange={(next) => setSlot(index, next || null)}
                entries={entries}
              />
            </li>
          );
        })}
      </ul>

      {showToDemonButton && (
        <button
          type="button"
          className={styles.showButton}
          disabled={!anyBluffSet}
          onClick={() => setShowingToDemon(true)}
        >
          Show to Demon
        </button>
      )}

      {showingToDemon && (
        <ShowToDemonOverlay
          bluffCharacters={bluffCharacters}
          onClose={() => setShowingToDemon(false)}
        />
      )}
    </>
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
                <span className={styles.overlayToken}>
                  <CharacterToken character={character} />
                </span>
                <span className={styles.overlayName}>{character.name}</span>
                <span className={styles.overlayTeam} data-team={character.team}>
                  {teamNames[character.team]}
                </span>
                <p className={styles.overlayAbility}>{character.ability}</p>
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
