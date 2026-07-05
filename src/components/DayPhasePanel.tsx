"use client";

import { useState, type FormEvent } from "react";

import {
  computeBlock,
  hasBeenNominatedToday,
  hasNominatedToday,
  nominationTally,
  nominationThreshold,
} from "@/lib/dayPhase";
import type { GameDocument } from "@/lib/gameDocument";

import styles from "./DayPhasePanel.module.css";

export interface DayPhasePanelProps {
  game: GameDocument;
  onRecordNomination: (nominatorId: string, nomineeId: string) => void;
  onToggleVote: (nominationId: string, playerId: string) => void;
}

// The day following night N (CONTEXT.md: Nomination — day phase begins once
// a night ends). There's no separate "start day" step: a night ending *is*
// dawn, so the day is simply whatever night just finished, open until the
// next night starts.
export function DayPhasePanel({ game, onRecordNomination, onToggleVote }: DayPhasePanelProps) {
  const [nominatorId, setNominatorId] = useState("");
  const [nomineeId, setNomineeId] = useState("");

  const isDayOpen = !game.nightOpen && game.night > 0;
  if (!isDayOpen) return null;

  const sorted = [...game.players].sort((a, b) => a.seat - b.seat);
  const block = computeBlock(game.nominations, game.players);

  function submitNomination(event: FormEvent) {
    event.preventDefault();
    if (!nominatorId || !nomineeId) return;
    onRecordNomination(nominatorId, nomineeId);
    setNominatorId("");
    setNomineeId("");
  }

  return (
    <section className={styles.panel} aria-label="Day phase">
      <h2 className={styles.heading}>Day {game.night}</h2>

      <form className={styles.nominateForm} onSubmit={submitNomination}>
        <label htmlFor="day-phase-nominator">
          Nominator
          <select
            id="day-phase-nominator"
            value={nominatorId}
            onChange={(event) => setNominatorId(event.target.value)}
          >
            <option value="">Choose player</option>
            {sorted.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
                {hasNominatedToday(game.nominations, player.id) ? " (nominated)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="day-phase-nominee">
          Nominee
          <select
            id="day-phase-nominee"
            value={nomineeId}
            onChange={(event) => setNomineeId(event.target.value)}
          >
            <option value="">Choose player</option>
            {sorted.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
                {hasBeenNominatedToday(game.nominations, player.id) ? " (nominated)" : ""}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Record nomination</button>
      </form>

      <ol className={styles.nominations}>
        {game.nominations.map((nomination) => {
          const nominator = game.players.find((p) => p.id === nomination.nominatorId);
          const nominee = game.players.find((p) => p.id === nomination.nomineeId);
          const threshold = nominationThreshold(game.players, nominee);
          const tally = nominationTally(nomination);
          const meets = tally >= threshold;
          const onBlock = block.nominationId === nomination.id;
          const isExile = nominee?.isTraveller ?? false;

          return (
            <li
              key={nomination.id}
              className={styles.nomination}
              data-on-block={onBlock || undefined}
            >
              <p className={styles.nominationHeading}>
                {nominator?.name ?? "?"} → {nominee?.name ?? "?"}
                {isExile && <span className={styles.exileBadge}> (exile)</span>}
                {onBlock && <span className={styles.blockBadge}> On the block</span>}
              </p>
              <p className={styles.tally} data-meets-threshold={meets || undefined}>
                {tally} / {threshold}
              </p>
              <ul className={styles.voters}>
                {sorted.map((player) => (
                  <li key={player.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={nomination.voterIds.includes(player.id)}
                        onChange={() => onToggleVote(nomination.id, player.id)}
                      />
                      {player.name}
                      {player.dead && !isExile && (
                        <span className={styles.note}> (ghost vote)</span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
