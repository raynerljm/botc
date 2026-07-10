// Freeform storyteller notes, organized into sections (issue #193): a
// persistent General plus one auto-created per phase as it begins, so notes
// accumulate in step with the game instead of living in one undifferentiated
// blob (CONTEXT.md: Notes).
export interface NotesSection {
  id: string;
  title: string;
  text: string;
}

export const GENERAL_NOTES_SECTION_ID = "general";

export function createInitialNotes(): NotesSection[] {
  return [{ id: GENERAL_NOTES_SECTION_ID, title: "General", text: "" }];
}

export function nightNotesSectionId(nightNumber: number): string {
  return `night-${nightNumber}`;
}

export function dayNotesSectionId(day: number): string {
  return `day-${day}`;
}

// Appends a new empty section for `id`/`title` if one doesn't already exist.
// Idempotent, so a phase-transition handler firing again (or its own undo
// path re-firing) never creates a duplicate or clobbers text already jotted
// under that section.
export function withNotesSection(
  notes: NotesSection[],
  id: string,
  title: string,
): NotesSection[] {
  if (notes.some((section) => section.id === id)) return notes;
  return [...notes, { id, title, text: "" }];
}

// Bundles a phase's section id with its storyteller-facing title, so the
// naming convention ("Night N" / "Day N") lives in this one file rather than
// being re-spelled out at each call site (NightList.tsx's Start/End night
// handlers).
export function withNightNotesSection(
  notes: NotesSection[],
  nightNumber: number,
): NotesSection[] {
  return withNotesSection(notes, nightNotesSectionId(nightNumber), `Night ${nightNumber}`);
}

export function withDayNotesSection(notes: NotesSection[], day: number): NotesSection[] {
  return withNotesSection(notes, dayNotesSectionId(day), `Day ${day}`);
}

export function withUpdatedNotesSection(
  notes: NotesSection[],
  id: string,
  text: string,
): NotesSection[] {
  return notes.map((section) => (section.id === id ? { ...section, text } : section));
}

// Drops `id`'s section only if the storyteller never wrote anything in it —
// used to undo a Start/End night's automatic section creation on "Back" or
// "Reopen" without ever discarding text the storyteller already jotted.
export function withoutEmptyNotesSection(
  notes: NotesSection[],
  id: string,
): NotesSection[] {
  const section = notes.find((s) => s.id === id);
  if (!section || section.text !== "") return notes;
  return notes.filter((s) => s.id !== id);
}

// Migrates a pre-#193 freeform-string notes field into the sectioned shape,
// preserving whatever the storyteller had already written as the General
// section's text (AC: "without data loss").
export function migrateLegacyNotes(legacyNotes: string): NotesSection[] {
  return [{ id: GENERAL_NOTES_SECTION_ID, title: "General", text: legacyNotes }];
}

function isNotesSection(value: unknown): value is NotesSection {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as NotesSection).id === "string" &&
    typeof (value as NotesSection).title === "string" &&
    typeof (value as NotesSection).text === "string"
  );
}

// Coerces a raw `notes` value of unknown shape (a saved document from any
// prior era — or hand-edited/corrupted localStorage, per the same
// defensiveness this codebase already applies to other stored positions) into
// the current sectioned form — shared by every notes migration path
// (gameStorage's v20 upgrade and its pre-#21 legacy-key promotion) so "what
// does an old/malformed notes value become" is answered in exactly one
// place. An array is validated element-by-element rather than trusted
// outright, and the persistent General section is guaranteed even if a
// malformed array didn't carry one (Copilot review finding).
export function coerceNotes(rawNotes: unknown): NotesSection[] {
  if (typeof rawNotes === "string") return migrateLegacyNotes(rawNotes);
  if (Array.isArray(rawNotes)) {
    const sections = rawNotes.filter(isNotesSection);
    return sections.some((section) => section.id === GENERAL_NOTES_SECTION_ID)
      ? sections
      : [{ id: GENERAL_NOTES_SECTION_ID, title: "General", text: "" }, ...sections];
  }
  return createInitialNotes();
}
