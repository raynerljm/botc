"use client";

import { useState } from "react";

import type { Character } from "@/lib/characters";
import type { GameDocument } from "@/lib/gameDocument";
import {
  nightNotesSectionId,
  withDayNotesSection,
  withoutEmptyNotesSection,
} from "@/lib/gameNotes";
import {
  computeNightList,
  currentNightNumber,
  phaseForNight,
  phaseLabel,
  withNightStarted,
} from "@/lib/nightList";

import { BottomSheet } from "./BottomSheet";
import { CharacterToken } from "./CharacterToken";
import { Checkbox } from "./Checkbox";
import styles from "./NightList.module.css";

export interface NightListProps {
  game: GameDocument;
  characterById: Map<string, Character>;
  onChange: (next: GameDocument) => void;
}

function toggleInArray(list: string[], id: string): string[] {
  return list.includes(id)
    ? list.filter((entryId) => entryId !== id)
    : [...list, id];
}

export function NightList({ game, characterById, onChange }: NightListProps) {
  const [showAll, setShowAll] = useState(false);

  const nightNumber = currentNightNumber(game);
  const phase = phaseForNight(nightNumber);

  // The sheet's peek/expanded state reuses `nightListCollapsed` (issue #194
  // decision, recorded in the PR): collapsed already meant "just the heading
  // is visible" pre-sheet (issue #168), which is exactly the peek state, so
  // no new persisted field/schema bump is needed. Shared with Day phase
  // (issue #195) — only one of them is ever mounted at a time.
  function toggleCollapsed(collapsed: boolean) {
    onChange({ ...game, nightListCollapsed: collapsed });
  }

  function startNight() {
    onChange(withNightStarted(game, nightNumber));
  }

  function endNight() {
    const newNightNumber = game.night + 1;
    onChange({
      ...game,
      nightOpen: false,
      night: newNightNumber,
      nightChecked: [],
      nightUnskipped: [],
      // Ending a night starts the next day, and nomination eligibility
      // resets at dawn (issue #20 AC) — today's nominations don't carry
      // over (CONTEXT.md: "tracked for the current day only").
      nominations: [],
      // Captured before being cleared above, so "Reopen" can restore this
      // night rather than reopening it blank (issue #165).
      lastEndedNightSnapshot: {
        nightChecked: game.nightChecked,
        nightUnskipped: game.nightUnskipped,
        nominations: game.nominations,
      },
      // A day begins once night N closes (issue #193 AC), idempotent for
      // the same reason as Start night above.
      notes: withDayNotesSection(game.notes, newNightNumber),
    });
  }

  // Undoes "Start night". The state a night opened from is always blank
  // (starting always clears nightChecked/nightUnskipped, and nothing else
  // touches them while a night is closed), so going back just needs to
  // close the night again — including discarding any check-offs made
  // before backing out (issue #165 AC).
  function undoStartNight() {
    onChange({
      ...game,
      nightOpen: false,
      nightChecked: [],
      nightUnskipped: [],
      // A mis-tap (Start night immediately followed by Back) shouldn't leave
      // a permanent, empty "Night N" section cluttering the notes panel
      // (issue #193 code review finding) — but never touches a section the
      // storyteller already wrote something in.
      notes: withoutEmptyNotesSection(
        game.notes,
        nightNotesSectionId(nightNumber),
      ),
    });
  }

  function toggleChecked(entryId: string) {
    onChange({
      ...game,
      nightChecked: toggleInArray(game.nightChecked, entryId),
    });
  }

  function toggleUnskipped(entryId: string) {
    onChange({
      ...game,
      nightUnskipped: toggleInArray(game.nightUnskipped, entryId),
    });
  }

  // `!game.nightOpen` only ever renders here before the first night has
  // started (day 0 has no day-phase business of its own — GrimoireSetup only
  // mounts NightList once day 0 or an open night makes it "night" phase,
  // issue #195). Once a night has actually ended, day >= 1 and the sheet
  // shows Day phase instead — reopening that ended night (issue #165) is its
  // control to offer, not this one's; see DayPhase.tsx's own undoEndNight.
  if (!game.nightOpen) {
    return (
      <BottomSheet
        ariaLabel="Night list"
        title="Night list"
        collapsed={game.nightListCollapsed}
        onToggleCollapsed={toggleCollapsed}
      >
        <button
          type="button"
          className={styles.startNight}
          onClick={startNight}
        >
          Start {phaseLabel(phase, nightNumber)}
        </button>
      </BottomSheet>
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
  const checkedCount = countable.filter((entry) =>
    checkedIds.has(entry.id),
  ).length;
  // The next actionable entry — first unchecked, un-skipped — so the sheet's
  // peek state can show "3/8 · Empath" instead of a bare count (issue #194
  // AC). Undefined once everything's checked off.
  const nextEntry = entries.find(
    (entry) => !entry.skipped && !checkedIds.has(entry.id),
  );
  const progressText = `${checkedCount}/${countable.length}${
    nextEntry ? ` · ${nextEntry.label}` : " done"
  }`;

  return (
    <BottomSheet
      ariaLabel="Night list"
      title={phaseLabel(phase, nightNumber)}
      collapsed={game.nightListCollapsed}
      onToggleCollapsed={toggleCollapsed}
      // Kept outside the collapsible body, unlike the checklist itself —
      // the sheet's peek state (issue #194) still needs this glanceable
      // "how much is left, what's next" line without expanding the whole
      // entries list (code review finding from the panel's original issue
      // #168).
      below={
        <p className={styles.progress} role="status">
          {progressText}
        </p>
      }
    >
      <button type="button" className={styles.back} onClick={undoStartNight}>
        ← Back
      </button>

      <label className={styles.showAll}>
        <Checkbox checked={showAll} onChange={setShowAll} />
        Show all
      </label>

      <ol className={styles.entries}>
        {entries.map((entry) => {
          // An acts-as entry's physical token is the acting player's own
          // character (e.g. the Philosopher) — the target (`characterId`)
          // only supplies the borrowed ability's name and reminder text
          // (CONTEXT.md: Acts as; issue #17 AC).
          const actingCharacter = entry.actingCharacterId
            ? characterById.get(entry.actingCharacterId)
            : undefined;
          const character =
            actingCharacter ??
            (entry.characterId
              ? characterById.get(entry.characterId)
              : undefined);
          const accessibleName = actingCharacter
            ? `${entry.playerName} — ${actingCharacter.name} as ${entry.label}`
            : entry.playerName
              ? `${entry.label} — ${entry.playerName}`
              : entry.label;

          return (
            <li
              key={entry.id}
              className={styles.entry}
              data-dead={entry.dead || undefined}
              data-skipped={entry.skipped || undefined}
              data-checked={checkedIds.has(entry.id) || undefined}
            >
              <label className={styles.entryMain}>
                <Checkbox
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
                    {actingCharacter && entry.playerName ? (
                      <>
                        {entry.playerName} — {actingCharacter.name} as{" "}
                        {entry.label}
                      </>
                    ) : (
                      <>
                        {entry.label}
                        {entry.playerName && (
                          <span className={styles.entryPlayer}>
                            {" "}
                            — {entry.playerName}
                          </span>
                        )}
                      </>
                    )}
                    {entry.isDrunk && (
                      <span className={styles.note}> (actually the Drunk)</span>
                    )}
                    {entry.isLunatic && (
                      <span className={styles.note}>
                        {" "}
                        (actually the Lunatic)
                      </span>
                    )}
                    {entry.skipped && (
                      <span className={styles.skippedBadge}> (skipped)</span>
                    )}
                  </span>
                  <span className={styles.entryReminder}>
                    {entry.reminderText}
                  </span>
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
    </BottomSheet>
  );
}
