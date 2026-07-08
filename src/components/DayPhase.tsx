"use client";

import { useMemo, useState, type FormEvent } from "react";

import {
  canRecordVote,
  computeBlock,
  currentDay,
  hasNominatedToday,
  hasSpentGhostVoteElsewhereToday,
  nominationThreshold,
  wasNominatedToday,
} from "@/lib/dayPhase";
import type { GameDocument, Nomination, Player } from "@/lib/gameDocument";

import { Checkbox } from "./Checkbox";
import { CollapsibleSection } from "./CollapsibleSection";
import styles from "./DayPhase.module.css";
import { Select } from "./Select";

export interface DayPhaseProps {
  game: GameDocument;
  onChange: (next: GameDocument) => void;
}

export function DayPhase({ game, onChange }: DayPhaseProps) {
  const secondPlayerId = game.players[1]?.id ?? game.players[0]?.id ?? "";
  const [nominatorId, setNominatorId] = useState(game.players[0]?.id ?? "");
  const [nomineeId, setNomineeId] = useState(secondPlayerId);

  const playerById = useMemo(
    () => new Map(game.players.map((player) => [player.id, player] as const)),
    [game.players],
  );

  function toggleCollapsed(collapsed: boolean) {
    onChange({ ...game, dayPhaseCollapsed: collapsed });
  }

  const day = currentDay(game);
  if (day < 1 || game.nightOpen) {
    return (
      <section className={styles.panel} aria-label="Day phase">
        <CollapsibleSection
          title="Day phase"
          collapsed={game.dayPhaseCollapsed}
          onToggleCollapsed={toggleCollapsed}
        >
          <p className={styles.muted}>
            {day < 1
              ? "Begins once the first night ends."
              : "Resumes once tonight's night list ends."}
          </p>
        </CollapsibleSection>
      </section>
    );
  }

  // The most recently recorded nomination is the one still open for voting
  // — earlier ones in the day are already resolved and shown read-only.
  const openNomination = game.nominations[game.nominations.length - 1] ?? null;
  const blockNomineeId = computeBlock(game.nominations, game.players);
  const blockHolder = playerById.get(blockNomineeId ?? "");

  function recordNomination(event: FormEvent) {
    event.preventDefault();
    const nominee = playerById.get(nomineeId);
    if (!nominee) return;
    const nomination: Nomination = {
      id: crypto.randomUUID(),
      nominatorId,
      nomineeId,
      votes: [],
      threshold: nominationThreshold(nominee, game.players),
      isExile: nominee.isTraveller,
    };
    onChange({ ...game, nominations: [...game.nominations, nomination] });
  }

  function toggleVote(nomination: Nomination, player: Player) {
    const alreadyVoted = nomination.votes.includes(player.id);
    const votes = alreadyVoted
      ? nomination.votes.filter((id) => id !== player.id)
      : [...nomination.votes, player.id];
    const nominations = game.nominations.map((n) =>
      n.id === nomination.id ? { ...n, votes } : n,
    );
    const isExecution = !nomination.isExile;

    // Recording a dead player's vote on an execution spends their ghost
    // vote; un-recording it restores the vote, but only when no *other*
    // nomination recorded today still holds their one vote (otherwise
    // they're genuinely still spent, and this would wrongly refund them).
    // An exile never touches the ghost vote either way (CONTEXT.md: Exile).
    // Never blocked (ADR 0003) — a storyteller can always record or remove
    // a vote regardless of the advisory "already spent" state.
    if (player.dead && isExecution) {
      const ghostVoteSpent = !alreadyVoted
        ? true
        : hasSpentGhostVoteElsewhereToday(game.nominations, player.id, nomination.id);
      onChange({
        ...game,
        nominations,
        players: game.players.map((p) =>
          p.id === player.id ? { ...p, ghostVoteSpent } : p,
        ),
      });
      return;
    }

    onChange({ ...game, nominations });
  }

  return (
    <section className={styles.panel} aria-label="Day phase">
      <CollapsibleSection
        title={`Day ${day}`}
        collapsed={game.dayPhaseCollapsed}
        onToggleCollapsed={toggleCollapsed}
      >
        <form className={styles.form} onSubmit={recordNomination}>
          <label className={styles.field}>
            Nominator
            <Select
              className={styles.select}
              aria-label="Nominator"
              value={nominatorId}
              onChange={setNominatorId}
              entries={game.players.map((player) => ({
                value: player.id,
                label: `${player.name}${player.dead ? " (dead)" : ""}${
                  hasNominatedToday(game.nominations, player.id)
                    ? " (already nominated)"
                    : ""
                }`,
              }))}
            />
          </label>
          <label className={styles.field}>
            Nominee
            <Select
              className={styles.select}
              aria-label="Nominee"
              value={nomineeId}
              onChange={setNomineeId}
              entries={game.players.map((player) => ({
                value: player.id,
                label: `${player.name}${player.dead ? " (dead)" : ""}${
                  wasNominatedToday(game.nominations, player.id)
                    ? " (already nominated)"
                    : ""
                }`,
              }))}
            />
          </label>
          <button type="submit" className={styles.submit}>
            Record nomination
          </button>
        </form>

        <ul className={styles.nominations}>
          {game.nominations.map((nomination) => {
            const nominator = playerById.get(nomination.nominatorId);
            const nominee = playerById.get(nomination.nomineeId);
            if (!nominee) return null;

            const threshold = nomination.threshold;
            const tally = nomination.votes.length;
            const meetsThreshold = tally >= threshold;
            const isOpen = nomination.id === openNomination?.id;

            return (
              <li key={nomination.id} className={styles.nomination}>
                <p className={styles.nominationHeading}>
                  {nominator?.name ?? "Unknown"} → {nominee.name}
                  {nomination.isExile && " (exile)"}
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
                      // Advisory only (ADR 0003) — never disables the
                      // checkbox, just labels a dead voter whose ghost vote
                      // is already spent so the storyteller can see it before
                      // choosing to record (or not record) the vote anyway.
                      const alreadySpent =
                        player.dead && !voted && !canRecordVote(player, nomination.isExile);
                      return (
                        <label key={player.id} className={styles.voter}>
                          <Checkbox
                            checked={voted}
                            onChange={() => toggleVote(nomination, player)}
                          />
                          {player.name}
                          {player.dead && (
                            <span className={styles.note}>
                              {" "}
                              (
                              {nomination.isExile
                                ? "vote free"
                                : `ghost vote${alreadySpent ? " — already spent" : ""}`}
                              )
                            </span>
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

        {/* Rendered after the list, never above it — inserting this above the
            nominations shifted every voter checkbox down by a row on the exact
            tap that crossed the threshold, losing votes mid-count (issue
            #125). */}
        {blockHolder && (
          <p className={styles.block} role="status">
            On the block: {blockHolder.name}
          </p>
        )}
      </CollapsibleSection>
    </section>
  );
}
