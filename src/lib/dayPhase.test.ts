import { describe, expect, it } from "vitest";

import {
  canRecordVote,
  computeBlock,
  currentDay,
  hasNominatedToday,
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
    ...overrides,
  };
}

function makeNomination(overrides: Partial<Nomination> = {}): Nomination {
  return {
    id: "n1",
    nominatorId: "p1",
    nomineeId: "p2",
    votes: [],
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

  it("uses the exile threshold for a Traveller nominee, dead players included", () => {
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
      makeNomination({ nomineeId: "p6", votes: ["p1", "p2", "p3"] }),
    ];

    // 3 votes meets the (wrong) execution threshold but not the exile one.
    expect(computeBlock(nominations, withTraveller)).toBeNull();

    const withFourthVote = [
      makeNomination({ nomineeId: "p6", votes: ["p1", "p2", "p3", "p4"] }),
    ];
    expect(computeBlock(withFourthVote, withTraveller)).toBe("p6");
  });
});

describe("canRecordVote", () => {
  const execution = makePlayer({ id: "nominee", isTraveller: false });
  const exile = makePlayer({
    id: "traveller",
    isTraveller: true,
    travellerAlignment: "good",
  });

  it("always lets a living player vote", () => {
    const voter = makePlayer({ id: "voter", dead: false });
    expect(canRecordVote(voter, execution)).toBe(true);
    expect(canRecordVote(voter, exile)).toBe(true);
  });

  it("lets a dead player vote on an execution only while their ghost vote is unspent", () => {
    const unspent = makePlayer({ id: "ghost", dead: true, ghostVoteSpent: false });
    const spent = makePlayer({ id: "ghost", dead: true, ghostVoteSpent: true });

    expect(canRecordVote(unspent, execution)).toBe(true);
    expect(canRecordVote(spent, execution)).toBe(false);
  });

  it("always lets a dead player vote on an exile, spent or not (exile never touches the ghost vote)", () => {
    const unspent = makePlayer({ id: "ghost", dead: true, ghostVoteSpent: false });
    const spent = makePlayer({ id: "ghost", dead: true, ghostVoteSpent: true });

    expect(canRecordVote(unspent, exile)).toBe(true);
    expect(canRecordVote(spent, exile)).toBe(true);
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
});
