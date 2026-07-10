"use client";

import { useEffect, useState } from "react";

import {
  DAY_TIMER_PRESETS_MINUTES,
  dayTimerRemainingMs,
  formatDayTimerMs,
  isDayTimerExpired,
  pauseDayTimer,
  resetDayTimer,
  resumeDayTimer,
  startDayTimer,
} from "@/lib/dayTimer";
import type { GameDocument } from "@/lib/gameDocument";

import styles from "./DayTimer.module.css";

export interface DayTimerProps {
  game: GameDocument;
  onChange: (next: GameDocument) => void;
}

export function DayTimer({ game, onChange }: DayTimerProps) {
  const timer = game.dayTimer;
  // The timer's own state is an absolute end time, never a ticking counter
  // (lib/dayTimer.ts) — this just forces a redraw once a second so the
  // displayed countdown visibly moves while running.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (timer.status !== "running") return;
    const id = setInterval(() => forceTick((tick) => tick + 1), 1000);
    return () => clearInterval(id);
  }, [timer.status]);

  const remainingMs = dayTimerRemainingMs(timer);
  const expired = isDayTimerExpired(timer);

  function start(minutes: number) {
    onChange({ ...game, dayTimer: startDayTimer(minutes * 60_000) });
  }

  function togglePause() {
    onChange({
      ...game,
      dayTimer: timer.status === "running" ? pauseDayTimer(timer) : resumeDayTimer(timer),
    });
  }

  function reset() {
    onChange({ ...game, dayTimer: resetDayTimer() });
  }

  return (
    <div className={styles.widget} aria-label="Discussion timer">
      <div className={styles.presets}>
        {DAY_TIMER_PRESETS_MINUTES.map((minutes) => (
          <button
            key={minutes}
            type="button"
            className={styles.preset}
            onClick={() => start(minutes)}
          >
            {minutes} min
          </button>
        ))}
      </div>

      {timer.status !== "idle" && (
        <div className={styles.running} data-expired={expired || undefined}>
          <span className={styles.remaining} role="timer" aria-live="polite">
            {expired ? "Time's up" : formatDayTimerMs(remainingMs)}
          </span>
          <div className={styles.controls}>
            <button type="button" className={styles.control} onClick={togglePause}>
              {timer.status === "running" ? "Pause" : "Resume"}
            </button>
            <button type="button" className={styles.control} onClick={reset}>
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
