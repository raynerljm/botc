import { afterEach, describe, expect, it } from "vitest";

import {
  formatDateStampSGT,
  formatDuration,
  formatStartTimeSGT,
} from "./gameTime";

const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe("formatStartTimeSGT", () => {
  it("shows the date and time of day, not just the date", () => {
    // 2026-07-04T00:00:00Z is 2026-07-04T08:00:00+08:00 in SGT.
    expect(formatStartTimeSGT("2026-07-04T00:00:00.000Z")).toBe(
      "4 Jul, 08:00 SGT",
    );
  });

  it("converts to SGT the same way regardless of the host's local timezone", () => {
    process.env.TZ = "America/New_York";
    expect(formatStartTimeSGT("2026-07-04T00:00:00.000Z")).toBe(
      "4 Jul, 08:00 SGT",
    );
  });

  it("shows midnight as 00:00, not 24:00", () => {
    // 2026-07-03T16:00:00Z is exactly midnight SGT (+8h).
    expect(formatStartTimeSGT("2026-07-03T16:00:00.000Z")).toBe(
      "4 Jul, 00:00 SGT",
    );
  });

  it("falls back to a plain label instead of throwing on an unparseable date", () => {
    expect(formatStartTimeSGT("not-a-date")).toBe("Unknown start time");
  });
});

describe("formatDateStampSGT", () => {
  it("dates a timestamp by its SGT calendar day, not UTC's", () => {
    // 2026-07-04T20:00:00Z is 2026-07-05T04:00:00+08:00 in SGT — a day later.
    expect(formatDateStampSGT("2026-07-04T20:00:00.000Z")).toBe(
      "2026-07-05",
    );
  });

  it("agrees with UTC outside the 16:00-24:00Z window", () => {
    expect(formatDateStampSGT("2026-07-04T00:00:00.000Z")).toBe(
      "2026-07-04",
    );
  });

  it("converts to SGT the same way regardless of the host's local timezone", () => {
    process.env.TZ = "America/New_York";
    expect(formatDateStampSGT("2026-07-04T20:00:00.000Z")).toBe(
      "2026-07-05",
    );
  });

  it("falls back to a placeholder instead of throwing on an unparseable date", () => {
    expect(formatDateStampSGT("not-a-date")).toBe("unknown-date");
  });
});

describe("formatDuration", () => {
  it("shows minutes only under an hour", () => {
    const start = "2026-07-04T00:00:00.000Z";
    const now = new Date("2026-07-04T00:45:00.000Z");
    expect(formatDuration(start, now)).toBe("45m");
  });

  it("shows hours and minutes once an hour has passed", () => {
    const start = "2026-07-04T00:00:00.000Z";
    const now = new Date("2026-07-04T02:15:00.000Z");
    expect(formatDuration(start, now)).toBe("2h 15m");
  });

  it("shows days and hours for very long games", () => {
    const start = "2026-07-04T00:00:00.000Z";
    const now = new Date("2026-07-05T03:00:00.000Z");
    expect(formatDuration(start, now)).toBe("1d 3h");
  });

  it("floors instead of rounding up to the next tier", () => {
    const start = "2026-07-04T00:00:00.000Z";
    // 59m31s should still read "59m", not round up to a full hour.
    const now = new Date("2026-07-04T00:59:31.000Z");
    expect(formatDuration(start, now)).toBe("59m");
  });

  it("reports the total span from start to a given end time", () => {
    expect(
      formatDuration(
        "2026-07-04T00:00:00.000Z",
        new Date("2026-07-04T02:00:00.000Z"),
      ),
    ).toBe("2h 0m");
  });

  it("falls back instead of showing NaNm on an unparseable createdAt", () => {
    expect(
      formatDuration("not-a-date", new Date("2026-07-04T02:00:00.000Z")),
    ).toBe("unknown");
  });

  it("falls back instead of showing NaNm on an unparseable until", () => {
    expect(
      formatDuration("2026-07-04T00:00:00.000Z", new Date("not-a-date")),
    ).toBe("unknown");
  });
});
