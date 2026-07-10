import { describe, expect, it } from "vitest";

import {
  coerceNotes,
  createInitialNotes,
  dayNotesSectionId,
  GENERAL_NOTES_SECTION_ID,
  migrateLegacyNotes,
  nightNotesSectionId,
  withDayNotesSection,
  withNightNotesSection,
  withNotesSection,
  withoutEmptyNotesSection,
  withUpdatedNotesSection,
} from "./gameNotes";

describe("createInitialNotes", () => {
  it("starts with only a persistent General section, empty", () => {
    expect(createInitialNotes()).toEqual([
      { id: GENERAL_NOTES_SECTION_ID, title: "General", text: "" },
    ]);
  });
});

describe("withNotesSection", () => {
  it("appends a new empty section for a phase that hasn't been seen yet", () => {
    const notes = createInitialNotes();

    expect(withNotesSection(notes, nightNotesSectionId(1), "Night 1")).toEqual([
      { id: GENERAL_NOTES_SECTION_ID, title: "General", text: "" },
      { id: "night-1", title: "Night 1", text: "" },
    ]);
  });

  it("is idempotent: re-adding a section that already exists changes nothing, including its text", () => {
    const notes = withUpdatedNotesSection(
      withNotesSection(createInitialNotes(), nightNotesSectionId(1), "Night 1"),
      "night-1",
      "The Imp killed Alice.",
    );

    expect(withNotesSection(notes, nightNotesSectionId(1), "Night 1")).toEqual(notes);
  });
});

describe("withUpdatedNotesSection", () => {
  it("replaces only the matching section's text, leaving others untouched", () => {
    const notes = withNotesSection(createInitialNotes(), dayNotesSectionId(1), "Day 1");

    expect(withUpdatedNotesSection(notes, "day-1", "Alice nominated Bob.")).toEqual([
      { id: GENERAL_NOTES_SECTION_ID, title: "General", text: "" },
      { id: "day-1", title: "Day 1", text: "Alice nominated Bob." },
    ]);
  });
});

describe("nightNotesSectionId / dayNotesSectionId", () => {
  it("names sections after the night/day number, matching the storyteller-facing label", () => {
    expect(nightNotesSectionId(2)).toBe("night-2");
    expect(dayNotesSectionId(3)).toBe("day-3");
  });
});

describe("withNightNotesSection / withDayNotesSection", () => {
  it("bundle the id and the 'Night N'/'Day N' title together", () => {
    expect(withNightNotesSection(createInitialNotes(), 2)).toEqual([
      { id: GENERAL_NOTES_SECTION_ID, title: "General", text: "" },
      { id: "night-2", title: "Night 2", text: "" },
    ]);
    expect(withDayNotesSection(createInitialNotes(), 3)).toEqual([
      { id: GENERAL_NOTES_SECTION_ID, title: "General", text: "" },
      { id: "day-3", title: "Day 3", text: "" },
    ]);
  });
});

describe("withoutEmptyNotesSection", () => {
  it("removes the section if it's still empty (an accidental Start-then-Back leaves no clutter)", () => {
    const notes = withNightNotesSection(createInitialNotes(), 1);

    expect(withoutEmptyNotesSection(notes, "night-1")).toEqual([
      { id: GENERAL_NOTES_SECTION_ID, title: "General", text: "" },
    ]);
  });

  it("never discards a section the storyteller already wrote something in", () => {
    const notes = withUpdatedNotesSection(
      withNightNotesSection(createInitialNotes(), 1),
      "night-1",
      "Imp killed Alice.",
    );

    expect(withoutEmptyNotesSection(notes, "night-1")).toEqual(notes);
  });

  it("is a no-op when the section doesn't exist", () => {
    const notes = createInitialNotes();

    expect(withoutEmptyNotesSection(notes, "night-1")).toEqual(notes);
  });
});

describe("coerceNotes", () => {
  it("wraps a legacy freeform string as the General section", () => {
    expect(coerceNotes("Great game.")).toEqual([
      { id: GENERAL_NOTES_SECTION_ID, title: "General", text: "Great game." },
    ]);
  });

  it("passes an already-sectioned array through unchanged", () => {
    const notes = [{ id: "general", title: "General", text: "x" }];
    expect(coerceNotes(notes)).toBe(notes);
  });

  it("defaults to a fresh General section for anything else (missing/malformed)", () => {
    expect(coerceNotes(undefined)).toEqual(createInitialNotes());
    expect(coerceNotes(null)).toEqual(createInitialNotes());
  });
});

describe("migrateLegacyNotes", () => {
  it("wraps a pre-#193 freeform string as the General section's text, unchanged", () => {
    expect(migrateLegacyNotes("Slayer shot the Imp on day 3.")).toEqual([
      {
        id: GENERAL_NOTES_SECTION_ID,
        title: "General",
        text: "Slayer shot the Imp on day 3.",
      },
    ]);
  });

  it("preserves an empty legacy string as an empty General section", () => {
    expect(migrateLegacyNotes("")).toEqual([
      { id: GENERAL_NOTES_SECTION_ID, title: "General", text: "" },
    ]);
  });
});
