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
  shuffleTokens,
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
    const players = [makePlayer({ id: "p1", isDrunk: true, characterId: "washerwoman" })];
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

describe("anchoredReminderPosition (issue #71)", () => {
  it("places the first reminder below the seat, clear of its token+name block", () => {
    const position = anchoredReminderPosition({ x: 50, y: 50 }, 0);
    expect(position.x).toBe(50);
    expect(position.y).toBeGreaterThan(50 + 8);
  });

  it("stacks a second reminder on the same seat further down, not on top of the first", () => {
    const first = anchoredReminderPosition({ x: 50, y: 50 }, 0);
    const second = anchoredReminderPosition({ x: 50, y: 50 }, 1);
    expect(second.y).toBeGreaterThan(first.y);
  });

  it("clamps within the pad's bounds for a seat near the bottom edge", () => {
    const position = anchoredReminderPosition({ x: 50, y: 94 }, 0);
    expect(position.y).toBeLessThanOrEqual(96);
  });

  it("separates siblings by x when a near-bottom seat clamps every sibling's y to the same edge (code review finding)", () => {
    const first = anchoredReminderPosition({ x: 50, y: 94 }, 0);
    const second = anchoredReminderPosition({ x: 50, y: 94 }, 1);
    expect(first.y).toBe(96);
    expect(second.y).toBe(96);
    expect(second.x).not.toBe(first.x);
  });

  it("recovers the vertical clearance a bottom-of-circle seat's clamp ate by pushing the chip sideways instead, so it clears the token rather than landing on it (issue #117)", () => {
    const anchor = { x: 50, y: 94 };
    const position = anchoredReminderPosition(anchor, 0);
    const distanceFromAnchor = Math.hypot(
      position.x - anchor.x,
      position.y - anchor.y,
    );
    // A non-edge seat gets 12pts of clearance below it (the first test
    // above); an edge seat whose y clamps must still end up this far from
    // the token overall, just angled sideways instead of straight down.
    expect(distanceFromAnchor).toBeGreaterThanOrEqual(11.99);
  });

  it("fans a second sibling further sideways than the first once y has clamped, preserving the stacking order (issue #117)", () => {
    const anchor = { x: 50, y: 94 };
    const first = anchoredReminderPosition(anchor, 0);
    const second = anchoredReminderPosition(anchor, 1);
    const firstDistance = Math.hypot(first.x - anchor.x, first.y - anchor.y);
    const secondDistance = Math.hypot(second.x - anchor.x, second.y - anchor.y);
    expect(secondDistance).toBeGreaterThan(firstDistance);
  });

  it("pushes a clamped chip toward the pad's horizontal centre, not further off the edge, for a bottom-corner seat (issue #117)", () => {
    const anchor = { x: 94, y: 94 };
    const position = anchoredReminderPosition(anchor, 0);
    expect(position.x).toBeLessThan(anchor.x);
    expect(position.x).toBeGreaterThanOrEqual(4);
  });

  it("keeps several siblings on a clamped seat distinct instead of collapsing them onto the same point (code review finding)", () => {
    const anchor = { x: 50, y: 94 };
    const positions = Array.from({ length: 6 }, (_, i) =>
      anchoredReminderPosition(anchor, i),
    );
    const xs = new Set(positions.map((p) => p.x));
    expect(xs.size).toBe(positions.length);
  });

  it("still recovers clearance for an anchor outside the pad's own bounds, e.g. a legacy or hand-edited position (code review finding)", () => {
    const position = anchoredReminderPosition({ x: 50, y: 150 }, 0);
    // Treated as clamped to y=96 before computing clearance, same as any
    // other bottom-of-circle seat — not silently zeroed by a negative
    // "clearance" from the out-of-range input.
    expect(position.x).not.toBe(50);
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

  it("starts unfinished: no winner, no end time, empty notes", () => {
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
    expect(game.notes).toBe("");
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

  it("starts with Demon bluffs and Claims expanded, and the end-game panel's collapse left unset (issue #79)", () => {
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 1,
      selectedCharacters: characters("washerwoman"),
      standIn: null,
      extraCopies: {},
    });

    expect(game.demonBluffsCollapsed).toBe(false);
    expect(game.claimsCollapsed).toBe(false);
    expect(game.endGamePanelCollapsed).toBeNull();
  });

  it("starts with the Night List and Day Phase side panels expanded (issue #168)", () => {
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 1,
      selectedCharacters: characters("washerwoman"),
      standIn: null,
      extraCopies: {},
    });

    expect(game.nightListCollapsed).toBe(false);
    expect(game.dayPhaseCollapsed).toBe(false);
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
      isEndGamePanelCollapsed(gameWith({ night: 2, endGamePanelCollapsed: true })),
    ).toBe(true);
  });

  it("honors an explicit manual expand even before the first night has ended", () => {
    expect(
      isEndGamePanelCollapsed(gameWith({ night: 0, endGamePanelCollapsed: false })),
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
