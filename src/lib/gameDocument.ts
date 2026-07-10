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
// again for issue #113 (Nomination gained the required `threshold` field),
// again for issue #114 (Nomination gained the required `isExile` field),
// and again for issue #108 (GameDocument gained the required `drawSession`
// field), again for issue #168 (GameDocument gained the required
// `nightListCollapsed`/`dayPhaseCollapsed` fields), again for issue #165
// (GameDocument gained the required `lastEndedNightSnapshot` field), and
// again for issue #163 (Player gained the required `isLunatic` field) — a
// document saved under an older shape must be rejected by gameStorage's
// version check rather than loaded with any of these fields silently
// undefined.
//
// Not bumped for issue #189 (GameDocument lost the `claimsCollapsed` field,
// the bottom Claims panel it toggled having been removed): unlike every
// bump above, a field going away can't leave an old document with anything
// silently undefined — a v17 save just carries one harmless, never-read
// extra key. Bumping here would only cost every storyteller with a game in
// progress their one and only saved copy (ADR 0001: client-only, single
// document, no server backup) for no compatibility gain.
//
// Bumped again for issue #190 (GameDocument gained the required `dayTimer`
// field).
export const GAME_SCHEMA_VERSION = 18;

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
  // Same mechanic as isDrunkStandIn, for the Lunatic's Demon stand-in
  // (issue #163): the extra Demon-styled token the Lunatic's player believes
  // they are.
  isLunaticStandIn: boolean;
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
// so nothing is lost but the on-screen card. Written as an allowlist
// ("choosing" is the only stage safe to re-render) rather than coercing the
// one known-dangerous stage, so a future privacy-sensitive stage resumes at
// the guard by default instead of needing this line remembered — the same
// fail-closed reasoning as GrimoireSetup's screenObscured.
export function resumeDrawSession(
  drawSession: DrawSession | null,
): DrawSession | null {
  if (drawSession === null || drawSession.stage === "choosing") {
    return drawSession;
  }
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
  // The execution/exile threshold as it stood when this nomination was
  // recorded (CONTEXT.md: On the block/Exile). Snapshotted rather than
  // recomputed against the current player list, so a later death mid-day
  // can't rewrite a past tally's threshold or move the block (issue #113).
  threshold: number;
  // Whether this was an exile call (the nominee was a Traveller) rather
  // than an execution nomination, snapshotted at record time for the same
  // reason as threshold: an exile never competes for the block, spends a
  // nomination, or spends a ghost vote (CONTEXT.md: Exile), and that must
  // hold even if the nominee later leaves the roster entirely (issue #114).
  isExile: boolean;
}

// Night-phase state captured immediately before "End night" clears it, so a
// "back" control can reopen the just-ended night without losing its
// checklist or the day's nominations (issue #165). Single-slot, not a
// history stack — only the most recently ended night can be undone. A `Pick`
// off `GameDocument` rather than a hand-repeated shape, so the two can't
// silently drift apart.
export type EndedNightSnapshot = Pick<
  GameDocument,
  "nightChecked" | "nightUnskipped" | "nominations"
>;

export type DayTimerStatus = "idle" | "running" | "paused";

// The daytime discussion countdown (CONTEXT.md doesn't name this yet; issue
// #190). A running timer stores an absolute end time rather than a ticking
// remaining-time counter, so a reload or device sleep mid-count re-derives
// the true remaining time from wall-clock time instead of resuming from a
// value that drifted while nothing was updating it.
export interface DayTimer {
  status: DayTimerStatus;
  // Set only while status is "running" — the wall-clock instant the
  // countdown reaches zero.
  endAt: string | null;
  // The frozen remaining time while paused or idle; meaningless while
  // running, where remaining time is derived from endAt instead (see
  // lib/dayTimer.ts).
  remainingMs: number;
}

export function createDayTimer(): DayTimer {
  return { status: "idle", endAt: null, remainingMs: 0 };
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
  // Same mechanic as isDrunk, for the Lunatic's Demon stand-in (issue #163).
  isLunatic: boolean;
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
  // Snapshot of nightChecked/nightUnskipped/nominations as they stood right
  // before the most recent "End night" cleared them, or null once no
  // ended-night is available to undo (never ended one yet, or the reopen
  // control already consumed it). Lets "back" restore the just-ended night
  // instead of reopening it blank (issue #165).
  lastEndedNightSnapshot: EndedNightSnapshot | null;
  // Collapsed/expanded state for the board's secondary panels, persisted so
  // it survives a reload (issue #79: a 15-player game's always-expanded
  // panels push mid-game controls several screen-heights below the board).
  // Demon bluffs' collapse is a plain manual toggle, defaulting expanded to
  // match pre-#79 behavior. The end-game panel's default instead comes from
  // `isEndGamePanelCollapsed` below — null here means "follow that computed
  // default," with an explicit true/false recording a deliberate manual
  // toggle that should stick regardless of night progression.
  demonBluffsCollapsed: boolean;
  endGamePanelCollapsed: boolean | null;
  // Collapsed/expanded state for the board's side panels (issue #168), same
  // plain-manual-toggle shape as demonBluffsCollapsed above — defaults
  // expanded so the tablet/desktop layout is unchanged until the storyteller
  // deliberately reclaims the circle's width.
  nightListCollapsed: boolean;
  dayPhaseCollapsed: boolean;
  // The daytime discussion countdown (issue #190), persisted so a reload or
  // device sleep mid-count restores the correct remaining time rather than
  // losing or drifting it.
  dayTimer: DayTimer;
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
// overlapping the first.
const ANCHOR_OFFSET_Y = 12;
const ANCHOR_STACK_STEP_Y = 6;
const ANCHOR_STACK_STEP_X = 3;

export function anchoredReminderPosition(
  anchorPosition: PlayerPosition,
  siblingIndex: number,
): PlayerPosition {
  // Defensive: every position this function is actually handed today
  // (circlePosition, a drag drop) is already within clampPct's range, but a
  // hand-edited or pre-#117 exported game document isn't guaranteed to be —
  // an anchor outside [4,96] would otherwise make verticalClearance exceed
  // ANCHOR_OFFSET_Y and silently zero the recovery below (code review
  // finding), reproducing the exact bug this function exists to fix.
  const anchorX = clampPct(anchorPosition.x);
  const anchorY = clampPct(anchorPosition.y);
  const y = clampPct(anchorY + ANCHOR_OFFSET_Y + siblingIndex * ANCHOR_STACK_STEP_Y);
  const verticalClearance = y - anchorY;
  // A seat near the bottom of the circle clamps y before it reaches its full
  // offset, which used to park the chip directly on the token instead of
  // below it (issue #117). Recover the clearance the clamp ate as a
  // horizontal push instead, so the chip ends up exactly as far from the
  // token as an unclamped seat's chip would. Recovered against the *base*
  // offset, not the growing per-sibling one — otherwise every sibling
  // recomputes its own full recovery on top of the per-sibling fan below,
  // and a handful of reminders on one clamped seat collapse back onto a
  // single point far sooner than an unclamped seat would need before its
  // own fan saturates (code review finding).
  const recoveredX = Math.sqrt(
    Math.max(ANCHOR_OFFSET_Y ** 2 - verticalClearance ** 2, 0),
  );
  // Fan toward the pad's horizontal centre, not off the nearer edge — scales
  // the per-sibling step too, so later siblings keep receding from the edge
  // instead of the unscaled step undoing part of the recovery above (code
  // review finding).
  const direction = anchorX > 50 ? -1 : 1;
  const x = clampPct(
    anchorX + direction * (recoveredX + siblingIndex * ANCHOR_STACK_STEP_X),
  );
  return { x, y };
}

// The Drunk's true character (CONTEXT.md: Stand-in) — its id, exported so
// every place that special-cases the Drunk (bag building here, the reveal
// action and display in the grimoire components) shares one source of truth.
export const DRUNK_ID = "drunk";

// Same mechanic as DRUNK_ID, for the Lunatic's Demon stand-in (issue #163).
export const LUNATIC_ID = "lunatic";

// Characters that canonically resolve another character's ability
// (CONTEXT.md: Acts as), and so are the only ones offered the "Acts as"
// picker/badge — everyone else's token never shows it (issue #187).
export const ACTS_AS_CAPABLE_IDS: ReadonlySet<string> = new Set([
  "philosopher",
  "alchemist",
  "boffin",
]);

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

export function travellerCount(game: GameDocument): number {
  return game.players.filter((player) => player.isTraveller).length;
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

// Deterministic id for a seat's automatically-placed "Drunk" reminder (issue
// #186) — the same id every time a stand-in lands on this seat, so a
// re-assignment (GrimoireSetup's chooseToken/assignManually) replaces it
// outright instead of stacking a duplicate.
export function drunkStandInReminderId(playerId: string): string {
  return `drunkstandin:${playerId}`;
}

// Whether `reminders` already carries a Drunk-disguise reminder anchored to
// this seat — matched by anchor + characterId, not the exact id, so a
// reminder placed under the pre-#186 walkthrough id scheme
// (setupwalkthrough:<stepId>:<index>) still counts. The single predicate
// both withBackfilledDrunkReminders (add if absent) and
// withoutDrunkStandInReminder (remove if present, GrimoireSetup.tsx) key off,
// so a legacy-id'd reminder that backfill treats as "already there" is the
// same one removal treats as "there to remove" (code review finding: the two
// used to disagree, leaving a legacy reminder stale after a reveal/swap).
function isDrunkStandInReminder(
  reminder: ReminderToken,
  playerId: string,
): boolean {
  return reminder.anchorPlayerId === playerId && reminder.characterId === DRUNK_ID;
}

export function withoutDrunkStandInReminder(
  reminders: ReminderToken[],
  playerId: string,
): ReminderToken[] {
  return reminders.filter((r) => !isDrunkStandInReminder(r, playerId));
}

// Repairs a game document that predates issue #186 (or any state where a
// Drunk seat's reminder never got created by the new automatic-placement
// code — e.g. a pre-#186 game whose reminder still carries the old
// walkthrough-placed id). Every seat with isDrunk still true gets its
// "Drunk" reminder backfilled if it doesn't already carry one — otherwise
// such a seat would show no trace of the disguise at all, now that the
// inline "(actually the Drunk)" copy is gone too. Called once at load
// (GrimoireSetup's initial state, mirroring resumeDrawSession above), not on
// every update, so a storyteller's later deliberate removal of the reminder
// is never fought.
export function withBackfilledDrunkReminders(
  reminders: ReminderToken[],
  players: Player[],
): ReminderToken[] {
  const missing = players.filter(
    (p) => p.isDrunk && !reminders.some((r) => isDrunkStandInReminder(r, p.id)),
  );
  if (missing.length === 0) return reminders;
  return [
    ...reminders,
    ...missing.map((p) => ({
      id: drunkStandInReminderId(p.id),
      characterId: DRUNK_ID,
      label: "Drunk",
      position: parkBeside(livePlayerPosition(p.id, players)),
      anchorPlayerId: p.id,
    })),
  ];
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
  // Same mechanic as standIn, for the Lunatic's Demon stand-in (issue #163).
  // Optional (unlike standIn) so every pre-existing caller/test that doesn't
  // care about the Lunatic keeps working unchanged.
  lunaticStandIn?: Character | null;
  extraCopies: Record<string, number>;
  newId?: () => string;
}

export interface BuiltBagTokens {
  officialTokens: BagToken[];
  travellerTokens: BagToken[];
}

// The Drunk never gets a physical token of its own — the player believes
// they are the stand-in Townsfolk, so that character's extra token fills
// the Drunk's slot instead (CONTEXT.md: Stand-in). The Lunatic follows the
// same pattern with a Demon stand-in (issue #163).
export function buildBagTokens({
  selectedCharacters,
  standIn,
  lunaticStandIn = null,
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
        isLunaticStandIn: false,
      });
      continue;
    }
    const normalizedId = normalizeCharacterId(character.id);
    if (normalizedId === DRUNK_ID || normalizedId === LUNATIC_ID) continue;

    const copies = 1 + (extraCopies[character.id] ?? 0);
    for (let i = 0; i < copies; i++) {
      officialTokens.push({
        id: newId(),
        characterId: character.id,
        isDrunkStandIn: false,
        isLunaticStandIn: false,
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
      isLunaticStandIn: false,
    });
  }

  const lunaticSelected = selectedCharacters.some(
    (c) => normalizeCharacterId(c.id) === LUNATIC_ID,
  );
  if (lunaticSelected && lunaticStandIn) {
    officialTokens.push({
      id: newId(),
      characterId: lunaticStandIn.id,
      isDrunkStandIn: false,
      isLunaticStandIn: true,
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
  // Same mechanic as standIn, for the Lunatic's Demon stand-in (issue #163).
  // Optional (unlike standIn) so every pre-existing caller/test that doesn't
  // care about the Lunatic keeps working unchanged.
  lunaticStandIn?: Character | null;
  extraCopies: Record<string, number>;
  almanacUrl?: string | null;
  firstNightOrder?: string[] | null;
  otherNightOrder?: string[] | null;
  createdAt?: string;
  newId?: () => string;
  // The script's full character list, selected or not (BagBuilder already
  // has this from its own `characters` prop). Defaults to just the selected
  // characters, so a caller that doesn't have the full script on hand still
  // gets a valid document — it just can't offer any "not in play" options,
  // and the in-game "Share via QR" (which encodes this field, issue #109)
  // would expose the bag composition. Pass the real script whenever you
  // have it.
  scriptCharacters?: Character[];
}

// The one place "Player N" is spelled out — both a fresh seat's initial name
// and a renamed-to-blank seat's fallback (GrimoireSetup.tsx) go through this,
// so the two can never drift into different default-naming conventions.
export function defaultPlayerName(seat: number): string {
  return `Player ${seat}`;
}

export function createGame({
  scriptId,
  scriptName,
  playerCount,
  selectedCharacters,
  standIn,
  lunaticStandIn = null,
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
    lunaticStandIn,
    extraCopies,
    newId,
  });

  const players: Player[] = Array.from({ length: playerCount }, (_, i) => ({
    id: newId(),
    seat: i + 1,
    name: defaultPlayerName(i + 1),
    characterId: null,
    startingCharacterId: null,
    isDrunk: false,
    isLunatic: false,
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
      [
        ...selectedCharacters,
        ...(standIn ? [standIn] : []),
        ...(lunaticStandIn ? [lunaticStandIn] : []),
      ].map((c) => [c.id, c]),
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
    lastEndedNightSnapshot: null,
    demonBluffsCollapsed: false,
    endGamePanelCollapsed: null,
    nightListCollapsed: false,
    dayPhaseCollapsed: false,
    dayTimer: createDayTimer(),
  };
}

// Dragging a token is the single reorder gesture (issue #188) — where it
// lands determines the new seat order, replacing the old dedicated "move
// seat earlier/later" buttons. Every other seat keeps its own live position
// (its own drag, or its computed circle slot under its *old* seat number);
// only the moved seat's position changes. Sorting everyone's live position
// by clockwise angle relabels seats 1..N in that order, so a drop that
// doesn't cross anyone reproduces the same numbers and one that lands
// between two seats slots in between them.
export function reorderSeatsAfterMove(
  players: Player[],
  movedPlayerId: string,
  position: PlayerPosition,
): Player[] {
  const bySeat = [...players].sort((a, b) => a.seat - b.seat);
  const total = bySeat.length;
  const movedIndex = bySeat.findIndex((p) => p.id === movedPlayerId);
  if (movedIndex === -1) return players;
  // Clamped up front so a caller passing an out-of-range drop position can't
  // sort or persist by a different point than GrimoireBoard's render loop
  // would actually clamp it to (code review finding).
  const clampedPosition = { x: clampPct(position.x), y: clampPct(position.y) };

  // A stored position isn't guaranteed to be within clampPct's [4,96] range
  // (a hand-edited or pre-#167 exported document) — clamped the same way
  // GrimoireBoard's own render loop clamps one, so this never sorts by a
  // different position than what's actually on screen (code review finding).
  function liveSeatPosition(player: Player, index: number): PlayerPosition {
    return player.position
      ? { x: clampPct(player.position.x), y: clampPct(player.position.y) }
      : circlePosition(index, total);
  }

  function rawAngle(pos: PlayerPosition): number {
    return Math.atan2(pos.y - 50, pos.x - 50);
  }

  // The sort below needs one fixed point on the circle to call "0" so the
  // circular order can become a line — anchoring that cut to a fixed screen
  // point (e.g. the top) means whichever seat already sits there can never
  // be overtaken, since nothing can sort below the sort's own minimum (code
  // review finding). Anchoring it instead to the *moved* seat's own vacated
  // spot means the one point guaranteed empty after the move is the cut, so
  // the moved seat is always free to land anywhere in the new order,
  // including first or last.
  const cut = rawAngle(liveSeatPosition(bySeat[movedIndex], movedIndex));
  function clockwiseAngleFromCut(pos: PlayerPosition): number {
    const raw = rawAngle(pos) - cut;
    return ((raw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  }

  const withAngle = bySeat.map((player, index) => ({
    player,
    angle: clockwiseAngleFromCut(
      player.id === movedPlayerId ? clampedPosition : liveSeatPosition(player, index),
    ),
  }));
  withAngle.sort((a, b) => {
    const diff = a.angle - b.angle;
    if (diff !== 0) return diff;
    // An exact tie (dropped precisely on another seat's position) reads as
    // "take that seat's spot" rather than a no-op that leaves both parties
    // exactly where they already were (code review finding) — every other
    // tie (e.g. two untouched seats coincidentally sharing an angle) falls
    // back to the existing seat order.
    if (a.player.id === movedPlayerId) return -1;
    if (b.player.id === movedPlayerId) return 1;
    return a.player.seat - b.player.seat;
  });

  const seatById = new Map(withAngle.map((entry, index) => [entry.player.id, index + 1]));
  return players.map((player) =>
    player.id === movedPlayerId
      ? { ...player, position: clampedPosition, seat: seatById.get(player.id)! }
      : { ...player, seat: seatById.get(player.id)! },
  );
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
