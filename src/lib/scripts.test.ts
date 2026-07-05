import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getScriptById, listScriptSummaries, listValidLibraryScripts } from "./scripts";

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
    expect(byId["sample-homebrew"]).toMatchObject({
      name: "Sample Homebrew Script",
      author: "BotC Grimoire",
      isTeensyville: false,
    });
  });

  it("excludes Fabled characters from characterCount, same as travellers", () => {
    const summaries = listScriptSummaries();
    const script = summaries.find((s) => s.id === "a-lleech-of-distrust");
    // 6 townsfolk + 2 outsiders + 2 minions + 1 demon; Sentinel (fabled) is a
    // storyteller aid, not a seat, so it counts toward neither figure.
    expect(script).toMatchObject({ characterCount: 11, travellerCount: 0 });
  });
});

describe("bundled custom scripts (issue #47)", () => {
  it("parses each of the six community scripts cleanly, with the correct category and character count", () => {
    const expected = [
      { id: "catfishing", isTeensyville: false, characterCount: 25, travellerCount: 5 },
      { id: "everyone-can-play", isTeensyville: false, characterCount: 24, travellerCount: 0 },
      { id: "pies-baking", isTeensyville: false, characterCount: 23, travellerCount: 0 },
      { id: "a-lleech-of-distrust", isTeensyville: true, characterCount: 11, travellerCount: 0 },
      { id: "ride-the-cyclone", isTeensyville: false, characterCount: 22, travellerCount: 5 },
      { id: "no-greater-joy", isTeensyville: true, characterCount: 11, travellerCount: 0 },
    ];

    const summaries = listScriptSummaries();
    const byId = Object.fromEntries(summaries.map((s) => [s.id, s]));

    for (const { id, isTeensyville, characterCount, travellerCount } of expected) {
      expect(byId[id], `missing summary for ${id}`).toBeDefined();
      expect(byId[id]).toMatchObject({
        source: "library",
        isTeensyville,
        characterCount,
        travellerCount,
      });
    }
  });

  it("leaves the sample demo scripts untagged and unaffected", () => {
    const summaries = listScriptSummaries();
    const byId = Object.fromEntries(summaries.map((s) => [s.id, s]));
    expect(byId["sample-homebrew"]?.isTeensyville).toBe(false);
    expect(byId["setup-modifiers-demo"]?.isTeensyville).toBe(false);
  });
});

describe("getScriptById", () => {
  it("resolves a base edition by id", () => {
    const script = getScriptById("tb");
    expect(script?.name).toBe("Trouble Brewing");
    expect(script?.characters.map((c) => c.id)).toContain("imp");
  });

  it("carries its display name in meta.name too, for consumers that only read meta (e.g. sharing)", () => {
    expect(getScriptById("tb")?.meta.name).toBe("Trouble Brewing");
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

describe("listValidLibraryScripts: base edition id collision", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "script-library-collision-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("drops a library script whose filename collides with a base edition id", () => {
    fs.writeFileSync(path.join(dir, "tb.json"), JSON.stringify(["imp"]));
    fs.writeFileSync(
      path.join(dir, "my-script.json"),
      JSON.stringify(["imp"]),
    );

    const ids = listValidLibraryScripts(dir).map((s) => s.id);
    expect(ids).not.toContain("tb");
    expect(ids).toContain("my-script");
  });

  it("carries its filename-derived display name in meta.name too, when the script's own JSON has no _meta.name", () => {
    fs.writeFileSync(
      path.join(dir, "no-meta-name.json"),
      JSON.stringify(["imp"]),
    );

    const script = listValidLibraryScripts(dir).find(
      (s) => s.id === "no-meta-name",
    );
    expect(script?.name).toBe("no-meta-name");
    expect(script?.meta.name).toBe("no-meta-name");
  });
});
