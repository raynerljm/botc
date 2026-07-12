import { describe, expect, it } from "vitest";

import { getCharacter, type Character } from "./characters";
import {
  anchoredReminderPosition,
  buildBagTokens,
  circlePosition,
  createGame,
  drunkStandInReminderId,
  firstNightEnded,
  GAME_SCHEMA_VERSION,
  heldCharacterIds,
  insertAtSeat,
  isEndGamePanelCollapsed,
  nextPadReminderPosition,
  resumeDrawSession,
  ROTATION_STEP_DEG,
  rotatePosition,
  shuffleTokens,
  stepRotation,
  unrotatePosition,
  withBackfilledDrunkReminders,
  withRestoredReminder,
  type DrawSession,
  type GameDocument,
  type Player,
  type ReminderToken,
} from "./gameDocument";

function characters(...ids: string[]) {
  return ids.map((id) => getCharacter(id)!);
}

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "p1",
    seat: 1,
    name: "Alice",
    characterId: "washerwoman",
    startingCharacterId: "washerwoman",
    isDrunk: false,
    isLunatic: false,
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

describe("heldCharacterIds", () => {
  it("collects every seated player's characterId, skipping unassigned seats", () => {
    const players = [
      makePlayer({ id: "p1", characterId: "washerwoman" }),
      makePlayer({ id: "p2", characterId: null }),
      makePlayer({ id: "p3", characterId: "imp" }),
    ];
    expect(heldCharacterIds(players)).toEqual(new Set(["washerwoman", "imp"]));
  });

  it("returns an empty set for no players", () => {
    expect(heldCharacterIds([])).toEqual(new Set());
  });
});

describe("shuffleTokens", () => {
  it("returns every item, none added or dropped", () => {
    const result = shuffleTokens([1, 2, 3, 4, 5]);
    expect(result.slice().sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("doesn't mutate the input array", () => {
    const input = [1, 2, 3];
    shuffleTokens(input, () => 0.9);
    expect(input).toEqual([1, 2, 3]);
  });

  it("is deterministic given an injected random source", () => {
    const random = () => 0;
    expect(shuffleTokens([1, 2, 3, 4], random)).toEqual(
      shuffleTokens([1, 2, 3, 4], random),
    );
  });
});

describe("withRestoredReminder (code review: PR #37, double-undo dedup)", () => {
  const reminder: ReminderToken = {
    id: "r1",
    characterId: null,
    label: "Poisoned",
    position: { x: 10, y: 20 },
    anchorPlayerId: null,
    homePlayerId: null,
  };

  it("appends a restored reminder that isn't already present", () => {
    expect(withRestoredReminder([], reminder)).toEqual([reminder]);
  });

  it("doesn't duplicate a reminder whose id is already present", () => {
    expect(withRestoredReminder([reminder], reminder)).toEqual([reminder]);
  });
});

describe("withBackfilledDrunkReminders (issue #186 migration)", () => {
  it("adds a 'Drunk' reminder for a seat that predates automatic placement", () => {
    const players = [
      makePlayer({ id: "p1", isDrunk: true, characterId: "washerwoman" }),
    ];
    const reminders = withBackfilledDrunkReminders([], players);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({
      id: drunkStandInReminderId("p1"),
      characterId: "drunk",
      label: "Drunk",
      anchorPlayerId: "p1",
    });
  });

  it("doesn't duplicate a Drunk reminder that's already anchored to the seat, even under a legacy id", () => {
    const players = [makePlayer({ id: "p1", isDrunk: true })];
    const legacyReminder: ReminderToken = {
      id: "setupwalkthrough:p1:0",
      characterId: "drunk",
      label: "Drunk",
      position: { x: 10, y: 20 },
      anchorPlayerId: "p1",
      homePlayerId: "p1",
    };
    expect(withBackfilledDrunkReminders([legacyReminder], players)).toEqual([
      legacyReminder,
    ]);
  });

  it("leaves a non-Drunk seat's reminders untouched", () => {
    const players = [makePlayer({ id: "p1", isDrunk: false })];
    expect(withBackfilledDrunkReminders([], players)).toEqual([]);
  });
});

describe("insertAtSeat", () => {
  it("makes room for a new seat by bumping every later seat by one", () => {
    const players = [
      makePlayer({ id: "p1", seat: 1 }),
      makePlayer({ id: "p2", seat: 2 }),
      makePlayer({ id: "p3", seat: 3 }),
    ];

    const result = insertAtSeat(players, 2);

    expect(result.find((p) => p.id === "p1")!.seat).toBe(1);
    expect(result.find((p) => p.id === "p2")!.seat).toBe(3);
    expect(result.find((p) => p.id === "p3")!.seat).toBe(4);
  });

  it("leaves every seat untouched when inserting past the last seat", () => {
    const players = [makePlayer({ id: "p1", seat: 1 })];

    const result = insertAtSeat(players, 2);

    expect(result.find((p) => p.id === "p1")!.seat).toBe(1);
  });
});

describe("circlePosition", () => {
  it("places the first seat of a 4-seat circle at the top centre", () => {
    const { x, y } = circlePosition(0, 4);
    expect(x).toBeCloseTo(50);
    expect(y).toBeCloseTo(5);
  });

  it("spaces seats evenly all the way around", () => {
    const top = circlePosition(0, 4);
    const right = circlePosition(1, 4);
    const bottom = circlePosition(2, 4);
    const left = circlePosition(3, 4);

    expect(right.x).toBeGreaterThan(top.x);
    expect(bottom.y).toBeGreaterThan(top.y);
    expect(left.x).toBeLessThan(top.x);
    // Symmetric around the centre (50, 50).
    expect(right.x - 50).toBeCloseTo(50 - left.x);
    expect(bottom.y - 50).toBeCloseTo(50 - top.y);
  });
});

describe("rotatePosition (issue #192)", () => {
  it("leaves a position unchanged when rotating by 0 degrees", () => {
    expect(rotatePosition({ x: 60, y: 20 }, 0)).toEqual({ x: 60, y: 20 });
  });

  it("rotates a seat around the centre in the same clockwise sense as circlePosition's own layout", () => {
    // circlePosition(0, 4) is the top seat, circlePosition(1, 4) is the seat
    // one clockwise step further (the right) — rotating the top seat by a
    // quarter turn should land it exactly on that same right-hand spot.
    const top = circlePosition(0, 4);
    const rotated = rotatePosition(top, 90);
    const right = circlePosition(1, 4);
    expect(rotated.x).toBeCloseTo(right.x);
    expect(rotated.y).toBeCloseTo(right.y);
  });

  it("returns to the starting position after a full turn", () => {
    const start = { x: 30, y: 70 };
    const rotated = rotatePosition(start, 360);
    expect(rotated.x).toBeCloseTo(start.x);
    expect(rotated.y).toBeCloseTo(start.y);
  });

  it("clamps a rotated position back onto the pad instead of letting it drift off-screen", () => {
    // A token dragged into a corner sits further from the centre than any
    // computed circle seat ever does — rotating it can push it outside the
    // [4,96] pad bounds clampPct otherwise guarantees everywhere else.
    const corner = { x: 96, y: 96 };
    const rotated = rotatePosition(corner, 45);
    expect(rotated.y).toBeLessThanOrEqual(96);
  });
});

describe("unrotatePosition (issue #192)", () => {
  it("undoes rotatePosition for a position well within the pad's bounds", () => {
    const start = { x: 60, y: 30 };
    const rotated = rotatePosition(start, 45);
    const back = unrotatePosition(rotated, 45);
    expect(back.x).toBeCloseTo(start.x);
    expect(back.y).toBeCloseTo(start.y);
  });

  it("does not clamp its result, unlike rotatePosition", () => {
    // A drag drop already clamped independently per axis in display space
    // (a corner of the square pad) doesn't sit on the same circle a rotation
    // preserves — un-rotating it can legitimately land outside [4, 96].
    // Clamping again here (as rotatePosition does) would snap it to a
    // different spot than where it was actually dropped, since per-axis
    // clamping only commutes with rotation at multiples of 90 degrees
    // (code review finding).
    const cornerDrop = { x: 96, y: 96 };
    const canonical = unrotatePosition(cornerDrop, 45);
    expect(canonical.x).toBeGreaterThan(96);
  });
});

describe("stepRotation (issue #192)", () => {
  it("steps clockwise by the fixed increment", () => {
    expect(stepRotation(0, 1)).toBe(ROTATION_STEP_DEG);
  });

  it("steps counterclockwise by wrapping under 0", () => {
    expect(stepRotation(0, -1)).toBe(360 - ROTATION_STEP_DEG);
  });

  it("wraps back to 0 once a full turn accumulates", () => {
    expect(stepRotation(360 - ROTATION_STEP_DEG, 1)).toBe(0);
  });
});

describe("nextPadReminderPosition (issue #71)", () => {
  it("puts the first reminder dead centre, matching prior default-position behavior", () => {
    expect(nextPadReminderPosition([])).toEqual({ x: 50, y: 50 });
  });

  it("spreads each later reminder to a distinct point, never stacking on centre or on each other", () => {
    const positions: { x: number; y: number }[] = [];
    for (let i = 0; i < 5; i++) {
      positions.push(nextPadReminderPosition(positions));
    }
    const dedup = new Set(positions.map((p) => `${p.x},${p.y}`));
    expect(dedup.size).toBe(positions.length);
  });

  it("keeps every position within the pad's clamped bounds", () => {
    const positions: { x: number; y: number }[] = [];
    for (let i = 0; i < 30; i++) {
      const next = nextPadReminderPosition(positions);
      expect(next.x).toBeGreaterThanOrEqual(4);
      expect(next.x).toBeLessThanOrEqual(96);
      expect(next.y).toBeGreaterThanOrEqual(4);
      expect(next.y).toBeLessThanOrEqual(96);
      positions.push(next);
    }
  });

  it("doesn't replay an earlier spiral point once the set of existing reminders shrinks (code review finding)", () => {
    // Add three, then simulate the middle one being attached/removed (drops
    // out of the "existing free reminders" set) — a count-based index would
    // hand the next add the exact spot the still-present third one occupies.
    const first = nextPadReminderPosition([]);
    const second = nextPadReminderPosition([first]);
    const third = nextPadReminderPosition([first, second]);
    const afterSecondLeaves = nextPadReminderPosition([first, third]);

    expect(afterSecondLeaves).not.toEqual(first);
    expect(afterSecondLeaves).not.toEqual(third);
  });
});

describe("anchoredReminderPosition (issue #251)", () => {
  // (30, 50) sits directly left of the circle's centre (50, 50), so "toward
  // the centre" is purely rightward here — a clean seam for asserting the
  // line/step/cap behaviour without every assertion also fighting a diagonal.
  const leftOfCentre = { x: 30, y: 50 };

  it("places the first reminder on the line from the seat toward the circle's centre", () => {
    const position = anchoredReminderPosition(leftOfCentre, 0);
    // On the anchor->centre ray: displacement is a positive multiple of
    // (centre - anchor), i.e. the cross product is ~0 and the dot product
    // is positive.
    const toCentre = { x: 50 - leftOfCentre.x, y: 50 - leftOfCentre.y };
    const displacement = {
      x: position.x - leftOfCentre.x,
      y: position.y - leftOfCentre.y,
    };
    const cross =
      toCentre.x * displacement.y - toCentre.y * displacement.x;
    const dot = toCentre.x * displacement.x + toCentre.y * displacement.y;
    expect(Math.abs(cross)).toBeLessThan(1e-6);
    expect(dot).toBeGreaterThan(0);
  });

  it("steps a second reminder further along that same line than the first, not on top of it", () => {
    const first = anchoredReminderPosition(leftOfCentre, 0);
    const second = anchoredReminderPosition(leftOfCentre, 1);
    const firstDistance = Math.hypot(
      first.x - leftOfCentre.x,
      first.y - leftOfCentre.y,
    );
    const secondDistance = Math.hypot(
      second.x - leftOfCentre.x,
      second.y - leftOfCentre.y,
    );
    expect(secondDistance).toBeGreaterThan(firstDistance);
  });

  it("keeps a bottom-of-circle seat's reminder above the seat, clear of the bottom sheet's occluded band (ADR 0004)", () => {
    const bottomSeat = { x: 50, y: 90 };
    const position = anchoredReminderPosition(bottomSeat, 0);
    expect(position.y).toBeLessThan(bottomSeat.y);
  });

  it("caps how far a seat's reminders reach toward the centre instead of letting them converge on it", () => {
    const far = anchoredReminderPosition(leftOfCentre, 40);
    const distanceFromCentre = Math.hypot(far.x - 50, far.y - 50);
    // The anchor itself is 20 units from centre; a sibling that had
    // marched all the way in would land within a couple of units of it.
    expect(distanceFromCentre).toBeGreaterThan(5);
  });

  it("curves later siblings around the capped point instead of piling them on the same spot", () => {
    // 40, not 10: a fixed arc step that evenly divides 360° wraps back to an
    // angle it's already used well before 40 overflow siblings (Copilot
    // review finding on an earlier version of this function) — a short run
    // wouldn't have caught it.
    const positions = Array.from({ length: 40 }, (_, i) =>
      anchoredReminderPosition(leftOfCentre, i),
    );
    const key = (p: { x: number; y: number }) =>
      `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
    const distinct = new Set(positions.map(key));
    expect(distinct.size).toBe(positions.length);
  });

  it("keeps neighbouring seats' first reminders from crowding together even at the maximum 20-player count", () => {
    // Every seat's line points at the same centre, so more seats sharing
    // one radius narrows the gap between neighbours' reminders as they all
    // step inward — this locks in a floor for that gap so a larger base
    // offset doesn't silently shrink it to where reminders touch.
    const seatCount = 20;
    const reminders = Array.from({ length: seatCount }, (_, i) =>
      anchoredReminderPosition(circlePosition(i, seatCount), 0),
    );
    let minGap = Infinity;
    for (let i = 0; i < seatCount; i++) {
      const next = reminders[(i + 1) % seatCount];
      const gap = Math.hypot(reminders[i].x - next.x, reminders[i].y - next.y);
      minGap = Math.min(minGap, gap);
    }
    expect(minGap).toBeGreaterThan(6);
  });

  it("stays within the pad's bounds for a seat near the edge", () => {
    const position = anchoredReminderPosition({ x: 50, y: 94 }, 0);
    expect(position.y).toBeLessThanOrEqual(96);
    expect(position.y).toBeGreaterThanOrEqual(4);
  });

  it("treats an anchor outside the pad's own bounds as clamped first, e.g. a legacy or hand-edited position (code review finding)", () => {
    const position = anchoredReminderPosition({ x: 50, y: 150 }, 0);
    expect(position.y).toBeLessThanOrEqual(96);
    expect(position.y).toBeGreaterThanOrEqual(4);
    expect(Number.isFinite(position.x)).toBe(true);
  });

  it("falls back to straight down for a seat parked exactly on the centre, where 'toward the centre' is undefined", () => {
    const position = anchoredReminderPosition({ x: 50, y: 50 }, 0);
    expect(position.x).toBe(50);
    expect(position.y).toBeGreaterThan(50);
  });
});

describe("buildBagTokens", () => {
  it("makes one official token per selected non-traveller character", () => {
    const { officialTokens } = buildBagTokens({
      selectedCharacters: characters("washerwoman", "recluse", "baron", "imp"),
      standIn: null,
      extraCopies: {},
    });

    expect(officialTokens.map((t) => t.characterId).sort()).toEqual(
      ["baron", "imp", "recluse", "washerwoman"].sort(),
    );
    expect(officialTokens.every((t) => !t.isDrunkStandIn)).toBe(true);
  });

  it("gives the Drunk's slot a stand-in token instead of a 'drunk' token", () => {
    const { officialTokens } = buildBagTokens({
      selectedCharacters: characters("washerwoman", "drunk", "baron", "imp"),
      standIn: getCharacter("washerwoman") ?? null,
      extraCopies: {},
    });

    // 13p reference scenario shape: no physical "drunk" token, instead an
    // extra washerwoman-labelled token stands in for it.
    expect(officialTokens.some((t) => t.characterId === "drunk")).toBe(false);
    const standIns = officialTokens.filter((t) => t.isDrunkStandIn);
    expect(standIns).toHaveLength(1);
    expect(standIns[0].characterId).toBe("washerwoman");
    expect(
      officialTokens.filter((t) => t.characterId === "washerwoman"),
    ).toHaveLength(2);
  });

  it("gives the Lunatic's slot a Demon stand-in token instead of a 'lunatic' token (issue #163)", () => {
    const { officialTokens } = buildBagTokens({
      selectedCharacters: characters("washerwoman", "lunatic", "baron", "imp"),
      standIn: null,
      lunaticStandIn: getCharacter("zombuul") ?? null,
      extraCopies: {},
    });

    expect(officialTokens.some((t) => t.characterId === "lunatic")).toBe(false);
    const standIns = officialTokens.filter((t) => t.isLunaticStandIn);
    expect(standIns).toHaveLength(1);
    expect(standIns[0].characterId).toBe("zombuul");
    expect(
      officialTokens.filter((t) => t.characterId === "zombuul"),
    ).toHaveLength(1);
  });

  it("leaves the Lunatic's slot without a token when no Demon stand-in is given, same as the Drunk", () => {
    const { officialTokens } = buildBagTokens({
      selectedCharacters: characters("washerwoman", "lunatic", "imp"),
      standIn: null,
      lunaticStandIn: null,
      extraCopies: {},
    });

    expect(officialTokens).toHaveLength(2);
    expect(officialTokens.some((t) => t.isLunaticStandIn)).toBe(false);
  });

  it("expands extra copies (e.g. Village Idiot) into repeated tokens", () => {
    const { officialTokens } = buildBagTokens({
      selectedCharacters: characters("villageidiot"),
      standIn: null,
      extraCopies: { villageidiot: 2 },
    });

    expect(
      officialTokens.filter((t) => t.characterId === "villageidiot"),
    ).toHaveLength(3);
  });

  it("puts every token in its own uniquely-identified token, even duplicates", () => {
    const { officialTokens } = buildBagTokens({
      selectedCharacters: characters("villageidiot"),
      standIn: null,
      extraCopies: { villageidiot: 1 },
    });

    expect(new Set(officialTokens.map((t) => t.id)).size).toBe(2);
  });

  it("separates traveller characters into their own bag", () => {
    const { officialTokens, travellerTokens } = buildBagTokens({
      selectedCharacters: characters("washerwoman", "scapegoat"),
      standIn: null,
      extraCopies: {},
    });

    expect(officialTokens.map((t) => t.characterId)).toEqual(["washerwoman"]);
    expect(travellerTokens.map((t) => t.characterId)).toEqual(["scapegoat"]);
  });
});

describe("createGame", () => {
  it("generates a seat per player with an editable default name and no character yet", () => {
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 5,
      selectedCharacters: characters(
        "washerwoman",
        "librarian",
        "investigator",
        "baron",
        "imp",
      ),
      standIn: null,
      extraCopies: {},
      createdAt: "2026-07-04T00:00:00.000Z",
      newId: (() => {
        let n = 0;
        return () => `id-${n++}`;
      })(),
    });

    expect(game.players).toHaveLength(5);
    expect(game.players.map((p) => p.seat)).toEqual([1, 2, 3, 4, 5]);
    expect(game.players.map((p) => p.name)).toEqual([
      "Player 1",
      "Player 2",
      "Player 3",
      "Player 4",
      "Player 5",
    ]);
    expect(game.players.every((p) => p.characterId === null)).toBe(true);
  });

  it("starts every player alive, on the computed circle, with an unspent ghost vote", () => {
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 3,
      selectedCharacters: characters("washerwoman"),
      standIn: null,
      extraCopies: {},
    });

    expect(game.players.every((p) => p.dead === false)).toBe(true);
    expect(game.players.every((p) => p.ghostVoteSpent === false)).toBe(true);
    expect(game.players.every((p) => p.position === null)).toBe(true);
  });

  it("carries the script's almanac link onto the game document when provided", () => {
    const game = createGame({
      scriptId: "custom-script",
      scriptName: "Custom Script",
      playerCount: 1,
      selectedCharacters: characters("washerwoman"),
      standIn: null,
      extraCopies: {},
      almanacUrl: "https://example.com/almanac",
    });

    expect(game.almanacUrl).toBe("https://example.com/almanac");
  });

  it("defaults the almanac link to null when the script doesn't provide one", () => {
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 1,
      selectedCharacters: characters("washerwoman"),
      standIn: null,
      extraCopies: {},
    });

    expect(game.almanacUrl).toBeNull();
  });

  it("carries the script's night-order overrides onto the game document when provided", () => {
    const game = createGame({
      scriptId: "custom-script",
      scriptName: "Custom Script",
      playerCount: 1,
      selectedCharacters: characters("washerwoman"),
      standIn: null,
      extraCopies: {},
      firstNightOrder: ["dusk", "washerwoman", "dawn"],
      otherNightOrder: ["dusk", "dawn"],
    });

    expect(game.firstNightOrder).toEqual(["dusk", "washerwoman", "dawn"]);
    expect(game.otherNightOrder).toEqual(["dusk", "dawn"]);
  });

  it("defaults the night-order overrides to null when the script doesn't provide them", () => {
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 1,
      selectedCharacters: characters("washerwoman"),
      standIn: null,
      extraCopies: {},
    });

    expect(game.firstNightOrder).toBeNull();
    expect(game.otherNightOrder).toBeNull();
  });

  it("starts with no night open and every night-list field empty", () => {
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 1,
      selectedCharacters: characters("washerwoman"),
      standIn: null,
      extraCopies: {},
    });

    expect(game.night).toBe(0);
    expect(game.nightOpen).toBe(false);
    expect(game.nightChecked).toEqual([]);
    expect(game.nightUnskipped).toEqual([]);
  });

  it("starts with no nominations recorded", () => {
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 1,
      selectedCharacters: characters("washerwoman"),
      standIn: null,
      extraCopies: {},
    });

    expect(game.nominations).toEqual([]);
  });

  it("stamps the schema version, script, and creation time", () => {
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 5,
      selectedCharacters: characters("washerwoman"),
      standIn: null,
      extraCopies: {},
      createdAt: "2026-07-04T00:00:00.000Z",
    });

    expect(game.schemaVersion).toBe(GAME_SCHEMA_VERSION);
    expect(game.scriptId).toBe("tb");
    expect(game.scriptName).toBe("Trouble Brewing");
    expect(game.createdAt).toBe("2026-07-04T00:00:00.000Z");
  });

  it("gives every game a unique id so many games can coexist", () => {
    const input = {
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 5,
      selectedCharacters: characters("washerwoman"),
      standIn: null,
      extraCopies: {},
    } as const;

    const a = createGame(input);
    const b = createGame(input);

    expect(a.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
  });

  it("starts with no active Fabled", () => {
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 5,
      selectedCharacters: characters("washerwoman"),
      standIn: null,
      extraCopies: {},
    });

    expect(game.activeFabled).toEqual([]);
  });

  it("gives every player a null starting character until one is assigned", () => {
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 2,
      selectedCharacters: characters("washerwoman"),
      standIn: null,
      extraCopies: {},
    });

    expect(game.players.every((p) => p.startingCharacterId === null)).toBe(
      true,
    );
  });

  it("starts every player not disguised as the Drunk or the Lunatic", () => {
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 2,
      selectedCharacters: characters("washerwoman"),
      standIn: null,
      extraCopies: {},
    });

    expect(game.players.every((p) => p.isDrunk === false)).toBe(true);
    expect(game.players.every((p) => p.isLunatic === false)).toBe(true);
  });

  it("starts unfinished: no winner, no end time, only an empty General notes section", () => {
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 5,
      selectedCharacters: characters("washerwoman"),
      standIn: null,
      extraCopies: {},
      createdAt: "2026-07-04T00:00:00.000Z",
    });

    expect(game.winner).toBeNull();
    expect(game.endedAt).toBeNull();
    expect(game.notes).toEqual([{ id: "general", title: "General", text: "" }]);
  });

  it("starts with no reminder tokens on the pad", () => {
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 5,
      selectedCharacters: characters("washerwoman"),
      standIn: null,
      extraCopies: {},
    });

    expect(game.reminders).toEqual([]);
  });

  it("starts the setup walkthrough un-offered and with no steps resolved (issue #26)", () => {
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 5,
      selectedCharacters: characters("washerwoman"),
      standIn: null,
      extraCopies: {},
    });

    expect(game.setupWalkthroughOffered).toBe(false);
    expect(game.setupWalkthroughSteps).toEqual({});
  });

  it("puts the built bag tokens on the game document", () => {
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 1,
      selectedCharacters: characters("washerwoman", "scapegoat"),
      standIn: null,
      extraCopies: {},
      createdAt: "2026-07-04T00:00:00.000Z",
    });

    expect(game.bag.map((t) => t.characterId)).toEqual(["washerwoman"]);
    expect(game.travellerBag.map((t) => t.characterId)).toEqual(["scapegoat"]);
  });

  it("keeps the full character pool so homebrew characters resolve without a global dataset lookup", () => {
    const homebrewCharacter: Character = {
      id: "custom-oracle",
      name: "Custom Oracle",
      edition: null,
      team: "townsfolk",
      ability: "A homebrew ability.",
      firstNight: 0,
      firstNightReminder: "",
      otherNight: 0,
      otherNightReminder: "",
      reminders: [],
      remindersGlobal: [],
      setup: false,
      jinxes: [],
      image: null,
    };

    const game = createGame({
      scriptId: "custom-script",
      scriptName: "Custom Script",
      playerCount: 1,
      selectedCharacters: [homebrewCharacter],
      standIn: null,
      extraCopies: {},
      createdAt: "2026-07-04T00:00:00.000Z",
    });

    expect(game.characterPool).toContainEqual(homebrewCharacter);
  });

  it("includes the Lunatic's Demon stand-in in the character pool (issue #163)", () => {
    const zombuul = getCharacter("zombuul")!;
    const game = createGame({
      scriptId: "custom-script",
      scriptName: "Custom Script",
      playerCount: 1,
      selectedCharacters: characters("lunatic"),
      standIn: null,
      lunaticStandIn: zombuul,
      extraCopies: {},
    });

    expect(game.characterPool).toContainEqual(zombuul);
  });

  it("starts with three empty Demon bluff slots and no player claims", () => {
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 2,
      selectedCharacters: characters("washerwoman", "imp"),
      standIn: null,
      extraCopies: {},
    });

    expect(game.demonBluffs).toEqual([null, null, null]);
    expect(game.players.every((p) => p.claim === null)).toBe(true);
  });

  it("captures the script's full character list for later not-in-play lookups (e.g. Demon bluffs)", () => {
    const scriptCharacters = characters("washerwoman", "librarian", "imp");
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 1,
      selectedCharacters: characters("washerwoman", "imp"),
      standIn: null,
      extraCopies: {},
      scriptCharacters,
    });

    expect(game.scriptCharacters).toEqual(scriptCharacters);
  });

  it("falls back to the selected characters as the script pool when the full list isn't given", () => {
    const selected = characters("washerwoman", "imp");
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 1,
      selectedCharacters: selected,
      standIn: null,
      extraCopies: {},
    });

    expect(game.scriptCharacters).toEqual(selected);
  });

  it("starts with Demon bluffs expanded, and the end-game panel's collapse left unset (issue #79)", () => {
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 1,
      selectedCharacters: characters("washerwoman"),
      standIn: null,
      extraCopies: {},
    });

    expect(game.demonBluffsCollapsed).toBe(false);
    expect(game.endGamePanelCollapsed).toBeNull();
  });

  it("starts with the bottom sheet expanded (issue #168)", () => {
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 1,
      selectedCharacters: characters("washerwoman"),
      standIn: null,
      extraCopies: {},
    });

    expect(game.nightListCollapsed).toBe(false);
  });
});

describe("firstNightEnded (issues #68, #79)", () => {
  function gameWith(night: number): GameDocument {
    return {
      ...createGame({
        scriptId: "tb",
        scriptName: "Trouble Brewing",
        playerCount: 1,
        selectedCharacters: characters("washerwoman"),
        standIn: null,
        extraCopies: {},
      }),
      night,
    };
  }

  it("is false before any night has ended", () => {
    expect(firstNightEnded(gameWith(0))).toBe(false);
  });

  it("is true once at least one night has ended", () => {
    expect(firstNightEnded(gameWith(1))).toBe(true);
    expect(firstNightEnded(gameWith(2))).toBe(true);
  });
});

describe("isEndGamePanelCollapsed (issue #79)", () => {
  function gameWith(overrides: Partial<GameDocument>): GameDocument {
    return {
      ...createGame({
        scriptId: "tb",
        scriptName: "Trouble Brewing",
        playerCount: 1,
        selectedCharacters: characters("washerwoman"),
        standIn: null,
        extraCopies: {},
      }),
      ...overrides,
    };
  }

  it("defaults to collapsed before the first night has ended", () => {
    expect(isEndGamePanelCollapsed(gameWith({ night: 0 }))).toBe(true);
  });

  it("defaults to expanded once the first night has ended", () => {
    expect(isEndGamePanelCollapsed(gameWith({ night: 1 }))).toBe(false);
  });

  it("honors an explicit manual collapse even after the first night has ended", () => {
    expect(
      isEndGamePanelCollapsed(
        gameWith({ night: 2, endGamePanelCollapsed: true }),
      ),
    ).toBe(true);
  });

  it("honors an explicit manual expand even before the first night has ended", () => {
    expect(
      isEndGamePanelCollapsed(
        gameWith({ night: 0, endGamePanelCollapsed: false }),
      ),
    ).toBe(false);
  });
});

describe("resumeDrawSession (issue #108)", () => {
  const session = (stage: DrawSession["stage"]): DrawSession => ({
    seatId: "p1",
    stage,
  });

  it("resumes the safe choosing stage as-is", () => {
    expect(resumeDrawSession(session("choosing"))).toEqual(session("choosing"));
  });

  it("resumes every other stage at the hidden privacy guard, failing closed — a mid-reveal reload never re-renders the identity", () => {
    const unsafeStages = [
      "revealed",
      "hidden",
      // A stage this code has never heard of (schema-version skew, or a
      // future privacy-sensitive stage) must also land on the guard.
      "someFutureStage" as DrawSession["stage"],
    ] as const;
    for (const stage of unsafeStages) {
      expect(resumeDrawSession(session(stage))).toEqual(session("hidden"));
    }
  });

  it("leaves 'no draw underway' alone", () => {
    expect(resumeDrawSession(null)).toBeNull();
  });

  it("starts a new game with no draw session", () => {
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 2,
      selectedCharacters: characters("washerwoman", "imp"),
      standIn: null,
      extraCopies: {},
    });
    expect(game.drawSession).toBeNull();
  });
});
