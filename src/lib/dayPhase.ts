import type { GameDocument, Nomination, Player } from "./gameDocument";

// The day following night N (CONTEXT.md: Nomination). There's no separate
// "start day" step — a night ending *is* dawn, so the day is simply
// whatever night just finished, open until the next night starts.
export function isDayOpen(game: GameDocument): boolean {
  return !game.nightOpen && game.night > 0;
}

// The living (non-dead) player count — the denominator for an execution
// nomination's threshold (CONTEXT.md: Nomination).
export function livingCount(players: Player[]): number {
  return players.filter((player) => !player.dead).length;
}

// CONTEXT.md: On the block — threshold is ceil(living players / 2) for an
// execution, or ceil(all players / 2) (dead included) for an exile
// (CONTEXT.md: Exile — the Traveller equivalent of an execution).
export function nominationThreshold(
  players: Player[],
  nominee: Player | undefined,
): number {
  const count = nominee?.isTraveller ? players.length : livingCount(players);
  return Math.ceil(count / 2);
}

export function nominationTally(nomination: Nomination): number {
  return nomination.voterIds.length;
}

// Eligibility is advisory only (ADR 0003) — these just drive the "used
// today" badges, never a hard stop on recording another nomination.
export function hasNominatedToday(nominations: Nomination[], playerId: string): boolean {
  return nominations.some((nomination) => nomination.nominatorId === playerId);
}

export function hasBeenNominatedToday(
  nominations: Nomination[],
  playerId: string,
): boolean {
  return nominations.some((nomination) => nomination.nomineeId === playerId);
}

export interface VoteToggleResult {
  nominations: Nomination[];
  players: Player[];
}

// Recording and un-recording a dead player's vote is the same round trip
// that spends and un-spends their ghost vote (mirrors the existing manual
// ghost-vote toggle) — except for an exile, where a Traveller nominee means
// dead players vote freely without spending anything (CONTEXT.md: Exile).
export function applyVoteToggle(
  nominations: Nomination[],
  players: Player[],
  nominationId: string,
  playerId: string,
): VoteToggleResult {
  const nomination = nominations.find((n) => n.id === nominationId);
  if (!nomination) return { nominations, players };

  const voting = !nomination.voterIds.includes(playerId);
  const nextNominations = nominations.map((n) =>
    n.id === nominationId
      ? {
          ...n,
          voterIds: voting
            ? [...n.voterIds, playerId]
            : n.voterIds.filter((id) => id !== playerId),
        }
      : n,
  );

  const voter = players.find((p) => p.id === playerId);
  const nominee = players.find((p) => p.id === nomination.nomineeId);
  const spendsGhostVote = Boolean(voter?.dead) && !nominee?.isTraveller;

  // A mistaken uncheck on *this* nomination must not erase a ghost vote the
  // player has genuinely spent by still actively voting (on an execution) in
  // another nomination recorded today — un-spend only once no such vote
  // remains.
  const stillVotingElsewhere = nextNominations.some((n) => {
    if (n.id === nominationId || !n.voterIds.includes(playerId)) return false;
    const otherNominee = players.find((p) => p.id === n.nomineeId);
    return !otherNominee?.isTraveller;
  });
  const nextGhostVoteSpent = voting || stillVotingElsewhere;

  const nextPlayers = spendsGhostVote
    ? players.map((p) =>
        p.id === playerId ? { ...p, ghostVoteSpent: nextGhostVoteSpent } : p,
      )
    : players;

  return { nominations: nextNominations, players: nextPlayers };
}

// A removed player can't stay nominator, nominee, or voter — dropping the
// nomination outright when they were nominator/nominee avoids a dangling
// reference that would corrupt threshold/tally/block math for the rest of
// the day (issue #20: removePlayer must scrub game.nominations).
export function withoutPlayerFromNominations(
  nominations: Nomination[],
  playerId: string,
): Nomination[] {
  return nominations
    .filter((n) => n.nominatorId !== playerId && n.nomineeId !== playerId)
    .map((n) =>
      n.voterIds.includes(playerId)
        ? { ...n, voterIds: n.voterIds.filter((id) => id !== playerId) }
        : n,
    );
}

export interface BlockState {
  nominationId: string | null;
  playerId: string | null;
  tally: number;
}

const NO_BLOCK: BlockState = { nominationId: null, playerId: null, tally: 0 };

// Derived from the day's nominations in order, rather than stored as its own
// field — so the current block-holder can never drift from what the day's
// recorded votes actually say (CONTEXT.md: On the block). A tally below
// threshold never changes the current holder; meeting or beating it either
// replaces the holder (strictly higher), clears it (an exact tie), or leaves
// it alone (strictly lower).
export function computeBlock(nominations: Nomination[], players: Player[]): BlockState {
  let state = NO_BLOCK;
  for (const nomination of nominations) {
    const nominee = players.find((player) => player.id === nomination.nomineeId);
    const threshold = nominationThreshold(players, nominee);
    const tally = nominationTally(nomination);
    if (tally < threshold) continue;
    if (state.playerId === null || tally > state.tally) {
      state = { nominationId: nomination.id, playerId: nomination.nomineeId, tally };
    } else if (tally === state.tally) {
      state = NO_BLOCK;
    }
  }
  return state;
}
