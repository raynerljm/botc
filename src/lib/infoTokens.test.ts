import { describe, expect, it } from "vitest";

import { STANDARD_INFO_TOKENS, visibleInfoTokens } from "./infoTokens";

describe("standard info token library", () => {
  it("includes the standard storyteller show cards named in issue #19", () => {
    const texts = STANDARD_INFO_TOKENS.map((t) => t.text);
    expect(texts).toEqual(
      expect.arrayContaining([
        "These are your minions",
        "This is the Demon",
        "You are",
        "The Damsel is in play",
        "Did you nominate today?",
      ]),
    );
  });

  it("includes the basic always-available cards named in issue #161", () => {
    const texts = STANDARD_INFO_TOKENS.map((t) => t.text);
    expect(texts).toEqual(
      expect.arrayContaining(["Make your choice", "Use your ability?"]),
    );
  });

  it("gives every entry a unique, stable id", () => {
    const ids = STANDARD_INFO_TOKENS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("visibleInfoTokens", () => {
  it("includes every basic card regardless of script", () => {
    const texts = visibleInfoTokens(new Set()).map((t) => t.text);
    expect(texts).toEqual(
      expect.arrayContaining([
        "These are your minions",
        "This is the Demon",
        "You are",
        "Did you nominate today?",
        "Make your choice",
        "Use your ability?",
      ]),
    );
  });

  it("hides a character-gated card when its character isn't in the script", () => {
    const texts = visibleInfoTokens(new Set()).map((t) => t.text);
    expect(texts).not.toContain("The Damsel is in play");
    expect(texts).not.toContain("This player attacked");
  });

  it("shows the Damsel card only when the Damsel is in the script", () => {
    const texts = visibleInfoTokens(new Set(["damsel"])).map((t) => t.text);
    expect(texts).toContain("The Damsel is in play");
    expect(texts).not.toContain("This player attacked");
  });

  it("shows the Lunatic attack marker only when the Lunatic is in the script", () => {
    const texts = visibleInfoTokens(new Set(["lunatic"])).map((t) => t.text);
    expect(texts).toContain("This player attacked");
    expect(texts).not.toContain("The Damsel is in play");
  });
});
