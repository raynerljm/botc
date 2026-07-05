"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import {
  alignmentLabel,
  isGameEnded,
  seatedPlayerCount,
  type GameDocument,
} from "@/lib/gameDocument";
import { downloadGameSnapshot } from "@/lib/gameExport";
import { formatDuration, formatStartTimeSGT } from "@/lib/gameTime";
import {
  deleteGame,
  getGamesSnapshot,
  setActiveGame,
  subscribeGames,
} from "@/lib/gameStorage";

import styles from "./GamesList.module.css";

const EMPTY: GameDocument[] = [];
const ELAPSED_REFRESH_MS = 30_000;

function statusOf(ended: boolean, game: GameDocument): string {
  return ended ? `${alignmentLabel(game.winner!)} won` : "In progress";
}

function timeSummaryOf(ended: boolean, game: GameDocument): string {
  const started = `Started ${formatStartTimeSGT(game.createdAt)}`;
  return ended
    ? `${started} · Lasted ${formatDuration(game.createdAt, new Date(game.endedAt!))}`
    : `${started} · Elapsed ${formatDuration(game.createdAt)}`;
}

export function GamesList() {
  const router = useRouter();
  const games = useSyncExternalStore(
    subscribeGames,
    getGamesSnapshot,
    () => EMPTY,
  );
  // A saved game can stay open on screen indefinitely, so "Elapsed" needs its
  // own clock tick — the store only notifies on save/delete, not on time
  // passing. Only ongoing games show "Elapsed", so skip the timer entirely
  // when every saved game has already ended.
  const [, tick] = useState(0);
  const hasOngoingGame = games.some((game) => !isGameEnded(game));

  useEffect(() => {
    if (!hasOngoingGame) return;
    const id = setInterval(() => tick((n) => n + 1), ELAPSED_REFRESH_MS);
    return () => clearInterval(id);
  }, [hasOngoingGame]);

  if (games.length === 0) return null;

  function resume(id: string) {
    setActiveGame(id);
    router.push("/game");
  }

  function remove(game: GameDocument) {
    if (
      window.confirm(
        `Delete "${game.scriptName}"? This can't be undone — export it first if you want to keep it.`,
      )
    ) {
      deleteGame(game.id);
    }
  }

  return (
    <section className={styles.section} aria-label="Your games">
      <h2 className={styles.heading}>Your games</h2>
      <ul className={styles.list}>
        {games.map((game) => {
          const ended = isGameEnded(game);
          return (
            <li key={game.id} className={styles.item}>
              <div className={styles.summary}>
                <span className={styles.name}>{game.scriptName}</span>
                <span className={styles.meta}>
                  {seatedPlayerCount(game)} players · {statusOf(ended, game)}
                </span>
                <span className={styles.meta}>
                  {timeSummaryOf(ended, game)}
                </span>
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.resume}
                  onClick={() => resume(game.id)}
                >
                  Resume
                </button>
                <button
                  type="button"
                  onClick={() => downloadGameSnapshot(game)}
                >
                  Export
                </button>
                <button
                  type="button"
                  className={styles.delete}
                  onClick={() => remove(game)}
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
