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

export function getEditionCharacters(editionId: BaseEditionId): Character[] {
  return allCharacters.filter((c) => c.edition === editionId);
}

const charactersById = new Map(allCharacters.map((c) => [c.id, c]));

export function getCharacter(id: string): Character | undefined {
  return charactersById.get(id);
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

export function wikiUrl(character: Character): string {
  // encodeURIComponent leaves apostrophes unescaped (they're in its
  // unreserved set), so "Devil's Advocate" needs an explicit replace too.
  const encoded = encodeURIComponent(
    character.name.replace(/ /g, "_"),
  ).replace(/'/g, "%27");
  return `https://wiki.bloodontheclocktower.com/${encoded}`;
}
