import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteCustomScript,
  getCustomScript,
  listCustomScripts,
  saveCustomScript,
  subscribeCustomScripts,
} from "./customScripts";

describe("custom scripts (localStorage)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts empty", () => {
    expect(listCustomScripts()).toEqual([]);
  });

  it("saves a script and lists it back", () => {
    const saved = saveCustomScript({
      rawText: '["washerwoman"]',
      name: "My Script",
      author: "Me",
    });
    expect(saved).toMatchObject({
      name: "My Script",
      author: "Me",
      rawText: '["washerwoman"]',
    });
    expect(saved.id).toBeTruthy();
    expect(saved.addedAt).toBeTruthy();

    expect(listCustomScripts()).toEqual([saved]);
  });

  it("persists across separate calls (survives reload)", () => {
    const saved = saveCustomScript({ rawText: "[]", name: "Script A" });
    expect(getCustomScript(saved.id)).toEqual(saved);
  });

  it("returns undefined for an id that isn't stored", () => {
    expect(getCustomScript("does-not-exist")).toBeUndefined();
  });

  it("deletes a script by id", () => {
    const a = saveCustomScript({ rawText: "[]", name: "A" });
    const b = saveCustomScript({ rawText: "[]", name: "B" });

    deleteCustomScript(a.id);

    expect(listCustomScripts()).toEqual([b]);
  });

  it("keeps multiple custom scripts distinct", () => {
    saveCustomScript({ rawText: "[]", name: "A" });
    saveCustomScript({ rawText: "[]", name: "B" });
    expect(listCustomScripts()).toHaveLength(2);
    expect(new Set(listCustomScripts().map((s) => s.id)).size).toBe(2);
  });

  describe("subscribeCustomScripts", () => {
    it("ignores storage events for unrelated keys", () => {
      const onChange = vi.fn();
      const unsubscribe = subscribeCustomScripts(onChange);

      window.dispatchEvent(
        new StorageEvent("storage", { key: "some-other-key" }),
      );
      expect(onChange).not.toHaveBeenCalled();

      window.dispatchEvent(
        new StorageEvent("storage", { key: "botc:custom-scripts" }),
      );
      expect(onChange).toHaveBeenCalledTimes(1);

      // key: null means localStorage.clear() — should still notify.
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
      expect(onChange).toHaveBeenCalledTimes(2);

      unsubscribe();
      window.dispatchEvent(
        new StorageEvent("storage", { key: "botc:custom-scripts" }),
      );
      expect(onChange).toHaveBeenCalledTimes(2);
    });
  });
});
