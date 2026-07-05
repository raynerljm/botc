import { describe, expect, it } from "vitest";

import { getCharacter, type Character } from "./characters";
import {
  createGame,
  type GameDocument,
  type Nomination,
  type Player,
} from "./gameDocument";
import {
  applyVoteToggle,
  computeBlock,
  hasBeenNominatedToday,
  hasNominatedToday,
  nominationTally,
  nominationThreshold,
} from "./dayPhase";

function nomination(overrides: Partial<Nomination> = {}): Nomination {
  return {
    id: "nom-1",
    nominatorId: "p1",
    nomineeId: "p2",
    voterIds: [],
    ...overrides,
  };
}

function characters(...ids: string[]): Character[] {
  return ids.map((id) => getCharacter(id)!);
}

function gameWith(
  selectedIds: string[],
  overrides: Partial<GameDocument> = {},
): GameDocument {
  let n = 0;
  const game = createGame({
    scriptId: "tb",
    scriptName: "Trouble Brewing",
    playerCount: selectedIds.length,
    selectedCharacters: characters(...selectedIds),
    standIn: null,
    extraCopies: {},
    createdAt: "2026-07-04T00:00:00.000Z",
    newId: () => `id-${n++}`,
  });
  const players: Player[] = game.players.map((player, index) => ({
    ...player,
    characterId: selectedIds[index],
  }));
  return { ...game, players, ...overrides };
}

describe("nominationThreshold", () => {
  it("is ceil(living players / 2) for an execution nomination", () => {
    // 7 seated players, none dead: ceil(7/2) = 4.
    const game = gameWith([
      "washerwoman",
      "librarian",
      "investigator",
      "baron",
      "imp",
      "chef",
      "empath",
    ]);
    expect(nominationThreshold(game.players, game.players[0])).toBe(4);
  });

  it("counts only living players, dead players excluded", () => {
    const game = gameWith([
      "washerwoman",
      "librarian",
      "investigator",
      "baron",
      "imp",
      "chef",
      "empath",
    ]);
    // Kill two: 5 living left, ceil(5/2) = 3.
    const players = game.players.map((p, i) =>
      i < 2 ? { ...p, dead: true } : p,
    );
    expect(nominationThreshold(players, players[2])).toBe(3);
  });

  it("is ceil(all players / 2), dead included, for a Traveller nominee (exile)", () => {
    const game = gameWith(["washerwoman", "librarian", "investigator", "baron", "imp"]);
    const players = game.players.map((p, i) => ({
      ...p,
      dead: i === 0,
      isTraveller: i === 4,
    }));
    // 5 total players (dead included): ceil(5/2) = 3.
    expect(nominationThreshold(players, players[4])).toBe(3);
  });
});

describe("nominationTally", () => {
  it("is the number of recorded voters", () => {
    expect(nominationTally(nomination({ voterIds: [] }))).toBe(0);
    expect(nominationTally(nomination({ voterIds: ["p3", "p4", "p5"] }))).toBe(3);
  });
});

describe("computeBlock", () => {
  const game = gameWith([
    "washerwoman",
    "librarian",
    "investigator",
    "baron",
    "imp",
    "chef",
    "empath",
  ]);
  // 7 living players: execution threshold is ceil(7/2) = 4.
  const [, p2, p3, p4] = game.players;

  it("has no block-holder when there are no nominations", () => {
    expect(computeBlock([], game.players)).toEqual({
      nominationId: null,
      playerId: null,
      tally: 0,
    });
  });

  it("doesn't put a nominee on the block below threshold", () => {
    const nominations = [
      nomination({ id: "n1", nomineeId: p2.id, voterIds: ["a", "b", "c"] }),
    ];
    expect(computeBlock(nominations, game.players)).toEqual({
      nominationId: null,
      playerId: null,
      tally: 0,
    });
  });

  it("puts a nominee on the block once tally meets threshold", () => {
    const nominations = [
      nomination({ id: "n1", nomineeId: p2.id, voterIds: ["a", "b", "c", "d"] }),
    ];
    expect(computeBlock(nominations, game.players)).toEqual({
      nominationId: "n1",
      playerId: p2.id,
      tally: 4,
    });
  });

  it("replaces the block-holder when a later nomination strictly beats it", () => {
    const nominations = [
      nomination({ id: "n1", nomineeId: p2.id, voterIds: ["a", "b", "c", "d"] }),
      nomination({
        id: "n2",
        nomineeId: p3.id,
        voterIds: ["a", "b", "c", "d", "e"],
      }),
    ];
    expect(computeBlock(nominations, game.players)).toEqual({
      nominationId: "n2",
      playerId: p3.id,
      tally: 5,
    });
  });

  it("leaves the block-holder in place when a later nomination doesn't beat it", () => {
    const nominations = [
      nomination({
        id: "n1",
        nomineeId: p2.id,
        voterIds: ["a", "b", "c", "d", "e"],
      }),
      nomination({ id: "n2", nomineeId: p3.id, voterIds: ["a", "b", "c", "d"] }),
    ];
    expect(computeBlock(nominations, game.players)).toEqual({
      nominationId: "n1",
      playerId: p2.id,
      tally: 5,
    });
  });

  it("clears the block on an exact tie with the current block-holder", () => {
    const nominations = [
      nomination({ id: "n1", nomineeId: p2.id, voterIds: ["a", "b", "c", "d"] }),
      nomination({ id: "n2", nomineeId: p3.id, voterIds: ["a", "b", "c", "d"] }),
    ];
    expect(computeBlock(nominations, game.players)).toEqual({
      nominationId: null,
      playerId: null,
      tally: 0,
    });
  });

  it("keeps a cleared block clearable/re-fillable by a further nomination", () => {
    const nominations = [
      nomination({ id: "n1", nomineeId: p2.id, voterIds: ["a", "b", "c", "d"] }),
      nomination({ id: "n2", nomineeId: p3.id, voterIds: ["a", "b", "c", "d"] }), // tie clears
      nomination({ id: "n3", nomineeId: p4.id, voterIds: ["a", "b", "c", "d"] }),
    ];
    expect(computeBlock(nominations, game.players)).toEqual({
      nominationId: "n3",
      playerId: p4.id,
      tally: 4,
    });
  });

  it("uses the exile threshold (dead included) for a Traveller nominee", () => {
    // 7 players total; mark one dead and one a traveller nominee.
    const players = game.players.map((p, i) => ({
      ...p,
      dead: i === 0,
      isTraveller: i === 5,
    }));
    const traveller = players[5];
    // ceil(7/2) = 4 (all players, dead included) — 3 voters isn't enough.
    const nominations = [
      nomination({ id: "n1", nomineeId: traveller.id, voterIds: ["a", "b", "c"] }),
    ];
    expect(computeBlock(nominations, players)).toEqual({
      nominationId: null,
      playerId: null,
      tally: 0,
    });
  });
});

describe("applyVoteToggle", () => {
  const game = gameWith(["washerwoman", "imp", "chef"]);
  const [alice, bob, carol] = game.players;

  it("adds and removes a living player's vote with no ghost-vote side effect", () => {
    const nominations = [nomination({ id: "n1", nomineeId: bob.id, voterIds: [] })];

    const voted = applyVoteToggle(nominations, game.players, "n1", alice.id);
    expect(voted.nominations[0].voterIds).toEqual([alice.id]);
    expect(voted.players.find((p) => p.id === alice.id)?.ghostVoteSpent).toBe(false);

    const unvoted = applyVoteToggle(voted.nominations, voted.players, "n1", alice.id);
    expect(unvoted.nominations[0].voterIds).toEqual([]);
  });

  it("spends a dead player's ghost vote when recording their execution vote, and undoes it on toggle-off", () => {
    const players = game.players.map((p) => (p.id === carol.id ? { ...p, dead: true } : p));
    const nominations = [nomination({ id: "n1", nomineeId: bob.id, voterIds: [] })];

    const voted = applyVoteToggle(nominations, players, "n1", carol.id);
    expect(voted.nominations[0].voterIds).toEqual([carol.id]);
    expect(voted.players.find((p) => p.id === carol.id)?.ghostVoteSpent).toBe(true);

    const undone = applyVoteToggle(voted.nominations, voted.players, "n1", carol.id);
    expect(undone.nominations[0].voterIds).toEqual([]);
    expect(undone.players.find((p) => p.id === carol.id)?.ghostVoteSpent).toBe(false);
  });

  it("never spends a ghost vote for an exile nomination, even for a dead voter", () => {
    const players = game.players.map((p) => {
      if (p.id === bob.id) return { ...p, isTraveller: true };
      if (p.id === carol.id) return { ...p, dead: true };
      return p;
    });
    const nominations = [nomination({ id: "n1", nomineeId: bob.id, voterIds: [] })];

    const voted = applyVoteToggle(nominations, players, "n1", carol.id);
    expect(voted.nominations[0].voterIds).toEqual([carol.id]);
    expect(voted.players.find((p) => p.id === carol.id)?.ghostVoteSpent).toBe(false);
  });

  it("is a no-op for an unknown nomination id", () => {
    const nominations = [nomination({ id: "n1", nomineeId: bob.id, voterIds: [] })];
    const result = applyVoteToggle(nominations, game.players, "unknown", alice.id);
    expect(result.nominations).toBe(nominations);
    expect(result.players).toBe(game.players);
  });
});

describe("hasNominatedToday / hasBeenNominatedToday", () => {
  it("tracks whether a player has already made or received a nomination today", () => {
    const nominations = [nomination({ nominatorId: "p1", nomineeId: "p2" })];
    expect(hasNominatedToday(nominations, "p1")).toBe(true);
    expect(hasNominatedToday(nominations, "p2")).toBe(false);
    expect(hasBeenNominatedToday(nominations, "p2")).toBe(true);
    expect(hasBeenNominatedToday(nominations, "p1")).toBe(false);
  });
});
