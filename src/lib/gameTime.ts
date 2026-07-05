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
  hour12: false,
});

export function formatStartTimeSGT(createdAt: string): string {
  return `${startTimeFormatter.format(new Date(createdAt))} SGT`;
}

function formatDurationMs(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// `now` defaults to the real clock; tests pin it via the parameter instead of
// faking global time.
export function formatElapsed(createdAt: string, now: Date = new Date()): string {
  return formatDurationMs(now.getTime() - new Date(createdAt).getTime());
}

export function formatGameDuration(createdAt: string, endedAt: string): string {
  return formatDurationMs(new Date(endedAt).getTime() - new Date(createdAt).getTime());
}
