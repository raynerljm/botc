import { afterEach, describe, expect, it, vi } from "vitest";

import { getCharacter } from "./characters";
import { createGame, type GameDocument } from "./gameDocument";
import {
  clearGame,
  getGameSnapshot,
  loadGame,
  saveGame,
  subscribeGame,
} from "./gameStorage";

function makeGame(): GameDocument {
  return createGame({
    scriptId: "tb",
    scriptName: "Trouble Brewing",
    playerCount: 5,
    selectedCharacters: [getCharacter("washerwoman")!],
    standIn: null,
    extraCopies: {},
    createdAt: "2026-07-04T00:00:00.000Z",
  });
}

afterEach(() => {
  clearGame();
});

describe("game storage", () => {
  it("has nothing to load before any game is saved", () => {
    expect(loadGame()).toBeNull();
  });

  it("round-trips a saved game exactly", () => {
    const game = makeGame();
    saveGame(game);

    expect(loadGame()).toEqual(game);
  });

  it("survives a fresh read from storage (not just an in-memory reference)", () => {
    const game = makeGame();
    saveGame(game);

    // Simulate a reload: a second independent load must see the same data.
    expect(loadGame()).toEqual(loadGame());
    expect(loadGame()).not.toBe(game);
  });

  it("clearing removes the saved game", () => {
    saveGame(makeGame());
    clearGame();

    expect(loadGame()).toBeNull();
  });
});

describe("game snapshot subscription (for useSyncExternalStore)", () => {
  it("has no snapshot before any game is saved", () => {
    expect(getGameSnapshot()).toBeNull();
  });

  it("reflects the saved game in its snapshot", () => {
    const game = makeGame();
    saveGame(game);

    expect(getGameSnapshot()).toEqual(game);
  });

  it("notifies subscribers when a game is saved", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeGame(onChange);

    saveGame(makeGame());

    expect(onChange).toHaveBeenCalled();
    unsubscribe();
  });

  it("notifies subscribers when the game is cleared", () => {
    saveGame(makeGame());
    const onChange = vi.fn();
    const unsubscribe = subscribeGame(onChange);

    clearGame();

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
