import charactersJson from "@/data/characters.json";

export type Team =
  | "townsfolk"
  | "outsider"
  | "minion"
  | "demon"
  | "traveller"
  | "fabled"
  | "loric";

export type BaseEditionId = "tb" | "bmr" | "snv";

export interface Jinx {
  id: string;
  reason: string;
}

export interface Character {
  id: string;
  name: string;
  edition: BaseEditionId | null;
  team: Team;
  ability: string;
  firstNight: number;
  firstNightReminder: string;
  otherNight: number;
  otherNightReminder: string;
  reminders: string[];
  remindersGlobal: string[];
  setup: boolean;
  jinxes: Jinx[];
  image: string | null;
}

export const allCharacters = charactersJson as Character[];

export interface BaseEdition {
  id: BaseEditionId;
  name: string;
}

export const baseEditions: BaseEdition[] = [
  { id: "tb", name: "Trouble Brewing" },
  { id: "bmr", name: "Bad Moon Rising" },
  { id: "snv", name: "Sects & Violets" },
];

const charactersById = new Map(allCharacters.map((c) => [c.id, c]));

export function getCharacter(id: string): Character | undefined {
  return charactersById.get(id);
}

// The vendored dataset (src/data/characters.json) is sorted alphabetically by
// id, not in official script order, so each base edition needs its own
// explicit reading order — grouped by team, matching the official character
// sheet (script.bloodontheclocktower.com). Runtime-uploaded scripts don't
// need this: parseScript already preserves the uploaded JSON's own order.
const EDITION_CHARACTER_ORDER: Record<BaseEditionId, string[]> = {
  tb: [
    "washerwoman", "librarian", "investigator", "chef", "empath",
    "fortuneteller", "undertaker", "monk", "ravenkeeper", "virgin", "slayer",
    "soldier", "mayor",
    "butler", "drunk", "recluse", "saint",
    "poisoner", "spy", "scarletwoman", "baron",
    "imp",
    "bureaucrat", "thief", "gunslinger", "scapegoat", "beggar",
  ],
  bmr: [
    "grandmother", "sailor", "chambermaid", "exorcist", "innkeeper",
    "gambler", "gossip", "courtier", "professor", "minstrel", "tealady",
    "pacifist", "fool",
    "tinker", "moonchild", "goon", "lunatic",
    "godfather", "devilsadvocate", "assassin", "mastermind",
    "zombuul", "pukka", "shabaloth", "po",
    "apprentice", "matron", "judge", "bishop", "voudon",
  ],
  snv: [
    "clockmaker", "dreamer", "snakecharmer", "mathematician", "flowergirl",
    "towncrier", "oracle", "savant", "seamstress", "philosopher", "artist",
    "juggler", "sage",
    "mutant", "sweetheart", "barber", "klutz",
    "eviltwin", "witch", "cerenovus", "pithag",
    "fanggu", "vigormortis", "nodashii", "vortox",
    "barista", "harlot", "butcher", "bonecollector", "deviant",
  ],
};

export function getEditionCharacters(editionId: BaseEditionId): Character[] {
  return EDITION_CHARACTER_ORDER[editionId].map((id) => {
    const character = charactersById.get(id);
    if (!character) {
      throw new Error(
        `Unknown character id "${id}" in edition order for "${editionId}"`,
      );
    }
    return character;
  });
}

// Value equality against the vendored dataset, not object identity — a game
// document round-tripped through localStorage (JSON.parse) never has the
// same object references as the imported dataset, even for a genuinely
// official character. A homebrew character reusing an official id but with
// its own name/ability differs in value, so it correctly reads as not
// official.
export function isOfficialCharacter(character: Character): boolean {
  const official = getCharacter(character.id);
  return official !== undefined && JSON.stringify(official) === JSON.stringify(character);
}

export const teamOrder: Team[] = [
  "townsfolk",
  "outsider",
  "minion",
  "demon",
  "traveller",
  "fabled",
  "loric",
];

export const teamNames: Record<Team, string> = {
  townsfolk: "Townsfolk",
  outsider: "Outsiders",
  minion: "Minions",
  demon: "Demons",
  traveller: "Travellers",
  fabled: "Fabled",
  loric: "Loric",
};

export interface TeamGroup {
  team: Team;
  characters: Character[];
}

export function groupByTeam(characters: Character[]): TeamGroup[] {
  return teamOrder
    .map((team) => ({
      team,
      characters: characters.filter((c) => c.team === team),
    }))
    .filter((group) => group.characters.length > 0);
}

// Teams a single seat can actually hold. Travellers carry their own explicit
// alignment field rather than deriving it from a character's team, so
// swapping a non-traveller seat to one would leave isTraveller/
// travellerAlignment unset and the export unable to derive an alignment at
// all; Fabled/Loric are storyteller aids never held by any player. Shared by
// the mid-game "Add character" flow and the "Swap character" picker (issue
// #15) so both stay in sync.
export const SEAT_HOLDING_TEAMS: Team[] = [
  "townsfolk",
  "outsider",
  "minion",
  "demon",
];

// "Good" by team, not by a player's tracked alignment (CONTEXT.md:
// Alignment) — shared by every storyteller-facing "pick a good character"
// picker (Demon bluffs, Philosopher/Boffin's acts-as target) so the two
// definitions can't drift apart.
export const GOOD_TEAMS: ReadonlySet<Team> = new Set(["townsfolk", "outsider"]);

// The "script's characters first, then everything in the dataset" picker
// pool (issue #15: swap, mid-game add, Fabled) — a script's own characters
// (including homebrew ones with no vendored entry) take priority so the
// game actually in play is one tap away, with every other official
// character still reachable underneath.
export function characterPickerPool(
  scriptCharacters: Character[],
  team?: Team,
): Character[] {
  const inTeam = (c: Character) => !team || c.team === team;
  const byId = new Map<string, Character>();
  for (const character of scriptCharacters) {
    if (inTeam(character)) byId.set(character.id, character);
  }
  for (const character of allCharacters) {
    if (inTeam(character) && !byId.has(character.id)) {
      byId.set(character.id, character);
    }
  }
  return [...byId.values()];
}

export function wikiUrl(character: Character): string {
  // encodeURIComponent leaves apostrophes unescaped (they're in its
  // unreserved set), so "Devil's Advocate" needs an explicit replace too.
  const encoded = encodeURIComponent(
    character.name.replace(/ /g, "_"),
  ).replace(/'/g, "%27");
  return `https://wiki.bloodontheclocktower.com/${encoded}`;
}
