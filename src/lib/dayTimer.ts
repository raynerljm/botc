import { createDayTimer, type DayTimer } from "./gameDocument";

// The quick-action presets the day phase offers (issue #190 AC: "2, 3, and
// 6 minutes").
export const DAY_TIMER_PRESETS_MINUTES = [2, 3, 6];

export function startDayTimer(durationMs: number, now: number = Date.now()): DayTimer {
  return {
    status: "running",
    endAt: new Date(now + durationMs).toISOString(),
    remainingMs: durationMs,
  };
}

export function pauseDayTimer(timer: DayTimer, now: number = Date.now()): DayTimer {
  if (timer.status !== "running") return timer;
  return { status: "paused", endAt: null, remainingMs: dayTimerRemainingMs(timer, now) };
}

export function resumeDayTimer(timer: DayTimer, now: number = Date.now()): DayTimer {
  if (timer.status !== "paused") return timer;
  return {
    status: "running",
    endAt: new Date(now + timer.remainingMs).toISOString(),
    remainingMs: timer.remainingMs,
  };
}

export function resetDayTimer(): DayTimer {
  return createDayTimer();
}

// The single source of truth for "how much time is left" — derived from the
// stored end time while running rather than any ticking counter, so a
// reload or device sleep mid-count re-derives the true remaining time from
// wall-clock time instead of resuming a value that drifted while nothing was
// updating it (issue #190 AC).
export function dayTimerRemainingMs(timer: DayTimer, now: number = Date.now()): number {
  if (timer.status === "running" && timer.endAt) {
    return Math.max(0, new Date(timer.endAt).getTime() - now);
  }
  return timer.remainingMs;
}

export function isDayTimerExpired(timer: DayTimer, now: number = Date.now()): boolean {
  return timer.status !== "idle" && dayTimerRemainingMs(timer, now) <= 0;
}

// Rounds up to the next whole second so a countdown never flashes "0:00"
// while genuine time remains (e.g. 59.6s left reads as "1:00", not "0:59").
export function formatDayTimerMs(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
