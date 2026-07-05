import { afterEach, describe, expect, it } from "vitest";

import {
  formatElapsed,
  formatGameDuration,
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
});

describe("formatElapsed", () => {
  it("shows minutes only under an hour", () => {
    const start = "2026-07-04T00:00:00.000Z";
    const now = new Date("2026-07-04T00:45:00.000Z");
    expect(formatElapsed(start, now)).toBe("45m");
  });

  it("shows hours and minutes once an hour has passed", () => {
    const start = "2026-07-04T00:00:00.000Z";
    const now = new Date("2026-07-04T02:15:00.000Z");
    expect(formatElapsed(start, now)).toBe("2h 15m");
  });

  it("shows days and hours for very long games", () => {
    const start = "2026-07-04T00:00:00.000Z";
    const now = new Date("2026-07-05T03:00:00.000Z");
    expect(formatElapsed(start, now)).toBe("1d 3h");
  });
});

describe("formatGameDuration", () => {
  it("reports the total span from start to end", () => {
    expect(
      formatGameDuration(
        "2026-07-04T00:00:00.000Z",
        "2026-07-04T02:00:00.000Z",
      ),
    ).toBe("2h 0m");
  });
});
