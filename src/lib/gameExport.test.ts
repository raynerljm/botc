import { afterEach, describe, expect, it, vi } from "vitest";

import { getCharacter } from "./characters";
import { createGame, type GameDocument, type Player } from "./gameDocument";
import {
  buildGameSnapshot,
  downloadGameSnapshot,
  gameSnapshotFilename,
  serializeGameSnapshot,
} from "./gameExport";

// A finished-ish game to snapshot: an evil Imp, a good Washerwoman, a Drunk
// standing in as the Librarian, and a traveller — enough to exercise every
// alignment path the export derives.
function makeGame(overrides: Partial<GameDocument> = {}): GameDocument {
  const base = createGame({
    scriptId: "tb",
    scriptName: "Trouble Brewing",
    playerCount: 3,
    selectedCharacters: [
      getCharacter("imp")!,
      getCharacter("washerwoman")!,
      getCharacter("librarian")!,
      getCharacter("baron")!,
    ],
    standIn: null,
    extraCopies: {},
    createdAt: "2026-07-04T00:00:00.000Z",
  });

  const players: Player[] = [
    {
      ...base.players[0],
      seat: 1,
      name: "Rayner",
      characterId: "imp",
      isDrunk: false,
      isTraveller: false,
      travellerAlignment: null,
    },
    {
      ...base.players[1],
      seat: 2,
      name: "Sarah",
      characterId: "washerwoman",
      isDrunk: false,
      isTraveller: false,
      travellerAlignment: null,
    },
    {
      ...base.players[2],
      seat: 3,
      name: "Alex",
      characterId: "librarian",
      isDrunk: true,
      isTraveller: false,
      travellerAlignment: null,
    },
  ];

  return { ...base, players, ...overrides };
}

describe("buildGameSnapshot", () => {
  it("stamps schema version, script, and player count (travellers excluded)", () => {
    const snapshot = buildGameSnapshot(makeGame());

    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.script.name).toBe("Trouble Brewing");
    expect(snapshot.playerCount).toBe(3);
  });

  it("lists the script's characters by id", () => {
    const snapshot = buildGameSnapshot(makeGame());

    expect(snapshot.script.characters).toContain("imp");
    expect(snapshot.script.characters).toContain("washerwoman");
    expect(snapshot.script.characters).toContain("baron");
  });

  it("records each player's starting and final character (equal until a swap slice lands)", () => {
    const snapshot = buildGameSnapshot(makeGame());
    const rayner = snapshot.players.find((p) => p.name === "Rayner")!;

    expect(rayner.seat).toBe(1);
    expect(rayner.startingCharacter).toBe("imp");
    expect(rayner.finalCharacter).toBe("imp");
  });

  it("derives good/evil alignment from the character's team", () => {
    const snapshot = buildGameSnapshot(makeGame());

    const imp = snapshot.players.find((p) => p.name === "Rayner")!;
    const washer = snapshot.players.find((p) => p.name === "Sarah")!;
    expect(imp.startingAlignment).toBe("evil");
    expect(imp.finalAlignment).toBe("evil");
    expect(washer.startingAlignment).toBe("good");
  });

  it("uses the chosen alignment for travellers rather than their team", () => {
    const game = makeGame();
    const evilTraveller: Player = {
      id: "traveller-1",
      seat: 4,
      name: "Nomad",
      characterId: "scapegoat",
      isDrunk: false,
      isTraveller: true,
      travellerAlignment: "evil",
      dead: false,
      ghostVoteSpent: false,
      position: null,
    };
    const withTraveller = {
      ...game,
      players: [...game.players, evilTraveller],
      characterPool: [...game.characterPool, getCharacter("scapegoat")!],
    };

    const snapshot = buildGameSnapshot(withTraveller);
    const nomad = snapshot.players.find((p) => p.name === "Nomad")!;

    expect(nomad.startingAlignment).toBe("evil");
    // A traveller doesn't count toward the setup player count.
    expect(snapshot.playerCount).toBe(3);
  });

  it("carries winner, notes, start and end timestamps for an ended game", () => {
    const snapshot = buildGameSnapshot(
      makeGame({
        winner: "good",
        endedAt: "2026-07-04T02:30:00.000Z",
        notes: "Slayer shot the Imp on day 3.",
      }),
    );

    expect(snapshot.winner).toBe("good");
    expect(snapshot.startedAt).toBe("2026-07-04T00:00:00.000Z");
    expect(snapshot.endedAt).toBe("2026-07-04T02:30:00.000Z");
    expect(snapshot.notes).toBe("Slayer shot the Imp on day 3.");
  });

  it("snapshots an in-progress game with a null winner and end time", () => {
    const snapshot = buildGameSnapshot(makeGame());

    expect(snapshot.winner).toBeNull();
    expect(snapshot.endedAt).toBeNull();
  });

  it("defaults forward-looking fields not yet tracked (dead, claim, demonBluffs)", () => {
    const snapshot = buildGameSnapshot(makeGame());

    expect(snapshot.players.every((p) => p.dead === false)).toBe(true);
    expect(snapshot.players.every((p) => p.claim === null)).toBe(true);
    expect(snapshot.demonBluffs).toEqual([]);
  });
});

describe("serializeGameSnapshot", () => {
  it("produces pretty-printed JSON that round-trips to the snapshot", () => {
    const game = makeGame({ winner: "evil" });
    const json = serializeGameSnapshot(game);

    expect(json).toContain("\n  ");
    expect(JSON.parse(json)).toEqual(buildGameSnapshot(game));
  });
});

describe("gameSnapshotFilename", () => {
  it("slugs the script name and dates it by the game's end (or start)", () => {
    expect(gameSnapshotFilename(makeGame())).toBe(
      "botc-trouble-brewing-2026-07-04.json",
    );
    expect(
      gameSnapshotFilename(
        makeGame({ endedAt: "2026-07-05T10:00:00.000Z" }),
      ),
    ).toBe("botc-trouble-brewing-2026-07-05.json");
  });
});

describe("downloadGameSnapshot", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("clicks a temporary anchor and defers revoking the object URL", () => {
    const createObjectURL = vi.fn(() => "blob:fake-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    vi.useFakeTimers();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    downloadGameSnapshot(makeGame());

    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    // The anchor is removed from the DOM right away…
    expect(document.querySelector("a[download]")).toBeNull();
    // …but the object URL isn't revoked in the same tick (Safari can cancel
    // the download if it is).
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake-url");
  });
});
