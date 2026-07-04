import type { Character } from "./characters";
import { normalizeCharacterId } from "./scriptParser";

// Bumped for issue #14: GameDocument gained the required `reminders` field
// — a document saved under the old shape must be rejected by gameStorage's
// version check rather than loaded with it silently undefined.
export const GAME_SCHEMA_VERSION = 3;

export type Alignment = "good" | "evil";

// Display text for an alignment (CONTEXT.md: Alignment is good or evil).
export function alignmentLabel(alignment: Alignment): string {
  return alignment === "good" ? "Good" : "Evil";
}

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

// A reminder token parked on the pad to track ability state (CONTEXT.md
// doesn't define this term separately from the token itself, but see issue
// #14: "the small tokens the storyteller parks next to players"). Unlike a
// Player, a reminder has no inherent default layout — position is always a
// concrete point, set once when the token is added.
export interface ReminderToken {
  id: string;
  // The character this reminder's text comes from, for grouping in the
  // picker and for wiki/almanac-style provenance. Null for a free-text
  // reminder that isn't tied to any character.
  characterId: string | null;
  label: string;
  position: PlayerPosition;
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
  // Stable per-game identity so several saved games can coexist on one device
  // (CONTEXT.md: Game document is the unit of persistence; a games list lets
  // more than one live at once).
  id: string;
  scriptId: string;
  scriptName: string;
  players: Player[];
  // Tokens tracking ability state, dragged freely around the pad rather than
  // owned by any one player (CONTEXT.md: Bag draw is the physical ritual
  // this app digitizes; reminder tokens are the physical ones storytellers
  // park next to players, but nothing here ties a reminder to a player id).
  reminders: ReminderToken[];
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
  // End-game state (issue #21). Null winner / null endedAt means the game is
  // still in progress; both are set together when the storyteller declares a
  // result. Notes is free text the storyteller can add at any time.
  winner: Alignment | null;
  endedAt: string | null;
  notes: string;
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

// A declared winner is what marks a game ended; `winner` and `endedAt` are
// always set (and cleared) together, so either can stand for "ended" — this
// helper keeps every call site reading the same one.
export function isGameEnded(game: GameDocument): boolean {
  return game.winner !== null;
}

// The distribution-table player count — travellers are extra and never counted
// (CONTEXT.md: Target counts).
export function seatedPlayerCount(game: GameDocument): number {
  return game.players.filter((player) => !player.isTraveller).length;
}

// Undo must be idempotent: two Undo taps fired before the banner's state
// update has rendered would otherwise both append the same removed token,
// leaving two reminders sharing one id.
export function withRestoredReminder(
  reminders: ReminderToken[],
  reminder: ReminderToken,
): ReminderToken[] {
  if (reminders.some((r) => r.id === reminder.id)) return reminders;
  return [...reminders, reminder];
}

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
    id: newId(),
    scriptId,
    scriptName,
    players,
    reminders: [],
    bag: officialTokens,
    travellerBag: travellerTokens,
    characterPool,
    almanacUrl,
    createdAt,
    winner: null,
    endedAt: null,
    notes: "",
  };
}
