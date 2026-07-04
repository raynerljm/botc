import { describe, expect, it } from "vitest";

import {
  allCharacters,
  baseEditions,
  getCharacter,
  getEditionCharacters,
  groupByTeam,
  wikiUrl,
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
