import { describe, expect, it } from "vitest";

import type { Character } from "./characters";
import { resolveCharacterId } from "./scriptParser";
import {
  buildShareUrl,
  decodeScriptForShare,
  encodeScriptForShare,
  exceedsQrCapacity,
  isTooLargeForReliableQr,
} from "./scriptShare";

describe("encodeScriptForShare / decodeScriptForShare", () => {
  it("round-trips an official-only script's meta and characters", () => {
    const washerwoman = resolveCharacterId("washerwoman")!;
    const imp = resolveCharacterId("imp")!;
    const encoded = encodeScriptForShare(
      { name: "My Script", author: "Me" },
      [washerwoman, imp],
    );

    const result = decodeScriptForShare(encoded);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.script.meta).toMatchObject({
      name: "My Script",
      author: "Me",
    });
    expect(result.script.characters.map((c) => c.id).sort()).toEqual(
      ["imp", "washerwoman"].sort(),
    );
    // Bare official characters round-trip to the exact vendored reference,
    // not a homebrew copy.
    expect(result.script.characters.find((c) => c.id === "washerwoman")).toBe(
      washerwoman,
    );
  });

  it("round-trips a full homebrew character object", () => {
    const custom: Character = {
      id: "custom-seer",
      name: "Custom Seer",
      edition: null,
      team: "townsfolk",
      ability: "Each night, learn a number of evil players.",
      firstNight: 0,
      firstNightReminder: "",
      otherNight: 45,
      otherNightReminder: "Show the count of evil players.",
      reminders: ["Used"],
      remindersGlobal: [],
      setup: false,
      jinxes: [],
      image: null,
    };
    const encoded = encodeScriptForShare({}, [custom]);

    const result = decodeScriptForShare(encoded);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.script.characters).toEqual([custom]);
  });

  it("still round-trips as a bare id when the official character crossed a serialization boundary (e.g. a Server Component prop) and is no longer the same object reference", () => {
    const washerwoman = resolveCharacterId("washerwoman")!;
    // Simulates what a React Server Component -> Client Component prop
    // does: identical data, but a structurally-cloned object, not the same
    // reference as the vendored dataset entry.
    const cloned: Character = JSON.parse(JSON.stringify(washerwoman));
    expect(cloned).not.toBe(washerwoman);

    const encoded = encodeScriptForShare({}, [cloned]);
    expect(encoded.length).toBeLessThan(30);

    const result = decodeScriptForShare(encoded);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.script.characters[0]).toBe(washerwoman);
  });

  it("reskins an official id with its own name as homebrew, not a bare reference", () => {
    const reskinned: Character = {
      id: "imp",
      name: "The Devil",
      edition: null,
      team: "demon",
      ability: "Custom ability text.",
      firstNight: 0,
      firstNightReminder: "",
      otherNight: 20,
      otherNightReminder: "",
      reminders: [],
      remindersGlobal: [],
      setup: false,
      jinxes: [],
      image: null,
    };
    const encoded = encodeScriptForShare({}, [reskinned]);

    const result = decodeScriptForShare(encoded);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.script.characters).toEqual([reskinned]);
  });

  it("round-trips _meta firstNight/otherNight order overrides", () => {
    const encoded = encodeScriptForShare(
      { firstNight: ["washerwoman", "imp"], otherNight: ["imp"] },
      [resolveCharacterId("washerwoman")!, resolveCharacterId("imp")!],
    );

    const result = decodeScriptForShare(encoded);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.script.meta.firstNight).toEqual(["washerwoman", "imp"]);
    expect(result.script.meta.otherNight).toEqual(["imp"]);
  });

  it("round-trips the teensyville flag", () => {
    const encoded = encodeScriptForShare(
      { name: "Small Script", teensyville: true },
      [resolveCharacterId("imp")!],
    );

    const result = decodeScriptForShare(encoded);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.script.meta.teensyville).toBe(true);
  });

  it("omits the _meta entry entirely when meta is empty", () => {
    const encoded = encodeScriptForShare({}, [resolveCharacterId("imp")!]);

    const result = decodeScriptForShare(encoded);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.script.meta).toEqual({});
  });

  it("fails to decode a string that isn't validly encoded", () => {
    const result = decodeScriptForShare("not-a-valid-encoded-script!!");
    expect(result.ok).toBe(false);
  });
});

describe("isTooLargeForReliableQr", () => {
  it("is false for a small script's full share URL", () => {
    const encoded = encodeScriptForShare({ name: "Small" }, [
      resolveCharacterId("imp")!,
    ]);
    const url = buildShareUrl("https://example.com", "", encoded);
    expect(isTooLargeForReliableQr(url)).toBe(false);
  });

  it("is true once the encoded string exceeds the reliable-scan threshold", () => {
    expect(isTooLargeForReliableQr("a".repeat(1501))).toBe(true);
    expect(isTooLargeForReliableQr("a".repeat(1500))).toBe(false);
  });
});

describe("exceedsQrCapacity", () => {
  it("is false comfortably under the QR encoder's hard capacity", () => {
    expect(exceedsQrCapacity("a".repeat(2900))).toBe(false);
  });

  it("is true once the value exceeds the QR encoder's hard capacity, before it would ever throw", () => {
    expect(exceedsQrCapacity("a".repeat(2901))).toBe(true);
  });
});

describe("buildShareUrl", () => {
  it("puts the encoded script in the URL fragment of the /share route, with the trailing slash the static export's trailingSlash config requires", () => {
    expect(buildShareUrl("https://example.com", "", "abc123")).toBe(
      "https://example.com/share/#abc123",
    );
  });

  it("includes a configured basePath before the route", () => {
    expect(buildShareUrl("https://example.com", "/botc", "abc123")).toBe(
      "https://example.com/botc/share/#abc123",
    );
  });
});
