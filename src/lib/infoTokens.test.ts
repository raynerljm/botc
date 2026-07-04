import { describe, expect, it } from "vitest";

import { STANDARD_INFO_TOKENS } from "./infoTokens";

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

  it("gives every entry a unique, stable id", () => {
    const ids = STANDARD_INFO_TOKENS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
