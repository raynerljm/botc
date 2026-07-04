import { describe, expect, it } from "vitest";

import { getScriptById, listScriptSummaries } from "./scripts";

describe("listScriptSummaries", () => {
  it("includes the three base editions and at least one library script", () => {
    const summaries = listScriptSummaries();
    const byId = Object.fromEntries(summaries.map((s) => [s.id, s]));

    expect(byId.tb).toMatchObject({ name: "Trouble Brewing", source: "base" });
    expect(byId.bmr).toMatchObject({
      name: "Bad Moon Rising",
      source: "base",
    });
    expect(byId.snv).toMatchObject({
      name: "Sects & Violets",
      source: "base",
    });

    const librarySummaries = summaries.filter((s) => s.source === "library");
    expect(librarySummaries.length).toBeGreaterThan(0);
    expect(librarySummaries[0]).toMatchObject({
      name: "Sample Homebrew Script",
      author: "BotC Grimoire",
    });
  });
});

describe("getScriptById", () => {
  it("resolves a base edition by id", () => {
    const script = getScriptById("tb");
    expect(script?.name).toBe("Trouble Brewing");
    expect(script?.characters.map((c) => c.id)).toContain("imp");
  });

  it("resolves a library script by its filename-derived id, meta and jinxes included", () => {
    const script = getScriptById("sample-homebrew");
    expect(script?.name).toBe("Sample Homebrew Script");
    expect(script?.meta.author).toBe("BotC Grimoire");
    expect(script?.characters.map((c) => c.id)).toEqual(
      expect.arrayContaining(["washerwoman", "custom-seer", "wraith", "imp"]),
    );
    expect(script?.jinxes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ characterId: "alchemist", targetId: "wraith" }),
      ]),
    );
  });

  it("returns undefined for an unknown id", () => {
    expect(getScriptById("does-not-exist")).toBeUndefined();
  });
});
