import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { listLibraryScripts } from "./scriptLibrary";

describe("listLibraryScripts", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "script-library-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns an empty list when the folder does not exist", () => {
    expect(listLibraryScripts(path.join(dir, "missing"))).toEqual([]);
  });

  it("auto-discovers every JSON file, id derived from the filename", () => {
    fs.writeFileSync(
      path.join(dir, "b-script.json"),
      JSON.stringify(["washerwoman"]),
    );
    fs.writeFileSync(
      path.join(dir, "a-script.json"),
      JSON.stringify([{ id: "_meta", name: "A Script" }, "imp"]),
    );
    fs.writeFileSync(path.join(dir, "notes.txt"), "ignore me");

    const scripts = listLibraryScripts(dir);
    expect(scripts.map((s) => s.id)).toEqual(["a-script", "b-script"]);

    const aScript = scripts[0].result;
    expect(aScript.ok).toBe(true);
    if (aScript.ok) {
      expect(aScript.script.meta.name).toBe("A Script");
      expect(aScript.script.characters.map((c) => c.id)).toEqual(["imp"]);
    }
  });

  it("surfaces a malformed library script's parse errors instead of throwing", () => {
    fs.writeFileSync(path.join(dir, "broken.json"), "{not json");

    const scripts = listLibraryScripts(dir);
    expect(scripts[0].result).toEqual({
      ok: false,
      errors: [{ type: "invalid-json" }],
    });
  });

  it("parses every script actually committed to the repo's script-library folder", () => {
    const scripts = listLibraryScripts();
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
      expect(script.result.ok).toBe(true);
    }
  });
});
