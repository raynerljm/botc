"use client";

import type { GameDocument } from "@/lib/gameDocument";
import { GENERAL_NOTES_SECTION_ID } from "@/lib/gameNotes";

import { CollapsibleSection } from "./CollapsibleSection";
import styles from "./GameNotes.module.css";

export interface GameNotesProps {
  game: GameDocument;
  // Reports only the edited section's id and new text, never a precomputed
  // full notes array — this panel is reachable during a bag draw (issue
  // #193 AC: "editable during play"), so the *read* half of this
  // read-modify-write must happen against the caller's freshest state
  // (gameRef.current), not this render's `game` prop, or a same-tick
  // draw-stage write to `notes` could get silently reverted (code review
  // finding).
  onChangeSection: (id: string, text: string) => void;
  onToggleCollapsed: (collapsed: boolean) => void;
}

export function GameNotes({ game, onChangeSection, onToggleCollapsed }: GameNotesProps) {
  return (
    <section className={styles.panel} aria-label="Notes">
      <CollapsibleSection
        title="Notes"
        collapsed={game.notesCollapsed}
        onToggleCollapsed={onToggleCollapsed}
      >
        {/* Sections are stored oldest-first (General, then each phase as it
            begins — gameNotes.ts's withNotesSection appends) so storage and
            export stay chronological; display order is flipped here only,
            newest phase on top with General last (issue #214). */}
        {[...game.notes].reverse().map((section) => (
          <label key={section.id} className={styles.section}>
            {section.title}
            <textarea
              value={section.text}
              placeholder={
                section.id === GENERAL_NOTES_SECTION_ID
                  ? "Anything worth remembering about this game…"
                  : undefined
              }
              onChange={(event) => onChangeSection(section.id, event.target.value)}
            />
          </label>
        ))}
      </CollapsibleSection>
    </section>
  );
}
