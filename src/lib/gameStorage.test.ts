import { afterEach, describe, expect, it, vi } from "vitest";

import { getCharacter } from "./characters";
import { createGame, GAME_SCHEMA_VERSION, type GameDocument } from "./gameDocument";
import {
  clearGames,
  deleteGame,
  getGameSnapshot,
  getGamesSnapshot,
  listGames,
  loadGame,
  saveGame,
  setActiveGame,
  subscribeGame,
  subscribeGames,
} from "./gameStorage";

// A monotonically increasing id source shared across every makeGame call, so
// two games built in the same test never collide on an id.
let nextId = 0;
function makeGame(name = "Trouble Brewing"): GameDocument {
  return createGame({
    scriptId: "tb",
    scriptName: name,
    playerCount: 5,
    selectedCharacters: [getCharacter("washerwoman")!],
    standIn: null,
    extraCopies: {},
    createdAt: "2026-07-04T00:00:00.000Z",
    newId: () => `id-${nextId++}`,
  });
}

afterEach(() => {
  clearGames();
});

describe("active game", () => {
  it("has no active game before anything is saved", () => {
    expect(loadGame()).toBeNull();
  });

  it("round-trips the active game exactly", () => {
    const game = makeGame();
    saveGame(game);

    expect(loadGame()).toEqual(game);
  });

  it("survives a fresh read from storage (not just an in-memory reference)", () => {
    const game = makeGame();
    saveGame(game);

    expect(loadGame()).toEqual(loadGame());
    expect(loadGame()).not.toBe(game);
  });

  it("saving an existing game updates it in place rather than duplicating", () => {
    const game = makeGame();
    saveGame(game);
    saveGame({
      ...game,
      notes: [{ id: "general", title: "General", text: "changed" }],
    });

    expect(listGames()).toHaveLength(1);
    expect(loadGame()?.notes).toEqual([
      { id: "general", title: "General", text: "changed" },
    ]);
  });

  it("makes the most recently saved game the active one", () => {
    const first = makeGame("Trouble Brewing");
    const second = makeGame("Sects & Violets");
    saveGame(first);
    saveGame(second);

    expect(loadGame()?.id).toBe(second.id);
    expect(listGames()).toHaveLength(2);
  });
});

describe("games list", () => {
  it("keeps every saved game", () => {
    const a = makeGame("A");
    const b = makeGame("B");
    saveGame(a);
    saveGame(b);

    expect(listGames().map((g) => g.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("resuming a game makes it active without changing the list", () => {
    const a = makeGame("A");
    const b = makeGame("B");
    saveGame(a);
    saveGame(b);

    setActiveGame(a.id);

    expect(loadGame()?.id).toBe(a.id);
    expect(listGames()).toHaveLength(2);
  });

  it("deleting a game removes it and clears the active pointer if it was active", () => {
    const a = makeGame("A");
    const b = makeGame("B");
    saveGame(a);
    saveGame(b); // b is active

    deleteGame(b.id);

    expect(listGames().map((g) => g.id)).toEqual([a.id]);
    expect(loadGame()).toBeNull();
  });

  it("deleting a non-active game leaves the active game untouched", () => {
    const a = makeGame("A");
    const b = makeGame("B");
    saveGame(a);
    saveGame(b); // b is active

    deleteGame(a.id);

    expect(loadGame()?.id).toBe(b.id);
    expect(listGames().map((g) => g.id)).toEqual([b.id]);
  });
});

describe("legacy migration (pre-#21 single-game key)", () => {
  // Pre-#21 shape: no `id`/`winner`/`endedAt`/`notes` — those were added by
  // this slice, so a genuinely old save has none of them.
  function legacyDocument(overrides: Record<string, unknown> = {}) {
    const legacy = Object.fromEntries(
      Object.entries(makeGame("Legacy Game")).filter(
        ([key]) => !["id", "winner", "endedAt", "notes"].includes(key),
      ),
    );
    return { ...legacy, ...overrides };
  }

  it("promotes an existing botc:game document into the games list as the active game", () => {
    window.localStorage.setItem(
      "botc:game",
      JSON.stringify(legacyDocument()),
    );

    const game = loadGame();
    expect(game).not.toBeNull();
    expect(game?.scriptName).toBe("Legacy Game");
    expect(listGames()).toHaveLength(1);
  });

  it("backfills winner/endedAt/notes defaults and mints an id", () => {
    window.localStorage.setItem(
      "botc:game",
      JSON.stringify(legacyDocument()),
    );

    const game = loadGame()!;
    expect(game.id).toBeTruthy();
    expect(game.winner).toBeNull();
    expect(game.endedAt).toBeNull();
    expect(game.notes).toEqual([{ id: "general", title: "General", text: "" }]);
  });

  it("removes the legacy key once migrated", () => {
    window.localStorage.setItem(
      "botc:game",
      JSON.stringify(legacyDocument()),
    );

    loadGame();

    expect(window.localStorage.getItem("botc:game")).toBeNull();
  });

  it("does nothing when there's no legacy key", () => {
    expect(loadGame()).toBeNull();
    expect(listGames()).toHaveLength(0);
  });

  it("ignores legacy data from a different schema version", () => {
    window.localStorage.setItem(
      "botc:game",
      JSON.stringify(legacyDocument({ schemaVersion: 999 })),
    );

    expect(loadGame()).toBeNull();
  });

  it("never overwrites an already-migrated (or freshly saved) games store", () => {
    const current = makeGame("Current Game");
    saveGame(current);
    window.localStorage.setItem(
      "botc:game",
      JSON.stringify(legacyDocument()),
    );

    expect(loadGame()?.scriptName).toBe("Current Game");
    expect(listGames()).toHaveLength(1);
  });
});

describe("notes migration (issue #193: schemaVersion 20 -> 21)", () => {
  // A v20 game as it existed on disk before issue #193: `notes` was a plain
  // string, one schema version behind current.
  function v20GameWithNotes(notes: string): GameDocument {
    return {
      ...makeGame("Pre-#193 Game"),
      schemaVersion: 20,
      notes,
    } as unknown as GameDocument;
  }

  it("upgrades a v20 game's freeform notes into the General section without losing the text", () => {
    const legacy = v20GameWithNotes("Slayer shot the Imp on day 3.");
    window.localStorage.setItem(
      "botc:games",
      JSON.stringify({ activeId: legacy.id, games: [legacy] }),
    );

    const game = loadGame()!;
    // The current schema version, not the v21 milestone issue #193 itself
    // introduced — a later, unrelated bump (issue #192) chains straight past
    // it via upgradeV21Rotation, so a migrated v20 document ends up fully
    // current rather than stuck one bump behind.
    expect(game.schemaVersion).toBe(GAME_SCHEMA_VERSION);
    expect(game.notes).toEqual([
      { id: "general", title: "General", text: "Slayer shot the Imp on day 3." },
    ]);
  });

  it("still drops a game from any other outdated schema version", () => {
    const ancient = { ...v20GameWithNotes("x"), schemaVersion: 5 };
    window.localStorage.setItem(
      "botc:games",
      JSON.stringify({ activeId: ancient.id, games: [ancient] }),
    );

    expect(loadGame()).toBeNull();
    expect(listGames()).toHaveLength(0);
  });

  it("backfills the new notesCollapsed field a real v20 document never had, rather than leaving it undefined", () => {
    // A real pre-#193 v20 document never had `notesCollapsed` at all — that
    // field was introduced by the same bump that sectioned `notes`. Strip it
    // to reproduce the actual on-disk shape rather than a fixture that
    // already carries every current-schema field.
    const legacy = v20GameWithNotes("x") as unknown as Record<string, unknown>;
    delete legacy.notesCollapsed;
    window.localStorage.setItem(
      "botc:games",
      JSON.stringify({ activeId: legacy.id, games: [legacy] }),
    );

    const game = loadGame()!;
    expect(game.notesCollapsed).toBe(false);
  });
});

describe("rotation migration (issue #192: schemaVersion 21 -> 22, chained after the notes migration)", () => {
  it("backfills rotation on a v20 document, chaining straight through both migrations to the current version", () => {
    const legacy = {
      ...makeGame("Pre-#193 Game"),
      schemaVersion: 20,
      notes: "x",
    } as unknown as Record<string, unknown>;
    delete legacy.rotation;
    window.localStorage.setItem(
      "botc:games",
      JSON.stringify({ activeId: legacy.id, games: [legacy] }),
    );

    const game = loadGame()!;
    expect(game.schemaVersion).toBe(GAME_SCHEMA_VERSION);
    expect(game.rotation).toBe(0);
  });

  it("backfills rotation on a real v21 document (notes already sectioned, rotation never existed yet)", () => {
    const v21 = {
      ...makeGame("Pre-#192 Game"),
      schemaVersion: 21,
    } as unknown as Record<string, unknown>;
    delete v21.rotation;
    window.localStorage.setItem(
      "botc:games",
      JSON.stringify({ activeId: v21.id, games: [v21] }),
    );

    const game = loadGame()!;
    expect(game.schemaVersion).toBe(GAME_SCHEMA_VERSION);
    expect(game.rotation).toBe(0);
  });
});

describe("homePlayerId migration (issue #213: schemaVersion 22 -> 23)", () => {
  it("backfills a v22 reminder's homePlayerId from its current anchorPlayerId", () => {
    const base = makeGame("Pre-#213 Game");
    const v22 = {
      ...base,
      schemaVersion: 22,
      reminders: [
        {
          id: "r1",
          characterId: null,
          label: "Poisoned",
          position: { x: 10, y: 20 },
          anchorPlayerId: base.players[0].id,
        },
      ],
    } as unknown as Record<string, unknown>;
    window.localStorage.setItem(
      "botc:games",
      JSON.stringify({ activeId: v22.id, games: [v22] }),
    );

    const game = loadGame()!;
    expect(game.schemaVersion).toBe(GAME_SCHEMA_VERSION);
    expect(game.reminders[0].homePlayerId).toBe(base.players[0].id);
  });

  it("backfills a v22 reminder that was already dragged free with no home, rather than inventing one", () => {
    const base = makeGame("Pre-#213 Game");
    const v22 = {
      ...base,
      schemaVersion: 22,
      reminders: [
        {
          id: "r1",
          characterId: null,
          label: "Poisoned",
          position: { x: 10, y: 20 },
          anchorPlayerId: null,
        },
      ],
    } as unknown as Record<string, unknown>;
    window.localStorage.setItem(
      "botc:games",
      JSON.stringify({ activeId: v22.id, games: [v22] }),
    );

    const game = loadGame()!;
    expect(game.schemaVersion).toBe(GAME_SCHEMA_VERSION);
    expect(game.reminders[0].homePlayerId).toBeNull();
  });

  it("chains a v20 document with reminders all the way to the current schema version", () => {
    const base = makeGame("Pre-#193 Game");
    const legacy = {
      ...base,
      schemaVersion: 20,
      notes: "x",
      reminders: [
        {
          id: "r1",
          characterId: null,
          label: "Poisoned",
          position: { x: 10, y: 20 },
          anchorPlayerId: base.players[0].id,
        },
      ],
    } as unknown as Record<string, unknown>;
    delete legacy.rotation;
    window.localStorage.setItem(
      "botc:games",
      JSON.stringify({ activeId: legacy.id, games: [legacy] }),
    );

    const game = loadGame()!;
    expect(game.schemaVersion).toBe(GAME_SCHEMA_VERSION);
    expect(game.reminders[0].homePlayerId).toBe(base.players[0].id);
  });
});

describe("snapshots (for useSyncExternalStore)", () => {
  it("reflects the active game and the full list in their snapshots", () => {
    const game = makeGame();
    saveGame(game);

    expect(getGameSnapshot()).toEqual(game);
    expect(getGamesSnapshot()).toHaveLength(1);
  });

  it("returns a stable list reference until storage changes", () => {
    saveGame(makeGame());

    expect(getGamesSnapshot()).toBe(getGamesSnapshot());
  });

  it("notifies game subscribers on save and delete", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeGame(onChange);
    const game = makeGame();

    saveGame(game);
    deleteGame(game.id);

    expect(onChange).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("notifies list subscribers on save", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeGames(onChange);

    saveGame(makeGame());

    expect(onChange).toHaveBeenCalled();
    unsubscribe();
  });

  it("stops notifying after unsubscribing", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeGame(onChange);
    unsubscribe();

    saveGame(makeGame());

    expect(onChange).not.toHaveBeenCalled();
  });
});
