import { describe, expect, it } from "vitest";

import { getCharacter, type Character } from "./characters";
import { createGame, type GameDocument, type Player } from "./gameDocument";
import {
  computeNightList,
  minionDemonInfoEligible,
  phaseForNight,
} from "./nightList";

function characters(...ids: string[]): Character[] {
  return ids.map((id) => getCharacter(id)!);
}

function gameWith(
  selectedIds: string[],
  overrides: Partial<GameDocument> = {},
): GameDocument {
  const game = createGame({
    scriptId: "tb",
    scriptName: "Trouble Brewing",
    playerCount: selectedIds.length,
    selectedCharacters: characters(...selectedIds),
    standIn: null,
    extraCopies: {},
    createdAt: "2026-07-04T00:00:00.000Z",
  });
  const players: Player[] = game.players.map((player, index) => ({
    ...player,
    characterId: selectedIds[index],
  }));
  return { ...game, players, ...overrides };
}

function characterById(game: GameDocument): Map<string, Character> {
  return new Map(game.characterPool.map((c) => [c.id, c]));
}

describe("phaseForNight", () => {
  it("treats night 1 as the first night and every other night as 'other'", () => {
    expect(phaseForNight(1)).toBe("first");
    expect(phaseForNight(2)).toBe("other");
    expect(phaseForNight(10)).toBe("other");
  });
});

describe("minionDemonInfoEligible", () => {
  it("requires at least 7 seated (non-traveller) players", () => {
    const small = gameWith(["washerwoman", "imp", "poisoner", "recluse", "baron", "chef"]);
    const large = gameWith([
      "washerwoman",
      "imp",
      "poisoner",
      "recluse",
      "baron",
      "chef",
      "empath",
    ]);
    expect(minionDemonInfoEligible(small)).toBe(false);
    expect(minionDemonInfoEligible(large)).toBe(true);
  });
});

describe("computeNightList: fixed entries", () => {
  it("always includes Dusk first and Dawn last", () => {
    const game = gameWith(["washerwoman", "imp", "poisoner", "baron", "recluse", "chef"]);
    const entries = computeNightList({
      game,
      characterById: characterById(game),
      phase: "first",
      showAll: false,
      unskippedIds: new Set(),
    });

    expect(entries[0].id).toBe("fixed:dusk");
    expect(entries[entries.length - 1].id).toBe("fixed:dawn");
  });

  it("includes Minion info and Demon info on the first night only with 7+ players", () => {
    const sevenPlayers = gameWith([
      "washerwoman",
      "imp",
      "poisoner",
      "baron",
      "recluse",
      "chef",
      "empath",
    ]);
    const firstNight = computeNightList({
      game: sevenPlayers,
      characterById: characterById(sevenPlayers),
      phase: "first",
      showAll: false,
      unskippedIds: new Set(),
    });
    const otherNight = computeNightList({
      game: sevenPlayers,
      characterById: characterById(sevenPlayers),
      phase: "other",
      showAll: false,
      unskippedIds: new Set(),
    });

    expect(firstNight.map((e) => e.id)).toContain("fixed:minion-info");
    expect(firstNight.map((e) => e.id)).toContain("fixed:demon-info");
    expect(otherNight.map((e) => e.id)).not.toContain("fixed:minion-info");
    expect(otherNight.map((e) => e.id)).not.toContain("fixed:demon-info");
  });

  it("omits Minion/Demon info entirely below 7 players", () => {
    const sixPlayers = gameWith(["washerwoman", "imp", "poisoner", "baron", "recluse", "chef"]);
    const entries = computeNightList({
      game: sixPlayers,
      characterById: characterById(sixPlayers),
      phase: "first",
      showAll: false,
      unskippedIds: new Set(),
    });

    expect(entries.map((e) => e.id)).not.toContain("fixed:minion-info");
    expect(entries.map((e) => e.id)).not.toContain("fixed:demon-info");
  });
});

describe("computeNightList: character entries and ordering", () => {
  it("orders acting characters by their dataset night position", () => {
    // Washerwoman (32) acts before Poisoner (17)? use real dataset values —
    // assert relative order matches the characters' own firstNight numbers.
    const game = gameWith(["poisoner", "washerwoman", "imp"]);
    const chars = characterById(game);
    const entries = computeNightList({
      game,
      characterById: chars,
      phase: "first",
      showAll: false,
      unskippedIds: new Set(),
    });

    const acting = entries.filter((e) => e.kind === "character");
    const expectedOrder = [...acting]
      .map((e) => ({ e, value: chars.get(e.characterId!)!.firstNight }))
      .sort((a, b) => a.value - b.value)
      .map(({ e }) => e.id);
    expect(acting.map((e) => e.id)).toEqual(expectedOrder);
  });

  it("excludes characters with no action tonight by default", () => {
    // Recluse has firstNight 0 (no first-night action).
    const game = gameWith(["recluse", "imp"]);
    const entries = computeNightList({
      game,
      characterById: characterById(game),
      phase: "first",
      showAll: false,
      unskippedIds: new Set(),
    });

    expect(entries.some((e) => e.characterId === "recluse")).toBe(false);
  });

  it("show-all reveals characters with no action tonight", () => {
    const game = gameWith(["recluse", "imp"]);
    const entries = computeNightList({
      game,
      characterById: characterById(game),
      phase: "first",
      showAll: true,
      unskippedIds: new Set(),
    });

    expect(entries.some((e) => e.characterId === "recluse")).toBe(true);
    // Still before Dawn.
    const recluseIndex = entries.findIndex((e) => e.characterId === "recluse");
    expect(recluseIndex).toBeLessThan(entries.length - 1);
  });

  it("scopes entries to players, so duplicate characters each get their own entry", () => {
    const game = gameWith(["imp", "imp"]);
    const entries = computeNightList({
      game,
      characterById: characterById(game),
      phase: "other",
      showAll: false,
      unskippedIds: new Set(),
    });

    const impEntries = entries.filter((e) => e.characterId === "imp");
    expect(impEntries).toHaveLength(2);
    expect(new Set(impEntries.map((e) => e.id)).size).toBe(2);
  });

  it("includes homebrew characters using their own night numbers", () => {
    const homebrew: Character = {
      id: "custom-seer",
      name: "Custom Seer",
      edition: null,
      team: "townsfolk",
      ability: "A homebrew ability.",
      firstNight: 5,
      firstNightReminder: "Show a card.",
      otherNight: 0,
      otherNightReminder: "",
      reminders: [],
      remindersGlobal: [],
      setup: false,
      jinxes: [],
      image: null,
    };
    const game = createGame({
      scriptId: "custom",
      scriptName: "Custom",
      playerCount: 1,
      selectedCharacters: [homebrew],
      standIn: null,
      extraCopies: {},
    });
    const withCharacter: GameDocument = {
      ...game,
      players: [{ ...game.players[0], characterId: homebrew.id }],
    };
    const entries = computeNightList({
      game: withCharacter,
      characterById: characterById(withCharacter),
      phase: "first",
      showAll: false,
      unskippedIds: new Set(),
    });

    expect(entries.some((e) => e.characterId === "custom-seer")).toBe(true);
  });
});

describe("computeNightList: dead players", () => {
  it("marks a dead player's entry skipped unless un-skipped", () => {
    const game = gameWith(["imp", "washerwoman"]);
    const deadImp: GameDocument = {
      ...game,
      players: game.players.map((p) =>
        p.characterId === "imp" ? { ...p, dead: true } : p,
      ),
    };
    const entries = computeNightList({
      game: deadImp,
      characterById: characterById(deadImp),
      phase: "other",
      showAll: false,
      unskippedIds: new Set(),
    });

    const impEntry = entries.find((e) => e.characterId === "imp")!;
    expect(impEntry.dead).toBe(true);
    expect(impEntry.skipped).toBe(true);
  });

  it("un-skips a dead player's entry when its id is in unskippedIds", () => {
    const game = gameWith(["imp", "washerwoman"]);
    const deadImp: GameDocument = {
      ...game,
      players: game.players.map((p) =>
        p.characterId === "imp" ? { ...p, dead: true } : p,
      ),
    };
    const impPlayerId = deadImp.players.find((p) => p.characterId === "imp")!.id;
    const entries = computeNightList({
      game: deadImp,
      characterById: characterById(deadImp),
      phase: "other",
      showAll: false,
      unskippedIds: new Set([`char:${impPlayerId}`]),
    });

    const impEntry = entries.find((e) => e.characterId === "imp")!;
    expect(impEntry.skipped).toBe(false);
  });
});

describe("computeNightList: script _meta night-order overrides", () => {
  it("takes precedence over dataset positions", () => {
    const game = gameWith(["poisoner", "washerwoman", "imp"], {
      // Dataset order would normally put washerwoman/poisoner well before imp
      // acts; this override reverses the acting characters entirely.
      firstNightOrder: ["dusk", "imp", "washerwoman", "poisoner", "dawn"],
    });
    const entries = computeNightList({
      game,
      characterById: characterById(game),
      phase: "first",
      showAll: false,
      unskippedIds: new Set(),
    });

    const order = entries.map((e) => e.characterId ?? e.id);
    expect(order).toEqual([
      "fixed:dusk",
      "imp",
      "washerwoman",
      "poisoner",
      "fixed:dawn",
    ]);
  });

  it("matches character ids case- and separator-insensitively", () => {
    const game = gameWith(["alhadikhia", "imp"], {
      firstNightOrder: ["dusk", "AL-HADIKHIA", "dawn"],
    });
    const entries = computeNightList({
      game,
      characterById: characterById(game),
      phase: "first",
      showAll: false,
      unskippedIds: new Set(),
    });

    expect(entries.map((e) => e.characterId ?? e.id)).toContain("alhadikhia");
    expect(entries[1].characterId).toBe("alhadikhia");
  });

  it("appends characters missing from the override after the explicit entries", () => {
    const game = gameWith(["poisoner", "washerwoman", "imp"], {
      firstNightOrder: ["dusk", "imp", "dawn"],
    });
    const entries = computeNightList({
      game,
      characterById: characterById(game),
      phase: "first",
      showAll: false,
      unskippedIds: new Set(),
    });

    const ids = entries.map((e) => e.characterId ?? e.id);
    expect(ids.indexOf("imp")).toBeLessThan(ids.indexOf("fixed:dawn"));
    expect(ids).toContain("washerwoman");
    expect(ids).toContain("poisoner");
  });

  it("only applies the matching phase's override", () => {
    const game = gameWith(["poisoner", "imp"], {
      firstNightOrder: ["dusk", "imp", "poisoner", "dawn"],
      otherNightOrder: null,
    });
    const otherNight = computeNightList({
      game,
      characterById: characterById(game),
      phase: "other",
      showAll: false,
      unskippedIds: new Set(),
    });
    const chars = characterById(game);
    const acting = otherNight.filter((e) => e.kind === "character");
    const expectedOrder = [...acting]
      .map((e) => ({ e, value: chars.get(e.characterId!)!.otherNight }))
      .sort((a, b) => a.value - b.value)
      .map(({ e }) => e.id);
    expect(acting.map((e) => e.id)).toEqual(expectedOrder);
  });
});
