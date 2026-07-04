import { describe, expect, it } from "vitest";

import { getCharacter, type Character } from "./characters";
import {
  buildBagTokens,
  circlePosition,
  createGame,
  GAME_SCHEMA_VERSION,
  shuffleTokens,
  withRestoredReminder,
  type ReminderToken,
} from "./gameDocument";

function characters(...ids: string[]) {
  return ids.map((id) => getCharacter(id)!);
}

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
  };

  it("appends a restored reminder that isn't already present", () => {
    expect(withRestoredReminder([], reminder)).toEqual([reminder]);
  });

  it("doesn't duplicate a reminder whose id is already present", () => {
    expect(withRestoredReminder([reminder], reminder)).toEqual([reminder]);
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
});
