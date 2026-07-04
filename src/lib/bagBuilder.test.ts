import { describe, expect, it } from "vitest";

import { getCharacter, getEditionCharacters } from "./characters";
import {
  applySetupDeltas,
  officialTargetCounts,
  parseSetupModifier,
  randomizeBagSelection,
} from "./bagBuilder";

describe("official target counts", () => {
  it("looks up the published distribution table by player count", () => {
    expect(officialTargetCounts(5)).toEqual({
      townsfolk: 3,
      outsider: 0,
      minion: 1,
      demon: 1,
    });
    expect(officialTargetCounts(13)).toEqual({
      townsfolk: 9,
      outsider: 0,
      minion: 3,
      demon: 1,
    });
    expect(officialTargetCounts(15)).toEqual({
      townsfolk: 9,
      outsider: 2,
      minion: 3,
      demon: 1,
    });
  });

  it("rejects a player count outside the published 5-15 range", () => {
    expect(() => officialTargetCounts(4)).toThrow();
    expect(() => officialTargetCounts(16)).toThrow();
  });
});

describe("generic setup-modifier parsing", () => {
  it("returns null for characters with no bracketed setup text", () => {
    expect(parseSetupModifier(getCharacter("washerwoman")!.ability)).toBeNull();
  });

  it("parses a single fixed count delta (Baron: +2 Outsiders)", () => {
    expect(parseSetupModifier(getCharacter("baron")!.ability)).toEqual({
      bracketText: "+2 Outsiders",
      options: [{ label: "+2 Outsiders", outsiderDelta: 2, minionDelta: 0 }],
      isFreeform: false,
    });
  });

  it("parses a storyteller-chosen delta (Godfather: -1 or +1 Outsider)", () => {
    expect(parseSetupModifier(getCharacter("godfather")!.ability)).toEqual({
      bracketText: "-1 or +1 Outsider",
      options: [
        { label: "-1 Outsider", outsiderDelta: -1, minionDelta: 0 },
        { label: "+1 Outsider", outsiderDelta: 1, minionDelta: 0 },
      ],
      isFreeform: false,
    });
  });

  it("parses a minion-team delta (Lil' Monsta: +1 Minion)", () => {
    expect(parseSetupModifier(getCharacter("lilmonsta")!.ability)).toEqual({
      bracketText: "+1 Minion",
      options: [{ label: "+1 Minion", outsiderDelta: 0, minionDelta: 1 }],
      isFreeform: false,
    });
  });

  it("parses a requires-character modifier (Huntsman: +the Damsel)", () => {
    expect(parseSetupModifier(getCharacter("huntsman")!.ability)).toEqual({
      bracketText: "+the Damsel",
      options: [],
      requiresCharacterName: "Damsel",
      isFreeform: false,
    });
  });

  it("parses an extra-copies-of-self modifier (Village Idiot: +0 to +2)", () => {
    expect(parseSetupModifier(getCharacter("villageidiot")!.ability)).toEqual({
      bracketText: "+0 to +2 Village Idiots. 1 of the extras is drunk",
      options: [],
      extraCopies: { min: 0, max: 2 },
      isFreeform: false,
    });
  });

  it("falls back to freeform display for brackets with no structured delta (Atheist)", () => {
    expect(parseSetupModifier(getCharacter("atheist")!.ability)).toEqual({
      bracketText: "No evil characters",
      options: [],
      isFreeform: true,
    });
  });

  it("displays a signed-zero delta as '0', not '-0' (Hermit: -0 or -1 Outsider)", () => {
    expect(parseSetupModifier(getCharacter("hermit")!.ability)).toEqual({
      bracketText: "-0 or -1 Outsider",
      options: [
        { label: "0 Outsiders", outsiderDelta: 0, minionDelta: 0 },
        { label: "-1 Outsider", outsiderDelta: -1, minionDelta: 0 },
      ],
      isFreeform: false,
    });
  });
});

describe("applying setup deltas to the base targets", () => {
  it("matches the issue's reference scenario: 13p TB, Baron selected", () => {
    // 13p base is 9 Townsfolk / 0 Outsiders / 3 Minions / 1 Demon; Baron's
    // +2 Outsiders comes at Townsfolk's expense so the total stays 13.
    const baron = parseSetupModifier(getCharacter("baron")!.ability)!;
    expect(applySetupDeltas(13, [baron.options[0]])).toEqual({
      townsfolk: 7,
      outsider: 2,
      minion: 3,
      demon: 1,
    });
  });

  it("applies no adjustment when no deltas are given", () => {
    expect(applySetupDeltas(8, [])).toEqual(officialTargetCounts(8));
  });

  it("never drives a team's target below 0 (Godfather's default -1 Outsider at 5p, whose base is already 0)", () => {
    const godfather = parseSetupModifier(getCharacter("godfather")!.ability)!;
    expect(applySetupDeltas(5, [godfather.options[0]])).toEqual({
      townsfolk: 3,
      outsider: 0,
      minion: 1,
      demon: 1,
    });
  });

  it("never drives Townsfolk below 0 when stacked deltas push Outsiders+Minions past the player count", () => {
    // 5p base is 3 Townsfolk / 0 Outsiders / 1 Minion / 1 Demon. Three
    // stacked +2-Outsider deltas would otherwise compute Townsfolk as
    // 5 - 6 - 1 - 1 = -3.
    const baron = parseSetupModifier(getCharacter("baron")!.ability)!;
    const bigDelta = baron.options[0];
    expect(applySetupDeltas(5, [bigDelta, bigDelta, bigDelta])).toEqual({
      townsfolk: 0,
      outsider: 6,
      minion: 1,
      demon: 1,
    });
  });
});

describe("randomizing the remaining bag slots", () => {
  const tb = getEditionCharacters("tb");

  it("tops up each team to its target, leaving already-selected characters in place", () => {
    const alreadySelected = new Set(["washerwoman"]);
    const targets = officialTargetCounts(7); // 5 Townsfolk / 0 Outsider / 1 Minion / 1 Demon
    const result = randomizeBagSelection(tb, targets, alreadySelected);

    expect(result.has("washerwoman")).toBe(true);
    const byTeam = {
      townsfolk: tb.filter((c) => c.team === "townsfolk" && result.has(c.id))
        .length,
      outsider: tb.filter((c) => c.team === "outsider" && result.has(c.id))
        .length,
      minion: tb.filter((c) => c.team === "minion" && result.has(c.id)).length,
      demon: tb.filter((c) => c.team === "demon" && result.has(c.id)).length,
    };
    expect(byTeam).toEqual({ townsfolk: 5, outsider: 0, minion: 1, demon: 1 });
  });

  it("never selects more of a team than its pool contains", () => {
    const targets = { townsfolk: 0, outsider: 99, minion: 0, demon: 0 };
    const result = randomizeBagSelection(tb, targets, new Set());
    const outsidersSelected = tb.filter(
      (c) => c.team === "outsider" && result.has(c.id),
    ).length;
    expect(outsidersSelected).toBe(
      tb.filter((c) => c.team === "outsider").length,
    );
  });

  it("leaves targets already met by the current selection untouched", () => {
    const alreadySelected = new Set(["imp"]);
    const targets = officialTargetCounts(5);
    const result = randomizeBagSelection(tb, targets, alreadySelected);
    expect(
      tb.filter((c) => c.team === "demon" && result.has(c.id)),
    ).toEqual([getCharacter("imp")]);
  });
});
