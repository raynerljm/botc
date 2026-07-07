import type { Character } from "./characters";
import { normalizeCharacterId } from "./scriptParser";

// Bumped for issue #14 (GameDocument gained the required `reminders` field),
// again for issue #15 (Player gained startingCharacterId, GameDocument
// gained activeFabled), again for issue #16 (GameDocument gained the
// night-list fields: night, nightOpen, nightChecked, nightUnskipped,
// firstNightOrder, otherNightOrder), again for issue #18 (Player gained
// `claim`, GameDocument gained `demonBluffs` and `scriptCharacters`), again
// for issue #20 (GameDocument gained `nominations`), again for issue #26
// (GameDocument gained the required `setupWalkthroughOffered`/
// `setupWalkthroughSteps` fields), again for issue #17 (Player gained
// `actsAs`/`actsAsSetOnNight`), again for issue #71 (ReminderToken gained the
// required `anchorPlayerId` field), again for issue #79 (GameDocument
// gained `demonBluffsCollapsed`/`claimsCollapsed`/`endGamePanelCollapsed`),
// and again for issue #108 (GameDocument gained the required `drawSession`
// field) — a document saved under an older shape must be rejected by
// gameStorage's version check rather than loaded with any of these fields
// silently undefined.
export const GAME_SCHEMA_VERSION = 12;

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

// One seat's turn in the pass-the-device bag draw (CONTEXT.md: Bag draw):
// choosing face-down tokens, privately looking at the drawn character, or
// holding the "pass the device on" privacy guard. Persisted in the game
// document — not React state — because the session is what keeps
// already-drawn identities masked, and a mid-ritual reload must restore
// that mask rather than render an open grimoire (issue #108).
export type DrawStage = "choosing" | "revealed" | "hidden";

export interface DrawSession {
  seatId: string;
  stage: DrawStage;
}

// How a persisted draw session comes back after a remount. A reload can't
// know who is holding the device, so a session saved mid-reveal resumes at
// the "hidden" privacy guard instead of re-rendering the identity — the
// drawn character was already committed to the seat when the reveal opened,
// so nothing is lost but the on-screen card.
export function resumeDrawSession(
  drawSession: DrawSession | null,
): DrawSession | null {
  if (drawSession?.stage !== "revealed") return drawSession;
  return { ...drawSession, stage: "hidden" };
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
  // Last concrete point this reminder sat at — the source of truth once it
  // isn't anchored (anchorPlayerId null), and the fallback if its anchor
  // player is later removed from the game.
  position: PlayerPosition;
  // The seat this reminder is parked beside, kept in sync with that seat's
  // position every render (issue #71: "chips visually anchor to their
  // owning seat ... attribution is unambiguous at 14+ players") — null for
  // a reminder placed generically from the pad-level button, or one the
  // storyteller has since dragged to a free-standing spot (a manual drag
  // always detaches it, the same way dragging a player token overrides its
  // computed circle position).
  anchorPlayerId: string | null;
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
  // The character whose ability this player resolves instead of (or in
  // addition to) their own — a target character id, or null when unset
  // (CONTEXT.md: Acts as; issue #17: Philosopher, Alchemist, Boffin,
  // homebrew ability-thieves).
  actsAs: string | null;
  // The night number (matching GameDocument.night + 1) at which actsAs was
  // last set. Only meaningful when actsAs is non-null — used to resolve a
  // first-night-only target chosen on a later night to a single one-shot
  // night-list entry rather than a recurring one (issue #17 AC).
  actsAsSetOnNight: number | null;
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
  // The in-flight bag draw, or null when no draw ritual is underway. Lives
  // in the document (ADR 0001: one serializable JSON object holds the
  // game's entire state) so the privacy mask survives a reload (issue #108).
  drawSession: DrawSession | null;
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
  // Collapsed/expanded state for the board's secondary panels, persisted so
  // it survives a reload (issue #79: a 15-player game's always-expanded
  // panels push mid-game controls several screen-heights below the board).
  // Demon bluffs and Claims are plain manual toggles, defaulting expanded to
  // match pre-#79 behavior. The end-game panel's default instead comes from
  // `isEndGamePanelCollapsed` below — null here means "follow that computed
  // default," with an explicit true/false recording a deliberate manual
  // toggle that should stick regardless of night progression.
  demonBluffsCollapsed: boolean;
  claimsCollapsed: boolean;
  endGamePanelCollapsed: boolean | null;
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

// A player's current live position — their explicit dragged position if
// set, otherwise their computed circle slot. Shared by every place outside
// the main board render loop that needs one seat's position (attaching or
// detaching a reminder, the setup walkthrough's reminder placement) so the
// "circle index needs seats sorted by seat number" rule lives in one place
// instead of being re-derived at each call site (code review finding).
export function livePlayerPosition(
  playerId: string,
  players: Player[],
): PlayerPosition {
  const player = players.find((p) => p.id === playerId);
  const sorted = [...players].sort((a, b) => a.seat - b.seat);
  return (
    player?.position ??
    circlePosition(
      sorted.findIndex((p) => p.id === playerId),
      sorted.length,
    )
  );
}

// A reminder parked beside a player (rather than dragged to an exact spot)
// lands a little to the right of them — the convention for "the storyteller
// parks it next to players" (issue #14 AC), reused wherever a reminder is
// placed programmatically rather than dropped by hand.
export function parkBeside(position: PlayerPosition): PlayerPosition {
  return { x: clampPct(position.x + 5), y: clampPct(position.y) };
}

// Spread of new unanchored reminders added from the pad-level "Add
// reminder" button (issue #71 AC: adding several never stacks them fully on
// top of each other) — a golden-angle spiral out from the pad's centre, so
// the first reminder still lands dead centre (matching every prior
// behaviour/test) but each one after it lands at a distinct, increasingly
// spread-out point instead of piling on the same spot. Takes the *actual*
// positions still on the pad (not a count) and walks the spiral until it
// finds a point clear of all of them — indexing by a plain count of
// currently-unanchored reminders would replay an earlier spiral point once
// attaching, detaching, or removing one shrinks that count back down,
// landing a new reminder squarely on an existing one (code review finding).
const PAD_SPIRAL_RADIUS_STEP = 8;
const PAD_SPIRAL_GOLDEN_ANGLE_DEG = 137.5;
const PAD_SPIRAL_MIN_SEPARATION_PCT = 6;

function padSpiralPoint(index: number): PlayerPosition {
  if (index <= 0) return { x: 50, y: 50 };
  const angle = (index * PAD_SPIRAL_GOLDEN_ANGLE_DEG * Math.PI) / 180;
  const radius = PAD_SPIRAL_RADIUS_STEP * Math.sqrt(index);
  return {
    x: clampPct(50 + radius * Math.cos(angle)),
    y: clampPct(50 + radius * Math.sin(angle)),
  };
}

export function nextPadReminderPosition(
  existingPositions: PlayerPosition[],
): PlayerPosition {
  for (let index = 0; index < 1000; index++) {
    const candidate = padSpiralPoint(index);
    const collides = existingPositions.some(
      (p) =>
        Math.hypot(p.x - candidate.x, p.y - candidate.y) <
        PAD_SPIRAL_MIN_SEPARATION_PCT,
    );
    if (!collides) return candidate;
  }
  return padSpiralPoint(existingPositions.length);
}

// Where a reminder anchored to a seat renders (issue #71): stacked straight
// below that seat's own token+name block rather than beside it, so it never
// covers the name label or intercepts a tap meant for the seat (AC), and a
// second/third reminder on the same seat stacks further down instead of
// overlapping the first. A small per-sibling horizontal fan rides along with
// the vertical stacking so seats near the bottom of the circle — where the
// vertical offset clamps to the pad's edge for every sibling alike — still
// separate them instead of collapsing onto the same clamped point (code
// review finding).
const ANCHOR_OFFSET_Y = 12;
const ANCHOR_STACK_STEP_Y = 6;
const ANCHOR_STACK_STEP_X = 3;

export function anchoredReminderPosition(
  anchorPosition: PlayerPosition,
  siblingIndex: number,
): PlayerPosition {
  return {
    x: clampPct(anchorPosition.x + siblingIndex * ANCHOR_STACK_STEP_X),
    y: clampPct(anchorPosition.y + ANCHOR_OFFSET_Y + siblingIndex * ANCHOR_STACK_STEP_Y),
  };
}

// The Drunk's true character (CONTEXT.md: Stand-in) — its id, exported so
// every place that special-cases the Drunk (bag building here, the reveal
// action and display in the grimoire components) shares one source of truth.
export const DRUNK_ID = "drunk";

// Every character id currently held by a seated player — the "who holds
// what" set several pickers filter against (GrimoireBoard's reminder
// picker, the setup walkthrough's stand-in reassignment) so it's computed
// once here instead of re-typing the null-filter at each call site.
export function heldCharacterIds(players: Player[]): Set<string> {
  return new Set(
    players
      .map((player) => player.characterId)
      .filter((id): id is string => id !== null),
  );
}

// A declared winner is what marks a game ended; `winner` and `endedAt` are
// always set (and cleared) together, so either can stand for "ended" — this
// helper keeps every call site reading the same one.
export function isGameEnded(game: GameDocument): boolean {
  return game.winner !== null;
}

// `night` is nights fully completed, not the current night number — 0 until
// the first night has actually ended, so >= 1 is exactly "past the first
// night" (issue #68's setup-decision banner, issue #79's end-game default).
export function firstNightEnded(game: GameDocument): boolean {
  return game.night >= 1;
}

// Storyteller-first default (issue #79 AC: "starts collapsed... until the
// first night has ended — but always manually openable"): collapsed while
// still in setup, expanded once play is underway, unless the storyteller has
// explicitly toggled it — a deliberate choice always wins over the default.
export function isEndGamePanelCollapsed(game: GameDocument): boolean {
  return game.endGamePanelCollapsed ?? !firstNightEnded(game);
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
    actsAs: null,
    actsAsSetOnNight: null,
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
    drawSession: null,
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
    demonBluffsCollapsed: false,
    claimsCollapsed: false,
    endGamePanelCollapsed: null,
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
