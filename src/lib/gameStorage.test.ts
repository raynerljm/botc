import { afterEach, describe, expect, it, vi } from "vitest";

import { getCharacter } from "./characters";
import { createGame, type GameDocument } from "./gameDocument";
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
    saveGame({ ...game, notes: "changed" });

    expect(listGames()).toHaveLength(1);
    expect(loadGame()?.notes).toBe("changed");
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
