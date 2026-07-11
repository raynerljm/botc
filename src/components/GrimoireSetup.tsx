"use client";

import { useRouter } from "next/navigation";
import {
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";

import {
  characterPickerPool,
  getCharacter,
  SEAT_HOLDING_TEAMS,
  type Character,
} from "@/lib/characters";
import { currentDay, executionNominations } from "@/lib/dayPhase";
import {
  ACTS_AS_CAPABLE_IDS,
  anchoredReminderPosition,
  defaultPlayerName,
  DRUNK_ID,
  drunkStandInReminderId,
  firstNightEnded,
  insertAtSeat,
  livePlayerPosition,
  parkBeside,
  reorderSeatsAfterMove,
  resumeDrawSession,
  shuffleTokens,
  withBackfilledDrunkReminders,
  withoutDrunkStandInReminder,
  withRestoredReminder,
  type Alignment,
  type BagToken,
  type DrawSession,
  type EndedNightSnapshot,
  type GameDocument,
  type Player,
  type PlayerPosition,
  type ReminderToken,
  type SetupWalkthroughStepStatus,
} from "@/lib/gameDocument";
import { withUpdatedNotesSection } from "@/lib/gameNotes";
import { saveGame } from "@/lib/gameStorage";
import {
  actsAsEntryId,
  charEntryId,
  currentNightNumber,
} from "@/lib/nightList";
import { buildSetupWalkthroughSteps } from "@/lib/setupWalkthrough";

import { Button } from "./Button";
import { CharacterToken } from "./CharacterToken";
import { ConfirmDialog } from "./ConfirmDialog";
import { DayPhase } from "./DayPhase";
import { DemonBluffsPanel } from "./DemonBluffsPanel";
import { EndGamePanel } from "./EndGamePanel";
import { GameNotes } from "./GameNotes";
import { GrimoireBoard } from "./GrimoireBoard";
import { NightList } from "./NightList";
import { PlayerNamePicker } from "./PlayerNamePicker";
import { RadioGroup } from "./RadioGroup";
import styles from "./GrimoireSetup.module.css";
import { Select } from "./Select";
import {
  SetupWalkthrough,
  type SetupWalkthroughReminderInput,
} from "./SetupWalkthrough";
import { ShareScriptButton } from "./ShareScriptButton";

export interface GrimoireSetupProps {
  game: GameDocument;
}

// The seat whose turn the next draw is — official seats only (travellers
// never come from this bag). A plain function of a document (rather than
// only a render-time const) so the draw-stage handlers can re-derive it
// from gameRef.current, the same stale-snapshot defense the rest of this
// file's multi-update handlers use.
function nextUnassignedSeatOf(game: GameDocument): Player | undefined {
  return game.players.find((p) => !p.isTraveller && p.characterId === null);
}

// Seat numbers aren't necessarily contiguous — removing a player (issue #15)
// leaves a gap — so "the end" is the highest seat number in play, not the
// player count, everywhere that needs it (the picker below and each add
// flow's default).
function lastSeat(players: Player[]): number {
  return players.reduce((max, player) => Math.max(max, player.seat), 0);
}

// The "insert before this seat, or at the end" choice offered whenever a new
// seat joins the circle mid-game — seat order matters mechanically
// (CONTEXT.md: Seat), so every add flow lets the storyteller place it rather
// than always appending (issue #15).
function seatPositionOptions(
  players: Player[],
): { seat: number; label: string }[] {
  const bySeat = [...players].sort((a, b) => a.seat - b.seat);
  return [
    ...bySeat.map((player) => ({
      seat: player.seat,
      label: `Before ${player.name}`,
    })),
    { seat: lastSeat(players) + 1, label: "At the end" },
  ];
}

export function GrimoireSetup({ game: initialGame }: GrimoireSetupProps) {
  const router = useRouter();
  // A remount is where a persisted mid-reveal draw session gets coerced back
  // to the privacy guard (issue #108) — see resumeDrawSession. It's also
  // where a game document from before issue #186 (or any Drunk seat whose
  // automatic reminder never got created) gets its "Drunk" reminder
  // backfilled — see withBackfilledDrunkReminders.
  const [game, setGame] = useState(() => ({
    ...initialGame,
    drawSession: resumeDrawSession(initialGame.drawSession),
    reminders: withBackfilledDrunkReminders(
      initialGame.reminders,
      initialGame.players,
    ),
  }));
  // Mirrors `game`, updated synchronously by every update() call — lets a
  // handler that fires more than once per click (the setup walkthrough's
  // Confirm can add two reminders, then resolve the step) build each next
  // state off the previous call's result instead of the `game` this render
  // closed over, without moving the saveGame() side effect (which
  // synchronously dispatches a DOM event) inside a setState updater, which
  // would fire while React is still rendering (React warns and can tear).
  const gameRef = useRef(game);
  // The face-down grid's display order, reshuffled at the start of each
  // seat's turn (and freshly on a remount resuming mid-choosing — the only
  // time the mount-time value is ever rendered) — tokens are face-down
  // either way, but this keeps faith with the physical bag-draw ritual
  // (issue #12 AC). Session-only on purpose: the order is presentation, not
  // game state, so the document's drawSession doesn't carry it.
  const [tokenOrder, setTokenOrder] = useState<BagToken[]>(() =>
    initialGame.drawSession?.stage === "choosing"
      ? shuffleTokens(initialGame.bag)
      : [],
  );
  const [travellerFormOpen, setTravellerFormOpen] = useState(false);
  const [travellerCharacterId, setTravellerCharacterId] = useState("");
  const [travellerAlignment, setTravellerAlignment] =
    useState<Alignment>("good");
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [travellerSeat, setTravellerSeat] = useState(1);
  const [tokenFormOpen, setTokenFormOpen] = useState(false);
  const [tokenCharacterId, setTokenCharacterId] = useState("");
  const [tokenSeat, setTokenSeat] = useState(1);
  const [pendingRemovePlayer, setPendingRemovePlayer] = useState<Player | null>(
    null,
  );

  const characterById = useMemo(
    () => new Map(game.characterPool.map((c) => [c.id, c] as const)),
    [game.characterPool],
  );
  // Shared by every place a bag token needs a display name (the traveller
  // select, manual-assign selects, the leftover-bag summary) — a token
  // whose character somehow isn't in characterPool falls back to the raw id
  // rather than rendering blank.
  function tokenCharacterName(token: BagToken): string {
    return characterById.get(token.characterId)?.name ?? token.characterId;
  }
  // Only players/characterPool feed buildSetupWalkthroughSteps — passing
  // just those (not the whole `game`) skips a rebuild on every unrelated
  // autosave (moving a token, editing notes, ...).
  const walkthroughSteps = useMemo(
    () =>
      buildSetupWalkthroughSteps({
        players: game.players,
        characterPool: game.characterPool,
      }),
    [game.players, game.characterPool],
  );

  // "Acts as" targets aren't limited to in-play characters, so they resolve
  // names from the script's full pool rather than characterById.
  const scriptCharacterById = useMemo(
    () => new Map(game.scriptCharacters.map((c) => [c.id, c] as const)),
    [game.scriptCharacters],
  );

  // "used/available state visible ... as token badges" (issue #20 AC) —
  // computed once per render rather than per-token, since every token needs
  // the same two sets. Shares dayPhase.ts's executionNominations so this
  // agrees with the day panel's "already nominated" labels by construction
  // — exile calls are excluded from both (CONTEXT.md: Exile, issue #114).
  const todaysExecutionNominations = useMemo(
    () => executionNominations(game.nominations),
    [game.nominations],
  );
  const nominatorTodayIds = useMemo(
    () => new Set(todaysExecutionNominations.map((n) => n.nominatorId)),
    [todaysExecutionNominations],
  );
  const nomineeTodayIds = useMemo(
    () => new Set(todaysExecutionNominations.map((n) => n.nomineeId)),
    [todaysExecutionNominations],
  );

  // Referentially stable meta for ShareScriptButton, so opening the dialog
  // doesn't re-encode on unrelated game updates.
  const shareableScriptMeta = useMemo(
    () => ({ name: game.scriptName }),
    [game.scriptName],
  );

  // Mid-game token add (issue #15): any official-team character, script-first
  // then the rest of the dataset — travellers have their own add flow, and
  // Fabled have no add flow at all (issue #50), so both are excluded here.
  const addTokenOptions = useMemo(
    () =>
      characterPickerPool(game.characterPool).filter((c) =>
        SEAT_HOLDING_TEAMS.includes(c.team),
      ),
    [game.characterPool],
  );

  // Traveller add options (issue #119): every traveller-team character,
  // script-first then the rest of the dataset, whether or not it was ever
  // built into travellerBag — travellers may join the circle at any time per
  // the rulebook, even in a game built with 0 travellers. Sourced from
  // scriptCharacters, not characterPool: characterPool only holds what's
  // already selected/built (gameDocument.ts), so a homebrew script's own
  // traveller — never in the vendored dataset — would otherwise be
  // unreachable in a 0-traveller game; this needs the "not in play yet"
  // universe, not the in-play one.
  const travellerAddOptions = useMemo(
    () => characterPickerPool(game.scriptCharacters, "traveller"),
    [game.scriptCharacters],
  );

  // The in-flight draw ritual, read straight from the document so every
  // transition below persists it — a reload restores the same mask instead
  // of silently ending the ritual into an open grimoire (issue #108).
  const draw = game.drawSession;

  // Travellers (added later, task #6) don't come from this bag draw.
  const officialSeats = game.players.filter((p) => !p.isTraveller);
  const assignedCount = officialSeats.filter(
    (p) => p.characterId !== null,
  ).length;
  const nextUnassignedSeat = nextUnassignedSeatOf(game);
  // A bag built shorter than the seat count (ADR 0003 permits the warned
  // "Continue anyway") must still be recoverable rather than instructing a
  // player to draw from an empty bag (issue #118): surfaced as soon as it's
  // knowable, not just once the bag actually runs dry mid-ritual.
  const unassignedSeatCount = officialSeats.length - assignedCount;
  const bagEmpty = game.bag.length === 0;
  const bagShortfall = Math.max(0, unassignedSeatCount - game.bag.length);
  // Every token still sitting in the bag once the draw has filled every
  // seat (an over-sized bag, ADR 0003's warned "Continue anyway") — the
  // storyteller can only otherwise find this by elimination (issue #118).
  const leftoverBagCharacterNames = game.bag.map(tokenCharacterName);

  function update(next: GameDocument) {
    gameRef.current = next;
    setGame(next);
    saveGame(next);
  }

  function updatePlayer(playerId: string, patch: Partial<Player>) {
    return game.players.map((player) =>
      player.id === playerId ? { ...player, ...patch } : player,
    );
  }

  // A token landing on a seat always sets the same fields, whether it got
  // there by draw or by manual assignment. This is always a seat's *first*
  // character (the only way characterId goes from null to set), so
  // startingCharacterId is stamped here once and never touched again.
  function tokenAssignmentPatch(
    token: BagToken,
  ): Pick<
    Player,
    "characterId" | "startingCharacterId" | "isDrunk" | "isLunatic"
  > {
    return {
      characterId: token.characterId,
      startingCharacterId: token.characterId,
      isDrunk: token.isDrunkStandIn,
      isLunatic: token.isLunaticStandIn,
    };
  }

  // Issue #186: a Drunk stand-in used to be flagged with "(actually the
  // Drunk)" inline copy on the token/seat list. Now the storyteller reads
  // the seat's true state from an ordinary reminder token instead — placed
  // automatically the moment the stand-in lands on a seat, whether by draw
  // or manual assignment, so there's nothing left to opt into.
  function withDrunkStandInReminder(
    reminders: ReminderToken[],
    token: BagToken,
    playerId: string,
    players: Player[],
  ): ReminderToken[] {
    if (!token.isDrunkStandIn) return reminders;
    const reminder: ReminderToken = {
      id: drunkStandInReminderId(playerId),
      characterId: DRUNK_ID,
      label: "Drunk",
      position: parkBeside(livePlayerPosition(playerId, players)),
      anchorPlayerId: playerId,
      homePlayerId: playerId,
    };
    return [...withoutDrunkStandInReminder(reminders, playerId), reminder];
  }

  // The one non-draw handler reachable while a draw transition may have
  // just landed in the same tick (the seat-name inputs during "choosing",
  // the reveal's name picker) — builds off gameRef.current so a rename can
  // never revert a newer drawSession/bag/assignment write with a stale
  // spread (Cursor review finding). Handlers only reachable from the board
  // (hidden throughout the draw) keep the plain render-closure pattern.
  function renamePlayer(playerId: string, name: string) {
    const currentGame = gameRef.current;
    update({
      ...currentGame,
      players: currentGame.players.map((player) =>
        player.id === playerId ? { ...player, name } : player,
      ),
    });
  }

  // Normalizes on blur rather than on every renamePlayer keystroke — trimming
  // live would fight a controlled input's cursor (e.g. stripping a trailing
  // space the storyteller just typed before continuing a two-word name).
  // Falls back to the seat's default "Player N" so a name emptied out never
  // persists as blank/whitespace (dangling "Butler — " in the night list,
  // blank options in the Nominator/Nominee dropdowns).
  function commitPlayerName(playerId: string) {
    const currentGame = gameRef.current;
    const player = currentGame.players.find((p) => p.id === playerId);
    if (!player) return;
    const trimmed = player.name.trim();
    const normalized =
      trimmed === "" ? defaultPlayerName(player.seat) : trimmed;
    if (normalized === player.name) return;
    renamePlayer(playerId, normalized);
  }

  // Dragging a token is the seat-reorder gesture (issue #188): where it's
  // dropped determines the new clockwise seat order for everyone, not just
  // the moved seat's own position.
  function movePlayer(playerId: string, position: PlayerPosition) {
    update({
      ...game,
      players: reorderSeatsAfterMove(game.players, playerId, position),
    });
  }

  // Every seat's dragged position is cleared, so the next render falls back
  // to the computed circle for all of them at once. Also re-anchors every
  // reminder that belongs to a still-live seat (homePlayerId) but had been
  // dragged off onto the pad (anchorPlayerId null) — restoring the anchor is
  // enough on its own: the board's render loop already recomputes an
  // anchored reminder's on-screen position fresh from its seat's live
  // position and sibling index every render (issue #213), so there's no
  // stale `position` value to recompute here, and a reminder that was
  // already anchored (or never owned by any seat) is left untouched.
  function reCircle() {
    update({
      ...game,
      players: game.players.map((player) => ({ ...player, position: null })),
      reminders: game.reminders.map((r) =>
        r.homePlayerId && game.players.some((p) => p.id === r.homePlayerId)
          ? { ...r, anchorPlayerId: r.homePlayerId }
          : r,
      ),
    });
  }

  function rotate(rotation: number) {
    update({ ...game, rotation });
  }

  function toggleDead(playerId: string) {
    const player = game.players.find((p) => p.id === playerId);
    if (!player) return;
    const dead = !player.dead;
    const entryIds = [charEntryId(playerId), actsAsEntryId(playerId)];
    update({
      ...game,
      players: updatePlayer(playerId, { dead }),
      // A player who dies with an already-checked night-list entry leaves
      // no ambiguous state: dying prunes the checkmark alongside the
      // "(skipped)" badge NightList renders, rather than a checked box that
      // both counts as done and reads as never-performed (issue #128).
      nightChecked: dead
        ? withoutNightListEntries(game.nightChecked, entryIds)
        : game.nightChecked,
      lastEndedNightSnapshot: dead
        ? withoutSnapshotNightListEntries(game.lastEndedNightSnapshot, entryIds)
        : game.lastEndedNightSnapshot,
    });
  }

  function toggleGhostVote(playerId: string) {
    const player = game.players.find((p) => p.id === playerId);
    if (!player) return;
    update({
      ...game,
      players: updatePlayer(playerId, {
        ghostVoteSpent: !player.ghostVoteSpent,
      }),
    });
  }

  // Builds off gameRef.current (not the `game` this render closed over)
  // because the setup walkthrough can call onAddReminder more than once —
  // and then onResolveStep — from a single click handler (e.g. Washerwoman's
  // two reminders, or Confirm following either). update() refreshes
  // gameRef.current synchronously, so each call in that chain sees what the
  // previous one just committed instead of clobbering it.
  function addReminder(input: {
    characterId: string | null;
    label: string;
    position: PlayerPosition;
    anchorPlayerId: string | null;
  }) {
    const reminder: ReminderToken = {
      id: crypto.randomUUID(),
      ...input,
      // Owned by whatever seat it's placed anchored to, from the start
      // (issue #213) — null for a reminder added generically from the
      // pad-level button, same as anchorPlayerId.
      homePlayerId: input.anchorPlayerId,
    };
    update({
      ...gameRef.current,
      reminders: [...gameRef.current.reminders, reminder],
    });
  }

  // A manual drag always detaches a reminder from whatever seat it was
  // anchored to — the same way dragging a player token overrides its
  // computed circle position — since the storyteller just moved it
  // somewhere of their own choosing, not "beside" any particular seat
  // anymore (issue #71).
  function moveReminder(reminderId: string, position: PlayerPosition) {
    update({
      ...game,
      reminders: game.reminders.map((r) =>
        r.id === reminderId ? { ...r, position, anchorPlayerId: null } : r,
      ),
    });
  }

  // Tap-to-place (issue #71 AC: "a reminder can be attached to a seat
  // without a drag gesture") — parks the reminder beside the chosen seat's
  // current position and remembers the seat so it keeps tracking it. Builds
  // off gameRef.current (not the `game` this render closed over), the same
  // defensive precedent addReminder set — a tap-to-place click always
  // follows some other gesture (opening the reminder's menu, at minimum),
  // so this must never risk reading a stale pre-update snapshot (code
  // review finding).
  function attachReminder(reminderId: string, playerId: string) {
    if (!gameRef.current.players.some((p) => p.id === playerId)) return;
    const base = livePlayerPosition(playerId, gameRef.current.players);
    update({
      ...gameRef.current,
      reminders: gameRef.current.reminders.map((r) =>
        r.id === reminderId
          ? {
              ...r,
              position: parkBeside(base),
              anchorPlayerId: playerId,
              // A deliberate tap-to-place re-homes the reminder too (issue
              // #213), the same as an anchored reminder created fresh —
              // otherwise re-attaching it to a different seat than the one
              // it was last home to would leave a stale owner for Re-circle
              // to (wrongly) send it back to.
              homePlayerId: playerId,
            }
          : r,
      ),
    });
  }

  function removeReminder(reminderId: string) {
    update({
      ...game,
      reminders: game.reminders.filter((r) => r.id !== reminderId),
    });
  }

  // Restores the exact removed token (same id, label, and position) rather
  // than building a fresh one — every field the storyteller sees is back to
  // how it was, even though the token lands at the end of the array if other
  // reminders were added or removed in the meantime. withRestoredReminder is
  // idempotent by id, so a rapid double-tap on Undo can't duplicate it.
  // If the seat it was anchored to was itself removed during the undo
  // window, restoring the raw snapshot would bring back a dangling
  // anchorPlayerId — permanently invisible to the pad-spiral's unanchored
  // count and stuck at a stale never-updated position (code review
  // finding), so drop the anchor the same way removePlayer does for every
  // reminder still anchored to a live seat at removal time. Same dangling-
  // reference guard applies to homePlayerId (issue #213): a snapshot from
  // before that seat was removed would otherwise hand Re-circle a home seat
  // that no longer exists.
  function restoreReminder(reminder: ReminderToken) {
    const anchorStillLive =
      reminder.anchorPlayerId === null ||
      game.players.some((p) => p.id === reminder.anchorPlayerId);
    const homeStillLive =
      reminder.homePlayerId === null ||
      game.players.some((p) => p.id === reminder.homePlayerId);
    const restored = {
      ...reminder,
      anchorPlayerId: anchorStillLive ? reminder.anchorPlayerId : null,
      homePlayerId: homeStillLive ? reminder.homePlayerId : null,
    };
    update({
      ...game,
      reminders: withRestoredReminder(game.reminders, restored),
    });
  }

  // The auto-offer is shown once (Start or Skip both count as "handled") —
  // opening the walkthrough by any path (the offer's own "Start", or the
  // grimoire board's reopen button) marks it offered, so it can never pop
  // back up over an already-in-progress or already-finished walkthrough.
  function openWalkthrough() {
    if (!gameRef.current.setupWalkthroughOffered) {
      update({ ...gameRef.current, setupWalkthroughOffered: true });
    }
    setShowWalkthrough(true);
  }

  function dismissWalkthroughOffer() {
    update({ ...gameRef.current, setupWalkthroughOffered: true });
  }

  // Deterministic ids (rather than crypto.randomUUID()) are what make Redo
  // durable across a reload, not just within one session: resolving the same
  // step always reuses `setupwalkthrough:<stepId>:<index>`, so the filter
  // below finds and drops exactly the reminders a *previous* visit placed —
  // no separate bookkeeping of "which ids did this step add" needs to
  // survive anywhere (code review finding: a session-only ref reset on
  // reload, silently reintroducing stale duplicates across sessions).
  function setupWalkthroughReminderId(stepId: string, index: number): string {
    return `setupwalkthrough:${stepId}:${index}`;
  }

  // Atomically swaps out whatever reminders this step last placed for the
  // ones it just produced, then records its status — one update() call, so
  // a Redo can never leave a stale token from the previous answer behind,
  // and a step with two reminders (Washerwoman) never risks a partial write.
  function resolveWalkthroughStep(
    stepId: string,
    status: SetupWalkthroughStepStatus,
    reminders: SetupWalkthroughReminderInput[],
  ) {
    const newReminders: ReminderToken[] = reminders.map((input, index) => ({
      id: setupWalkthroughReminderId(stepId, index),
      ...input,
      // Owned by whatever seat the walkthrough step anchored it to, the same
      // as any other reminder (issue #213).
      homePlayerId: input.anchorPlayerId,
    }));
    const isThisStepsOldReminder = (r: ReminderToken) =>
      r.id.startsWith(`setupwalkthrough:${stepId}:`);

    update({
      ...gameRef.current,
      reminders: [
        ...gameRef.current.reminders.filter((r) => !isThisStepsOldReminder(r)),
        ...newReminders,
      ],
      setupWalkthroughSteps: {
        ...gameRef.current.setupWalkthroughSteps,
        [stepId]: status,
      },
    });
  }

  // Any mutation that can introduce a character id the game hasn't seen
  // before (a swap, a mid-game add) has to also add it here — characterPool
  // is what every token/board lookup resolves display info from, official
  // or homebrew (gameDocument.ts).
  function withCharacterInPool(
    pool: Character[],
    character: Character | undefined,
  ): Character[] {
    if (!character || pool.some((c) => c.id === character.id)) return pool;
    return [...pool, character];
  }

  // Drops the given night-list entry ids from a nightChecked/nightUnskipped
  // array — shared by every place a player's character, acts-as target, or
  // vital status changes underneath an entry id that's keyed by player only
  // (nightList.ts), so neither checked nor un-skipped state can survive
  // pointing at a wake the new identity never had (issue #128).
  function withoutNightListEntries(
    list: string[],
    ids: readonly string[],
  ): string[] {
    return list.filter((id) => !ids.includes(id));
  }

  // The same pruning, applied to a captured "End night" snapshot (issue
  // #165) rather than the live nightChecked/nightUnskipped — a reopened
  // night replays the snapshot verbatim, so a swap/retarget/death that
  // lands between End night and Reopen must prune it too, or Reopen
  // resurrects the exact ambiguous checked-and-skipped state issue #128
  // prunes on the live arrays.
  function withoutSnapshotNightListEntries(
    snapshot: EndedNightSnapshot | null,
    ids: readonly string[],
  ): EndedNightSnapshot | null {
    if (!snapshot) return null;
    return {
      ...snapshot,
      nightChecked: withoutNightListEntries(snapshot.nightChecked, ids),
      nightUnskipped: withoutNightListEntries(snapshot.nightUnskipped, ids),
    };
  }

  // Swaps only ever change characterId — startingCharacterId (stamped once,
  // at the seat's first assignment) is untouched, so the export can still
  // tell a starting character from a final one that diverged (issue #15).
  // isDrunk/isLunatic clear by default: a deliberate swap — whether it's a
  // dedicated reveal or a storyteller correction to some other character —
  // ordinarily ends whichever stand-in illusion was active, since there's
  // nothing left to disguise. The one exception is reassigning a stand-in
  // itself (issue #52/#163's reassignStandIn below) — that only changes
  // which Townsfolk/Demon the disguise is, not whether there's a disguise at
  // all, so it opts out via endDisguise: false.
  function swapCharacter(
    playerId: string,
    characterId: string,
    { endDisguise = true }: { endDisguise?: boolean } = {},
  ) {
    const character = getCharacter(characterId);
    const player = game.players.find((p) => p.id === playerId);
    const wasDrunk = player?.isDrunk;
    // A swap away from an acts-as-capable character (Philosopher/Alchemist/
    // Boffin) must clear any acts-as target — the picker that sets it is
    // only offered to those three characters (issue #187), so a stale value
    // left behind would be unclearable from the UI while still driving a
    // real night-list wake for an ability the new character doesn't have.
    const clearsActsAs =
      Boolean(player?.actsAs) && !ACTS_AS_CAPABLE_IDS.has(characterId);
    // Pruned on every swap, not only one that clears actsAs — even a swap
    // between two eligible characters (e.g. Philosopher -> Alchemist) keeps
    // the same actsAs target but wakes a different physical token, so a
    // pre-existing checked/un-skipped state for it is just as stale as
    // charEntryId's below (Copilot review finding). Harmless when no
    // acts-as entry exists.
    const entryIds = [charEntryId(playerId), actsAsEntryId(playerId)];
    update({
      ...game,
      players: updatePlayer(playerId, {
        characterId,
        ...(endDisguise ? { isDrunk: false, isLunatic: false } : {}),
        ...(clearsActsAs ? { actsAs: null, actsAsSetOnNight: null } : {}),
      }),
      // The auto-placed "Drunk" reminder (issue #186) is only meaningful
      // while the seat is still disguised — once the disguise ends (a
      // reveal, or a storyteller correction to some other character), it's
      // either redundant (the token now reads "Drunk" itself) or wrong (the
      // seat is a different character entirely).
      reminders:
        endDisguise && wasDrunk
          ? withoutDrunkStandInReminder(game.reminders, playerId)
          : game.reminders,
      characterPool: withCharacterInPool(game.characterPool, character),
      // The night-list entry id doesn't encode which character it was for
      // (issue #128), so a mid-night swap would otherwise inherit whatever
      // checked/un-skipped state the player's previous character left behind
      // — "done", or exempt from auto-skip, for a wake the new character
      // never had.
      nightChecked: withoutNightListEntries(game.nightChecked, entryIds),
      nightUnskipped: withoutNightListEntries(game.nightUnskipped, entryIds),
      lastEndedNightSnapshot: withoutSnapshotNightListEntries(
        game.lastEndedNightSnapshot,
        entryIds,
      ),
    });
  }

  function reassignStandIn(playerId: string, characterId: string) {
    swapCharacter(playerId, characterId, { endDisguise: false });
  }

  function removePlayer(playerId: string) {
    const player = game.players.find((p) => p.id === playerId);
    if (!player) return;
    setPendingRemovePlayer(player);
  }

  function confirmRemovePlayer() {
    const player = pendingRemovePlayer;
    setPendingRemovePlayer(null);
    if (!player) return;
    const playerId = player.id;
    const remainingPlayers = game.players.filter((p) => p.id !== playerId);
    // Emptying the roster flips setupComplete back to false, which hides
    // the "Add character" form — close it here too, or it would silently
    // reappear pre-filled the moment a new player (e.g. a traveller)
    // brings setupComplete back to true, with no click to explain it.
    if (remainingPlayers.length === 0) setTokenFormOpen(false);

    // A reminder anchored to the removed seat would otherwise keep pointing
    // at a player id that no longer exists — forever excluded from the
    // pad-spiral spread's "unanchored" count, and falling back to a stale
    // attach-time position instead of where the seat was actually last seen
    // (code review finding). Resolve it to that live position and detach it,
    // the same way a manual drag detaches a reminder from its anchor.
    const removedPosition = livePlayerPosition(playerId, game.players);
    const anchoredHere = game.reminders.filter(
      (r) => r.anchorPlayerId === playerId,
    );
    const reminders = game.reminders.map((r) => {
      // homePlayerId is cleared whenever it points at this seat, even for a
      // reminder already dragged off onto the pad (anchorPlayerId already
      // null there, so it wouldn't otherwise hit the branch below) — the
      // seat it belongs to is gone, so there's nothing left for a later
      // Re-circle to home it back to (issue #213).
      const homePlayerId = r.homePlayerId === playerId ? null : r.homePlayerId;
      if (r.anchorPlayerId !== playerId) return { ...r, homePlayerId };
      const siblingIndex = anchoredHere.findIndex(
        (sibling) => sibling.id === r.id,
      );
      return {
        ...r,
        anchorPlayerId: null,
        homePlayerId,
        position: anchoredReminderPosition(removedPosition, siblingIndex),
      };
    });

    // A removed traveller's token goes back in the bag — the same character
    // is then reachable again from "Add traveller" without ever having been
    // physically built into the game (issue #119). A fresh id (not the
    // original token's) is fine: nothing else keys off a traveller token's id
    // once it's left the bag.
    const travellerBag =
      player.isTraveller && player.characterId
        ? [
            ...game.travellerBag,
            {
              id: crypto.randomUUID(),
              characterId: player.characterId,
              isDrunkStandIn: false,
              isLunaticStandIn: false,
            },
          ]
        : game.travellerBag;

    // A removed player's night-list entries and any snapshotted nomination
    // votes must not survive them (issue #20's live-nominations rule,
    // extended to the "End night" snapshot by issue #165 — otherwise
    // Reopen could resurrect a checkmark or a vote tally for a player who
    // no longer exists).
    const snapshotEntryIds = [charEntryId(playerId), actsAsEntryId(playerId)];
    const prunedSnapshot = withoutSnapshotNightListEntries(
      game.lastEndedNightSnapshot,
      snapshotEntryIds,
    );

    update({
      ...game,
      players: remainingPlayers,
      travellerBag,
      reminders,
      // A removed player's recorded vote must not go on counting toward a
      // nomination's tally forever (issue #20).
      nominations: game.nominations.map((n) => ({
        ...n,
        votes: n.votes.filter((id) => id !== playerId),
      })),
      lastEndedNightSnapshot: prunedSnapshot && {
        ...prunedSnapshot,
        nominations: prunedSnapshot.nominations.map((n) => ({
          ...n,
          votes: n.votes.filter((id) => id !== playerId),
        })),
      },
    });
  }

  // A dedicated shortcut for what's otherwise just a swap to the "drunk"
  // character — the player's token switches from the stand-in's identity to
  // the Drunk's, openly, once it matters (CONTEXT.md: Stand-in).
  function revealDrunk(playerId: string) {
    swapCharacter(playerId, DRUNK_ID);
  }

  function removeFabled(characterId: string) {
    update({
      ...game,
      activeFabled: game.activeFabled.filter((id) => id !== characterId),
    });
  }

  function setClaim(playerId: string, characterId: string | null) {
    update({
      ...game,
      players: updatePlayer(playerId, { claim: characterId }),
    });
  }

  // The night this acts-as takes effect is whichever night is currently
  // open (or about to open) — the same number the night list itself uses
  // (CONTEXT.md: Night list) — so a first-night-only target chosen mid-game
  // resolves to that specific night, not night 1.
  //
  // The target picker offers the script's full character list (any
  // not-in-play character is a legitimate target — a Philosopher choosing a
  // character nobody currently holds is the canonical case), so — exactly
  // like swapCharacter — the target must be added to characterPool or the
  // night list's characterById (in-play only) can never resolve it and the
  // acts-as entry silently never appears.
  function setActsAs(playerId: string, characterId: string | null) {
    const character = characterId
      ? scriptCharacterById.get(characterId)
      : undefined;
    const entryIds = [actsAsEntryId(playerId)];
    update({
      ...game,
      players: updatePlayer(playerId, {
        actsAs: characterId,
        actsAsSetOnNight: characterId ? currentNightNumber(game) : null,
      }),
      characterPool: withCharacterInPool(game.characterPool, character),
      // The acts-as entry's id is keyed by player, not by target character
      // (issue #128), so retargeting (or clearing) would otherwise leave a
      // stale checked/un-skipped state behind — "done", or exempt from
      // auto-skip, for a wake the new target never had.
      nightChecked: withoutNightListEntries(game.nightChecked, entryIds),
      nightUnskipped: withoutNightListEntries(game.nightUnskipped, entryIds),
      lastEndedNightSnapshot: withoutSnapshotNightListEntries(
        game.lastEndedNightSnapshot,
        entryIds,
      ),
    });
  }

  // Begins the next seat's turn. Like every draw-stage transition below,
  // builds off gameRef.current rather than the `game` this render closed
  // over, so an update that landed in the same tick (a rename from the
  // reveal's name picker, another handler's write) can never be reverted by
  // spreading a stale snapshot (the same defense chooseToken documents).
  function startDraw() {
    const currentGame = gameRef.current;
    const seat = nextUnassignedSeatOf(currentGame);
    // No token left for a seat means no draw to start (issue #118) — the
    // setup screen's shortfall notice owns that recovery path.
    if (!seat || currentGame.bag.length === 0) return;
    setTokenOrder(shuffleTokens(currentGame.bag));
    update({
      ...currentGame,
      drawSession: { seatId: seat.id, stage: "choosing" },
    });
  }

  // Builds off gameRef.current, not the `game` this render closed over — two
  // taps on different face-down tokens landing before React re-renders (a
  // fast double-tap) would otherwise both commit from the same stale bag
  // snapshot, and the second update() would silently overwrite the first's
  // removal instead of compounding it (code review finding). The stage guard
  // closes the rest of that race: the first tap moves the persisted stage to
  // "revealed" synchronously, so the second tap can't assign the same seat a
  // second token.
  function chooseToken(tokenId: string) {
    const currentGame = gameRef.current;
    const session = currentGame.drawSession;
    if (session?.stage !== "choosing") return;
    const token = currentGame.bag.find((t) => t.id === tokenId);
    // Defensive: the tapped token isn't necessarily still in the bag by the
    // time this runs (e.g. a future change reintroduces a way to mutate the
    // bag mid-draw, the way manual assignment used to before issue #111) —
    // reshuffle the grid from what's actually left rather than leaving a
    // dead, stale button on screen.
    if (!token) {
      setTokenOrder(shuffleTokens(currentGame.bag));
      return;
    }

    update({
      ...currentGame,
      bag: currentGame.bag.filter((t) => t.id !== token.id),
      players: currentGame.players.map((player) =>
        player.id === session.seatId
          ? { ...player, ...tokenAssignmentPatch(token) }
          : player,
      ),
      reminders: withDrunkStandInReminder(
        currentGame.reminders,
        token,
        session.seatId,
        currentGame.players,
      ),
      drawSession: { ...session, stage: "revealed" },
    });
  }

  // A double-click on "Start bag draw" (or "Ready to draw") lands its
  // second click right where this token grid just replaced the button —
  // event.detail (the browser's own click count, tracked by screen position
  // and timing regardless of which element ends up under the pointer) is 2
  // for that click, so it's ignored instead of instantly drawing the token
  // (issue #111). A deliberate, separate tap is always its own fresh
  // detail: 1 click.
  function chooseTokenOnClick(
    event: MouseEvent<HTMLButtonElement>,
    tokenId: string,
  ) {
    if (event.detail > 1) return;
    chooseToken(tokenId);
  }

  // Where a reveal goes next. Whenever another seat is still waiting and the
  // bag has a token for it, this skips the "hidden" privacy screen entirely
  // and opens that seat's shuffled, face-down grid directly — safe, because
  // nothing about the next seat's identity is visible yet (issue #185).
  // Otherwise (the last seat, or the bag ran dry) what comes next is *not*
  // blind — it's either the finished grimoire or the setup screen's seats
  // list, both of which show other seats' identities — so the "hidden"
  // privacy guard and its explicit hand-off tap are still required there,
  // exactly as before this change.
  function nextRevealSession(currentGame: GameDocument): DrawSession {
    const session = currentGame.drawSession!;
    const seat = nextUnassignedSeatOf(currentGame);
    return seat && currentGame.bag.length > 0
      ? { seatId: seat.id, stage: "choosing" }
      : { ...session, stage: "hidden" };
  }

  // Names the drawing seat and advances the reveal in one update — merges
  // what would otherwise be a rename() then advance() pair into a single
  // update()/saveGame(), so picking a name doesn't fire the game-changed
  // event (and its full games-store read/write) twice (code review
  // finding). Naming the drawing player is the only interactive way to
  // leave a reveal (issue #210) — a reload mid-reveal is the one other
  // exit, and that's resumeDrawSession's pre-existing privacy fallback
  // (issue #108), unrelated to this change. The stage/seatId guard below
  // closes the same issue #111-style double-tap hazard chooseToken and the
  // old "Hide & pass" button guarded against: PickerGroup's quick-pick
  // buttons carry no built-in double-click protection (they're shared with
  // pickers that don't need it), and naming is now the *only* way to
  // advance a reveal, so a stray second tap landing on the next seat's
  // freshly-rendered face-down grid must be rejected rather than silently
  // re-advancing past it (code review finding).
  function nameAndAdvance(playerId: string, name: string) {
    const currentGame = gameRef.current;
    if (currentGame.drawSession?.seatId !== playerId) return;
    if (currentGame.drawSession.stage !== "revealed") return;
    const next = nextRevealSession(currentGame);
    if (next.stage === "choosing")
      setTokenOrder(shuffleTokens(currentGame.bag));
    update({
      ...currentGame,
      players: currentGame.players.map((player) =>
        player.id === playerId ? { ...player, name } : player,
      ),
      drawSession: next,
    });
  }

  // The bag can run dry between two seats' turns (a bag built shorter than
  // the seat count, ADR 0003's warned "Continue anyway") — with no token
  // left for the next seat, end the draw here instead of opening a
  // "choosing" stage with an empty token grid (issue #118). The setup
  // screen's own shortfall notice (bagShortfall below) takes it from there.
  function readyForNextDraw() {
    const currentGame = gameRef.current;
    if (!nextUnassignedSeatOf(currentGame)) return;
    if (currentGame.bag.length === 0) {
      update({ ...currentGame, drawSession: null });
      return;
    }
    startDraw();
  }

  // Ends the draw session once the storyteller has the device back — the
  // last seat's hand-off has no next seat to pass to, so it can't reuse
  // readyForNextDraw's "draw again" flow. Persisted through gameRef like
  // every other draw-stage transition.
  function openGrimoire() {
    update({ ...gameRef.current, drawSession: null });
  }

  // Shares the draw's own bag, so a token taken here can't also be drawn.
  // Only reachable while `draw` is null — its one call site (the manual-
  // assign select) doesn't render during an active draw (issue #111) — but
  // still builds off gameRef.current like every other multi-update handler,
  // so it can never spread a stale snapshot (Cursor review finding).
  function assignManually(playerId: string, tokenId: string) {
    const currentGame = gameRef.current;
    const token = currentGame.bag.find((t) => t.id === tokenId);
    if (!token) return;

    update({
      ...currentGame,
      bag: currentGame.bag.filter((t) => t.id !== token.id),
      players: currentGame.players.map((player) =>
        player.id === playerId
          ? { ...player, ...tokenAssignmentPatch(token) }
          : player,
      ),
      reminders: withDrunkStandInReminder(
        currentGame.reminders,
        token,
        playerId,
        currentGame.players,
      ),
      drawSession:
        currentGame.drawSession?.seatId === playerId
          ? null
          : currentGame.drawSession,
    });
  }

  function openTravellerForm() {
    const preferred =
      game.travellerBag[0]?.characterId ?? travellerAddOptions[0]?.id ?? "";
    setTravellerCharacterId(preferred);
    setTravellerAlignment("good");
    setTravellerSeat(lastSeat(game.players) + 1);
    setTravellerFormOpen(true);
  }

  // Travellers join the circle at whichever seat the storyteller chose, and
  // never compete with the official-team target counts. Prefer consuming a
  // physical token already sitting in travellerBag (the built-for-this-game
  // case); if the chosen character has none there — a latecomer picked from
  // the wider dataset, or the game was built with 0 travellers — just add
  // the seat without touching the bag (issue #119).
  function addTraveller(event: FormEvent) {
    event.preventDefault();
    const character = travellerAddOptions.find(
      (c) => c.id === travellerCharacterId,
    );
    if (!character) return;
    const matchingToken = game.travellerBag.find(
      (t) => t.characterId === character.id,
    );

    const travellerCount = game.players.filter((p) => p.isTraveller).length;
    const newPlayer: Player = {
      id: crypto.randomUUID(),
      seat: travellerSeat,
      name: `Traveller ${travellerCount + 1}`,
      characterId: character.id,
      startingCharacterId: character.id,
      isDrunk: false,
      isLunatic: false,
      isTraveller: true,
      travellerAlignment,
      dead: false,
      ghostVoteSpent: false,
      position: null,
      claim: null,
      actsAs: null,
      actsAsSetOnNight: null,
    };

    update({
      ...game,
      players: [...insertAtSeat(game.players, travellerSeat), newPlayer],
      travellerBag: matchingToken
        ? game.travellerBag.filter((t) => t.id !== matchingToken.id)
        : game.travellerBag,
      characterPool: withCharacterInPool(game.characterPool, character),
    });
    setTravellerFormOpen(false);
  }

  function openTokenForm() {
    setTokenCharacterId(addTokenOptions[0]?.id ?? "");
    setTokenSeat(lastSeat(game.players) + 1);
    setTokenFormOpen(true);
  }

  // A wholly new seat — not a traveller, possibly not even on the script
  // (issue #15 AC: "including off-script characters") — for whatever the
  // storyteller needs to improvise mid-game (an extra demon from a Pit-Hag
  // chain, a Legion clone, and so on).
  function addToken(event: FormEvent) {
    event.preventDefault();
    const character = addTokenOptions.find((c) => c.id === tokenCharacterId);
    if (!character) return;

    const newPlayer: Player = {
      id: crypto.randomUUID(),
      seat: tokenSeat,
      name: "New player",
      characterId: character.id,
      startingCharacterId: character.id,
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
    };

    update({
      ...game,
      players: [...insertAtSeat(game.players, tokenSeat), newPlayer],
      characterPool: withCharacterInPool(game.characterPool, character),
    });
    setTokenFormOpen(false);
  }

  const drawingSeat = draw
    ? game.players.find((p) => p.id === draw.seatId)
    : undefined;
  // The seat's characterId is stamped in the same update() call that moves
  // the stage to "revealed" (chooseToken), so it's always in lockstep with
  // what was just drawn — no separate field needed to track it.
  const revealedCharacter: Character | undefined =
    draw?.stage === "revealed" && drawingSeat?.characterId
      ? characterById.get(drawingSeat.characterId)
      : undefined;
  // Every other seat's current name, fed to the reveal's name picker so it
  // can't re-offer a "Regular players" name that's already seated (issue
  // #185) — computed once here rather than inline in the JSX below.
  const otherPlayerNames = draw
    ? game.players.filter((p) => p.id !== draw.seatId).map((p) => p.name)
    : [];
  // Every seat filled — the setup screens give way to the grimoire itself.
  const setupComplete =
    game.players.length > 0 &&
    game.players.every((p) => p.characterId !== null);
  // "Screen blurred/obscured" means the *whole* screen, not just the draw
  // card — every other control (traveller add, the grimoire board once every
  // seat is filled) has to disappear too, both while a character is
  // privately on screen and while the device is mid pass-around — i.e.
  // whenever a draw is active and it isn't the safe "choosing" stage. Written
  // as a deny-list (not `stage === "revealed" || stage === "hidden"`) so a
  // future privacy-sensitive stage is obscured by default instead of needing
  // this line remembered. The seats list (seat names, manual-assign
  // dropdowns, "Assigned"/"Draw in progress" status) is stricter still — it
  // uses its own `!draw` gate at its render site (issue #158), since its own
  // full-screen "choosing" grid means "choosing" isn't safe for *that*
  // control the way it is for the others here.
  const screenObscured = draw !== null && draw.stage !== "choosing";
  // Export/end-game/script-sharing stay reachable through a private reveal
  // (issue #21 AC: always reachable) — only the pass-around hand-off itself
  // hides them, so a drawing player can't see them mid-pass.
  const passAroundHidden = draw?.stage === "hidden";
  // Which content the single bottom sheet shows (issue #195): the night
  // list whenever a night is open, or before the first night has even
  // started (day 0 has no day-phase business of its own — CONTEXT.md: a day
  // begins once night N closes) — Day phase otherwise. Only one of the two
  // is ever mounted at a time.
  const sheetPhase: "night" | "day" =
    game.nightOpen || currentDay(game) < 1 ? "night" : "day";

  return (
    <div className={styles.main}>
      {!setupComplete && !draw && (
        // Browser-history back, not a hardcoded link to the bag builder —
        // this page is also reached by resuming an in-progress game from
        // the home page (GamesList), where the true previous step is the
        // games list, not a fresh bag build for the same script (which
        // would abandon this game's already-drawn seats instead of
        // resuming them). Hidden for the whole draw ritual (any stage, not
        // just the "hidden" privacy-guard one) so a mid-draw tap can't
        // discard an in-flight choice or reveal.
        <Button
          variant="ghost"
          className={styles.back}
          onClick={() => router.back()}
        >
          ← {game.scriptName}
        </Button>
      )}
      <h1 className={styles.title}>{game.scriptName}</h1>

      <p className={styles.progress}>
        {assignedCount}/{officialSeats.length} seats assigned
      </p>

      {!draw && bagShortfall > 0 && (
        <p className={styles.bagShortfall} role="alert">
          The bag is short {bagShortfall} token{bagShortfall === 1 ? "" : "s"}{" "}
          for {unassignedSeatCount} unassigned seat
          {unassignedSeatCount === 1 ? "" : "s"}. Go back to bag-building to add
          more characters.
        </p>
      )}

      {!draw && nextUnassignedSeat && !bagEmpty && (
        <Button
          variant="primary"
          className={styles.startDraw}
          onClick={startDraw}
        >
          Start bag draw
        </Button>
      )}

      {setupComplete &&
        !screenObscured &&
        leftoverBagCharacterNames.length > 0 && (
          <p className={styles.bagLeftover}>
            Left in the bag: {leftoverBagCharacterNames.join(", ")}
          </p>
        )}

      {draw && drawingSeat && (
        <div className={styles.drawFlow} role="region" aria-label="Bag draw">
          {draw.stage === "choosing" && (
            // Full-screen like the reveal (issue #53's .reveal) — the
            // drawing player needs only these tokens on screen, not the
            // seats list rendering behind them (issue #158). Same
            // no-aria-modal trade-off as the reveal below: ShareScriptButton/
            // EndGamePanel stay focusable underneath by design (issue #21),
            // so this backdrop hiding them visually doesn't pull them out of
            // the tab order.
            <div
              className={styles.choosingFullscreen}
              role="dialog"
              aria-label={`${drawingSeat.name}, tap a token to draw`}
            >
              <p>{drawingSeat.name}, tap a token to draw</p>
              <ul className={styles.tokenGrid}>
                {tokenOrder.map((token, index) => (
                  <li key={token.id}>
                    <button
                      type="button"
                      className={styles.faceDownToken}
                      aria-label={`Face-down token ${index + 1}`}
                      onClick={(event) => chooseTokenOnClick(event, token.id)}
                    >
                      <span aria-hidden="true">{index + 1}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {draw.stage === "revealed" && revealedCharacter && (
            <div
              className={styles.reveal}
              role="dialog"
              aria-label={revealedCharacter.name}
            >
              {/* No aria-modal: ShareScriptButton/EndGamePanel stay focusable
                  underneath this by design (issue #21), so Tab can reach
                  them — claiming aria-modal would be dishonest about that
                  (issue #122). Escape doesn't dismiss either — a privacy
                  guard shouldn't be bypassable by a stray keypress. */}
              {/* The animation lives on this inner wrapper, not .reveal
                  itself: .reveal is the opaque full-viewport privacy
                  backdrop (issue #53), and scaling *that* down leaves its
                  shrunken edges exposing the setup page behind it for the
                  animation's duration — exactly what it exists to hide. */}
              <div className={styles.revealContent}>
                <CharacterToken character={revealedCharacter} />
                <h2>{revealedCharacter.name}</h2>
                <p>{revealedCharacter.ability}</p>
                <PlayerNamePicker
                  excludeNames={otherPlayerNames}
                  onSelect={(name) => nameAndAdvance(draw.seatId, name)}
                />
              </div>
            </div>
          )}

          {draw.stage === "hidden" && (
            <div className={styles.privacyGuard}>
              {/* Reached live only when what's next isn't blind — the last
                  seat's hand-off (issue #110) or a bag-shortfall mid-ritual
                  (issue #118) — plus any reload mid-reveal (resumeDrawSession).
                  A normal seat-to-seat pass skips straight past this guard
                  (issue #185: nextRevealSession). With no next seat to pass
                  to, the honest instruction is to hand back, and the button
                  ends the ritual. */}
              <p>
                {nextUnassignedSeat
                  ? `Card hidden. Pass the device to ${nextUnassignedSeat.name}.`
                  : "Card hidden. Return the device to the storyteller."}
              </p>
              <Button
                onClick={nextUnassignedSeat ? readyForNextDraw : openGrimoire}
              >
                {nextUnassignedSeat ? "Ready to draw" : "Open the grimoire"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Gated on `!draw`, not just `!screenObscured` — screenObscured
          deliberately treats the 'choosing' stage as safe for most controls,
          but this form's default selection is seeded from travellerBag
          (openTravellerForm), which is exactly the kind of bag-composition
          leak issue #111 closed for the official bag's manual-assign
          selects. Always offered regardless of travellerBag's size — a
          traveller may join at any time per the rulebook, even in a game
          built with 0 travellers (issue #119).
          Hidden once setupComplete (issue #217): the board exists by then,
          and reaches this same openTravellerForm through its own overflow
          menu instead — see the GrimoireBoard onOpenAddTraveller prop below. */}
      {!draw && !travellerFormOpen && !setupComplete && (
        <Button className={styles.addTraveller} onClick={openTravellerForm}>
          Add traveller
        </Button>
      )}

      {!draw && travellerFormOpen && (
        <form className={styles.travellerForm} onSubmit={addTraveller}>
          <label>
            Traveller character
            <Select
              aria-label="Traveller character"
              value={travellerCharacterId}
              onChange={setTravellerCharacterId}
              entries={travellerAddOptions.map((character) => ({
                value: character.id,
                label: character.name,
              }))}
            />
          </label>
          <RadioGroup
            name="traveller-alignment"
            legend="Alignment"
            value={travellerAlignment}
            onChange={setTravellerAlignment}
            options={[
              { value: "good", label: "Good" },
              { value: "evil", label: "Evil" },
            ]}
          />
          <label>
            Seat position
            <Select
              aria-label="Seat position"
              className={styles.select}
              value={String(travellerSeat)}
              onChange={(next) => setTravellerSeat(Number(next))}
              entries={seatPositionOptions(game.players).map((option) => ({
                value: String(option.seat),
                label: option.label,
              }))}
            />
          </label>
          <Button type="submit" variant="primary">
            Add to the circle
          </Button>
          <Button variant="ghost" onClick={() => setTravellerFormOpen(false)}>
            Cancel
          </Button>
        </form>
      )}

      {/* No standalone trigger button here (issue #217) — reached through
          the board's own overflow menu instead (onOpenAddCharacter below),
          since this form is only ever valid once the board already exists. */}
      {setupComplete && !screenObscured && tokenFormOpen && (
        <form className={styles.travellerForm} onSubmit={addToken}>
          <label>
            Character
            <Select
              aria-label="Character"
              value={tokenCharacterId}
              onChange={setTokenCharacterId}
              entries={addTokenOptions.map((character) => ({
                value: character.id,
                label: character.name,
              }))}
            />
          </label>
          <label>
            Seat position
            <Select
              aria-label="Seat position"
              className={styles.select}
              value={String(tokenSeat)}
              onChange={(next) => setTokenSeat(Number(next))}
              entries={seatPositionOptions(game.players).map((option) => ({
                value: String(option.seat),
                label: option.label,
              }))}
            />
          </label>
          <Button type="submit" variant="primary">
            Add to the grimoire
          </Button>
          <Button variant="ghost" onClick={() => setTokenFormOpen(false)}>
            Cancel
          </Button>
        </form>
      )}

      {setupComplete ? (
        // Setup→play handoff (issue #220): this whole branch mounts fresh
        // exactly once, the moment the last seat is filled — everything
        // inside (circle, sheet, Demon bluffs, walkthrough) stays mounted
        // afterward regardless of `hidden` toggles (see the comment on
        // .circleLayout below), so this wrapper's mount animation plays
        // once for the handoff and never replays after.
        <div className={styles.boardEnter}>
          {/* No `walkthroughSteps.length > 0` conjunct here — the walkthrough
              always has at least its Demon bluffs step (issue #155), so this
              offer is never conditioned on any character being in play. */}
          {!showWalkthrough &&
            !screenObscured &&
            !game.setupWalkthroughOffered && (
              <div
                role="region"
                aria-label="Setup walkthrough offer"
                className={styles.walkthroughOffer}
              >
                <p>
                  {walkthroughSteps.length} setup decision
                  {walkthroughSteps.length === 1 ? "" : "s"}{" "}
                  {/* Once the first night has ended, "before the first
                      night" reads as if a night is still ahead rather than
                      past — drop that framing but keep the offer itself
                      actionable (issue #68). */}
                  {firstNightEnded(game)
                    ? "pending."
                    : "to make before the first night."}
                </p>
                <Button variant="primary" onClick={openWalkthrough}>
                  Start walkthrough
                </Button>
                <Button onClick={dismissWalkthroughOffer}>Skip</Button>
              </div>
            )}
          {/* Stays mounted (just hidden) rather than being swapped out for
              the walkthrough dialog — GrimoireBoard owns its own session-only
              state (the privacy "Hide grimoire" toggle, an in-flight "Undo
              remove reminder" window) that unmounting would silently discard
              (code review finding). `hidden` also drops it from the
              accessibility tree, matching the old unmounted behavior for
              anything that queries by role. Also hidden while a draw is
              obscured — the very last seat's draw can flip setupComplete
              true mid-reveal, and without this the board's player names
              would mount underneath the reveal overlay (code review
              finding). */}
          <div
            className={styles.circleLayout}
            hidden={showWalkthrough || screenObscured}
          >
            <div
              role="region"
              aria-label="Grimoire circle"
              className={styles.circleArea}
            >
              {/* Day/night phase sweep (issue #220): a brief translucent
                  wash over the circle whenever the single bottom sheet
                  swaps between Night list and Day phase — keyed on
                  sheetPhase so it remounts (replaying the fade) only on an
                  actual phase change, never on an ordinary re-render.
                  Decorative only (aria-hidden, pointer-events: none via
                  CSS) so it never intercepts a token/reminder drag. */}
              <div
                key={sheetPhase}
                className={styles.phaseSweep}
                aria-hidden="true"
              />
              <GrimoireBoard
                players={game.players}
                characterById={characterById}
                claimOptions={game.scriptCharacters}
                almanacUrl={game.almanacUrl}
                reminders={game.reminders}
                activeFabled={game.activeFabled}
                nominatorTodayIds={nominatorTodayIds}
                nomineeTodayIds={nomineeTodayIds}
                onRename={renamePlayer}
                onRenameCommit={commitPlayerName}
                onMove={movePlayer}
                onReCircle={reCircle}
                rotation={game.rotation}
                onRotate={rotate}
                onToggleDead={toggleDead}
                onToggleGhostVote={toggleGhostVote}
                onAddReminder={addReminder}
                onMoveReminder={moveReminder}
                onAttachReminder={attachReminder}
                onRemoveReminder={removeReminder}
                onRestoreReminder={restoreReminder}
                onSwapCharacter={swapCharacter}
                onRemovePlayer={removePlayer}
                onRevealDrunk={revealDrunk}
                onRemoveFabled={removeFabled}
                onSetClaim={setClaim}
                onSetActsAs={setActsAs}
                // Undefined once the first night has ended (issue #170) —
                // those are pre-first-night decisions, so the standing
                // reopen entry point is clutter afterward. Before that, the
                // walkthrough always has at least its Demon bluffs step
                // (issue #155), so this is never undefined in practice;
                // GrimoireBoard's own prop stays optional since it's a
                // generically reusable board, not specific to this.
                onOpenSetupWalkthrough={
                  firstNightEnded(game) ? undefined : openWalkthrough
                }
                // Both forms are owned by this component (they seed default
                // selections from state only this page holds — travellerBag,
                // lastSeat), so the board just gets a callback to open them,
                // the same delegation onOpenSetupWalkthrough already uses.
                // Hidden while its own form is already open, matching what
                // the old standalone trigger buttons did (issue #217).
                // `draw` is guaranteed null here in practice (GrimoireBoard
                // only mounts once setupComplete, which precludes a "choosing"
                // stage draw needing an unassigned seat) — but openTravellerForm
                // seeds its default from travellerBag[0], the same bag-leak
                // shape issue #111 closed for manual-assign selects, so this
                // still checks `!draw` explicitly rather than leaning on that
                // cross-file invariant staying true forever (code review
                // finding).
                onOpenAddTraveller={
                  draw || travellerFormOpen ? undefined : openTravellerForm
                }
                onOpenAddCharacter={
                  tokenFormOpen ? undefined : openTokenForm
                }
              />
            </div>
            {/* Renders as a fixed-position bottom sheet (BottomSheet.module.css)
                rather than a grid item — it's positioned here in the DOM
                (issue #58: circle before the sheet in DOM/tab order still
                holds) purely so its own CollapsibleSection/handle markup
                lives beside the circle it's paired with; its box escapes the
                grid entirely via `position: fixed` (issue #194). Only one of
                Night list/Day phase is ever mounted — whichever the current
                game phase calls for (issue #195) — since only one physical
                sheet exists; no side column remains for either. */}
            {sheetPhase === "night" ? (
              <NightList
                game={game}
                characterById={characterById}
                onChange={update}
              />
            ) : (
              <DayPhase game={game} onChange={update} />
            )}
          </div>
          {/* Hidden rather than unmounted while the walkthrough is open, same
              reasoning as the circle above — DemonBluffsPanel owns its own
              session-only state ("Show all characters", an in-flight "Show
              to Demon" overlay) that unmounting would silently discard. Also
              hidden while a draw is obscured, same reasoning as the circle
              above. */}
          <DemonBluffsPanel
            game={game}
            onChange={update}
            hidden={showWalkthrough || screenObscured}
          />
          {showWalkthrough && (
            <SetupWalkthrough
              steps={walkthroughSteps}
              stepStatuses={game.setupWalkthroughSteps}
              players={game.players}
              characterPool={game.characterPool}
              game={game}
              onChangeGame={update}
              onResolveStep={resolveWalkthroughStep}
              onReassignStandIn={reassignStandIn}
              onClose={() => setShowWalkthrough(false)}
            />
          )}
        </div>
      ) : (
        // Hidden for the whole draw session, not just the obscured stages —
        // the choosing stage's own full-screen token grid (issue #158) means
        // this list never has anything useful to show until every seat is
        // filled or the draw hasn't started yet.
        !draw && (
          <ul className={styles.seats} aria-label="Seats">
            {game.players.map((player) => {
              const character = player.characterId
                ? characterById.get(player.characterId)
                : undefined;
              // `draw` is always null here — the whole list is hidden
              // whenever a draw session is active (issue #158) — so every
              // seat is either already assigned or open for manual pick,
              // with no "revealed"/"Assigned"/"Draw in progress" mid-draw
              // placeholder state possible.
              return (
                <li key={player.id} className={styles.seat}>
                  <label htmlFor={`seat-name-${player.id}`}>
                    Seat {player.seat} name
                  </label>
                  <input
                    id={`seat-name-${player.id}`}
                    type="text"
                    value={player.name}
                    onChange={(event) =>
                      renamePlayer(player.id, event.target.value)
                    }
                    onBlur={() => commitPlayerName(player.id)}
                  />
                  {character ? (
                    <div className={styles.assignedCharacter}>
                      <CharacterToken character={character} />
                      <span>{character.name}</span>
                      {player.isTraveller && (
                        <span className={styles.alignment}>
                          {player.travellerAlignment}
                        </span>
                      )}
                      {player.isLunatic && (
                        <span className={styles.drunkNote}>
                          (actually the Lunatic)
                        </span>
                      )}
                    </div>
                  ) : (
                    <label>
                      {`Assign seat ${player.seat} manually`}
                      <Select
                        aria-label={`Assign seat ${player.seat} manually`}
                        className={styles.select}
                        value=""
                        onChange={(next) => assignManually(player.id, next)}
                        entries={[
                          { value: "", label: "Choose a character…" },
                          ...game.bag.map((token) => ({
                            value: token.id,
                            label: tokenCharacterName(token),
                          })),
                        ]}
                      />
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
        )
      )}

      {/* End-game, export, and script sharing are always reachable — even
          through a private character reveal (export works mid-game too,
          issue #21 AC) — but hidden while the device is mid pass-around so a
          drawing player can't see it. */}
      {!passAroundHidden && (
        <>
          {/* Share scriptCharacters — the script, the public reference
              document — never characterPool: bag composition is the
              storyteller's core secret (issue #109). */}
          <ShareScriptButton
            meta={shareableScriptMeta}
            characters={game.scriptCharacters}
          />
          {/* Reachable during play, not just from the end-game panel (issue
              #193 AC) — same always-reachable placement as EndGamePanel
              below. Unlike EndGamePanel's plain patch-onChange, editing a
              notes section is a read-modify-write against the notes array,
              so it must read from gameRef.current (not this render's stale
              `game`) or a same-tick draw-stage write to `notes` could be
              silently reverted (code review finding). */}
          <GameNotes
            game={game}
            onChangeSection={(id, text) =>
              update({
                ...gameRef.current,
                notes: withUpdatedNotesSection(gameRef.current.notes, id, text),
              })
            }
            onToggleCollapsed={(collapsed) =>
              update({ ...gameRef.current, notesCollapsed: collapsed })
            }
          />
          <EndGamePanel
            game={game}
            // Merged onto gameRef.current, not this render's `game` — the
            // panel is reachable mid-draw, so a stale full-document write
            // could revert a draw transition from the same tick (Cursor
            // review finding). The panel emits patches for the same reason.
            onChange={(patch) => update({ ...gameRef.current, ...patch })}
          />
        </>
      )}
      {pendingRemovePlayer && (
        <ConfirmDialog
          title="Remove player"
          message={`Remove ${pendingRemovePlayer.name} from the grimoire?`}
          confirmLabel="Remove"
          destructive
          onConfirm={confirmRemovePlayer}
          onCancel={() => setPendingRemovePlayer(null)}
        />
      )}
    </div>
  );
}
