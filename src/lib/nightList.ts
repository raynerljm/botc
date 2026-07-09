import type { Character } from "./characters";
import { seatedPlayerCount, type GameDocument } from "./gameDocument";
import { normalizeCharacterId } from "./scriptParser";

// CONTEXT.md: Night list — the ordered todo list of ability entries for the
// current night, derived from official night-order numbers.
export type NightPhase = "first" | "other";

export function phaseForNight(nightNumber: number): NightPhase {
  return nightNumber <= 1 ? "first" : "other";
}

// The night currently open, or the one "Start night" would open next —
// nights fully completed plus one. The single source of every place that
// needs "which night is this" (the heading, computeNightList's own one-shot
// acts-as check, and setting an acts-as target mid-game).
export function currentNightNumber(game: GameDocument): number {
  return game.night + 1;
}

// The night-list entry id for a player's own character, and for an acts-as
// entry borrowing another character's ability — the one place both are
// built, so nightChecked/nightUnskipped pruning elsewhere (GrimoireSetup.tsx)
// can't drift out of step with what computeNightList actually generates.
export function charEntryId(playerId: string): string {
  return `char:${playerId}`;
}

export function actsAsEntryId(playerId: string): string {
  return `actsas:${playerId}`;
}

export interface NightListEntry {
  id: string;
  kind: "fixed" | "character";
  label: string;
  reminderText: string;
  characterId: string | null;
  playerId: string | null;
  playerName: string | null;
  dead: boolean;
  isDrunk: boolean;
  // Same mechanic as isDrunk, for the Lunatic's Demon stand-in (issue #163)
  // — flags a fake wake so the storyteller runs it as the Lunatic's ritual
  // rather than a real demon action.
  isLunatic: boolean;
  // True for a dead player's entry not yet un-skipped this night — dimmed
  // and auto-skipped in the UI, but always present in the list (never
  // hidden), per issue #16's acceptance criteria.
  skipped: boolean;
  // Set only for an acts-as entry (CONTEXT.md: Acts as) — the acting
  // player's own actual character id (e.g. the Philosopher), distinct from
  // `characterId`, which stays the *target* character whose ability and
  // reminder text this entry represents. Lets the UI show the physical
  // token to wake (the player's own character) while attributing the
  // ability to the character it was borrowed from (issue #17 AC).
  actingCharacterId: string | null;
}

const FIXED_DUSK = "fixed:dusk";
const FIXED_MINION_INFO = "fixed:minion-info";
const FIXED_DEMON_INFO = "fixed:demon-info";
const FIXED_DAWN = "fixed:dawn";

// The official script-tool's _meta.firstNight/otherNight arrays reference
// these fixed steps by lowercase token, alongside character ids.
const FIXED_TOKEN_BY_ID: Record<string, string> = {
  [FIXED_DUSK]: "dusk",
  [FIXED_MINION_INFO]: "minioninfo",
  [FIXED_DEMON_INFO]: "demoninfo",
  [FIXED_DAWN]: "dawn",
};

const FIXED_LABEL: Record<string, string> = {
  [FIXED_DUSK]: "Dusk",
  [FIXED_MINION_INFO]: "Minion info",
  [FIXED_DEMON_INFO]: "Demon info",
  [FIXED_DAWN]: "Dawn",
};

const FIXED_REMINDER: Record<string, string> = {
  [FIXED_DUSK]: "Everybody, close your eyes.",
  [FIXED_MINION_INFO]:
    "Wake all Minions. Show them the Demon player, then put them back to sleep.",
  [FIXED_DEMON_INFO]:
    "Wake the Demon. Show them their Minions and three not-in-play good characters (the bluffs), then put them back to sleep.",
  [FIXED_DAWN]: "Everybody, open your eyes. Good morning!",
};

// The 7-player threshold below which evil players are assumed to already
// know each other, so the Minion/Demon info steps are skipped entirely
// (CONTEXT.md: Target counts use the same seated, non-traveller count).
export function minionDemonInfoEligible(game: GameDocument): boolean {
  return seatedPlayerCount(game) >= 7;
}

interface RawEntry extends NightListEntry {
  // Sort key used when no _meta override places this entry explicitly:
  // 0 dusk, 3 minion info / demon info / acting characters (by nightValue,
  // the vendored dataset's shared first-night scale), 4 non-acting
  // characters (show-all only), 5 dawn.
  defaultBucket: number;
  nightValue: number;
  // A character entry's _meta override rank, computed once where it's also
  // needed to decide whether the character acts tonight, and reused for
  // sorting so the two can't drift apart. Undefined for fixed entries (their
  // rank is looked up separately, keyed by their fixed token).
  overrideRank?: number;
}

function fixedEntry(id: string, bucket: number, nightValue: number): RawEntry {
  return {
    id,
    kind: "fixed",
    label: FIXED_LABEL[id],
    reminderText: FIXED_REMINDER[id],
    characterId: null,
    playerId: null,
    playerName: null,
    dead: false,
    isDrunk: false,
    isLunatic: false,
    skipped: false,
    actingCharacterId: null,
    defaultBucket: bucket,
    nightValue,
  };
}

// Shared with the acting/non-acting character entries below, so Minion info
// and Demon info sort by nightValue against characters instead of pinning
// ahead of them in their own buckets.
const ACTING_BUCKET = 3;
const NOT_ACTING_BUCKET = 4;

// Minion/Demon info sit on the same numeric first-night scale as acting
// characters (vendored dataset: Minion info ≈ 5, Demon info ≈ 8), not in
// buckets ahead of every character — e.g. Sects & Violets' Philosopher (2)
// and Trouble Brewing's Bureaucrat/Thief (1) act before Minion info, while
// Snitch (6) and Lunatic (7) act between the two info steps. Placed at the
// midpoint of that gap (4.5, 7.5) rather than the dataset's own 5/8, so they
// can never land on a real character's (always-integer) firstNight/otherNight
// and fall back to alphabetical order — e.g. the Summoner's firstNight is 8,
// exactly the info steps' approximate position.
const MINION_INFO_NIGHT_VALUE = 4.5;
const DEMON_INFO_NIGHT_VALUE = 7.5;

// Index of `key` within a script's _meta night-order override, or undefined
// if the override is absent or doesn't mention this entry. Character ids are
// matched with the same normalization the rest of script parsing uses;
// fixed-step tokens are matched case-insensitively.
function metaRank(
  order: string[] | null,
  key: string,
  isCharacter: boolean,
): number | undefined {
  if (!order) return undefined;
  const target = isCharacter ? normalizeCharacterId(key) : key.toLowerCase();
  for (let i = 0; i < order.length; i++) {
    const raw = order[i].trim();
    const normalized = isCharacter ? normalizeCharacterId(raw) : raw.toLowerCase();
    if (normalized === target) return i;
  }
  return undefined;
}

export interface ComputeNightListInput {
  game: GameDocument;
  characterById: Map<string, Character>;
  phase: NightPhase;
  // Show-all reveals in-game characters with no action tonight (nightValue
  // 0), which are hidden by default so the walkthrough isn't cluttered with
  // steps that don't apply.
  showAll: boolean;
  unskippedIds: ReadonlySet<string>;
}

interface NightAction {
  nightValue: number;
  overrideRank: number | undefined;
  acts: boolean;
  reminderText: string;
}

// Shared by a character's own entry and an acts-as entry borrowing another
// character's ability — both need the identical "does it act tonight, where
// does it sort, which reminder text applies" derivation, so the two can't
// drift apart (issue #17 code review). `oneShot` is only relevant to
// acts-as: a target with no position this phase is still treated as acting,
// at its first-night value, when it was set on exactly this night and truly
// has a first-night position — by dataset value *or* by a script's own
// night-order override, matching how `acts` itself already honors overrides.
function resolveNightAction(
  character: Character,
  phase: NightPhase,
  order: string[] | null,
  firstNightOrder: string[] | null,
  oneShot: boolean,
): NightAction {
  const primaryValue = phase === "first" ? character.firstNight : character.otherNight;
  const overrideRankThisPhase = metaRank(order, character.id, true);
  const actsPrimary = primaryValue > 0 || overrideRankThisPhase !== undefined;

  const firstNightOverrideRank = metaRank(firstNightOrder, character.id, true);
  const oneShotEligible =
    !actsPrimary &&
    phase === "other" &&
    oneShot &&
    (character.firstNight > 0 || firstNightOverrideRank !== undefined);

  const acts = actsPrimary || oneShotEligible;
  const nightValue = actsPrimary
    ? primaryValue
    : oneShotEligible
      ? character.firstNight
      : Number.MAX_SAFE_INTEGER;
  // A one-shot eligibility that comes purely from a first-night override
  // (character.firstNight is 0 in the dataset) has no meaningful nightValue
  // to sort by — surface that override's own rank instead, so it sorts via
  // the same rank-supremacy path any script-named character already gets,
  // rather than a bare nightValue of 0 sorting it before every real actor.
  const overrideRank =
    overrideRankThisPhase ?? (oneShotEligible ? firstNightOverrideRank : undefined);
  const reminderText =
    phase === "first" || oneShotEligible
      ? character.firstNightReminder
      : character.otherNightReminder;

  return { nightValue, overrideRank, acts, reminderText };
}

export function computeNightList({
  game,
  characterById,
  phase,
  showAll,
  unskippedIds,
}: ComputeNightListInput): NightListEntry[] {
  const order = phase === "first" ? game.firstNightOrder : game.otherNightOrder;
  const includeMinionDemonInfo =
    phase === "first" && minionDemonInfoEligible(game);

  // Needed to resolve a first-night-only acts-as target chosen on a later
  // night to the one specific night it was set (issue #17 AC), not every
  // night thereafter.
  const nightNumber = currentNightNumber(game);

  const raw: RawEntry[] = [fixedEntry(FIXED_DUSK, 0, 0)];
  if (includeMinionDemonInfo) {
    raw.push(fixedEntry(FIXED_MINION_INFO, ACTING_BUCKET, MINION_INFO_NIGHT_VALUE));
    raw.push(fixedEntry(FIXED_DEMON_INFO, ACTING_BUCKET, DEMON_INFO_NIGHT_VALUE));
  }

  for (const player of game.players) {
    if (!player.characterId) continue;
    // Once a player has an acts-as target, their own character's generic
    // entry is suppressed — the ability they'd otherwise be walked through
    // (e.g. the Philosopher's own "choose an ability" prompt) is replaced by
    // the acts-as entry generated below (issue #17 AC) — but show-all still
    // reveals it, same as every other non-acting entry, so it stays a full
    // reference view rather than gaining an unconditionally hidden case.
    if (player.actsAs && !showAll) continue;
    const character = characterById.get(player.characterId);
    if (!character) continue;

    const action = resolveNightAction(character, phase, order, null, false);
    if (!action.acts && !showAll) continue;

    raw.push({
      id: charEntryId(player.id),
      kind: "character",
      label: character.name,
      reminderText: action.reminderText,
      characterId: character.id,
      playerId: player.id,
      playerName: player.name,
      dead: player.dead,
      isDrunk: player.isDrunk,
      isLunatic: player.isLunatic,
      skipped: player.dead && !unskippedIds.has(charEntryId(player.id)),
      actingCharacterId: null,
      defaultBucket: action.acts ? ACTING_BUCKET : NOT_ACTING_BUCKET,
      nightValue: action.nightValue,
      overrideRank: action.overrideRank,
    });
  }

  for (const player of game.players) {
    if (!player.actsAs) continue;
    const target = characterById.get(player.actsAs);
    if (!target) continue;

    const oneShot = player.actsAsSetOnNight === nightNumber;
    const action = resolveNightAction(target, phase, order, game.firstNightOrder, oneShot);
    if (!action.acts && !showAll) continue;

    raw.push({
      id: actsAsEntryId(player.id),
      kind: "character",
      label: target.name,
      reminderText: action.reminderText,
      characterId: target.id,
      actingCharacterId: player.characterId,
      playerId: player.id,
      playerName: player.name,
      dead: player.dead,
      isDrunk: player.isDrunk,
      isLunatic: player.isLunatic,
      skipped: player.dead && !unskippedIds.has(actsAsEntryId(player.id)),
      defaultBucket: action.acts ? ACTING_BUCKET : NOT_ACTING_BUCKET,
      nightValue: action.nightValue,
      overrideRank: action.overrideRank,
    });
  }

  raw.push(fixedEntry(FIXED_DAWN, 5, 5));

  const ranked = raw.map((entry) => ({
    entry,
    rank:
      entry.kind === "fixed"
        ? metaRank(order, FIXED_TOKEN_BY_ID[entry.id], false)
        : entry.overrideRank,
  }));

  ranked.sort((a, b) => {
    // Dusk and Dawn are physical bookends of the night — nothing happens
    // before eyes close or after the sun rises — so they stay pinned first
    // and last regardless of any override rank. Without this, a partial
    // _meta night order (naming Dawn but omitting real acting characters,
    // or naming one character without any fixed-step tokens at all) could
    // sort Dawn before those characters' actions, or a lone ranked
    // character ahead of Dusk.
    if (a.entry.id !== FIXED_DUSK && b.entry.id === FIXED_DUSK) return 1;
    if (a.entry.id === FIXED_DUSK && b.entry.id !== FIXED_DUSK) return -1;
    if (a.entry.id !== FIXED_DAWN && b.entry.id === FIXED_DAWN) return -1;
    if (a.entry.id === FIXED_DAWN && b.entry.id !== FIXED_DAWN) return 1;
    if (a.rank !== undefined && b.rank !== undefined) return a.rank - b.rank;
    if (a.rank !== undefined) return -1;
    if (b.rank !== undefined) return 1;
    if (a.entry.defaultBucket !== b.entry.defaultBucket) {
      return a.entry.defaultBucket - b.entry.defaultBucket;
    }
    if (a.entry.nightValue !== b.entry.nightValue) {
      return a.entry.nightValue - b.entry.nightValue;
    }
    return a.entry.label.localeCompare(b.entry.label);
  });

  return ranked.map(({ entry }) => ({
    id: entry.id,
    kind: entry.kind,
    label: entry.label,
    reminderText: entry.reminderText,
    characterId: entry.characterId,
    playerId: entry.playerId,
    playerName: entry.playerName,
    dead: entry.dead,
    isDrunk: entry.isDrunk,
    isLunatic: entry.isLunatic,
    skipped: entry.skipped,
    actingCharacterId: entry.actingCharacterId,
  }));
}
