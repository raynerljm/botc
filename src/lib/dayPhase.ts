import type { GameDocument, Nomination, Player } from "./gameDocument";

// Ended nights start the next day; a day begins once night N has closed,
// so `game.night` doubles as the current day number (issue #20 AC: "Ending
// a night starts the next day").
export function currentDay(game: GameDocument): number {
  return game.night;
}

export function livingPlayerCount(players: Player[]): number {
  return players.filter((player) => !player.dead).length;
}

// A Traveller nomination is an exile, not an execution: its threshold counts
// every player, dead included, and doesn't spend ghost votes (CONTEXT.md:
// Exile). Everyone else is an execution, whose threshold counts only the
// living (CONTEXT.md: On the block).
export function nominationThreshold(
  nominee: Player,
  players: Player[],
): number {
  const count = nominee.isTraveller ? players.length : livingPlayerCount(players);
  return Math.ceil(count / 2);
}

export function nominationTally(nomination: Nomination): number {
  return nomination.votes.length;
}

// Nominations that count as executions — every nomination except exile
// calls, which are unlimited per day and never compete for the block
// (CONTEXT.md: Exile, issue #114). The single place that draws the
// exile/execution boundary, so every consumer below shares one answer.
export function executionNominations(nominations: Nomination[]): Nomination[] {
  return nominations.filter((nomination) => !nomination.isExile);
}

// Folds today's nominations in the order they were recorded, tracking the
// high-water tally among nominations that met their own threshold — not
// just the current block-holder's tally. A nomination only takes the block
// by strictly beating the high-water mark; an exact tie clears the block
// but leaves the high-water mark standing, so a later nomination matching
// that same tied tally still doesn't take it — only a strictly higher tally
// ever does (CONTEXT.md: On the block). A nomination short of its own
// threshold never touches the block or the high-water mark, even if its
// tally happens to match either. Each nomination's threshold is the one
// snapshotted on it at vote time (issue #113) — never recomputed against
// the current player list, so a mid-day death can't rewrite a past tally
// or move the block. The high-water mark advances even for a nomination
// whose nominee has since left the roster entirely (mid-game removal,
// distinct from merely dying) — only the block-holder itself has to still
// exist to be creditable, or a later nomination could retake the block by
// merely matching a tally that only seems forgotten because its holder is
// gone (still the same bug this fold exists to prevent). An exile call
// never enters this fold at all — it isn't an execution, doesn't compete
// for the block, and is unlimited per day (CONTEXT.md: Exile, issue #114).
interface BlockFold {
  nominationId: string | null;
  nomineeId: string | null;
}

// Shared by computeBlock and computeBlockNominationId so the two can never
// disagree on which nomination holds the block — a nominee can be nominated
// more than once in a day (wasNominatedToday only advisory-labels a repeat,
// never blocks it), so a caller that needs to badge the *specific* holding
// nomination can't safely re-derive it by matching nomineeId alone (issue
// #166 code review finding: that would badge every nomination against the
// current block-holder, not just the one that actually took it).
function foldBlock(nominations: Nomination[], players: Player[]): BlockFold {
  let nominationId: string | null = null;
  let nomineeId: string | null = null;
  let highWater = -1;

  for (const nomination of executionNominations(nominations)) {
    const tally = nominationTally(nomination);
    if (tally < nomination.threshold) continue;

    if (tally > highWater) {
      highWater = tally;
      const stillInPlay = players.some((player) => player.id === nomination.nomineeId);
      nominationId = stillInPlay ? nomination.id : null;
      nomineeId = stillInPlay ? nomination.nomineeId : null;
    } else if (tally === highWater) {
      nominationId = null;
      nomineeId = null;
    }
  }

  return { nominationId, nomineeId };
}

export function computeBlock(
  nominations: Nomination[],
  players: Player[],
): string | null {
  return foldBlock(nominations, players).nomineeId;
}

// The id of the specific nomination currently holding the block, or null —
// distinct from computeBlock's nominee id because the same nominee can have
// more than one nomination recorded in a day (see foldBlock above).
export function computeBlockNominationId(
  nominations: Nomination[],
  players: Player[],
): string | null {
  return foldBlock(nominations, players).nominationId;
}

// A dead player's one ghost vote only ever gates an execution vote — an
// exile neither needs nor spends it (CONTEXT.md: Exile "ghost votes are not
// spent on it"), so a ghost with no votes left can still vote on an exile,
// and voting on an exile never uses up the vote they'd need for a later
// execution. Takes the nomination's snapshotted isExile rather than a live
// nominee, for the same staleness reason as the rest of issue #114 — a
// nomination stays whatever it was recorded as even if its nominee later
// leaves the roster. Advisory only (ADR 0003) — nothing in this file
// disables recording a vote based on this; it's for the advisory label next
// to a dead voter's name.
export function canRecordVote(voter: Player, isExile: boolean): boolean {
  if (!voter.dead) return true;
  if (isExile) return true;
  return !voter.ghostVoteSpent;
}

// The dead voters an execution nomination's lock-in spends a ghost vote for
// (issue #191: ghost votes are spent at lock-in, not as votes are toggled
// while the nomination is still open). An exile never spends one
// (CONTEXT.md: Exile "ghost votes are not spent on it"), so it always
// yields none. A living voter is never in `votes` costing a ghost vote in
// the first place, but filtering by `dead` here keeps this the single
// source of truth rather than trusting callers to pre-filter.
export function ghostVoteSpendersOnLockIn(
  nomination: Nomination,
  players: Player[],
): string[] {
  if (nomination.isExile) return [];
  const deadIds = new Set(
    players.filter((player) => player.dead).map((player) => player.id),
  );
  return nomination.votes.filter((playerId) => deadIds.has(playerId));
}

// Whether a dead player's ghost vote is already accounted for by some
// *other* locked-in execution nomination recorded today. Reopening a
// nomination restores `ghostVoteSpent` only when this really was the
// nomination that spent it — not when a different, still-locked nomination
// today already holds their one vote for the day, which would otherwise
// wrongly refund it. Only locked-in nominations count: an open nomination's
// votes are just a live tally-in-progress and haven't spent anything yet
// (issue #191). An exile vote never counts here either way (CONTEXT.md:
// Exile "ghost votes are not spent on it").
export function hasSpentGhostVoteElsewhereToday(
  nominations: Nomination[],
  playerId: string,
  currentNominationId: string,
): boolean {
  return executionNominations(nominations).some(
    (nomination) =>
      nomination.id !== currentNominationId &&
      nomination.lockedIn &&
      nomination.votes.includes(playerId),
  );
}

// An exile call never consumes the caller's once-per-day nomination —
// exile calls are unlimited per day (CONTEXT.md: Exile, issue #114).
export function hasNominatedToday(
  nominations: Nomination[],
  playerId: string,
): boolean {
  return executionNominations(nominations).some(
    (nomination) => nomination.nominatorId === playerId,
  );
}

// An exile call never marks its Traveller target as "already nominated" —
// exile calls are unlimited per day (CONTEXT.md: Exile, issue #114).
export function wasNominatedToday(
  nominations: Nomination[],
  playerId: string,
): boolean {
  return executionNominations(nominations).some(
    (nomination) => nomination.nomineeId === playerId,
  );
}

// Display order for the vote-recording roster: seat order starting with the
// first seat clockwise of the nominee, wrapping around so the nominee is
// last (issue #248) — matches how voting actually proceeds around the table.
// Derived from `player.seat`, not array order, so it stays correct after
// reseats/insertions. Purely presentational — `nomination.votes` itself
// stays in recorded order, untouched by this. If the nominee isn't among
// the players, `nomineeIndex` is -1 and the slice arithmetic below already
// yields plain seat order with no special-casing needed.
export function voteRosterOrder(
  players: Player[],
  nomineeId: string,
): Player[] {
  const bySeat = [...players].sort((a, b) => a.seat - b.seat);
  const nomineeIndex = bySeat.findIndex((player) => player.id === nomineeId);
  return [
    ...bySeat.slice(nomineeIndex + 1),
    ...bySeat.slice(0, nomineeIndex + 1),
  ];
}
