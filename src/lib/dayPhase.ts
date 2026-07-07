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
// or move the block.
export function computeBlock(
  nominations: Nomination[],
  players: Player[],
): string | null {
  let blockNomineeId: string | null = null;
  let highWater = 0;

  for (const nomination of nominations) {
    const stillInPlay = players.some((player) => player.id === nomination.nomineeId);
    if (!stillInPlay) continue;

    const tally = nominationTally(nomination);
    if (tally < nomination.threshold) continue;

    if (tally > highWater) {
      blockNomineeId = nomination.nomineeId;
      highWater = tally;
    } else if (tally === highWater) {
      blockNomineeId = null;
    }
  }

  return blockNomineeId;
}

// A dead player's one ghost vote only ever gates an execution vote — an
// exile (Traveller nominee) neither needs nor spends it (CONTEXT.md: Exile
// "ghost votes are not spent on it"), so a ghost with no votes left can
// still vote on an exile, and voting on an exile never uses up the vote
// they'd need for a later execution. Advisory only (ADR 0003) — nothing
// in this file disables recording a vote based on this; it's for the
// advisory label next to a dead voter's name.
export function canRecordVote(voter: Player, nominee: Player): boolean {
  if (!voter.dead) return true;
  if (nominee.isTraveller) return true;
  return !voter.ghostVoteSpent;
}

// Whether a dead player's ghost vote is already accounted for by some
// *other* execution nomination recorded today. Un-checking a vote restores
// `ghostVoteSpent` only when this really was the nomination that spent it —
// not when an earlier (now-closed) nomination still holds their one vote
// for the day, which would otherwise wrongly refund it.
export function hasSpentGhostVoteElsewhereToday(
  nominations: Nomination[],
  players: Player[],
  playerId: string,
  currentNominationId: string,
): boolean {
  return nominations.some((nomination) => {
    if (nomination.id === currentNominationId) return false;
    if (!nomination.votes.includes(playerId)) return false;
    const nominee = players.find((player) => player.id === nomination.nomineeId);
    return !!nominee && !nominee.isTraveller;
  });
}

export function hasNominatedToday(
  nominations: Nomination[],
  playerId: string,
): boolean {
  return nominations.some((nomination) => nomination.nominatorId === playerId);
}

export function wasNominatedToday(
  nominations: Nomination[],
  playerId: string,
): boolean {
  return nominations.some((nomination) => nomination.nomineeId === playerId);
}
