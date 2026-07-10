"use client";

import { useState } from "react";

import type { Character } from "@/lib/characters";
import { pauseDayTimer } from "@/lib/dayTimer";
import type { GameDocument } from "@/lib/gameDocument";
import {
  dayNotesSectionId,
  nightNotesSectionId,
  withDayNotesSection,
  withNightNotesSection,
  withoutEmptyNotesSection,
} from "@/lib/gameNotes";
import {
  computeNightList,
  currentNightNumber,
  phaseForNight,
  type NightPhase,
} from "@/lib/nightList";

import { CharacterToken } from "./CharacterToken";
import { Checkbox } from "./Checkbox";
import { CollapsibleSection } from "./CollapsibleSection";
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

  const nightNumber = currentNightNumber(game);
  const phase = phaseForNight(nightNumber);

  function toggleCollapsed(collapsed: boolean) {
    onChange({ ...game, nightListCollapsed: collapsed });
  }

  function startNight() {
    // The day timer's own controls (DayPhase.tsx) are unreachable once the
    // night list is open, so a still-running discussion countdown would
    // otherwise keep deriving from wall-clock time all night and read a
    // stale/expired value the moment day resumes (issue #190 code review
    // finding). Pausing freezes its remaining time instead — a no-op if it
    // wasn't running (lib/dayTimer.ts).
    onChange({
      ...game,
      nightOpen: true,
      nightChecked: [],
      nightUnskipped: [],
      dayTimer: pauseDayTimer(game.dayTimer),
      // Section titles are always "Night N" (issue #193 AC), distinct from
      // the checklist heading above ("First night" for night 1) — the notes
      // panel names sections by number regardless of the first-night/other
      // distinction that only matters for which abilities act. Idempotent: a
      // Back-then-Start-again round trip must not wipe out notes already
      // jotted under this night's section.
      notes: withNightNotesSection(game.notes, nightNumber),
    });
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
      notes: withoutEmptyNotesSection(game.notes, nightNotesSectionId(nightNumber)),
    });
  }

  // Undoes "End night": reopens the just-ended night with its checklist and
  // the day's nominations restored from the snapshot End night captured,
  // then consumes the snapshot so the offer can't be replayed (issue #165).
  function undoEndNight() {
    const snapshot = game.lastEndedNightSnapshot;
    if (!snapshot) return;
    onChange({
      ...game,
      night: game.night - 1,
      nightOpen: true,
      nightChecked: snapshot.nightChecked,
      nightUnskipped: snapshot.nightUnskipped,
      // Only restore the snapshotted nominations if none have been recorded
      // since — End night always leaves nominations empty, so a non-empty
      // array here means the storyteller has already nominated today, and
      // that must never be silently overwritten by older, pre-End data
      // (issue #165 AC: "does not silently lose the day-phase state").
      nominations: game.nominations.length === 0 ? snapshot.nominations : game.nominations,
      lastEndedNightSnapshot: null,
      // Every path that reopens the night must pause a running day timer,
      // the same reasoning as startNight() above (Copilot review finding on
      // issue #190: this path was missed the first time).
      dayTimer: pauseDayTimer(game.dayTimer),
      // Same "don't leave mis-tap clutter" reasoning as undoStartNight above
      // (issue #193 code review finding): the day section End night just
      // created is only removed if it's still empty.
      notes: withoutEmptyNotesSection(game.notes, dayNotesSectionId(game.night)),
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
        <CollapsibleSection
          title="Night list"
          collapsed={game.nightListCollapsed}
          onToggleCollapsed={toggleCollapsed}
        >
          <button type="button" className={styles.startNight} onClick={startNight}>
            Start {phaseLabel(phase, nightNumber)}
          </button>
          {game.lastEndedNightSnapshot && (
            <button type="button" className={styles.back} onClick={undoEndNight}>
              ← Reopen {phaseLabel(phaseForNight(game.night), game.night)}
            </button>
          )}
        </CollapsibleSection>
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
      <CollapsibleSection
        title={phaseLabel(phase, nightNumber)}
        collapsed={game.nightListCollapsed}
        onToggleCollapsed={toggleCollapsed}
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
              (entry.characterId ? characterById.get(entry.characterId) : undefined);
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
                          {entry.playerName} — {actingCharacter.name} as {entry.label}
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
                        <span className={styles.note}> (actually the Lunatic)</span>
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
      </CollapsibleSection>

      {/* Kept outside CollapsibleSection, unlike the checklist itself — a
          storyteller collapsing this panel to reclaim circle width (issue
          #168) still needs this glanceable "how much is left" count without
          re-expanding the whole entries list (code review finding). */}
      <p className={styles.progress} role="status">
        {checkedCount}/{countable.length} done
      </p>
    </section>
  );
}
