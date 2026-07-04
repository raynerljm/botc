"use client";

import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";

import {
  alignmentLabel,
  isGameEnded,
  seatedPlayerCount,
  type GameDocument,
} from "@/lib/gameDocument";
import { downloadGameSnapshot } from "@/lib/gameExport";
import {
  deleteGame,
  getGamesSnapshot,
  setActiveGame,
  subscribeGames,
} from "@/lib/gameStorage";

import styles from "./GamesList.module.css";

const EMPTY: GameDocument[] = [];

function statusOf(game: GameDocument): string {
  return isGameEnded(game)
    ? `${alignmentLabel(game.winner!)} won`
    : "In progress";
}

export function GamesList() {
  const router = useRouter();
  const games = useSyncExternalStore(
    subscribeGames,
    getGamesSnapshot,
    () => EMPTY,
  );

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
        {games.map((game) => (
          <li key={game.id} className={styles.item}>
            <div className={styles.summary}>
              <span className={styles.name}>{game.scriptName}</span>
              <span className={styles.meta}>
                {seatedPlayerCount(game)} players · {statusOf(game)} ·{" "}
                {game.createdAt.slice(0, 10)}
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
        ))}
      </ul>
    </section>
  );
}
