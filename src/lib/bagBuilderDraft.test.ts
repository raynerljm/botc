import { afterEach, describe, expect, it } from "vitest";

import {
  clearBagBuilderDraft,
  loadBagBuilderDraft,
  saveBagBuilderDraft,
} from "./bagBuilderDraft";

afterEach(() => {
  localStorage.clear();
});

function draft(overrides: Partial<Parameters<typeof saveBagBuilderDraft>[1]> = {}) {
  return {
    playerCount: 9 as number | "",
    travellerCount: 1 as number | "",
    selectedIds: ["imp", "baron"],
    autoAddedIds: [] as string[],
    modifierChoices: { baron: 0 },
    extraCopies: { villageidiot: 1 },
    standInId: "chef",
    lunaticStandInId: "imp",
    ...overrides,
  };
}

describe("bag-builder draft persistence", () => {
  it("returns null when nothing has been saved for this script", () => {
    expect(loadBagBuilderDraft("tb")).toBeNull();
  });

  it("round-trips every field saved for a script", () => {
    saveBagBuilderDraft("tb", draft());

    expect(loadBagBuilderDraft("tb")).toEqual(draft());
  });

  it("keeps drafts for different scripts independent", () => {
    saveBagBuilderDraft("tb", draft({ playerCount: 7 }));
    saveBagBuilderDraft("bmr", draft({ playerCount: 12 }));

    expect(loadBagBuilderDraft("tb")?.playerCount).toBe(7);
    expect(loadBagBuilderDraft("bmr")?.playerCount).toBe(12);
  });

  it("overwrites a script's previous draft on a later save, not merges it", () => {
    saveBagBuilderDraft("tb", draft({ selectedIds: ["imp"] }));
    saveBagBuilderDraft("tb", draft({ selectedIds: ["baron"] }));

    expect(loadBagBuilderDraft("tb")?.selectedIds).toEqual(["baron"]);
  });

  it("clears a script's draft without touching another script's", () => {
    saveBagBuilderDraft("tb", draft());
    saveBagBuilderDraft("bmr", draft());

    clearBagBuilderDraft("tb");

    expect(loadBagBuilderDraft("tb")).toBeNull();
    expect(loadBagBuilderDraft("bmr")).not.toBeNull();
  });

  it("preserves a blank player/traveller count (mid-edit) rather than coercing it to a number", () => {
    saveBagBuilderDraft("tb", draft({ playerCount: "", travellerCount: "" }));

    const loaded = loadBagBuilderDraft("tb");
    expect(loaded?.playerCount).toBe("");
    expect(loaded?.travellerCount).toBe("");
  });

  it("ignores malformed JSON left behind in storage instead of throwing", () => {
    localStorage.setItem("botc:bagBuilderDraft:tb", "{not json");

    expect(loadBagBuilderDraft("tb")).toBeNull();
  });

  it("round-trips auto-add provenance", () => {
    saveBagBuilderDraft("tb", draft({ autoAddedIds: ["damsel"] }));

    expect(loadBagBuilderDraft("tb")?.autoAddedIds).toEqual(["damsel"]);
  });

  it("restores a pre-#129 draft with no autoAddedIds field as having none known, instead of dropping it", () => {
    const legacyDraft: Record<string, unknown> = { ...draft() };
    delete legacyDraft.autoAddedIds;
    localStorage.setItem("botc:bagBuilderDraft:tb", JSON.stringify(legacyDraft));

    const loaded = loadBagBuilderDraft("tb");
    expect(loaded?.autoAddedIds).toEqual([]);
    expect(loaded?.selectedIds).toEqual(["imp", "baron"]);
  });

  it("restores a pre-#163 draft with no lunaticStandInId field as none chosen, instead of dropping it", () => {
    const legacyDraft: Record<string, unknown> = { ...draft() };
    delete legacyDraft.lunaticStandInId;
    localStorage.setItem("botc:bagBuilderDraft:tb", JSON.stringify(legacyDraft));

    const loaded = loadBagBuilderDraft("tb");
    expect(loaded?.lunaticStandInId).toBeNull();
    expect(loaded?.selectedIds).toEqual(["imp", "baron"]);
  });

  it("round-trips the Lunatic's stand-in choice", () => {
    saveBagBuilderDraft("tb", draft({ lunaticStandInId: "zombuul" }));

    expect(loadBagBuilderDraft("tb")?.lunaticStandInId).toBe("zombuul");
  });
});
