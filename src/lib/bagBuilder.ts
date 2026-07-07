import type { Character } from "./characters";

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 15;
export const MAX_TRAVELLERS = 5;
// Teensyville scripts (BotC wiki "Behind the Curtain") are designed for 5-6
// players — their small character pools can't fill the standard distribution
// table above this.
export const TEENSYVILLE_MAX_PLAYERS = 6;

export interface TeamCounts {
  townsfolk: number;
  outsider: number;
  minion: number;
  demon: number;
}

// The official distribution table (Townsfolk/Outsider/Minion/Demon), fixed
// per player count. Demon is always exactly 1 in this 5-15 range; setup
// modifiers only ever trade Townsfolk against Outsiders or Minions.
const OFFICIAL_TARGET_COUNTS: Record<number, TeamCounts> = {
  5: { townsfolk: 3, outsider: 0, minion: 1, demon: 1 },
  6: { townsfolk: 3, outsider: 1, minion: 1, demon: 1 },
  7: { townsfolk: 5, outsider: 0, minion: 1, demon: 1 },
  8: { townsfolk: 5, outsider: 1, minion: 1, demon: 1 },
  9: { townsfolk: 5, outsider: 2, minion: 1, demon: 1 },
  10: { townsfolk: 7, outsider: 0, minion: 2, demon: 1 },
  11: { townsfolk: 7, outsider: 1, minion: 2, demon: 1 },
  12: { townsfolk: 7, outsider: 2, minion: 2, demon: 1 },
  13: { townsfolk: 9, outsider: 0, minion: 3, demon: 1 },
  14: { townsfolk: 9, outsider: 1, minion: 3, demon: 1 },
  15: { townsfolk: 9, outsider: 2, minion: 3, demon: 1 },
};

export function officialTargetCounts(playerCount: number): TeamCounts {
  const counts = OFFICIAL_TARGET_COUNTS[playerCount];
  if (!counts) {
    throw new Error(
      `No official target counts for ${playerCount} players (expected ${MIN_PLAYERS}-${MAX_PLAYERS}).`,
    );
  }
  return counts;
}

export interface SetupModifierOption {
  label: string;
  outsiderDelta: number;
  minionDelta: number;
}

export interface ParsedSetupModifier {
  bracketText: string;
  // One option = a fixed adjustment applied automatically. More than one
  // means the storyteller must choose which applies.
  options: SetupModifierOption[];
  // "+the X" style: requires another named character in play (Huntsman,
  // Choirboy) rather than adjusting a team count.
  requiresCharacterName?: string;
  // "+0 to +N" style: 0..N extra copies of the character itself (Village
  // Idiot) rather than a team count delta.
  extraCopies?: { min: number; max: number };
  // No structured delta could be parsed — display the bracket text as-is
  // (Atheist, Legion, Summoner, etc.) with no automatic adjustment.
  isFreeform: boolean;
}

const TEAM_LABEL: Record<"outsider" | "minion", string> = {
  outsider: "Outsider",
  minion: "Minion",
};

function pluralizedTeamLabel(team: "outsider" | "minion", n: number): string {
  const label = TEAM_LABEL[team];
  return Math.abs(n) === 1 ? label : `${label}s`;
}

function extractBracket(ability: string): string | null {
  const match = ability.match(/\[([^\]]+)]/);
  return match ? match[1].trim() : null;
}

export function parseSetupModifier(ability: string): ParsedSetupModifier | null {
  const bracketText = extractBracket(ability);
  if (!bracketText) return null;

  const rangeMatch = bracketText.match(/^[+-]?0\s+to\s+[+-]?(\d+)\b/i);
  if (rangeMatch) {
    return {
      bracketText,
      options: [],
      extraCopies: { min: 0, max: Number(rangeMatch[1]) },
      isFreeform: false,
    };
  }

  const requiresMatch = bracketText.match(/^\+\s*the\s+(.+)$/i);
  if (requiresMatch) {
    return {
      bracketText,
      options: [],
      requiresCharacterName: requiresMatch[1].trim(),
      isFreeform: false,
    };
  }

  const deltaMatch = bracketText.match(
    /^([+-]\d+)(?:\s+or\s+([+-]\d+))?\s+(outsiders?|minions?)$/i,
  );
  if (deltaMatch) {
    const team: "outsider" | "minion" = deltaMatch[3].toLowerCase().startsWith(
      "outsider",
    )
      ? "outsider"
      : "minion";
    const deltas = [deltaMatch[1], deltaMatch[2]].filter(
      (d): d is string => d !== undefined,
    );
    const options = deltas.map((delta) => {
      // Number("-0") is -0: normalize to plain 0 so neither the displayed
      // label nor the stored delta ever carries a spurious sign (Hermit's
      // "[-0 or -1 Outsider]" would otherwise show and store "-0 Outsiders").
      const n = Number(delta) === 0 ? 0 : Number(delta);
      const displayDelta = n === 0 ? "0" : delta;
      return {
        label: `${displayDelta} ${pluralizedTeamLabel(team, n)}`,
        outsiderDelta: team === "outsider" ? n : 0,
        minionDelta: team === "minion" ? n : 0,
      };
    });
    return { bracketText, options, isFreeform: false };
  }

  return { bracketText, options: [], isFreeform: true };
}

// Fills each team up to its target from the given character pool, leaving
// already-selected characters (and any team already at/over target) alone.
// Targets is a partial team map so callers can randomize any subset of
// teams — e.g. just Travellers, independently of the official 4-team counts.
export function randomizeBagSelection(
  pool: Character[],
  targets: Partial<Record<Character["team"], number>>,
  alreadySelected: Set<string>,
  random: () => number = Math.random,
): Set<string> {
  const result = new Set(alreadySelected);

  for (const team of Object.keys(targets) as Character["team"][]) {
    const teamCharacters = pool.filter((c) => c.team === team);
    const alreadyInTeam = teamCharacters.filter((c) =>
      result.has(c.id),
    ).length;
    let needed = (targets[team] ?? 0) - alreadyInTeam;
    if (needed <= 0) continue;

    const candidates = teamCharacters.filter((c) => !result.has(c.id));
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (const character of candidates) {
      if (needed <= 0) break;
      result.add(character.id);
      needed--;
    }
  }

  return result;
}

// Extra Outsiders/Minions always come at Townsfolk's expense — the total
// (excluding Travellers) stays equal to the player count. No team can be
// driven below 0: Outsider/Minion individually (e.g. Godfather's default
// "-1 Outsider" at a player count whose base Outsider target is already 0),
// and Townsfolk as the remainder (multiple stacked +Outsider/+Minion
// deltas — plausible with homebrew, or several official characters
// selected together — could otherwise push Outsider+Minion past
// playerCount-Demon). A negative target has no in-game meaning and would
// otherwise flip a counter to a spurious "over" state at 0 selected.
export function applySetupDeltas(
  playerCount: number,
  deltas: Pick<SetupModifierOption, "outsiderDelta" | "minionDelta">[],
): TeamCounts {
  const base = officialTargetCounts(playerCount);
  const outsider = Math.max(
    0,
    base.outsider + deltas.reduce((sum, d) => sum + d.outsiderDelta, 0),
  );
  const minion = Math.max(
    0,
    base.minion + deltas.reduce((sum, d) => sum + d.minionDelta, 0),
  );
  const demon = base.demon;
  const townsfolk = Math.max(0, playerCount - outsider - minion - demon);
  return { townsfolk, outsider, minion, demon };
}
