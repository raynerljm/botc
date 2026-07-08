import { afterEach, describe, expect, it, vi } from "vitest";

import { getCharacter } from "./characters";
import { createGame, type GameDocument, type Player } from "./gameDocument";
import {
  buildGameSnapshot,
  downloadGameSnapshot,
  EXPORT_SCHEMA_VERSION,
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
      startingCharacterId: "imp",
      isDrunk: false,
      isTraveller: false,
      travellerAlignment: null,
    },
    {
      ...base.players[1],
      seat: 2,
      name: "Sarah",
      characterId: "washerwoman",
      startingCharacterId: "washerwoman",
      isDrunk: false,
      isTraveller: false,
      travellerAlignment: null,
    },
    {
      ...base.players[2],
      seat: 3,
      name: "Alex",
      characterId: "librarian",
      startingCharacterId: "librarian",
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

    expect(snapshot.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(snapshot.script.name).toBe("Trouble Brewing");
    expect(snapshot.playerCount).toBe(3);
  });

  it("lists the script's characters by id", () => {
    const snapshot = buildGameSnapshot(makeGame());

    expect(snapshot.script.characters).toContain("imp");
    expect(snapshot.script.characters).toContain("washerwoman");
    expect(snapshot.script.characters).toContain("baron");
  });

  it("lists the full script pool, not just in-play characters, so a not-in-play claim or bluff always resolves against it", () => {
    const game = makeGame({
      scriptCharacters: [
        getCharacter("imp")!,
        getCharacter("washerwoman")!,
        getCharacter("librarian")!,
        getCharacter("baron")!,
        // Not selected into this game's bag/characterPool.
        getCharacter("chef")!,
      ],
      demonBluffs: ["chef", null, null],
    });

    const snapshot = buildGameSnapshot(game);

    expect(snapshot.script.characters).toContain("chef");
    expect(snapshot.demonBluffs).toContain("chef");
  });

  it("records each player's starting and final character (equal until a swap slice lands)", () => {
    const snapshot = buildGameSnapshot(makeGame());
    const rayner = snapshot.players.find((p) => p.name === "Rayner")!;

    expect(rayner.seat).toBe(1);
    expect(rayner.startingCharacter).toBe("imp");
    expect(rayner.finalCharacter).toBe("imp");
  });

  it("keeps a swapped player's starting character/alignment distinct from their final one", () => {
    const game = makeGame();
    const swapped: Player = {
      ...game.players[1],
      characterId: "imp",
    };
    const withSwap = {
      ...game,
      players: game.players.map((p, i) => (i === 1 ? swapped : p)),
    };

    const snapshot = buildGameSnapshot(withSwap);
    const sarah = snapshot.players.find((p) => p.name === "Sarah")!;

    expect(sarah.startingCharacter).toBe("washerwoman");
    expect(sarah.finalCharacter).toBe("imp");
    expect(sarah.startingAlignment).toBe("good");
    expect(sarah.finalAlignment).toBe("evil");
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
      startingCharacterId: "scapegoat",
      isDrunk: false,
      isTraveller: true,
      travellerAlignment: "evil",
      dead: false,
      ghostVoteSpent: false,
      position: null,
      claim: null,
      actsAs: null,
      actsAsSetOnNight: null,
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

  it("defaults dead, claim, and demonBluffs when none are set", () => {
    const snapshot = buildGameSnapshot(makeGame());

    expect(snapshot.players.every((p) => p.claim === null)).toBe(true);
    expect(snapshot.demonBluffs).toEqual([]);
  });

  it("records a player's dead state", () => {
    const game = makeGame();
    const withDeath = {
      ...game,
      players: game.players.map((p, i) => (i === 0 ? { ...p, dead: true } : p)),
    };

    const snapshot = buildGameSnapshot(withDeath);

    expect(snapshot.players.find((p) => p.name === "Rayner")!.dead).toBe(true);
    expect(snapshot.players.find((p) => p.name === "Sarah")!.dead).toBe(false);
  });

  it("carries the game's active Fabled", () => {
    const snapshot = buildGameSnapshot(
      makeGame({ activeFabled: ["angel", "buddhist"] }),
    );

    expect(snapshot.activeFabled).toEqual(["angel", "buddhist"]);
  });

  it("carries each player's dead state and claim into the snapshot", () => {
    const game = makeGame();
    const [rayner, sarah] = game.players;
    const withState = {
      ...game,
      players: [
        { ...rayner, dead: true, claim: "washerwoman" },
        { ...sarah, claim: "librarian" },
        ...game.players.slice(2),
      ],
    };

    const snapshot = buildGameSnapshot(withState);

    expect(snapshot.players.find((p) => p.name === "Rayner")).toMatchObject({
      dead: true,
      claim: "washerwoman",
    });
    expect(snapshot.players.find((p) => p.name === "Sarah")).toMatchObject({
      dead: false,
      claim: "librarian",
    });
  });

  it("records a stand-in's true identity as the Drunk", () => {
    const snapshot = buildGameSnapshot(makeGame());
    const alex = snapshot.players.find((p) => p.name === "Alex")!;

    expect(alex.startingCharacter).toBe("librarian");
    expect(alex.isDrunk).toBe(true);
  });

  it("marks a genuine (non-Drunk) player false", () => {
    const snapshot = buildGameSnapshot(makeGame());
    const sarah = snapshot.players.find((p) => p.name === "Sarah")!;

    expect(sarah.isDrunk).toBe(false);
  });

  it("carries only the filled Demon bluff slots into the snapshot", () => {
    const game = makeGame({
      demonBluffs: ["fortuneteller", null, "slayer"],
    });

    const snapshot = buildGameSnapshot(game);

    expect(snapshot.demonBluffs).toEqual(["fortuneteller", "slayer"]);
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

  it("dates the filename by the SGT calendar day, not UTC's", () => {
    // 2026-07-04T20:00:00Z is 2026-07-05T04:00:00+08:00 in SGT.
    expect(
      gameSnapshotFilename(
        makeGame({ endedAt: "2026-07-04T20:00:00.000Z" }),
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
