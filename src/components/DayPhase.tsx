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
  voteRosterOrder,
  wasNominatedToday,
} from "@/lib/dayPhase";
import { pauseDayTimer } from "@/lib/dayTimer";
import type { GameDocument, Nomination, Player } from "@/lib/gameDocument";
import { dayNotesSectionId, withoutEmptyNotesSection } from "@/lib/gameNotes";
import {
  currentNightNumber,
  phaseForNight,
  phaseLabel,
  withNightStarted,
} from "@/lib/nightList";

import { BottomSheet } from "./BottomSheet";
import bottomSheetStyles from "./BottomSheet.module.css";
import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
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
  // An unsubmitted nominator/nominee pick is local, never-recorded state —
  // it doesn't survive Start Night unmounting this component and a later
  // Back remounting a fresh one (issue #195 decision: the single bottom
  // sheet mounts a fresh DayPhase on every return to the day, the same as a
  // genuine new day already reset these two below). Accepted rather than
  // lifting this pair to GrimoireSetup to survive the round trip: nothing
  // about the pick was ever recorded, so redoing two taps costs far less
  // than the every-render prop-drilling a controlled pair would add here.
  const [nominatorId, setNominatorId] = useState("");
  const [nomineeId, setNomineeId] = useState("");
  const [lastSeenDay, setLastSeenDay] = useState(currentDay(game));

  const playerById = useMemo(
    () => new Map(game.players.map((player) => [player.id, player] as const)),
    [game.players],
  );

  // The sheet's peek/expanded state shares `nightListCollapsed` with the
  // night list (issue #195 decision, recorded in the PR) rather than its own
  // field — only one of the two is ever mounted at a time, so there's only
  // ever one physical sheet's collapsed state to persist.
  function toggleCollapsed(collapsed: boolean) {
    onChange({ ...game, nightListCollapsed: collapsed });
  }

  const day = currentDay(game);
  const nightNumber = currentNightNumber(game);

  // A component-level guarantee, not one that depends on how the current
  // parent happens to mount this: GrimoireSetup in fact remounts a fresh
  // DayPhase on every night→day transition (issue #195, since a night is
  // always interposed between two days), so `lastSeenDay` already matches on
  // that first render and this branch doesn't fire — its unsubmitted picks
  // are already gone via the fresh useState default, the same as the reset
  // below would produce. But nothing about DayPhase's own props promises a
  // remount on every day change (a future parent could reasonably choose to
  // keep it mounted, the way this file's own tests still exercise via
  // `rerender`), so an unsubmitted pick left over from a day the storyteller
  // didn't record a nomination on must still never carry into the next day
  // as a misleading pre-filled pair — the same problem issue #166 removed
  // for the initial render. Adjusted during render (React's documented
  // pattern for resetting state on a prop change) rather than in an effect,
  // to avoid an extra cascading render.
  if (day !== lastSeenDay) {
    setLastSeenDay(day);
    setNominatorId("");
    setNomineeId("");
  }

  // A nomination is open for voting until the storyteller locks it in
  // (issue #191) — at most one is ever open at a time, since starting a new
  // one is only offered once the previous is locked in. Not necessarily the
  // last nomination recorded: reopening an earlier, already-locked one to
  // fix a mistake makes it the open one again, wherever it sits in the day.
  const openNomination = game.nominations.find((n) => !n.lockedIn) ?? null;
  const blockNomineeId = computeBlock(game.nominations, game.players);
  const blockNominationId = computeBlockNominationId(
    game.nominations,
    game.players,
  );
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
      ghostVoteSpenderIds: [],
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
  // Snapshots exactly who was charged onto the nomination itself (Copilot
  // review finding) — reopen must restore precisely these spenders, not
  // whoever is currently dead, which can differ if a death gets corrected
  // between lock-in and reopen.
  function lockInNomination(nomination: Nomination) {
    const spenders = ghostVoteSpendersOnLockIn(nomination, game.players);
    const spenderSet = new Set(spenders);
    onChange({
      ...game,
      nominations: game.nominations.map((n) =>
        n.id === nomination.id
          ? { ...n, lockedIn: true, ghostVoteSpenderIds: spenders }
          : n,
      ),
      players: game.players.map((p) =>
        spenderSet.has(p.id) ? { ...p, ghostVoteSpent: true } : p,
      ),
    });
  }

  // Reopens a locked nomination to correct a mistake, restoring each ghost
  // vote it spent — unless that same player's vote is still genuinely held
  // by a different, still-locked nomination recorded today. Restores
  // exactly the nomination's own snapshotted ghostVoteSpenderIds, not
  // whoever is currently dead (Copilot review finding: a player revived
  // after lock-in would otherwise never be found, and their ghost vote
  // would stay stuck spent forever). Refuses to open a second nomination
  // alongside one that's already open (earlier code review finding): the
  // rest of this file's bookkeeping — the create-form's gating,
  // hasSpentGhostVoteElsewhereToday's "locked-in nominations only" rule —
  // all assume at most one nomination is ever open at a time, and the
  // "Reopen" button is the only path that could otherwise break that (the
  // JSX below hides it for the same reason, this is the data-layer
  // backstop).
  function reopenNomination(nomination: Nomination) {
    if (openNomination && openNomination.id !== nomination.id) return;
    const spenders = new Set(nomination.ghostVoteSpenderIds);
    onChange({
      ...game,
      nominations: game.nominations.map((n) =>
        n.id === nomination.id
          ? { ...n, lockedIn: false, ghostVoteSpenderIds: [] }
          : n,
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

  // Undoes "End night": reopens the just-ended night with its checklist and
  // the day's nominations restored from the snapshot End night captured,
  // then consumes the snapshot so the offer can't be replayed (issue #165).
  // Lives here, not in NightList, because a non-null snapshot always means
  // day >= 1 with no night open — exactly the state where Day phase, not the
  // night list, is what the single bottom sheet is showing (issue #195).
  function undoEndNight() {
    const snapshot = game.lastEndedNightSnapshot;
    if (!snapshot) return;
    onChange({
      ...game,
      night: game.night - 1,
      nightOpen: true,
      nightChecked: snapshot.nightChecked,
      nightUnskipped: snapshot.nightUnskipped,
      // Only restore the snapshotted nominations if none have been recorded
      // since — End night always leaves nominations empty, so a non-empty
      // array here means the storyteller has already nominated today, and
      // that must never be silently overwritten by older, pre-End data
      // (issue #165 AC: "does not silently lose the day-phase state").
      nominations:
        game.nominations.length === 0 ? snapshot.nominations : game.nominations,
      lastEndedNightSnapshot: null,
      // Every path that reopens the night must pause a running day timer,
      // the same reasoning as NightList's startNight (Copilot review finding
      // on issue #190: this path was missed the first time).
      dayTimer: pauseDayTimer(game.dayTimer),
      // Same "don't leave mis-tap clutter" reasoning as NightList's
      // undoStartNight (issue #193 code review finding): the day section End
      // night just created is only removed if it's still empty.
      notes: withoutEmptyNotesSection(
        game.notes,
        dayNotesSectionId(game.night),
      ),
    });
  }

  // Ends the day and opens the next night — reachable from here, not the
  // night list, since the single bottom sheet only ever shows Day phase's
  // content while a day is in progress (issue #195); the night list's own
  // "Start First night" is the pre-day-1 case only. Shares the same
  // withNightStarted helper NightList uses, so the two paths can never
  // diverge on what "starting a night" actually does.
  function startNight() {
    onChange(withNightStarted(game, nightNumber));
  }

  return (
    <BottomSheet
      ariaLabel="Day phase"
      title={`Day ${day}`}
      collapsed={game.nightListCollapsed}
      onToggleCollapsed={toggleCollapsed}
      // Above the collapsible body, like the block-holder status below — a
      // glanceable storyteller aid (issue #190) that must stay visible even
      // while the sheet is peeking (issue #168).
      above={<DayTimer game={game} onChange={onChange} />}
      // The timer's full-size Pause/Resume/Reset controls need more peek
      // headroom than Night's own content, so this is the one BottomSheet
      // call site that opts into the roomier bound (issue #216 code review
      // finding) rather than that bound becoming everyone's default.
      peekVariant="roomy"
      // Below the collapsible body, unlike the nomination form/history
      // itself — a storyteller peeking the sheet to reclaim circle width
      // (issue #168) still needs this glanceable status without expanding
      // the whole nomination record (code review finding). Also keeps issue
      // #125's fix intact: it was moved after the (now collapsible) list
      // specifically so it can never shift a voter checkbox down mid-tap —
      // rendering it outside the list entirely preserves that.
      below={
        blockHolder && (
          <p className={styles.block} role="status">
            On the block: {blockHolder.name}
          </p>
        )
      }
    >
      {/* Offered whenever the storyteller has a night to undo — reachable
          from the very start of the day it created, since that's exactly
          where the single bottom sheet now shows this content (issue #195).
          Reuses the same "Reopen {phase}" label the night list itself used
          before this control moved here (issue #165). */}
      {game.lastEndedNightSnapshot && (
        <Button
          variant="ghost"
          className={[bottomSheetStyles.backAlign, styles.reopenNight]
            .filter(Boolean)
            .join(" ")}
          onClick={undoEndNight}
        >
          ← Reopen {phaseLabel(phaseForNight(game.night), game.night)}
        </Button>
      )}

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
              entries={playerEntries(
                game.players,
                "Choose who's nominating…",
                (id) => hasNominatedToday(game.nominations, id),
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
              entries={playerEntries(
                game.players,
                "Choose who's nominated…",
                (id) => wasNominatedToday(game.nominations, id),
              )}
            />
          </label>
          <p className={styles.preview} aria-live="polite">
            {selectedNominator && selectedNominee
              ? `${selectedNominator.name} will nominate ${selectedNominee.name}`
              : "Choose a nominator and a nominee to start a nomination."}
          </p>
          <Button type="submit" variant="primary" disabled={!canSubmit}>
            Record nomination
          </Button>
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
                <span
                  className={styles.statusBadge}
                  data-open={isOpen || undefined}
                >
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
                  {voteRosterOrder(game.players, nomination.nomineeId).map(
                    (player) => {
                      const voted = nomination.votes.includes(player.id);
                      // Advisory only (ADR 0003) — never disables the
                      // checkbox, just labels a dead voter whose ghost vote
                      // is already spent so the storyteller can see it
                      // before choosing to record (or not record) the vote
                      // anyway.
                      const alreadySpent =
                        player.dead &&
                        !voted &&
                        !canRecordVote(player, nomination.isExile);
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
                    },
                  )}
                </fieldset>
              )}

              {isOpen ? (
                <Button
                  variant="primary"
                  className={styles.lockIn}
                  onClick={() => lockInNomination(nomination)}
                >
                  Lock in votes
                </Button>
              ) : (
                // Hidden (not just disabled) while a different nomination
                // is open — reopening this one at the same time would
                // break the "at most one open nomination" invariant the
                // rest of the file relies on (code review finding); see
                // reopenNomination's own guard for the data-layer backstop.
                !openNomination && (
                  <Button
                    className={styles.reopen}
                    onClick={() => reopenNomination(nomination)}
                  >
                    Reopen
                  </Button>
                )
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

      {/* Ends the day and opens the next night — the single bottom sheet
          only ever shows Day phase's content while a day is in progress
          (issue #195), so this is the only place that control can live. */}
      <Button
        variant="primary"
        className={styles.startNight}
        onClick={startNight}
      >
        Start {phaseLabel(phaseForNight(nightNumber), nightNumber)}
      </Button>
    </BottomSheet>
  );
}
