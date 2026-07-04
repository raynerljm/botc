import type { Character } from "./characters";
import { seatedPlayerCount, type GameDocument } from "./gameDocument";
import { normalizeCharacterId } from "./scriptParser";

// CONTEXT.md: Night list — the ordered todo list of ability entries for the
// current night, derived from official night-order numbers.
export type NightPhase = "first" | "other";

export function phaseForNight(nightNumber: number): NightPhase {
  return nightNumber <= 1 ? "first" : "other";
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
  // True for a dead player's entry not yet un-skipped this night — dimmed
  // and auto-skipped in the UI, but always present in the list (never
  // hidden), per issue #16's acceptance criteria.
  skipped: boolean;
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
  // 0 dusk, 1 minion info, 2 demon info, 3 acting characters (by nightValue),
  // 4 non-acting characters (show-all only), 5 dawn.
  defaultBucket: number;
  nightValue: number;
}

function fixedEntry(id: string, bucket: number): RawEntry {
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
    skipped: false,
    defaultBucket: bucket,
    nightValue: bucket,
  };
}

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

  const raw: RawEntry[] = [fixedEntry(FIXED_DUSK, 0)];
  if (includeMinionDemonInfo) {
    raw.push(fixedEntry(FIXED_MINION_INFO, 1));
    raw.push(fixedEntry(FIXED_DEMON_INFO, 2));
  }

  for (const player of game.players) {
    if (!player.characterId) continue;
    const character = characterById.get(player.characterId);
    if (!character) continue;

    const nightValue = phase === "first" ? character.firstNight : character.otherNight;
    // A character explicitly named in the script's night-order override acts
    // tonight regardless of its dataset nightValue — the override itself is
    // the storyteller's evidence it belongs (e.g. a Demon like the Imp, whose
    // own firstNight is 0 because "Demon info" is the fixed step that
    // actually covers first night, still needs to appear when the script
    // places it explicitly).
    const overridden = metaRank(order, character.id, true) !== undefined;
    const acts = nightValue > 0 || overridden;
    if (!acts && !showAll) continue;

    raw.push({
      id: `char:${player.id}`,
      kind: "character",
      label: character.name,
      reminderText:
        phase === "first" ? character.firstNightReminder : character.otherNightReminder,
      characterId: character.id,
      playerId: player.id,
      playerName: player.name,
      dead: player.dead,
      isDrunk: player.isDrunk,
      skipped: player.dead && !unskippedIds.has(`char:${player.id}`),
      defaultBucket: acts ? 3 : 4,
      nightValue: acts ? nightValue : Number.MAX_SAFE_INTEGER,
    });
  }

  raw.push(fixedEntry(FIXED_DAWN, 5));

  const ranked = raw.map((entry) => ({
    entry,
    rank:
      entry.kind === "fixed"
        ? metaRank(order, FIXED_TOKEN_BY_ID[entry.id], false)
        : metaRank(order, entry.characterId!, true),
  }));

  ranked.sort((a, b) => {
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
    skipped: entry.skipped,
  }));
}
