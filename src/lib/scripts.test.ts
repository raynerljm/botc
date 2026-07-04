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
});
