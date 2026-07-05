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

// Folds today's nominations in the order they were recorded: a nomination
// only takes the block once its own tally meets its threshold, and only
// unseats the current block-holder by strictly beating their tally — an
// exact tie clears the block instead of leaving it be (CONTEXT.md: On the
// block). A nomination short of its own threshold never touches the block,
// even if its tally happens to match the current holder's.
export function computeBlock(
  nominations: Nomination[],
  players: Player[],
): string | null {
  let block: { nomineeId: string; tally: number } | null = null;

  for (const nomination of nominations) {
    const nominee = players.find((player) => player.id === nomination.nomineeId);
    if (!nominee) continue;

    const tally = nominationTally(nomination);
    if (tally < nominationThreshold(nominee, players)) continue;

    if (block === null || tally > block.tally) {
      block = { nomineeId: nomination.nomineeId, tally };
    } else if (tally === block.tally) {
      block = null;
    }
  }

  return block?.nomineeId ?? null;
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
