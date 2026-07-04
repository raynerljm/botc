import type { Character } from "./characters";
import { normalizeCharacterId } from "./scriptParser";

export const GAME_SCHEMA_VERSION = 1;

export type Alignment = "good" | "evil";

export interface BagToken {
  id: string;
  characterId: string;
  // True for the extra Townsfolk-styled token that stands in for the Drunk —
  // the player believes they are that Townsfolk (CONTEXT.md: Stand-in).
  isDrunkStandIn: boolean;
}

// Free-drag position as a percentage of the board's width/height. Null means
// "not dragged" — the token renders at its computed circlePosition instead,
// so a re-circle is just clearing this back to null for everyone.
export interface PlayerPosition {
  x: number;
  y: number;
}

export interface Player {
  id: string;
  seat: number;
  name: string;
  characterId: string | null;
  isDrunk: boolean;
  isTraveller: boolean;
  travellerAlignment: Alignment | null;
  dead: boolean;
  // Only meaningful once dead, but kept on every player rather than added on
  // death so a player who dies twice in one game doesn't lose whether their
  // one ghost vote was already spent.
  ghostVoteSpent: boolean;
  position: PlayerPosition | null;
}

export interface GameDocument {
  schemaVersion: typeof GAME_SCHEMA_VERSION;
  scriptId: string;
  scriptName: string;
  players: Player[];
  // Undrawn/unassigned tokens, kept separate so a Traveller added later
  // never competes with the official-team draw pool (CONTEXT.md: Bag).
  bag: BagToken[];
  travellerBag: BagToken[];
  // Full character data for every character in the bag, not just official
  // ids — homebrew characters (from library or custom scripts) don't live in
  // the vendored dataset, so tokens/players resolve display info from here
  // instead of a global lookup.
  characterPool: Character[];
  // The script's own almanac link (script-tool _meta.almanac), used for the
  // character-detail popover on homebrew characters, which have no page on
  // the official wiki.
  almanacUrl: string | null;
  createdAt: string;
}

// The circle layout every seat without a dragged position renders at —
// evenly spaced starting from the top, matching a physical cloth circle.
export function circlePosition(index: number, total: number): PlayerPosition {
  const angle = (2 * Math.PI * index) / total - Math.PI / 2;
  const radius = 45;
  return {
    x: 50 + radius * Math.cos(angle),
    y: 50 + radius * Math.sin(angle),
  };
}

const DRUNK_ID = "drunk";

function defaultNewId(): string {
  return crypto.randomUUID();
}

// Shuffles the face-down draw pool each time a seat starts drawing — the
// tokens themselves carry no visible identity, so this only matters for
// fidelity to the physical bag-draw ritual (CONTEXT.md: Bag draw), not for
// correctness.
export function shuffleTokens<T>(
  items: T[],
  random: () => number = Math.random,
): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export interface BuildBagTokensInput {
  selectedCharacters: Character[];
  // The stand-in is picked from characters *not* selected for the bag (any
  // other Townsfolk on the script), so it's passed as its own object rather
  // than looked up among selectedCharacters.
  standIn: Character | null;
  extraCopies: Record<string, number>;
  newId?: () => string;
}

export interface BuiltBagTokens {
  officialTokens: BagToken[];
  travellerTokens: BagToken[];
}

// The Drunk never gets a physical token of its own — the player believes
// they are the stand-in Townsfolk, so that character's extra token fills
// the Drunk's slot instead (CONTEXT.md: Stand-in).
export function buildBagTokens({
  selectedCharacters,
  standIn,
  extraCopies,
  newId = defaultNewId,
}: BuildBagTokensInput): BuiltBagTokens {
  const officialTokens: BagToken[] = [];
  const travellerTokens: BagToken[] = [];

  for (const character of selectedCharacters) {
    if (character.team === "traveller") {
      travellerTokens.push({
        id: newId(),
        characterId: character.id,
        isDrunkStandIn: false,
      });
      continue;
    }
    if (normalizeCharacterId(character.id) === DRUNK_ID) continue;

    const copies = 1 + (extraCopies[character.id] ?? 0);
    for (let i = 0; i < copies; i++) {
      officialTokens.push({
        id: newId(),
        characterId: character.id,
        isDrunkStandIn: false,
      });
    }
  }

  const drunkSelected = selectedCharacters.some(
    (c) => normalizeCharacterId(c.id) === DRUNK_ID,
  );
  if (drunkSelected && standIn) {
    officialTokens.push({
      id: newId(),
      characterId: standIn.id,
      isDrunkStandIn: true,
    });
  }

  return { officialTokens, travellerTokens };
}

export interface CreateGameInput {
  scriptId: string;
  scriptName: string;
  playerCount: number;
  selectedCharacters: Character[];
  standIn: Character | null;
  extraCopies: Record<string, number>;
  almanacUrl?: string | null;
  createdAt?: string;
  newId?: () => string;
}

export function createGame({
  scriptId,
  scriptName,
  playerCount,
  selectedCharacters,
  standIn,
  extraCopies,
  almanacUrl = null,
  createdAt = new Date().toISOString(),
  newId = defaultNewId,
}: CreateGameInput): GameDocument {
  const { officialTokens, travellerTokens } = buildBagTokens({
    selectedCharacters,
    standIn,
    extraCopies,
    newId,
  });

  const players: Player[] = Array.from({ length: playerCount }, (_, i) => ({
    id: newId(),
    seat: i + 1,
    name: `Player ${i + 1}`,
    characterId: null,
    isDrunk: false,
    isTraveller: false,
    travellerAlignment: null,
    dead: false,
    ghostVoteSpent: false,
    position: null,
  }));

  const characterPool = Array.from(
    new Map(
      [...selectedCharacters, ...(standIn ? [standIn] : [])].map((c) => [
        c.id,
        c,
      ]),
    ).values(),
  );

  return {
    schemaVersion: GAME_SCHEMA_VERSION,
    scriptId,
    scriptName,
    players,
    bag: officialTokens,
    travellerBag: travellerTokens,
    characterPool,
    almanacUrl,
    createdAt,
  };
}
