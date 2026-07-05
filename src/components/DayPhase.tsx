"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  canRecordVote,
  computeBlock,
  currentDay,
  hasNominatedToday,
  nominationThreshold,
  wasNominatedToday,
} from "@/lib/dayPhase";
import type { GameDocument, Nomination, Player } from "@/lib/gameDocument";

import styles from "./DayPhase.module.css";

export interface DayPhaseProps {
  game: GameDocument;
  onChange: (next: GameDocument) => void;
}

interface GhostSpend {
  nominationId: string;
  playerId: string;
}

function spendKey(spend: GhostSpend): string {
  return `${spend.nominationId}:${spend.playerId}`;
}

export function DayPhase({ game, onChange }: DayPhaseProps) {
  const secondPlayerId = game.players[1]?.id ?? game.players[0]?.id ?? "";
  const [nominatorId, setNominatorId] = useState(game.players[0]?.id ?? "");
  const [nomineeId, setNomineeId] = useState(secondPlayerId);
  // A brief per-spend banner offering to reverse the one automatic side
  // effect (issue #20 AC: "spends their ghost vote automatically, with
  // undo") — a list rather than a single slot, so a second dead player's
  // vote doesn't silently drop the first spend's undo option.
  const [ghostSpends, setGhostSpends] = useState<GhostSpend[]>([]);
  const undoTimeoutsRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const timeouts = undoTimeoutsRef.current;
    return () => {
      for (const timeout of timeouts.values()) clearTimeout(timeout);
      timeouts.clear();
    };
  }, []);

  const playerById = useMemo(
    () => new Map(game.players.map((player) => [player.id, player] as const)),
    [game.players],
  );

  const day = currentDay(game);
  if (day < 1 || game.nightOpen) {
    return (
      <section className={styles.panel} aria-label="Day phase">
        <h2 className={styles.heading}>Day phase</h2>
        <p className={styles.muted}>
          {day < 1
            ? "Begins once the first night ends."
            : "Resumes once tonight's night list ends."}
        </p>
      </section>
    );
  }

  // The most recently recorded nomination is the one still open for voting
  // — earlier ones in the day are already resolved and shown read-only.
  const openNomination = game.nominations[game.nominations.length - 1] ?? null;
  const blockNomineeId = computeBlock(game.nominations, game.players);
  const blockHolder = playerById.get(blockNomineeId ?? "");

  function recordSpend(spend: GhostSpend) {
    setGhostSpends((current) => [...current, spend]);
    const key = spendKey(spend);
    const timeout = setTimeout(() => {
      setGhostSpends((current) => current.filter((s) => spendKey(s) !== key));
      undoTimeoutsRef.current.delete(key);
    }, 6000);
    undoTimeoutsRef.current.set(key, timeout);
  }

  function clearSpend(spend: GhostSpend) {
    const key = spendKey(spend);
    const timeout = undoTimeoutsRef.current.get(key);
    if (timeout) clearTimeout(timeout);
    undoTimeoutsRef.current.delete(key);
    setGhostSpends((current) => current.filter((s) => spendKey(s) !== key));
  }

  function recordNomination(event: React.FormEvent) {
    event.preventDefault();
    const nomination: Nomination = {
      id: crypto.randomUUID(),
      nominatorId,
      nomineeId,
      votes: [],
    };
    onChange({ ...game, nominations: [...game.nominations, nomination] });
  }

  function toggleVote(nomination: Nomination, player: Player) {
    const nominee = playerById.get(nomination.nomineeId);
    const alreadyVoted = nomination.votes.includes(player.id);
    const votes = alreadyVoted
      ? nomination.votes.filter((id) => id !== player.id)
      : [...nomination.votes, player.id];
    const nominations = game.nominations.map((n) =>
      n.id === nomination.id ? { ...n, votes } : n,
    );

    // Recording a dead player's vote spends their ghost vote automatically,
    // but only for an execution — an exile never touches it (CONTEXT.md:
    // Exile) — and only on the way in; un-checking a vote never un-spends
    // it on its own (that's what Undo is for).
    if (!alreadyVoted && player.dead && nominee && !nominee.isTraveller) {
      onChange({
        ...game,
        nominations,
        players: game.players.map((p) =>
          p.id === player.id ? { ...p, ghostVoteSpent: true } : p,
        ),
      });
      recordSpend({ nominationId: nomination.id, playerId: player.id });
      return;
    }

    onChange({ ...game, nominations });
  }

  function undoGhostSpend(spend: GhostSpend) {
    onChange({
      ...game,
      nominations: game.nominations.map((n) =>
        n.id === spend.nominationId
          ? { ...n, votes: n.votes.filter((id) => id !== spend.playerId) }
          : n,
      ),
      players: game.players.map((p) =>
        p.id === spend.playerId ? { ...p, ghostVoteSpent: false } : p,
      ),
    });
    clearSpend(spend);
  }

  return (
    <section className={styles.panel} aria-label="Day phase">
      <h2 className={styles.heading}>Day {day}</h2>

      {blockHolder && (
        <p className={styles.block} role="status">
          On the block: {blockHolder.name}
        </p>
      )}

      <form className={styles.form} onSubmit={recordNomination}>
        <label className={styles.field}>
          Nominator
          <select
            value={nominatorId}
            onChange={(event) => setNominatorId(event.target.value)}
          >
            {game.players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
                {player.dead ? " (dead)" : ""}
                {hasNominatedToday(game.nominations, player.id)
                  ? " (already nominated)"
                  : ""}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Nominee
          <select
            value={nomineeId}
            onChange={(event) => setNomineeId(event.target.value)}
          >
            {game.players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
                {wasNominatedToday(game.nominations, player.id)
                  ? " (already nominated)"
                  : ""}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Record nomination</button>
      </form>

      {ghostSpends.map((spend) => (
        <div key={spendKey(spend)} className={styles.undoBanner}>
          <span>{playerById.get(spend.playerId)?.name ?? "Player"}&apos;s ghost vote spent</span>
          <button type="button" onClick={() => undoGhostSpend(spend)}>
            Undo
          </button>
        </div>
      ))}

      <ul className={styles.nominations}>
        {game.nominations.map((nomination) => {
          const nominator = playerById.get(nomination.nominatorId);
          const nominee = playerById.get(nomination.nomineeId);
          if (!nominee) return null;

          const threshold = nominationThreshold(nominee, game.players);
          const tally = nomination.votes.length;
          const meetsThreshold = tally >= threshold;
          const isOpen = nomination.id === openNomination?.id;

          return (
            <li key={nomination.id} className={styles.nomination}>
              <p className={styles.nominationHeading}>
                {nominator?.name ?? "Unknown"} → {nominee.name}
                {nominee.isTraveller && " (exile)"}
              </p>
              <p
                className={styles.tally}
                role="status"
                data-meets-threshold={meetsThreshold || undefined}
              >
                {tally}/{threshold} votes
                {meetsThreshold ? " — meets threshold" : ""}
              </p>

              {isOpen && (
                <fieldset className={styles.voters}>
                  <legend>Record votes</legend>
                  {game.players.map((player) => {
                    const voted = nomination.votes.includes(player.id);
                    const eligible = canRecordVote(player, nominee);
                    return (
                      <label key={player.id} className={styles.voter}>
                        <input
                          type="checkbox"
                          checked={voted}
                          disabled={!voted && !eligible}
                          onChange={() => toggleVote(nomination, player)}
                        />
                        {player.name}
                        {player.dead && (
                          <span className={styles.note}> (ghost vote)</span>
                        )}
                      </label>
                    );
                  })}
                </fieldset>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
