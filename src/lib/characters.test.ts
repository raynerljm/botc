import { describe, expect, it } from "vitest";

import {
  allCharacters,
  baseEditions,
  characterPickerPool,
  getCharacter,
  getEditionCharacters,
  groupByTeam,
  isOfficialCharacter,
  wikiUrl,
  type Character,
} from "./characters";

describe("vendored character dataset", () => {
  it("contains all 181 official characters with the fields every slice relies on", () => {
    expect(allCharacters).toHaveLength(181);
    for (const character of allCharacters) {
      expect(character.id).toBeTruthy();
      expect(character.name).toBeTruthy();
      expect(character.team).toBeTruthy();
      expect(character.ability).toBeTruthy();
    }
  });

  it("looks up a character by id with its official data", () => {
    const washerwoman = getCharacter("washerwoman");
    expect(washerwoman).toMatchObject({
      id: "washerwoman",
      name: "Washerwoman",
      edition: "tb",
      team: "townsfolk",
      ability: "You start knowing that 1 of 2 players is a particular Townsfolk.",
      setup: false,
    });
    expect(washerwoman?.reminders).toEqual(["Townsfolk", "Wrong"]);
    expect(washerwoman?.firstNight).toBeGreaterThan(0);
    expect(washerwoman?.firstNightReminder).toContain("Townsfolk");
  });
});

describe("base editions", () => {
  it("exposes the three base editions for the script picker", () => {
    expect(baseEditions.map((e) => e.name)).toEqual([
      "Trouble Brewing",
      "Bad Moon Rising",
      "Sects & Violets",
    ]);
  });

  it("resolves an edition's characters, travellers included", () => {
    const troubleBrewing = getEditionCharacters("tb");
    // 13 Townsfolk + 4 Outsiders + 4 Minions + 1 Demon + 5 Travellers
    expect(troubleBrewing).toHaveLength(27);
    expect(troubleBrewing.map((c) => c.id)).toContain("imp");
    expect(troubleBrewing.map((c) => c.id)).toContain("scapegoat");
    expect(troubleBrewing.every((c) => c.edition === "tb")).toBe(true);
  });

  it("orders Trouble Brewing's characters in official script order, not dataset order", () => {
    expect(getEditionCharacters("tb").map((c) => c.id)).toEqual([
      "washerwoman", "librarian", "investigator", "chef", "empath",
      "fortuneteller", "undertaker", "monk", "ravenkeeper", "virgin",
      "slayer", "soldier", "mayor",
      "butler", "drunk", "recluse", "saint",
      "poisoner", "spy", "scarletwoman", "baron",
      "imp",
      "bureaucrat", "thief", "gunslinger", "scapegoat", "beggar",
    ]);
  });

  it("orders Bad Moon Rising's characters in official script order", () => {
    expect(getEditionCharacters("bmr").map((c) => c.id)).toEqual([
      "grandmother", "sailor", "chambermaid", "exorcist", "innkeeper",
      "gambler", "gossip", "courtier", "professor", "minstrel", "tealady",
      "pacifist", "fool",
      "tinker", "moonchild", "goon", "lunatic",
      "godfather", "devilsadvocate", "assassin", "mastermind",
      "zombuul", "pukka", "shabaloth", "po",
      "apprentice", "matron", "judge", "bishop", "voudon",
    ]);
  });

  it("orders Sects & Violets' characters in official script order", () => {
    expect(getEditionCharacters("snv").map((c) => c.id)).toEqual([
      "clockmaker", "dreamer", "snakecharmer", "mathematician", "flowergirl",
      "towncrier", "oracle", "savant", "seamstress", "philosopher", "artist",
      "juggler", "sage",
      "mutant", "sweetheart", "barber", "klutz",
      "eviltwin", "witch", "cerenovus", "pithag",
      "fanggu", "vigormortis", "nodashii", "vortox",
      "barista", "harlot", "butcher", "bonecollector", "deviant",
    ]);
  });

  it("covers exactly the dataset's characters for each edition, so the hand-maintained order stays in sync with characters.json", () => {
    for (const edition of ["tb", "bmr", "snv"] as const) {
      const ordered = getEditionCharacters(edition).map((c) => c.id).sort();
      const fromDataset = allCharacters
        .filter((c) => c.edition === edition)
        .map((c) => c.id)
        .sort();
      expect(ordered).toEqual(fromDataset);
    }
  });
});

describe("character sheet grouping", () => {
  it("groups an edition's characters by team in sheet order", () => {
    const groups = groupByTeam(getEditionCharacters("tb"));
    expect(groups.map((g) => g.team)).toEqual([
      "townsfolk",
      "outsider",
      "minion",
      "demon",
      "traveller",
    ]);
    const byTeam = Object.fromEntries(
      groups.map((g) => [g.team, g.characters.length]),
    );
    expect(byTeam).toEqual({
      townsfolk: 13,
      outsider: 4,
      minion: 4,
      demon: 1,
      traveller: 5,
    });
    // groupByTeam only buckets by team; the official within-team order
    // (script sheet, bag builder, pickers) has to survive the grouping.
    expect(groups[0].characters[0].id).toBe("washerwoman");
  });

  it("omits teams with no characters instead of rendering empty groups", () => {
    const washerwoman = getCharacter("washerwoman")!;
    expect(groupByTeam([washerwoman]).map((g) => g.team)).toEqual([
      "townsfolk",
    ]);
  });
});

describe("official wiki links", () => {
  it("links a character to its page on the official wiki", () => {
    expect(wikiUrl(getCharacter("fortuneteller")!)).toBe(
      "https://wiki.bloodontheclocktower.com/Fortune_Teller",
    );
  });

  it("percent-encodes apostrophes so the link isn't broken", () => {
    expect(wikiUrl(getCharacter("devilsadvocate")!)).toBe(
      "https://wiki.bloodontheclocktower.com/Devil%27s_Advocate",
    );
  });
});

describe("characterPickerPool", () => {
  it("lists the script's own characters before the rest of the dataset", () => {
    const script = [getCharacter("imp")!, getCharacter("washerwoman")!];
    const pool = characterPickerPool(script);

    expect(pool.slice(0, 2)).toEqual(script);
    expect(pool.length).toBe(allCharacters.length);
  });

  it("doesn't list a script character twice", () => {
    const script = [getCharacter("imp")!];
    const pool = characterPickerPool(script);

    expect(pool.filter((c) => c.id === "imp")).toHaveLength(1);
  });

  it("keeps a script's homebrew character (off the vendored dataset) in the pool", () => {
    const homebrew: Character = {
      ...getCharacter("imp")!,
      id: "custom-demon",
      name: "Custom Demon",
    };
    const pool = characterPickerPool([homebrew]);

    expect(pool[0]).toBe(homebrew);
  });

  it("filters to a single team when given one, script characters still first", () => {
    const script = [getCharacter("angel")!, getCharacter("imp")!];
    const pool = characterPickerPool(script, "fabled");

    expect(pool[0]).toEqual(getCharacter("angel"));
    expect(pool.every((c) => c.team === "fabled")).toBe(true);
    expect(pool.map((c) => c.id)).not.toContain("imp");
  });
});

describe("isOfficialCharacter", () => {
  it("recognizes an official character even after a JSON round-trip (no shared object reference)", () => {
    // A game document loaded back from localStorage never has the same
    // object references as the imported dataset, even for genuinely
    // official characters — value equality has to survive that.
    const reloaded: Character = JSON.parse(JSON.stringify(getCharacter("imp")!));
    expect(isOfficialCharacter(reloaded)).toBe(true);
  });

  it("rejects a homebrew character that reuses an official id with different content", () => {
    const reskinned: Character = {
      ...getCharacter("imp")!,
      name: "Totally Different Demon",
      ability: "A homebrew ability, not the real Imp's.",
    };
    expect(isOfficialCharacter(reskinned)).toBe(false);
  });

  it("rejects a character whose id isn't in the vendored dataset at all", () => {
    const homebrew: Character = {
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
    expect(isOfficialCharacter(homebrew)).toBe(false);
  });
});
