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
  // Emits only the fields this panel changed, never a whole document built
  // from the `game` prop — the panel stays reachable while draw-stage
  // handlers write newer documents through GrimoireSetup's gameRef in the
  // same tick, so a full-document spread here could silently revert a
  // drawSession/bag/assignment write that landed after this render (Cursor
  // review finding). The owner merges the patch onto its freshest document.
  onChange: (patch: Partial<GameDocument>) => void;
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

  // Ending the game ends any in-flight bag draw with it — the panel stays
  // reachable during the draw's choosing stage, and now that the draw
  // session is persisted (issue #108) a dangling one would otherwise reopen
  // the ended game into the ritual on every resume, forever.
  function declareWinner(winner: Alignment) {
    onChange({ winner, endedAt: now(), drawSession: null });
    setPendingWinner(null);
  }

  function reopen() {
    onChange({ winner: null, endedAt: null });
  }

  return (
    <section className={styles.panel} aria-label="Game">
      <CollapsibleSection
        title="Game"
        collapsed={collapsed}
        onToggleCollapsed={(collapsed) => {
          // Otherwise collapsing merely unmounts the confirm dialog without
          // clearing the staged winner, so re-expanding later re-shows the
          // dialog with no further tap (Copilot review finding).
          if (collapsed) setPendingWinner(null);
          onChange({ endGamePanelCollapsed: collapsed });
        }}
      >
        {ended && (
          <p className={styles.result} role="status">
            {alignmentLabel(game.winner!)} won
          </p>
        )}

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
