"use client";

import { useRef, useState } from "react";

import type { Character } from "@/lib/characters";
import { pauseDayTimer } from "@/lib/dayTimer";
import type { GameDocument } from "@/lib/gameDocument";
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

// A firm swipe on the sheet's drag handle before it counts as a drag rather
// than a tap — matches GrimoireBoard's own DRAG_THRESHOLD_PX convention for
// pointer-driven UI, scaled up slightly since a thumb swipe on a handle is a
// coarser gesture than dragging a token.
const SHEET_DRAG_THRESHOLD_PX = 10;

interface HandleDrag {
  pointerId: number;
  startY: number;
}

export function NightList({ game, characterById, onChange }: NightListProps) {
  const [showAll, setShowAll] = useState(false);
  const dragRef = useRef<HandleDrag | null>(null);

  const nightNumber = currentNightNumber(game);
  const phase = phaseForNight(nightNumber);

  function toggleCollapsed(collapsed: boolean) {
    onChange({ ...game, nightListCollapsed: collapsed });
  }

  // The sheet's peek/expanded state reuses `nightListCollapsed` (issue #194
  // decision, recorded in the PR): collapsed already meant "just the heading
  // is visible" pre-sheet (issue #168), which is exactly the peek state, so
  // no new persisted field/schema bump is needed.
  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    // Without capture, a fast swipe carries the pointer off the handle's own
    // small hit area within the first few pixels of movement — the browser
    // then stops delivering pointermove/pointerup to it entirely, dropping
    // the gesture. GrimoireBoard's own token drag (line ~526) captures for
    // the same reason; code review (issue #194) caught this handle missing it.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startY: event.clientY };
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    // The sheet has no live visual follow while dragging (unlike a token
    // being repositioned), so only the start/end positions matter — no
    // pointermove tracking needed in between (code review simplification).
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaY) >= SHEET_DRAG_THRESHOLD_PX) {
      // Dragging up (toward the top of the screen, decreasing clientY)
      // expands; dragging down collapses — always resolves to the direction
      // the thumb was actually headed, regardless of the state it started in.
      toggleCollapsed(deltaY > 0);
    } else {
      // No meaningful movement: treat it as a tap, same as tapping the
      // heading button does.
      toggleCollapsed(!game.nightListCollapsed);
    }
  }

  function handlePointerCancel(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
  }

  // Rendered identically in both the not-open and open-night branches below
  // — hoisted so the two never drift out of sync.
  const dragHandle = (
    // Decorative drag handle — a bottom sheet's standard pointer/touch
    // affordance (issue #194). Screen-reader users still get an accessible
    // expand/collapse control via the heading button below, so this is
    // aria-hidden rather than a second, redundant control.
    <div
      className={styles.handle}
      data-handle
      aria-hidden="true"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    />
  );

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
    });
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
      // Captured before being cleared above, so "Reopen" can restore this
      // night rather than reopening it blank (issue #165).
      lastEndedNightSnapshot: {
        nightChecked: game.nightChecked,
        nightUnskipped: game.nightUnskipped,
        nominations: game.nominations,
      },
    });
  }

  // Undoes "Start night". The state a night opened from is always blank
  // (starting always clears nightChecked/nightUnskipped, and nothing else
  // touches them while a night is closed), so going back just needs to
  // close the night again — including discarding any check-offs made
  // before backing out (issue #165 AC).
  function undoStartNight() {
    onChange({ ...game, nightOpen: false, nightChecked: [], nightUnskipped: [] });
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
      <section className={styles.panel} aria-label="Night list" data-night-sheet>
        {dragHandle}
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
  // The next actionable entry — first unchecked, un-skipped — so the sheet's
  // peek state can show "3/8 · Empath" instead of a bare count (issue #194
  // AC). Undefined once everything's checked off.
  const nextEntry = entries.find((entry) => !entry.skipped && !checkedIds.has(entry.id));
  const progressText = `${checkedCount}/${countable.length}${
    nextEntry ? ` · ${nextEntry.label}` : " done"
  }`;

  return (
    <section className={styles.panel} aria-label="Night list" data-night-sheet>
      {dragHandle}
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

      {/* Kept outside CollapsibleSection, unlike the checklist itself — the
          sheet's peek state (issue #194) still needs this glanceable "how
          much is left, what's next" line without expanding the whole entries
          list (code review finding from the panel's original issue #168). */}
      <p className={styles.progress} role="status">
        {progressText}
      </p>
    </section>
  );
}
