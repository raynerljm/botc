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
    // Don't hardcode an expected order — derive it from the real dataset's
    // own firstNight numbers (lower acts first) and assert against that.
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

  it("sorts Minion info and Demon info onto the same numeric scale as acting characters, matching the official sheet", () => {
    // Sects & Violets with a Philosopher: official first night is
    // Dusk, Philosopher, Minion info, Demon info, ... (issue #115).
    // 7+ seated players so Minion/Demon info are eligible at all.
    const snv = gameWith([
      "philosopher",
      "witch",
      "clockmaker",
      "imp",
      "poisoner",
      "washerwoman",
      "chef",
    ]);
    const snvEntries = computeNightList({
      game: snv,
      characterById: characterById(snv),
      phase: "first",
      showAll: false,
      unskippedIds: new Set(),
    });
    const snvIds = snvEntries.map((e) => e.characterId ?? e.id);
    expect(snvIds.indexOf("philosopher")).toBeLessThan(snvIds.indexOf("fixed:minion-info"));
    expect(snvIds.indexOf("fixed:minion-info")).toBeLessThan(snvIds.indexOf("fixed:demon-info"));
    // Poisoner (17) acts well after Demon info.
    expect(snvIds.indexOf("fixed:demon-info")).toBeLessThan(snvIds.indexOf("poisoner"));

    // Trouble Brewing with Thief/Bureaucrat travellers: both act (1) before
    // Minion info.
    const tb = gameWith(["thief", "bureaucrat", "imp", "poisoner", "washerwoman", "chef", "empath"]);
    const tbEntries = computeNightList({
      game: tb,
      characterById: characterById(tb),
      phase: "first",
      showAll: false,
      unskippedIds: new Set(),
    });
    const tbIds = tbEntries.map((e) => e.characterId ?? e.id);
    expect(tbIds.indexOf("thief")).toBeLessThan(tbIds.indexOf("fixed:minion-info"));
    expect(tbIds.indexOf("bureaucrat")).toBeLessThan(tbIds.indexOf("fixed:minion-info"));

    // Snitch (6) and Lunatic (7) sit between the two info steps.
    const between = gameWith(["snitch", "lunatic", "imp", "poisoner", "washerwoman", "chef", "empath"]);
    const betweenEntries = computeNightList({
      game: between,
      characterById: characterById(between),
      phase: "first",
      showAll: false,
      unskippedIds: new Set(),
    });
    const betweenIds = betweenEntries.map((e) => e.characterId ?? e.id);
    expect(betweenIds.indexOf("fixed:minion-info")).toBeLessThan(betweenIds.indexOf("snitch"));
    expect(betweenIds.indexOf("snitch")).toBeLessThan(betweenIds.indexOf("fixed:demon-info"));
    expect(betweenIds.indexOf("fixed:minion-info")).toBeLessThan(betweenIds.indexOf("lunatic"));
    expect(betweenIds.indexOf("lunatic")).toBeLessThan(betweenIds.indexOf("fixed:demon-info"));
  });

  it("never ties Minion/Demon info's nightValue with a real character's (the Summoner's firstNight is 8, next to the info steps' approximate position)", () => {
    // A numeric tie would fall back to alphabetical order by luck rather
    // than a rule — assert Demon info's position is decided by its own
    // nightValue, not a same-value tie-break against the Summoner.
    const game = gameWith(["summoner", "washerwoman", "chef", "empath", "recluse", "baron", "mathematician"]);
    const chars = characterById(game);
    const entries = computeNightList({
      game,
      characterById: chars,
      phase: "first",
      showAll: false,
      unskippedIds: new Set(),
    });
    const ids = entries.map((e) => e.characterId ?? e.id);
    expect(ids.indexOf("fixed:demon-info")).toBeLessThan(ids.indexOf("summoner"));
  });

  it("leaves other-night ordering unaffected by the Minion/Demon info numeric scale", () => {
    const game = gameWith(["poisoner", "washerwoman", "imp", "baron", "recluse", "chef", "empath"]);
    const chars = characterById(game);
    const entries = computeNightList({
      game,
      characterById: chars,
      phase: "other",
      showAll: false,
      unskippedIds: new Set(),
    });

    const acting = entries.filter((e) => e.kind === "character");
    const expectedOrder = [...acting]
      .map((e) => ({ e, value: chars.get(e.characterId!)!.otherNight }))
      .sort((a, b) => a.value - b.value)
      .map(({ e }) => e.id);
    expect(acting.map((e) => e.id)).toEqual(expectedOrder);
    expect(entries.map((e) => e.id)).not.toContain("fixed:minion-info");
    expect(entries.map((e) => e.id)).not.toContain("fixed:demon-info");
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

describe("computeNightList: disguised stand-in flags (Drunk/Lunatic, issue #163)", () => {
  it("flags a Drunk's disguised entry as isDrunk, so the storyteller knows the wake is fake", () => {
    const game = gameWith(["washerwoman", "imp"]);
    const disguised: GameDocument = {
      ...game,
      players: game.players.map((p, i) => (i === 0 ? { ...p, isDrunk: true } : p)),
    };
    // showAll: true so every entry appears regardless of whether the
    // character actually acts tonight — this test only cares about the
    // isDrunk flag reaching the entry, not night-action eligibility.
    const entries = computeNightList({
      game: disguised,
      characterById: characterById(disguised),
      phase: "first",
      showAll: true,
      unskippedIds: new Set(),
    });

    const washerwomanEntry = entries.find((e) => e.characterId === "washerwoman")!;
    expect(washerwomanEntry.isDrunk).toBe(true);
    const impEntry = entries.find((e) => e.characterId === "imp")!;
    expect(impEntry.isDrunk).toBe(false);
  });

  it("flags a Lunatic's disguised entry as isLunatic, so the storyteller runs it as the fake ritual, not a real Demon action", () => {
    const game = gameWith(["imp", "washerwoman"]);
    const disguised: GameDocument = {
      ...game,
      players: game.players.map((p, i) => (i === 0 ? { ...p, isLunatic: true } : p)),
    };
    const entries = computeNightList({
      game: disguised,
      characterById: characterById(disguised),
      phase: "first",
      showAll: true,
      unskippedIds: new Set(),
    });

    const impEntry = entries.find((e) => e.characterId === "imp")!;
    expect(impEntry.isLunatic).toBe(true);
    const washerwomanEntry = entries.find((e) => e.characterId === "washerwoman")!;
    expect(washerwomanEntry.isLunatic).toBe(false);
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
    // A partial override must not let Dawn leapfrog real, unlisted actors —
    // washerwoman/poisoner still act *during* the night, not after it ends.
    expect(ids.indexOf("washerwoman")).toBeLessThan(ids.indexOf("fixed:dawn"));
    expect(ids.indexOf("poisoner")).toBeLessThan(ids.indexOf("fixed:dawn"));
  });

  it("keeps Dusk first and Dawn last even when the override omits fixed-step tokens entirely", () => {
    const game = gameWith(["empath", "imp"], {
      firstNightOrder: ["empath"],
    });
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

describe("computeNightList: acts-as (issue #17)", () => {
  it("inserts an entry at the target's night position, attributed to the acting player with the target's reminder text", () => {
    // Empath recurs on other nights (otherNight > 0) — a simple non-one-shot
    // target to prove basic attribution and reminder-text borrowing.
    const game = gameWith(["philosopher", "imp", "empath"]);
    const philosopher = game.players.find((p) => p.characterId === "philosopher")!;
    const withActsAs: GameDocument = {
      ...game,
      players: game.players.map((p) =>
        p.id === philosopher.id ? { ...p, actsAs: "empath", actsAsSetOnNight: 1 } : p,
      ),
    };
    const chars = characterById(withActsAs);
    const entries = computeNightList({
      game: withActsAs,
      characterById: chars,
      phase: "other",
      showAll: false,
      unskippedIds: new Set(),
    });

    const entry = entries.find((e) => e.id === `actsas:${philosopher.id}`);
    expect(entry).toBeDefined();
    expect(entry!.characterId).toBe("empath");
    expect(entry!.actingCharacterId).toBe("philosopher");
    expect(entry!.playerId).toBe(philosopher.id);
    expect(entry!.reminderText).toBe(chars.get("empath")!.otherNightReminder);
    // Sorted at the target's (empath) night position, not the actor's own.
    const impIndex = entries.findIndex((e) => e.characterId === "imp");
    const empathValue = chars.get("empath")!.otherNight;
    const impValue = chars.get("imp")!.otherNight;
    const entryIndex = entries.indexOf(entry!);
    expect(entryIndex < impIndex).toBe(empathValue < impValue);
  });

  it("suppresses the acting player's own generic entry once acts-as is set", () => {
    const game = gameWith(["philosopher", "imp", "empath"]);
    const philosopher = game.players.find((p) => p.characterId === "philosopher")!;
    const withActsAs: GameDocument = {
      ...game,
      players: game.players.map((p) =>
        p.id === philosopher.id ? { ...p, actsAs: "empath", actsAsSetOnNight: 1 } : p,
      ),
    };
    const entries = computeNightList({
      game: withActsAs,
      characterById: characterById(withActsAs),
      phase: "other",
      showAll: false,
      unskippedIds: new Set(),
    });

    expect(entries.some((e) => e.id === `char:${philosopher.id}`)).toBe(false);
  });

  it("still reveals the suppressed own entry under show-all, like every other non-acting entry", () => {
    const game = gameWith(["philosopher", "imp", "empath"]);
    const philosopher = game.players.find((p) => p.characterId === "philosopher")!;
    const withActsAs: GameDocument = {
      ...game,
      players: game.players.map((p) =>
        p.id === philosopher.id ? { ...p, actsAs: "empath", actsAsSetOnNight: 1 } : p,
      ),
    };

    const hidden = computeNightList({
      game: withActsAs,
      characterById: characterById(withActsAs),
      phase: "other",
      showAll: false,
      unskippedIds: new Set(),
    });
    expect(hidden.some((e) => e.id === `char:${philosopher.id}`)).toBe(false);

    const revealed = computeNightList({
      game: withActsAs,
      characterById: characterById(withActsAs),
      phase: "other",
      showAll: true,
      unskippedIds: new Set(),
    });
    expect(revealed.some((e) => e.id === `char:${philosopher.id}`)).toBe(true);
    // Both the player's own entry and their acts-as entry are visible.
    expect(revealed.some((e) => e.id === `actsas:${philosopher.id}`)).toBe(true);
  });

  it("uses the target's other-night reminder, not first-night, for an override-placed non-one-shot other-night entry", () => {
    // A homebrew character with no other-night dataset position, but placed
    // in the script's own other-night order — acts via the override alone,
    // not the one-shot rule, so it must use its other-night reminder text.
    const homebrew: Character = {
      id: "custom-scryer",
      name: "Custom Scryer",
      edition: null,
      team: "townsfolk",
      ability: "A homebrew ability.",
      firstNight: 0,
      firstNightReminder: "",
      otherNight: 0,
      otherNightReminder: "Show a card.",
      reminders: [],
      remindersGlobal: [],
      setup: false,
      jinxes: [],
      image: null,
    };
    const game = gameWith(["philosopher", "imp"], {
      otherNightOrder: ["dusk", "custom-scryer", "imp", "dawn"],
    });
    const philosopher = game.players.find((p) => p.characterId === "philosopher")!;
    const withActsAs: GameDocument = {
      ...game,
      characterPool: [...game.characterPool, homebrew],
      players: game.players.map((p) =>
        p.id === philosopher.id
          ? { ...p, actsAs: "custom-scryer", actsAsSetOnNight: 1 }
          : p,
      ),
    };
    const entries = computeNightList({
      game: withActsAs,
      characterById: characterById(withActsAs),
      phase: "other",
      showAll: false,
      unskippedIds: new Set(),
    });

    const entry = entries.find((e) => e.id === `actsas:${philosopher.id}`)!;
    expect(entry).toBeDefined();
    expect(entry.reminderText).toBe("Show a card.");
  });

  it("treats a target whose only first-night position comes from a script override as one-shot too", () => {
    // Dataset firstNight is 0, but the script's own first-night order names
    // it explicitly — the acting rule already honors this for a normal
    // character entry, so the one-shot acts-as fallback must too.
    const homebrew: Character = {
      id: "custom-oracle",
      name: "Custom Oracle",
      edition: null,
      team: "townsfolk",
      ability: "A homebrew ability.",
      firstNight: 0,
      firstNightReminder: "Reveal a card.",
      otherNight: 0,
      otherNightReminder: "",
      reminders: [],
      remindersGlobal: [],
      setup: false,
      jinxes: [],
      image: null,
    };
    const game = gameWith(["philosopher", "imp"], {
      night: 2,
      firstNightOrder: ["dusk", "custom-oracle", "dawn"],
    });
    const philosopher = game.players.find((p) => p.characterId === "philosopher")!;
    const withActsAs: GameDocument = {
      ...game,
      characterPool: [...game.characterPool, homebrew],
      players: game.players.map((p) =>
        p.id === philosopher.id
          ? { ...p, actsAs: "custom-oracle", actsAsSetOnNight: 3 }
          : p,
      ),
    };
    const entries = computeNightList({
      game: withActsAs,
      characterById: characterById(withActsAs),
      phase: "other",
      showAll: false,
      unskippedIds: new Set(),
    });

    const entry = entries.find((e) => e.id === `actsas:${philosopher.id}`);
    expect(entry).toBeDefined();
    expect(entry!.reminderText).toBe("Reveal a card.");
    // Regression (code review): an override-only one-shot has no real
    // nightValue to sort by (the dataset firstNight is 0), so it must sort
    // via the override's own rank — like any other script-named entry ranks
    // ahead of unranked ones — not by a bare nightValue of 0, which would
    // misplace it at the very start of the acting bucket regardless of
    // where the override actually named it.
    const impIndex = entries.findIndex((e) => e.characterId === "imp");
    const entryIndex = entries.indexOf(entry!);
    expect(entryIndex).toBeLessThan(impIndex);
  });

  it("inserts a first-night-only target chosen on a later night for that night only, then never again", () => {
    // Washerwoman only has a first-night position (otherNight === 0).
    const game = gameWith(["philosopher", "imp", "washerwoman"]);
    const philosopher = game.players.find((p) => p.characterId === "philosopher")!;
    const chosenOnNight3: GameDocument = {
      ...game,
      night: 2, // "night: game.night + 1" is the night currently open — 3.
      players: game.players.map((p) =>
        p.id === philosopher.id ? { ...p, actsAs: "washerwoman", actsAsSetOnNight: 3 } : p,
      ),
    };
    const chars = characterById(chosenOnNight3);

    const night3 = computeNightList({
      game: chosenOnNight3,
      characterById: chars,
      phase: "other",
      showAll: false,
      unskippedIds: new Set(),
    });
    expect(night3.some((e) => e.id === `actsas:${philosopher.id}`)).toBe(true);
    const entry = night3.find((e) => e.id === `actsas:${philosopher.id}`)!;
    expect(entry.reminderText).toBe(chars.get("washerwoman")!.firstNightReminder);

    const night4: GameDocument = { ...chosenOnNight3, night: 3 };
    const otherEntries = computeNightList({
      game: night4,
      characterById: characterById(night4),
      phase: "other",
      showAll: false,
      unskippedIds: new Set(),
    });
    expect(otherEntries.some((e) => e.id === `actsas:${philosopher.id}`)).toBe(false);
  });

  it("treats a recurring target's own later night normally, without needing actsAsSetOnNight to match", () => {
    const game = gameWith(["philosopher", "imp", "empath"]);
    const philosopher = game.players.find((p) => p.characterId === "philosopher")!;
    // Set on night 1, still recurring fine many nights later.
    const laterGame: GameDocument = {
      ...game,
      night: 4,
      players: game.players.map((p) =>
        p.id === philosopher.id ? { ...p, actsAs: "empath", actsAsSetOnNight: 1 } : p,
      ),
    };
    const entries = computeNightList({
      game: laterGame,
      characterById: characterById(laterGame),
      phase: "other",
      showAll: false,
      unskippedIds: new Set(),
    });

    expect(entries.some((e) => e.id === `actsas:${philosopher.id}`)).toBe(true);
  });

  it("marks a dead acting player's acts-as entry skipped unless un-skipped, independently of their suppressed own entry", () => {
    const game = gameWith(["philosopher", "imp", "empath"]);
    const philosopher = game.players.find((p) => p.characterId === "philosopher")!;
    const deadWithActsAs: GameDocument = {
      ...game,
      players: game.players.map((p) =>
        p.id === philosopher.id
          ? { ...p, actsAs: "empath", actsAsSetOnNight: 1, dead: true }
          : p,
      ),
    };
    const entries = computeNightList({
      game: deadWithActsAs,
      characterById: characterById(deadWithActsAs),
      phase: "other",
      showAll: false,
      unskippedIds: new Set(),
    });

    const entry = entries.find((e) => e.id === `actsas:${philosopher.id}`)!;
    expect(entry.dead).toBe(true);
    expect(entry.skipped).toBe(true);

    const unskipped = computeNightList({
      game: deadWithActsAs,
      characterById: characterById(deadWithActsAs),
      phase: "other",
      showAll: false,
      unskippedIds: new Set([`actsas:${philosopher.id}`]),
    });
    expect(unskipped.find((e) => e.id === `actsas:${philosopher.id}`)!.skipped).toBe(false);
  });
});
