import { describe, expect, it } from "vitest";

import { createDayTimer } from "./gameDocument";
import {
  DAY_TIMER_PRESETS_MINUTES,
  dayTimerRemainingMs,
  formatDayTimerMs,
  isDayTimerExpired,
  pauseDayTimer,
  resetDayTimer,
  resumeDayTimer,
  startDayTimer,
} from "./dayTimer";

const T0 = new Date("2026-07-10T12:00:00.000Z").getTime();

describe("DAY_TIMER_PRESETS_MINUTES", () => {
  it("offers 2, 3, and 6 minute presets (issue #190 AC)", () => {
    expect(DAY_TIMER_PRESETS_MINUTES).toEqual([2, 3, 6]);
  });
});

describe("startDayTimer", () => {
  it("starts running with the full duration remaining", () => {
    const timer = startDayTimer(2 * 60_000, T0);
    expect(timer.status).toBe("running");
    expect(dayTimerRemainingMs(timer, T0)).toBe(2 * 60_000);
  });

  it("counts down as wall-clock time passes", () => {
    const timer = startDayTimer(2 * 60_000, T0);
    expect(dayTimerRemainingMs(timer, T0 + 30_000)).toBe(90_000);
  });

  it("clamps remaining time at zero once the duration has fully elapsed", () => {
    const timer = startDayTimer(2 * 60_000, T0);
    expect(dayTimerRemainingMs(timer, T0 + 10 * 60_000)).toBe(0);
  });
});

describe("dayTimerRemainingMs: reload mid-count (issue #190 AC)", () => {
  it("re-derives the same remaining time from the stored end time, regardless of how long ago it started", () => {
    // Simulates a reload: a fresh call with only the persisted timer and the
    // current wall-clock time, no in-memory countdown state carried over.
    const timer = startDayTimer(3 * 60_000, T0);
    const reloadedAt = T0 + 45_000;
    expect(dayTimerRemainingMs(timer, reloadedAt)).toBe(3 * 60_000 - 45_000);
  });
});

describe("pauseDayTimer", () => {
  it("freezes the remaining time and stops deriving from wall-clock time", () => {
    const running = startDayTimer(2 * 60_000, T0);
    const paused = pauseDayTimer(running, T0 + 20_000);
    expect(paused.status).toBe("paused");
    expect(dayTimerRemainingMs(paused, T0 + 20_000)).toBe(100_000);
    // Time passing further while paused doesn't change the frozen value.
    expect(dayTimerRemainingMs(paused, T0 + 60 * 60_000)).toBe(100_000);
  });

  it("is a no-op on a timer that isn't running", () => {
    const idle = createDayTimer();
    expect(pauseDayTimer(idle, T0)).toEqual(idle);
  });
});

describe("resumeDayTimer", () => {
  it("resumes counting down from the frozen remaining time", () => {
    const running = startDayTimer(2 * 60_000, T0);
    const paused = pauseDayTimer(running, T0 + 20_000);
    const resumedAt = T0 + 5 * 60_000;
    const resumed = resumeDayTimer(paused, resumedAt);
    expect(resumed.status).toBe("running");
    expect(dayTimerRemainingMs(resumed, resumedAt)).toBe(100_000);
    expect(dayTimerRemainingMs(resumed, resumedAt + 10_000)).toBe(90_000);
  });

  it("is a no-op on a timer that isn't paused", () => {
    const idle = createDayTimer();
    expect(resumeDayTimer(idle, T0)).toEqual(idle);
  });
});

describe("resetDayTimer", () => {
  it("clears back to idle with no remaining time", () => {
    const running = startDayTimer(2 * 60_000, T0);
    expect(resetDayTimer()).toEqual(createDayTimer());
    expect(dayTimerRemainingMs(resetDayTimer(), T0)).toBe(0);
    expect(running.status).toBe("running");
  });
});

describe("isDayTimerExpired", () => {
  it("is false before the duration has elapsed", () => {
    const timer = startDayTimer(2 * 60_000, T0);
    expect(isDayTimerExpired(timer, T0 + 60_000)).toBe(false);
  });

  it("is true once a running timer's duration has fully elapsed", () => {
    const timer = startDayTimer(2 * 60_000, T0);
    expect(isDayTimerExpired(timer, T0 + 2 * 60_000)).toBe(true);
    expect(isDayTimerExpired(timer, T0 + 10 * 60_000)).toBe(true);
  });

  it("is false for an idle timer", () => {
    expect(isDayTimerExpired(createDayTimer(), T0)).toBe(false);
  });

  it("is true for a paused timer frozen at zero", () => {
    const running = startDayTimer(2 * 60_000, T0);
    const paused = pauseDayTimer(running, T0 + 2 * 60_000);
    expect(isDayTimerExpired(paused, T0 + 2 * 60_000)).toBe(true);
  });
});

describe("formatDayTimerMs", () => {
  it("formats whole minutes as m:ss", () => {
    expect(formatDayTimerMs(2 * 60_000)).toBe("2:00");
    expect(formatDayTimerMs(6 * 60_000)).toBe("6:00");
  });

  it("pads single-digit seconds", () => {
    expect(formatDayTimerMs(65_000)).toBe("1:05");
  });

  it("rounds up to the nearest whole second, so a countdown never flashes 0:00 while time genuinely remains", () => {
    expect(formatDayTimerMs(59_600)).toBe("1:00");
  });

  it("formats zero as 0:00", () => {
    expect(formatDayTimerMs(0)).toBe("0:00");
  });
});
