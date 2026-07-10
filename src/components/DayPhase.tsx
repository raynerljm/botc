"use client";

import { useMemo, useState, type FormEvent } from "react";

import {
  canRecordVote,
  computeBlock,
  computeBlockNominationId,
  currentDay,
  ghostVoteSpendersOnLockIn,
  hasNominatedToday,
  hasSpentGhostVoteElsewhereToday,
  nominationThreshold,
  wasNominatedToday,
} from "@/lib/dayPhase";
import type { GameDocument, Nomination, Player } from "@/lib/gameDocument";

import { Checkbox } from "./Checkbox";
import { CollapsibleSection } from "./CollapsibleSection";
import { DayTimer } from "./DayTimer";
import styles from "./DayPhase.module.css";
import { Select, type SelectEntry } from "./Select";

export interface DayPhaseProps {
  game: GameDocument;
  onChange: (next: GameDocument) => void;
}

// Shared shape for the Nominator/Nominee pickers: an empty placeholder entry
// first (no misleading default pairing — issue #166), then every player
// labeled dead/already-nominated by whichever check the caller passes.
function playerEntries(
  players: Player[],
  placeholder: string,
  alreadyNominated: (playerId: string) => boolean,
): SelectEntry[] {
  return [
    { value: "", label: placeholder },
    ...players.map((player) => ({
      value: player.id,
      label: `${player.name}${player.dead ? " (dead)" : ""}${
        alreadyNominated(player.id) ? " (already nominated)" : ""
      }`,
    })),
  ];
}

export function DayPhase({ game, onChange }: DayPhaseProps) {
  const [nominatorId, setNominatorId] = useState("");
  const [nomineeId, setNomineeId] = useState("");
  const [lastSeenDay, setLastSeenDay] = useState(currentDay(game));

  const playerById = useMemo(
    () => new Map(game.players.map((player) => [player.id, player] as const)),
    [game.players],
  );

  function toggleCollapsed(collapsed: boolean) {
    onChange({ ...game, dayPhaseCollapsed: collapsed });
  }

  const day = currentDay(game);

  // DayPhase stays mounted across day transitions (its parent never
  // remounts it), so an unsubmitted pick left over from a day the
  // storyteller didn't record a nomination on would otherwise carry
  // straight into the next day as a misleading pre-filled pair — the same
  // problem issue #166 removed for the initial render. Adjusted during
  // render (React's documented pattern for resetting state on a prop
  // change) rather than in an effect, to avoid an extra cascading render.
  if (day !== lastSeenDay) {
    setLastSeenDay(day);
    setNominatorId("");
    setNomineeId("");
  }

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

  // A nomination is open for voting until the storyteller locks it in
  // (issue #191) — at most one is ever open at a time, since starting a new
  // one is only offered once the previous is locked in. Not necessarily the
  // last nomination recorded: reopening an earlier, already-locked one to
  // fix a mistake makes it the open one again, wherever it sits in the day.
  const openNomination = game.nominations.find((n) => !n.lockedIn) ?? null;
  const blockNomineeId = computeBlock(game.nominations, game.players);
  const blockNominationId = computeBlockNominationId(game.nominations, game.players);
  const blockHolder = playerById.get(blockNomineeId ?? "");

  const selectedNominator = playerById.get(nominatorId);
  const selectedNominee = playerById.get(nomineeId);
  const canSubmit = Boolean(selectedNominator && selectedNominee);

  function recordNomination(event: FormEvent) {
    event.preventDefault();
    if (!selectedNominator || !selectedNominee) return;
    const nomination: Nomination = {
      id: crypto.randomUUID(),
      nominatorId,
      nomineeId,
      votes: [],
      threshold: nominationThreshold(selectedNominee, game.players),
      isExile: selectedNominee.isTraveller,
      lockedIn: false,
    };
    onChange({ ...game, nominations: [...game.nominations, nomination] });
    // Reset to the empty placeholder state — starting the next nomination is
    // always an explicit fresh choice, never a carried-over pairing.
    setNominatorId("");
    setNomineeId("");
  }

  // Votes are just a live tally while a nomination is open — ghost votes
  // aren't spent until lock-in (issue #191), so toggling one here never
  // touches player state.
  function toggleVote(nomination: Nomination, player: Player) {
    const alreadyVoted = nomination.votes.includes(player.id);
    const votes = alreadyVoted
      ? nomination.votes.filter((id) => id !== player.id)
      : [...nomination.votes, player.id];
    const nominations = game.nominations.map((n) =>
      n.id === nomination.id ? { ...n, votes } : n,
    );
    onChange({ ...game, nominations });
  }

  // Finalizes the tally: spends the ghost vote of every dead voter on an
  // execution (never on an exile) and makes the nomination read-only.
  function lockInNomination(nomination: Nomination) {
    const spenders = new Set(ghostVoteSpendersOnLockIn(nomination, game.players));
    onChange({
      ...game,
      nominations: game.nominations.map((n) =>
        n.id === nomination.id ? { ...n, lockedIn: true } : n,
      ),
      players: game.players.map((p) =>
        spenders.has(p.id) ? { ...p, ghostVoteSpent: true } : p,
      ),
    });
  }

  // Reopens a locked nomination to correct a mistake, restoring each ghost
  // vote it spent — unless that same player's vote is still genuinely held
  // by a different, still-locked nomination recorded today.
  function reopenNomination(nomination: Nomination) {
    const spenders = new Set(ghostVoteSpendersOnLockIn(nomination, game.players));
    onChange({
      ...game,
      nominations: game.nominations.map((n) =>
        n.id === nomination.id ? { ...n, lockedIn: false } : n,
      ),
      players: game.players.map((p) => {
        if (!spenders.has(p.id)) return p;
        const stillSpentElsewhere = hasSpentGhostVoteElsewhereToday(
          game.nominations,
          p.id,
          nomination.id,
        );
        return stillSpentElsewhere ? p : { ...p, ghostVoteSpent: false };
      }),
    });
  }

  return (
    <section className={styles.panel} aria-label="Day phase">
      {/* Outside CollapsibleSection, like the block-holder status below —
          a glanceable storyteller aid (issue #190) that must stay visible
          even while the storyteller has collapsed the panel to reclaim
          circle width (issue #168). */}
      <DayTimer game={game} onChange={onChange} />

      <CollapsibleSection
        title={`Day ${day}`}
        collapsed={game.dayPhaseCollapsed}
        onToggleCollapsed={toggleCollapsed}
      >
        {/* While a nomination is open, recording a new one is not offered —
            the screen focuses on ticking who voted for the one already in
            play (issue #191). */}
        {openNomination ? (
          <p className={styles.muted}>
            A nomination is open. Lock in its votes to start another.
          </p>
        ) : (
          <form className={styles.form} onSubmit={recordNomination}>
            <label className={styles.field}>
              Nominator
              <Select
                className={styles.select}
                aria-label="Nominator"
                value={nominatorId}
                onChange={setNominatorId}
                entries={playerEntries(game.players, "Choose who's nominating…", (id) =>
                  hasNominatedToday(game.nominations, id),
                )}
              />
            </label>
            <label className={styles.field}>
              Nominee
              <Select
                className={styles.select}
                aria-label="Nominee"
                value={nomineeId}
                onChange={setNomineeId}
                entries={playerEntries(game.players, "Choose who's nominated…", (id) =>
                  wasNominatedToday(game.nominations, id),
                )}
              />
            </label>
            <p className={styles.preview} aria-live="polite">
              {selectedNominator && selectedNominee
                ? `${selectedNominator.name} will nominate ${selectedNominee.name}`
                : "Choose a nominator and a nominee to start a nomination."}
            </p>
            <button type="submit" className={styles.submit} disabled={!canSubmit}>
              Record nomination
            </button>
          </form>
        )}

        <ul className={styles.nominations}>
          {game.nominations.map((nomination) => {
            const nominator = playerById.get(nomination.nominatorId);
            const nominee = playerById.get(nomination.nomineeId);
            if (!nominee) return null;

            const threshold = nomination.threshold;
            const tally = nomination.votes.length;
            const meetsThreshold = tally >= threshold;
            const isOpen = !nomination.lockedIn;
            const isOnBlock = nomination.id === blockNominationId;

            return (
              <li
                key={nomination.id}
                className={styles.nomination}
                data-status={isOpen ? "open" : "locked-in"}
              >
                <div className={styles.nominationHeader}>
                  <p className={styles.nominationHeading}>
                    {nominator?.name ?? "Unknown"} → {nominee.name}
                  </p>
                  <span
                    className={styles.typeBadge}
                    data-exile={nomination.isExile || undefined}
                  >
                    {nomination.isExile ? "Exile call" : "Execution"}
                  </span>
                </div>
                <p className={styles.statusLine}>
                  <span className={styles.statusBadge} data-open={isOpen || undefined}>
                    {isOpen ? "Open — accepting votes" : "Locked in"}
                  </span>
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

                {isOpen ? (
                  <button
                    type="button"
                    className={styles.lockIn}
                    onClick={() => lockInNomination(nomination)}
                  >
                    Lock in votes
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.reopen}
                    onClick={() => reopenNomination(nomination)}
                  >
                    Reopen
                  </button>
                )}

                {/* Kept after the voter fieldset, never before it — same
                    reasoning as the panel-wide block line below (issue
                    #125): mounting this once threshold is met must never
                    shift an unchecked voter checkbox down mid-tap. */}
                {isOnBlock && <p className={styles.blockBadge}>On the block</p>}
              </li>
            );
          })}
        </ul>

      </CollapsibleSection>

      {/* Kept outside CollapsibleSection, unlike the nomination form/history
          itself — a storyteller collapsing this panel to reclaim circle
          width (issue #168) still needs this glanceable status without
          re-expanding the whole nomination record (code review finding).
          Also keeps issue #125's fix intact: it was moved after the (now
          collapsible) list specifically so it can never shift a voter
          checkbox down mid-tap — rendering it outside the list entirely
          preserves that. */}
      {blockHolder && (
        <p className={styles.block} role="status">
          On the block: {blockHolder.name}
        </p>
      )}
    </section>
  );
}
