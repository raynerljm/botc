import type { Character } from "./characters";
import { normalizeCharacterId } from "./scriptParser";

// Bumped for issue #14 (GameDocument gained the required `reminders` field),
// again for issue #15 (Player gained startingCharacterId, GameDocument
// gained activeFabled), again for issue #16 (GameDocument gained the
// night-list fields: night, nightOpen, nightChecked, nightUnskipped,
// firstNightOrder, otherNightOrder), again for issue #18 (Player gained
// `claim`, GameDocument gained `demonBluffs` and `scriptCharacters`), again
// for issue #20 (GameDocument gained `nominations`), and again for issue #26
// (GameDocument gained the required `setupWalkthroughOffered`/
// `setupWalkthroughSteps` fields) — a document saved under an older shape
// must be rejected by gameStorage's version check rather than loaded with
// any of these fields silently undefined.
export const GAME_SCHEMA_VERSION = 8;

// Demon bluffs are a fixed 3-slot panel (CONTEXT.md: "Exactly three slots,
// script-wide, not per-player"), not an open-ended list.
export const DEMON_BLUFF_SLOTS = 3;

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

// Progress bookkeeping for the post-draw setup walkthrough (issue #26). The
// decisions themselves (red herring, grandchild, twin, ...) live only as
// ordinary ReminderTokens — this is just which steps the storyteller has
// already resolved, keyed by the holding player's id (stable across
// re-renders since each step is derived fresh from players/characterPool
// every time). Absence of a key means "not yet visited."
export type SetupWalkthroughStepStatus = "answered" | "skipped";

// A nomination recorded today (CONTEXT.md: Nomination) — tracked for the
// current day only, with no history kept once dawn resets it (ADR 0002).
export interface Nomination {
  id: string;
  nominatorId: string;
  nomineeId: string;
  // Every player id who voted for this nomination, in the order recorded.
  votes: string[];
}

export interface Player {
  id: string;
  seat: number;
  name: string;
  characterId: string | null;
  // Set once, the first time a character reaches this seat (draw, manual
  // assignment, or a mid-game add), and never touched again — swaps only
  // ever change characterId. Lets the export tell a starting character from
  // a final one that diverged (CONTEXT.md: Starting character/Final
  // character, issue #15).
  startingCharacterId: string | null;
  isDrunk: boolean;
  isTraveller: boolean;
  travellerAlignment: Alignment | null;
  dead: boolean;
  // Only meaningful once dead, but kept on every player rather than added on
  // death so a player who dies twice in one game doesn't lose whether their
  // one ghost vote was already spent.
  ghostVoteSpent: boolean;
  position: PlayerPosition | null;
  // The character this player is currently presenting as, good or evil
  // alike (CONTEXT.md: Claim). Current claim only — no history, matching a
  // finished game's export (ADR 0002 spirit).
  claim: string | null;
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
  // Whether the auto-offer to start the setup walkthrough has already been
  // shown & resolved once (Start or Decline) — prevents it from popping up
  // again on every visit to an already-set-up game (issue #26 AC: "declining
  // it is one tap"). Re-entering the walkthrough later is always available
  // regardless of this flag.
  setupWalkthroughOffered: boolean;
  setupWalkthroughSteps: Record<string, SetupWalkthroughStepStatus>;
  // Undrawn/unassigned tokens, kept separate so a Traveller added later
  // never competes with the official-team draw pool (CONTEXT.md: Bag).
  bag: BagToken[];
  travellerBag: BagToken[];
  // Full character data for every character in the bag, not just official
  // ids — homebrew characters (from library or custom scripts) don't live in
  // the vendored dataset, so tokens/players resolve display info from here
  // instead of a global lookup.
  characterPool: Character[];
  // Every character the script offered at bag-build time, whether or not it
  // made the bag — unlike characterPool, this is the universe a "not in
  // play" distinction needs (e.g. Demon bluffs). Captured once here because
  // resolving a script by id needs filesystem access the client-only /game
  // route doesn't have (ADR 0001).
  scriptCharacters: Character[];
  // The three not-in-play good characters shown to the Demon on the first
  // night (CONTEXT.md: Demon bluffs) — a fixed DEMON_BLUFF_SLOTS-length
  // array of character ids, null where a slot hasn't been filled yet.
  demonBluffs: (string | null)[];
  // The script's own almanac link (script-tool _meta.almanac), used for the
  // character-detail popover on homebrew characters, which have no page on
  // the official wiki.
  almanacUrl: string | null;
  // Fabled currently in play (character ids), shown outside the circle —
  // they're storyteller aids, not held by any player (issue #15).
  activeFabled: string[];
  // The script's own night-order overrides (script-tool _meta.firstNight/
  // otherNight): ordered lists of character ids and the special tokens
  // "dusk"/"minioninfo"/"demoninfo"/"dawn". Null when the script didn't
  // provide one, in which case the night list falls back to the vendored
  // dataset's per-character night positions (CONTEXT.md: Night list).
  firstNightOrder: string[] | null;
  otherNightOrder: string[] | null;
  createdAt: string;
  // End-game state (issue #21). Null winner / null endedAt means the game is
  // still in progress; both are set together when the storyteller declares a
  // result. Notes is free text the storyteller can add at any time.
  winner: Alignment | null;
  endedAt: string | null;
  notes: string;
  // Nights fully completed (0 before the first night ever starts). While
  // `nightOpen` is true, the storyteller is currently walking night
  // `night + 1`'s checklist.
  night: number;
  nightOpen: boolean;
  // Check-off/un-skip state for the currently open night only — reset to
  // empty every time a new night starts, so a fresh night always begins with
  // every box unchecked (issue #16 AC: "Start night" opens with boxes
  // cleared).
  nightChecked: string[];
  nightUnskipped: string[];
  // Today's nominations only (CONTEXT.md: "tracked for the current day
  // only") — cleared whenever a night ends and the next day begins (issue
  // #20 AC: "nomination eligibility resets at dawn").
  nominations: Nomination[];
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

// Keeps a token's centre within the pad instead of off the edge. Shared by
// every place that computes a drop position (GrimoireBoard's drag handling
// and reminder placement, the setup walkthrough's reminder placement) so the
// pad's usable bounds are defined once.
export function clampPct(value: number): number {
  return Math.min(96, Math.max(4, value));
}

// A reminder parked beside a player (rather than dragged to an exact spot)
// lands a little to the right of them — the convention for "the storyteller
// parks it next to players" (issue #14 AC), reused wherever a reminder is
// placed programmatically rather than dropped by hand.
export function parkBeside(position: PlayerPosition): PlayerPosition {
  return { x: clampPct(position.x + 5), y: clampPct(position.y) };
}

// The Drunk's true character (CONTEXT.md: Stand-in) — its id, exported so
// every place that special-cases the Drunk (bag building here, the reveal
// action and display in the grimoire components) shares one source of truth.
export const DRUNK_ID = "drunk";

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
  firstNightOrder?: string[] | null;
  otherNightOrder?: string[] | null;
  createdAt?: string;
  newId?: () => string;
  // The script's full character list, selected or not (BagBuilder already
  // has this from its own `characters` prop). Defaults to just the selected
  // characters, so a caller that doesn't have the full script on hand still
  // gets a valid document — it just can't offer any "not in play" options.
  scriptCharacters?: Character[];
}

export function createGame({
  scriptId,
  scriptName,
  playerCount,
  selectedCharacters,
  standIn,
  extraCopies,
  almanacUrl = null,
  firstNightOrder = null,
  otherNightOrder = null,
  createdAt = new Date().toISOString(),
  newId = defaultNewId,
  scriptCharacters = selectedCharacters,
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
    startingCharacterId: null,
    isDrunk: false,
    isTraveller: false,
    travellerAlignment: null,
    dead: false,
    ghostVoteSpent: false,
    position: null,
    claim: null,
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
    setupWalkthroughOffered: false,
    setupWalkthroughSteps: {},
    bag: officialTokens,
    travellerBag: travellerTokens,
    characterPool,
    scriptCharacters,
    demonBluffs: Array.from({ length: DEMON_BLUFF_SLOTS }, () => null),
    almanacUrl,
    activeFabled: [],
    firstNightOrder,
    otherNightOrder,
    createdAt,
    winner: null,
    endedAt: null,
    notes: "",
    night: 0,
    nightOpen: false,
    nightChecked: [],
    nightUnskipped: [],
    nominations: [],
  };
}

// Makes room at `seat` by bumping every seat at or past it up by one, so a
// newly created player can take that seat number without colliding — seat
// order matters mechanically (CONTEXT.md: Seat), so a mid-game addition has
// to land at a chosen position rather than always the end (issue #15).
export function insertAtSeat(players: Player[], seat: number): Player[] {
  return players.map((player) =>
    player.seat >= seat ? { ...player, seat: player.seat + 1 } : player,
  );
}
