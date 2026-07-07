import { describe, expect, it } from "vitest";

import {
  canRecordVote,
  computeBlock,
  currentDay,
  hasNominatedToday,
  hasSpentGhostVoteElsewhereToday,
  livingPlayerCount,
  nominationThreshold,
  wasNominatedToday,
} from "./dayPhase";
import { createGame, type GameDocument, type Nomination, type Player } from "./gameDocument";
import { getCharacter } from "./characters";

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "p1",
    seat: 1,
    name: "Alice",
    characterId: "washerwoman",
    startingCharacterId: "washerwoman",
    isDrunk: false,
    isTraveller: false,
    travellerAlignment: null,
    dead: false,
    ghostVoteSpent: false,
    position: null,
    claim: null,
    actsAs: null,
    actsAsSetOnNight: null,
    ...overrides,
  };
}

function makeNomination(overrides: Partial<Nomination> = {}): Nomination {
  return {
    id: "n1",
    nominatorId: "p1",
    nomineeId: "p2",
    votes: [],
    threshold: 3,
    isExile: false,
    ...overrides,
  };
}

describe("currentDay", () => {
  it("is the number of nights that have closed, since ending a night starts the next day", () => {
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 1,
      selectedCharacters: [getCharacter("washerwoman")!],
      standIn: null,
      extraCopies: {},
    });

    expect(currentDay(game)).toBe(0);
    expect(currentDay({ ...game, night: 1 } as GameDocument)).toBe(1);
  });
});

describe("livingPlayerCount", () => {
  it("counts only players who aren't dead", () => {
    const players = [
      makePlayer({ id: "p1", dead: false }),
      makePlayer({ id: "p2", dead: true }),
      makePlayer({ id: "p3", dead: false }),
    ];

    expect(livingPlayerCount(players)).toBe(2);
  });
});

describe("nominationThreshold", () => {
  it("is half the living players, rounded up, for an ordinary execution", () => {
    const players = [
      makePlayer({ id: "p1" }),
      makePlayer({ id: "p2" }),
      makePlayer({ id: "p3", dead: true }),
      makePlayer({ id: "p4" }),
      makePlayer({ id: "p5" }),
    ];
    const nominee = players[0];

    // 4 living players -> threshold 2.
    expect(nominationThreshold(nominee, players)).toBe(2);
  });

  it("counts everyone, dead included, for a Traveller's exile threshold", () => {
    const players = [
      makePlayer({ id: "p1" }),
      makePlayer({ id: "p2", dead: true }),
      makePlayer({ id: "p3" }),
      makePlayer({
        id: "p4",
        isTraveller: true,
        travellerAlignment: "good",
      }),
    ];
    const traveller = players[3];

    // 4 players total (dead included) -> exile threshold 2.
    expect(nominationThreshold(traveller, players)).toBe(2);
  });
});

describe("computeBlock", () => {
  const players = [
    makePlayer({ id: "p1", name: "Alice" }),
    makePlayer({ id: "p2", name: "Bob" }),
    makePlayer({ id: "p3", name: "Cara" }),
    makePlayer({ id: "p4", name: "Dan" }),
    makePlayer({ id: "p5", name: "Eve" }),
  ];
  // 5 living players -> threshold 3.

  it("puts no one on the block with no nominations", () => {
    expect(computeBlock([], players)).toBeNull();
  });

  it("leaves the block empty when a nomination falls short of threshold", () => {
    const nominations = [
      makeNomination({ nomineeId: "p2", votes: ["p1", "p3"] }),
    ];

    expect(computeBlock(nominations, players)).toBeNull();
  });

  it("puts a nominee on the block once their tally meets threshold", () => {
    const nominations = [
      makeNomination({ nomineeId: "p2", votes: ["p1", "p3", "p4"] }),
    ];

    expect(computeBlock(nominations, players)).toBe("p2");
  });

  it("lets a later nomination take the block by strictly beating the current tally", () => {
    const nominations = [
      makeNomination({ id: "n1", nomineeId: "p2", votes: ["p1", "p3", "p4"] }),
      makeNomination({
        id: "n2",
        nomineeId: "p3",
        votes: ["p1", "p2", "p4", "p5"],
      }),
    ];

    expect(computeBlock(nominations, players)).toBe("p3");
  });

  it("clears the block on an exact tie", () => {
    const nominations = [
      makeNomination({ id: "n1", nomineeId: "p2", votes: ["p1", "p3", "p4"] }),
      makeNomination({ id: "n2", nomineeId: "p3", votes: ["p1", "p2", "p4"] }),
    ];

    expect(computeBlock(nominations, players)).toBeNull();
  });

  it("keeps the current block-holder when a later nomination doesn't beat their tally", () => {
    const nominations = [
      makeNomination({
        id: "n1",
        nomineeId: "p2",
        votes: ["p1", "p3", "p4", "p5"],
      }),
      makeNomination({ id: "n2", nomineeId: "p3", votes: ["p1", "p2", "p4"] }),
    ];

    expect(computeBlock(nominations, players)).toBe("p2");
  });

  it("honours a Traveller nominee's own (higher, exile) snapshotted threshold instead of the execution one", () => {
    const withTraveller = [
      ...players,
      makePlayer({
        id: "p6",
        name: "Traveller",
        isTraveller: true,
        travellerAlignment: "good",
      }),
      makePlayer({ id: "p7", name: "Ghost", dead: true }),
    ];
    // 7 players total -> exile threshold 4; 6 living -> execution threshold 3.
    const nominations = [
      makeNomination({ nomineeId: "p6", votes: ["p1", "p2", "p3"], threshold: 4 }),
    ];

    // 3 votes meets the (wrong) execution threshold but not the exile one.
    expect(computeBlock(nominations, withTraveller)).toBeNull();

    const withFourthVote = [
      makeNomination({
        nomineeId: "p6",
        votes: ["p1", "p2", "p3", "p4"],
        threshold: 4,
      }),
    ];
    expect(computeBlock(withFourthVote, withTraveller)).toBe("p6");
  });

  it("doesn't let a nomination take the block by matching a tied high-water mark — only a strictly higher tally does", () => {
    // 7 living -> threshold 4 (matches issue #113's repro).
    const sevenLiving = [
      ...players,
      makePlayer({ id: "p6", name: "Frankie" }),
      makePlayer({ id: "p7", name: "Gray" }),
    ];
    const nominations = [
      makeNomination({ id: "n1", nomineeId: "p2", votes: ["p1", "p3", "p4", "p5"], threshold: 4 }),
      makeNomination({ id: "n2", nomineeId: "p3", votes: ["p1", "p2", "p4", "p5"], threshold: 4 }),
      makeNomination({ id: "n3", nomineeId: "p6", votes: ["p1", "p2", "p4", "p5"], threshold: 4 }),
    ];

    // n1 takes the block at 4; n2 ties it at 4, clearing the block; n3 also
    // lands exactly on the tied high-water mark of 4, so it doesn't take it
    // either — the third nomination must still not resurrect the block.
    expect(computeBlock(nominations, sevenLiving)).toBeNull();

    const withFifthVote = [
      ...nominations,
      makeNomination({
        id: "n4",
        nomineeId: "p7",
        votes: ["p1", "p2", "p3", "p4", "p5"],
        threshold: 4,
      }),
    ];
    expect(computeBlock(withFifthVote, sevenLiving)).toBe("p7");
  });

  it("keeps each nomination's own snapshotted threshold — a mid-day death never re-qualifies or re-disqualifies a past tally", () => {
    // Recorded earlier in the day against a threshold of 4 (e.g. 7 living):
    // 3 votes fell short. A different player is executed mid-day, dropping
    // the 5-player fixture above to 4 living (threshold 3 if recomputed) —
    // but this nomination's snapshot stays 4, so it must not suddenly "meet
    // threshold" or take the block.
    const nominations = [
      makeNomination({ nomineeId: "p2", votes: ["p1", "p3", "p4"], threshold: 4 }),
    ];
    const afterMiddayDeath = players.map((player) =>
      player.id === "p5" ? { ...player, dead: true } : player,
    );

    expect(computeBlock(nominations, afterMiddayDeath)).toBeNull();
  });

  it("keeps a tied high-water mark standing even after its nominee is removed from the roster entirely (code review finding)", () => {
    // 7 living -> threshold 4. p2 takes the block at 4, then p3 ties it,
    // clearing the block but leaving the high-water mark at 4.
    const sevenLiving = [
      ...players,
      makePlayer({ id: "p6", name: "Frankie" }),
      makePlayer({ id: "p7", name: "Gray" }),
    ];
    const nominations = [
      makeNomination({ id: "n1", nomineeId: "p2", votes: ["p1", "p3", "p4", "p5"], threshold: 4 }),
      makeNomination({ id: "n2", nomineeId: "p3", votes: ["p1", "p2", "p4", "p5"], threshold: 4 }),
    ];
    expect(computeBlock(nominations, sevenLiving)).toBeNull();

    // p2 (the nominee whose nomination set the tied high-water mark) is
    // later removed from the roster entirely — a real mid-game action,
    // distinct from dying. p2's own nomination can no longer be credited,
    // but it must still count toward the high-water mark: p3's matching
    // tally of 4 must still not resurrect the block just because p2 is
    // gone from the player list this fold checks against.
    const rosterWithoutP2 = sevenLiving.filter((player) => player.id !== "p2");
    expect(computeBlock(nominations, rosterWithoutP2)).toBeNull();
  });

  it("never lets an exile tally enter the block fold — it can't take the block, and doesn't stop a later execution from taking it", () => {
    const withTraveller = [
      ...players,
      makePlayer({ id: "p6", name: "Traveller", isTraveller: true, travellerAlignment: "good" }),
    ];
    // 6 players total -> exile threshold 3; 6 living (traveller included) ->
    // execution threshold 3 too.
    const nominations = [
      makeNomination({
        id: "n1",
        nomineeId: "p6",
        votes: ["p1", "p2", "p3"],
        threshold: 3,
        isExile: true,
      }),
      makeNomination({ id: "n2", nomineeId: "p2", votes: ["p1", "p3", "p4"], threshold: 3 }),
    ];

    expect(computeBlock(nominations, withTraveller)).toBe("p2");
  });

  it("matches the issue #114 repro: an exile at its own threshold doesn't corrupt a same-tallied execution's block", () => {
    const eightPlusTraveller = [
      ...players,
      makePlayer({ id: "p6", name: "Frankie" }),
      makePlayer({ id: "p7", name: "Gray" }),
      makePlayer({ id: "p8", name: "Harper" }),
      makePlayer({ id: "p9", name: "Tessa", isTraveller: true, travellerAlignment: "good" }),
    ];
    // 9 players total -> exile threshold 5; 9 living (traveller included) ->
    // execution threshold 5 too, per nominationThreshold's own math.
    const exile = makeNomination({
      id: "exile",
      nomineeId: "p9",
      votes: ["p1", "p2", "p3", "p4", "p5"],
      threshold: 5,
      isExile: true,
    });
    const execution = makeNomination({
      id: "exec",
      nomineeId: "p8",
      votes: ["p1", "p2", "p3", "p4"],
      threshold: 5,
    });

    // Below its own threshold — the exile sitting alongside it in
    // `nominations` must not affect this either way.
    expect(computeBlock([exile, execution], eightPlusTraveller)).toBeNull();

    // A 5th vote exactly matches the exile's tally. Under the old bug this
    // tied against the exile (which was still in the fold) and cleared the
    // block; with the exile excluded entirely, the execution takes it
    // outright instead.
    const executionWithFifthVote = { ...execution, votes: [...execution.votes, "p6"] };
    expect(computeBlock([exile, executionWithFifthVote], eightPlusTraveller)).toBe("p8");
  });

  it("keeps excluding an exile from the fold by its own snapshotted isExile even after its Traveller nominee is removed from the roster entirely", () => {
    const withTraveller = [
      ...players,
      makePlayer({ id: "p6", name: "Traveller", isTraveller: true, travellerAlignment: "good" }),
    ];
    // 6 players total -> exile threshold 3.
    const exile = makeNomination({
      id: "exile",
      nomineeId: "p6",
      votes: ["p1", "p2", "p3"],
      threshold: 3,
      isExile: true,
    });
    const execution = makeNomination({
      id: "exec",
      nomineeId: "p2",
      votes: ["p1", "p3", "p4"],
      threshold: 3,
    });

    // The Traveller is removed from the roster entirely (distinct from
    // dying) — a live `nominee.isTraveller` lookup would find nothing and
    // could misclassify the exile as an execution, corrupting the fold. The
    // snapshotted isExile must keep excluding it regardless.
    const rosterWithoutTraveller = withTraveller.filter((player) => player.id !== "p6");

    expect(computeBlock([exile, execution], rosterWithoutTraveller)).toBe("p2");
  });
});

describe("canRecordVote", () => {
  it("always lets a living player vote", () => {
    const voter = makePlayer({ id: "voter", dead: false });
    expect(canRecordVote(voter, false)).toBe(true);
    expect(canRecordVote(voter, true)).toBe(true);
  });

  it("lets a dead player vote on an execution only while their ghost vote is unspent", () => {
    const unspent = makePlayer({ id: "ghost", dead: true, ghostVoteSpent: false });
    const spent = makePlayer({ id: "ghost", dead: true, ghostVoteSpent: true });

    expect(canRecordVote(unspent, false)).toBe(true);
    expect(canRecordVote(spent, false)).toBe(false);
  });

  it("always lets a dead player vote on an exile, spent or not (exile never touches the ghost vote)", () => {
    const unspent = makePlayer({ id: "ghost", dead: true, ghostVoteSpent: false });
    const spent = makePlayer({ id: "ghost", dead: true, ghostVoteSpent: true });

    expect(canRecordVote(unspent, true)).toBe(true);
    expect(canRecordVote(spent, true)).toBe(true);
  });
});

describe("hasSpentGhostVoteElsewhereToday", () => {
  it("is false when the player has no other recorded execution vote today", () => {
    const nominations = [
      makeNomination({ id: "n1", nomineeId: "execution-nominee", votes: ["ghost"] }),
    ];

    expect(hasSpentGhostVoteElsewhereToday(nominations, "ghost", "n1")).toBe(false);
  });

  it("is true when a different, earlier execution nomination already recorded their vote", () => {
    const nominations = [
      makeNomination({ id: "n1", nomineeId: "execution-nominee", votes: ["ghost"] }),
      makeNomination({ id: "n2", nomineeId: "execution-nominee", votes: [] }),
    ];

    expect(hasSpentGhostVoteElsewhereToday(nominations, "ghost", "n2")).toBe(true);
  });

  it("ignores an exile nomination — voting on an exile never spends the ghost vote", () => {
    const nominations = [
      makeNomination({
        id: "n1",
        nomineeId: "traveller",
        votes: ["ghost"],
        isExile: true,
      }),
      makeNomination({ id: "n2", nomineeId: "execution-nominee", votes: [] }),
    ];

    expect(hasSpentGhostVoteElsewhereToday(nominations, "ghost", "n2")).toBe(false);
  });
});

describe("hasNominatedToday / wasNominatedToday", () => {
  it("reports whether a player has already nominated or been nominated today", () => {
    const nominations = [makeNomination({ nominatorId: "p1", nomineeId: "p2" })];

    expect(hasNominatedToday(nominations, "p1")).toBe(true);
    expect(hasNominatedToday(nominations, "p2")).toBe(false);
    expect(wasNominatedToday(nominations, "p2")).toBe(true);
    expect(wasNominatedToday(nominations, "p1")).toBe(false);
  });

  it("ignores exile calls — an exile is unlimited per day for both the caller and the Traveller target (issue #114)", () => {
    const nominations = [
      makeNomination({ nominatorId: "p1", nomineeId: "traveller", isExile: true }),
    ];

    expect(hasNominatedToday(nominations, "p1")).toBe(false);
    expect(wasNominatedToday(nominations, "traveller")).toBe(false);
  });
});
