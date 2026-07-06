"use client";

import { useState } from "react";

import {
  alignmentLabel,
  isEndGamePanelCollapsed,
  isGameEnded,
  type Alignment,
  type GameDocument,
} from "@/lib/gameDocument";
import { downloadGameSnapshot } from "@/lib/gameExport";

import { CollapsibleSection } from "./CollapsibleSection";
import { ConfirmDialog } from "./ConfirmDialog";
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
  const collapsed = isEndGamePanelCollapsed(game);
  // A fat-finger during setup shouldn't declare a winner with no friction
  // (issue #79) — the tap only stages a choice; confirming it is what
  // actually ends the game.
  const [pendingWinner, setPendingWinner] = useState<Alignment | null>(null);

  function declareWinner(winner: Alignment) {
    onChange({ ...game, winner, endedAt: now() });
    setPendingWinner(null);
  }

  function reopen() {
    onChange({ ...game, winner: null, endedAt: null });
  }

  return (
    <section className={styles.panel} aria-label="Game">
      <CollapsibleSection
        title="Game"
        collapsed={collapsed}
        onToggleCollapsed={(next) => onChange({ ...game, endGamePanelCollapsed: next })}
      >
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
                onClick={() => setPendingWinner("good")}
              >
                Good wins
              </button>
              <button
                type="button"
                className={styles.evil}
                onClick={() => setPendingWinner("evil")}
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

        {pendingWinner && (
          <ConfirmDialog
            title="Declare winner"
            message={`Declare ${alignmentLabel(pendingWinner)} the winner? This ends the game.`}
            confirmLabel="Declare winner"
            onConfirm={() => declareWinner(pendingWinner)}
            onCancel={() => setPendingWinner(null)}
          />
        )}
      </CollapsibleSection>
    </section>
  );
}
