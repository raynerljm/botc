// Storytellers run games from wherever they are, but the games list always
// reports times in Singapore time (issue #55 AC) — Intl's explicit `timeZone`
// does the conversion regardless of the device's own local timezone, so
// nothing here reads `Date`'s local getters or the host's TZ.
const SGT_TIME_ZONE = "Asia/Singapore";

const startTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: SGT_TIME_ZONE,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  // Explicit h23 (not hour12: false) avoids ICU renderings that print
  // midnight as "24:00" instead of "00:00".
  hourCycle: "h23",
});

export function formatStartTimeSGT(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "Unknown start time";
  return `${startTimeFormatter.format(date)} SGT`;
}

// en-CA formats as YYYY-MM-DD directly, so no field reassembly is needed.
const dateStampFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SGT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// The SGT calendar date, for filenames — distinct from formatStartTimeSGT's
// display string. A UTC timestamp in the 16:00-24:00 window is already the
// next day in SGT (+8h), so a raw ISO slice would date it a day behind what
// the games list (and this) shows.
export function formatDateStampSGT(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown-date";
  return dateStampFormatter.format(date);
}

function formatDurationMs(ms: number): string {
  // Floor, not round: a display with no seconds shouldn't claim "1h 0m" for
  // a game that's 59m31s in — that reads as a full hour when it isn't one.
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// `until` defaults to the real clock, giving an ongoing game's elapsed time;
// pass the game's `endedAt` to get its total duration instead — both are the
// same span calculation, just anchored at a different end point.
export function formatDuration(createdAt: string, until: Date = new Date()): string {
  const start = new Date(createdAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(until.getTime())) return "unknown";
  return formatDurationMs(until.getTime() - start);
}
