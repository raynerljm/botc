import { describe, expect, it } from "vitest";

import { getCharacter } from "./characters";
import { parseScript, resolveCharacterId } from "./scriptParser";

describe("resolveCharacterId", () => {
  it("resolves an exact id", () => {
    expect(resolveCharacterId("washerwoman")?.id).toBe("washerwoman");
  });

  it("normalizes case and hyphen/underscore variants", () => {
    expect(resolveCharacterId("Washerwoman")?.id).toBe("washerwoman");
    expect(resolveCharacterId("scarlet_woman")?.id).toBe("scarletwoman");
    expect(resolveCharacterId("scarlet-woman")?.id).toBe("scarletwoman");
    expect(resolveCharacterId("Al-Hadikhia")?.id).toBe("alhadikhia");
  });

  it("returns undefined for an id not in the dataset", () => {
    expect(resolveCharacterId("not-a-character")).toBeUndefined();
  });
});

describe("parseScript: bare ids and id references", () => {
  it("resolves an array of bare official ids", () => {
    const result = parseScript(
      JSON.stringify(["washerwoman", "imp", "poisoner"]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.script.characters.map((c) => c.id).sort()).toEqual(
      ["imp", "poisoner", "washerwoman"].sort(),
    );
  });

  it("resolves {id} reference entries", () => {
    const result = parseScript(JSON.stringify([{ id: "Washerwoman" }]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.script.characters).toHaveLength(1);
    expect(result.script.characters[0]).toMatchObject({ id: "washerwoman" });
  });

  it("reports an unknown bare id as an error", () => {
    const result = parseScript(JSON.stringify(["not-a-character"]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      { type: "unknown-character", raw: "not-a-character" },
    ]);
  });

  it("deduplicates a character named more than once, keeping the first occurrence", () => {
    const result = parseScript(
      JSON.stringify(["alchemist", "washerwoman", { id: "Alchemist" }]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.script.characters.map((c) => c.id)).toEqual([
      "alchemist",
      "washerwoman",
    ]);
  });
});

describe("parseScript: invalid input", () => {
  it("reports malformed JSON", () => {
    const result = parseScript("{not json");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([{ type: "invalid-json" }]);
  });

  it("reports a non-array top-level value", () => {
    const result = parseScript(JSON.stringify({ id: "washerwoman" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([{ type: "not-array" }]);
  });
});

describe("parseScript: homebrew characters", () => {
  it("accepts a full homebrew character object", () => {
    const homebrew = {
      id: "custom-fool",
      name: "Custom Fool",
      team: "townsfolk",
      ability: "You start knowing nothing.",
    };
    const result = parseScript(JSON.stringify([homebrew]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.script.characters[0]).toMatchObject({
      id: "custom-fool",
      name: "Custom Fool",
      team: "townsfolk",
      ability: "You start knowing nothing.",
      edition: null,
      firstNight: 0,
      otherNight: 0,
      reminders: [],
      remindersGlobal: [],
      setup: false,
      jinxes: [],
      image: null,
    });
  });

  it("honours optional homebrew fields when given", () => {
    const homebrew = {
      id: "custom-demon",
      name: "Custom Demon",
      team: "demon",
      ability: "Kills at night.",
      firstNight: 0,
      otherNight: 30,
      otherNightReminder: "Choose a player to die.",
      reminders: ["Dead"],
      setup: true,
    };
    const result = parseScript(JSON.stringify([homebrew]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.script.characters[0]).toMatchObject({
      otherNight: 30,
      otherNightReminder: "Choose a player to die.",
      reminders: ["Dead"],
      setup: true,
    });
  });

  it("reports missing required fields on an invalid homebrew object", () => {
    const result = parseScript(
      JSON.stringify([{ name: "Missing bits", team: "townsfolk" }]),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      { type: "invalid-homebrew", index: 0, missingFields: ["id", "ability"] },
    ]);
  });

  it("reports an invalid team on a homebrew object", () => {
    const result = parseScript(
      JSON.stringify([
        { id: "x", name: "X", team: "not-a-team", ability: "..." },
      ]),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      { type: "invalid-homebrew", index: 0, missingFields: ["team"] },
    ]);
  });

  it("collects errors across multiple bad entries", () => {
    const result = parseScript(
      JSON.stringify(["not-a-character", { name: "No id or ability" }]),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      { type: "unknown-character", raw: "not-a-character" },
      { type: "invalid-homebrew", index: 1, missingFields: ["id", "team", "ability"] },
    ]);
  });
});

describe("parseScript: _meta", () => {
  it("extracts _meta and excludes it from the character list", () => {
    const result = parseScript(
      JSON.stringify([
        {
          id: "_meta",
          name: "Sample Script",
          author: "Someone",
          logo: "https://example.com/logo.png",
          almanac: "https://example.com/almanac",
          bootlegger: "House rule: X",
          firstNight: ["dusk", "washerwoman"],
          otherNight: ["dusk", "imp"],
        },
        "washerwoman",
        "imp",
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.script.meta).toEqual({
      name: "Sample Script",
      author: "Someone",
      logo: "https://example.com/logo.png",
      almanac: "https://example.com/almanac",
      bootlegger: "House rule: X",
      firstNight: ["dusk", "washerwoman"],
      otherNight: ["dusk", "imp"],
    });
    expect(result.script.characters.map((c) => c.id)).toEqual([
      "washerwoman",
      "imp",
    ]);
  });

  it("defaults meta to an empty object when no _meta entry is present", () => {
    const result = parseScript(JSON.stringify(["washerwoman"]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.script.meta).toEqual({});
  });

  it("finds _meta regardless of its position in the array", () => {
    const result = parseScript(
      JSON.stringify([
        "washerwoman",
        "imp",
        { id: "_meta", name: "Sample Script" },
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.script.meta).toEqual({ name: "Sample Script" });
    expect(result.script.characters.map((c) => c.id)).toEqual([
      "washerwoman",
      "imp",
    ]);
  });
});

describe("parseScript: active jinxes", () => {
  it("includes a jinx only when both characters are in the script", () => {
    const alchemist = getCharacter("alchemist")!;
    expect(alchemist.jinxes.some((j) => j.id === "wraith")).toBe(true);

    const withBoth = parseScript(JSON.stringify(["alchemist", "wraith"]));
    expect(withBoth.ok).toBe(true);
    if (withBoth.ok) {
      expect(withBoth.script.jinxes).toEqual([
        {
          characterId: "alchemist",
          targetId: "wraith",
          reason: alchemist.jinxes.find((j) => j.id === "wraith")!.reason,
        },
      ]);
    }

    const withoutTarget = parseScript(JSON.stringify(["alchemist"]));
    expect(withoutTarget.ok).toBe(true);
    if (withoutTarget.ok) {
      expect(withoutTarget.script.jinxes).toEqual([]);
    }
  });
});
