"use client";

import { useEffect, useState } from "react";

import {
  DAY_TIMER_PRESETS_MINUTES,
  dayTimerRemainingMs,
  formatDayTimerMs,
  pauseDayTimer,
  resetDayTimer,
  resumeDayTimer,
  startDayTimer,
} from "@/lib/dayTimer";
import type { GameDocument } from "@/lib/gameDocument";

import { Button } from "./Button";
import styles from "./DayTimer.module.css";

export interface DayTimerProps {
  game: GameDocument;
  onChange: (next: GameDocument) => void;
}

export function DayTimer({ game, onChange }: DayTimerProps) {
  const timer = game.dayTimer;
  const remainingMs = dayTimerRemainingMs(timer);
  const expired = timer.status !== "idle" && remainingMs <= 0;

  // The timer's own state is an absolute end time, never a ticking counter
  // (lib/dayTimer.ts) — this just forces a redraw once a second so the
  // displayed countdown visibly moves while running. Stops once expired —
  // there's nothing left to count down, so ticking further would only ever
  // re-render the same frozen "Time's up" state.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (timer.status !== "running" || expired) return;
    const id = setInterval(() => forceTick((tick) => tick + 1), 1000);
    return () => clearInterval(id);
  }, [timer.status, expired]);

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
    <div className={styles.widget} role="group" aria-label="Discussion timer">
      <div className={styles.presets}>
        {DAY_TIMER_PRESETS_MINUTES.map((minutes) => (
          <Button key={minutes} onClick={() => start(minutes)}>
            {minutes} min
          </Button>
        ))}
      </div>

      {timer.status !== "idle" && (
        <div className={styles.running} data-expired={expired || undefined}>
          {/* role="timer" is implicitly aria-live="off" per the ARIA spec —
              deliberately not overridden to "polite", which would otherwise
              have a screen reader re-announce the remaining time every
              second for as long as the countdown runs. */}
          <span className={styles.remaining} role="timer">
            {expired ? "Time's up" : formatDayTimerMs(remainingMs)}
          </span>
          <div className={styles.controls}>
            <Button variant="ghost" onClick={togglePause}>
              {timer.status === "running" ? "Pause" : "Resume"}
            </Button>
            <Button variant="ghost" onClick={reset}>
              Reset
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
