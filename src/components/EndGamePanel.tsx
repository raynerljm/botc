"use client";

import {
  alignmentLabel,
  isGameEnded,
  type Alignment,
  type GameDocument,
} from "@/lib/gameDocument";
import { downloadGameSnapshot } from "@/lib/gameExport";

import styles from "./EndGamePanel.module.css";

export interface EndGamePanelProps {
  game: GameDocument;
  onChange: (next: GameDocument) => void;
  // Injectable clock so tests can assert a stable end timestamp.
  now?: () => string;
}

export function EndGamePanel({
  game,
  onChange,
  now = () => new Date().toISOString(),
}: EndGamePanelProps) {
  const ended = isGameEnded(game);

  function declareWinner(winner: Alignment) {
    onChange({ ...game, winner, endedAt: now() });
  }

  function reopen() {
    onChange({ ...game, winner: null, endedAt: null });
  }

  return (
    <section className={styles.panel} aria-label="Game">
      <h2 className={styles.heading}>Game</h2>

      {ended && (
        <p className={styles.result} role="status">
          {alignmentLabel(game.winner!)} won
        </p>
      )}

      <label className={styles.notes}>
        Notes
        <textarea
          value={game.notes}
          placeholder="Anything worth remembering about this game…"
          onChange={(event) => onChange({ ...game, notes: event.target.value })}
        />
      </label>

      <div className={styles.actions}>
        {ended ? (
          <button type="button" onClick={reopen}>
            Reopen game
          </button>
        ) : (
          <div className={styles.declare}>
            <span className={styles.declareLabel}>Declare winner</span>
            <button
              type="button"
              className={styles.good}
              onClick={() => declareWinner("good")}
            >
              Good wins
            </button>
            <button
              type="button"
              className={styles.evil}
              onClick={() => declareWinner("evil")}
            >
              Evil wins
            </button>
          </div>
        )}
        <button
          type="button"
          className={styles.export}
          onClick={() => downloadGameSnapshot(game)}
        >
          Export game
        </button>
      </div>
    </section>
  );
}
