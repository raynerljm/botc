"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type FormEvent } from "react";

import {
  characterPickerPool,
  getCharacter,
  SEAT_HOLDING_TEAMS,
  type Character,
} from "@/lib/characters";
import {
  anchoredReminderPosition,
  DRUNK_ID,
  firstNightEnded,
  insertAtSeat,
  livePlayerPosition,
  parkBeside,
  shuffleTokens,
  withRestoredReminder,
  type Alignment,
  type BagToken,
  type GameDocument,
  type Player,
  type PlayerPosition,
  type ReminderToken,
  type SetupWalkthroughStepStatus,
} from "@/lib/gameDocument";
import { saveGame } from "@/lib/gameStorage";
import { currentNightNumber } from "@/lib/nightList";
import { buildSetupWalkthroughSteps } from "@/lib/setupWalkthrough";

import { CharacterToken } from "./CharacterToken";
import { ClaimsList } from "./ClaimsList";
import { ConfirmDialog } from "./ConfirmDialog";
import { DayPhase } from "./DayPhase";
import { DemonBluffsPanel } from "./DemonBluffsPanel";
import { EndGamePanel } from "./EndGamePanel";
import { GrimoireBoard } from "./GrimoireBoard";
import { NightList } from "./NightList";
import { PlayerNamePicker } from "./PlayerNamePicker";
import styles from "./GrimoireSetup.module.css";
import { SetupWalkthrough, type SetupWalkthroughReminderInput } from "./SetupWalkthrough";
import { ShareScriptButton } from "./ShareScriptButton";

export interface GrimoireSetupProps {
  game: GameDocument;
}

type DrawStage = "choosing" | "revealed" | "hidden";

interface DrawState {
  seatId: string;
  stage: DrawStage;
  // Shuffled once per seat's turn — tokens are face-down either way, but
  // this keeps faith with the physical bag-draw ritual (issue #12 AC).
  tokenOrder: BagToken[];
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
  const [game, setGame] = useState(initialGame);
  // Mirrors `game`, updated synchronously by every update() call — lets a
  // handler that fires more than once per click (the setup walkthrough's
  // Confirm can add two reminders, then resolve the step) build each next
  // state off the previous call's result instead of the `game` this render
  // closed over, without moving the saveGame() side effect (which
  // synchronously dispatches a DOM event) inside a setState updater, which
  // would fire while React is still rendering (React warns and can tear).
  const gameRef = useRef(initialGame);
  const [draw, setDraw] = useState<DrawState | null>(null);
  const [travellerFormOpen, setTravellerFormOpen] = useState(false);
  const [travellerTokenId, setTravellerTokenId] = useState("");
  const [travellerAlignment, setTravellerAlignment] =
    useState<Alignment>("good");
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [travellerSeat, setTravellerSeat] = useState(1);
  const [tokenFormOpen, setTokenFormOpen] = useState(false);
  const [tokenCharacterId, setTokenCharacterId] = useState("");
  const [tokenSeat, setTokenSeat] = useState(1);
  const [pendingRemovePlayer, setPendingRemovePlayer] =
    useState<Player | null>(null);

  const characterById = useMemo(
    () => new Map(game.characterPool.map((c) => [c.id, c] as const)),
    [game.characterPool],
  );
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

  // Claims (and Demon bluffs) aren't limited to in-play characters, so they
  // resolve names from the script's full pool rather than characterById.
  const scriptCharacterById = useMemo(
    () => new Map(game.scriptCharacters.map((c) => [c.id, c] as const)),
    [game.scriptCharacters],
  );

  // "used/available state visible ... as token badges" (issue #20 AC) —
  // computed once per render rather than per-token, since every token needs
  // the same two sets.
  const nominatorTodayIds = useMemo(
    () => new Set(game.nominations.map((n) => n.nominatorId)),
    [game.nominations],
  );
  const nomineeTodayIds = useMemo(
    () => new Set(game.nominations.map((n) => n.nomineeId)),
    [game.nominations],
  );

  // Sharing from the grimoire shares what's actually in this game — the
  // characterPool (CONTEXT.md: Script) — rather than re-resolving the
  // original script file, which for a library script would require
  // filesystem access this client component doesn't have.
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

  // Travellers (added later, task #6) don't come from this bag draw.
  const officialSeats = game.players.filter((p) => !p.isTraveller);
  const assignedCount = officialSeats.filter(
    (p) => p.characterId !== null,
  ).length;
  const nextUnassignedSeat = officialSeats.find(
    (p) => p.characterId === null,
  );

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

  // A token landing on a seat always sets the same three fields, whether it
  // got there by draw or by manual assignment. This is always a seat's
  // *first* character (the only way characterId goes from null to set), so
  // startingCharacterId is stamped here once and never touched again.
  function tokenAssignmentPatch(
    token: BagToken,
  ): Pick<Player, "characterId" | "startingCharacterId" | "isDrunk"> {
    return {
      characterId: token.characterId,
      startingCharacterId: token.characterId,
      isDrunk: token.isDrunkStandIn,
    };
  }

  function renamePlayer(playerId: string, name: string) {
    update({ ...game, players: updatePlayer(playerId, { name }) });
  }

  function movePlayer(playerId: string, position: PlayerPosition) {
    update({ ...game, players: updatePlayer(playerId, { position }) });
  }

  // Every seat's dragged position is cleared, so the next render falls back
  // to the computed circle for all of them at once.
  function reCircle() {
    update({
      ...game,
      players: game.players.map((player) => ({ ...player, position: null })),
    });
  }

  // Reordering only swaps the two seats' numbers — the players array itself
  // stays in whatever order it was already in, since GrimoireBoard sorts by
  // seat before rendering.
  function reorderSeat(playerId: string, direction: "earlier" | "later") {
    const bySeat = [...game.players].sort((a, b) => a.seat - b.seat);
    const index = bySeat.findIndex((p) => p.id === playerId);
    const swapIndex = direction === "earlier" ? index - 1 : index + 1;
    if (index === -1 || swapIndex < 0 || swapIndex >= bySeat.length) return;

    const current = bySeat[index];
    const swapWith = bySeat[swapIndex];
    update({
      ...game,
      players: game.players.map((player) => {
        if (player.id === current.id) return { ...player, seat: swapWith.seat };
        if (player.id === swapWith.id) return { ...player, seat: current.seat };
        return player;
      }),
    });
  }

  function toggleDead(playerId: string) {
    const player = game.players.find((p) => p.id === playerId);
    if (!player) return;
    update({ ...game, players: updatePlayer(playerId, { dead: !player.dead }) });
  }

  function toggleGhostVote(playerId: string) {
    const player = game.players.find((p) => p.id === playerId);
    if (!player) return;
    update({
      ...game,
      players: updatePlayer(playerId, { ghostVoteSpent: !player.ghostVoteSpent }),
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
    const reminder: ReminderToken = { id: crypto.randomUUID(), ...input };
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
          ? { ...r, position: parkBeside(base), anchorPlayerId: playerId }
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
  // reminder still anchored to a live seat at removal time.
  function restoreReminder(reminder: ReminderToken) {
    const anchorStillLive =
      reminder.anchorPlayerId === null ||
      game.players.some((p) => p.id === reminder.anchorPlayerId);
    const restored = anchorStillLive
      ? reminder
      : { ...reminder, anchorPlayerId: null };
    update({ ...game, reminders: withRestoredReminder(game.reminders, restored) });
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

  // Swaps only ever change characterId — startingCharacterId (stamped once,
  // at the seat's first assignment) is untouched, so the export can still
  // tell a starting character from a final one that diverged (issue #15).
  // isDrunk clears by default: a deliberate swap — whether it's the
  // dedicated Drunk reveal or a storyteller correction to some other
  // character — ordinarily ends the stand-in illusion, since there's
  // nothing left to disguise. The one exception is reassigning the Drunk's
  // stand-in itself (issue #52's reassignStandIn below) — that only changes
  // which Townsfolk the disguise is, not whether there's a disguise at all,
  // so it opts out via endDisguise: false.
  function swapCharacter(
    playerId: string,
    characterId: string,
    { endDisguise = true }: { endDisguise?: boolean } = {},
  ) {
    const character = getCharacter(characterId);
    update({
      ...game,
      players: updatePlayer(
        playerId,
        endDisguise ? { characterId, isDrunk: false } : { characterId },
      ),
      characterPool: withCharacterInPool(game.characterPool, character),
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
    const anchoredHere = game.reminders.filter((r) => r.anchorPlayerId === playerId);
    const reminders = game.reminders.map((r) => {
      if (r.anchorPlayerId !== playerId) return r;
      const siblingIndex = anchoredHere.findIndex((sibling) => sibling.id === r.id);
      return {
        ...r,
        anchorPlayerId: null,
        position: anchoredReminderPosition(removedPosition, siblingIndex),
      };
    });

    update({
      ...game,
      players: remainingPlayers,
      reminders,
      // A removed player's recorded vote must not go on counting toward a
      // nomination's tally forever (issue #20).
      nominations: game.nominations.map((n) => ({
        ...n,
        votes: n.votes.filter((id) => id !== playerId),
      })),
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
    update({ ...game, players: updatePlayer(playerId, { claim: characterId }) });
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
    const character = characterId ? scriptCharacterById.get(characterId) : undefined;
    update({
      ...game,
      players: updatePlayer(playerId, {
        actsAs: characterId,
        actsAsSetOnNight: characterId ? currentNightNumber(game) : null,
      }),
      characterPool: withCharacterInPool(game.characterPool, character),
    });
  }

  function startDraw() {
    if (!nextUnassignedSeat) return;
    setDraw({
      seatId: nextUnassignedSeat.id,
      stage: "choosing",
      tokenOrder: shuffleTokens(game.bag),
    });
  }

  // Builds off gameRef.current, not the `game` this render closed over — two
  // taps on different face-down tokens landing before React re-renders (a
  // fast double-tap) would otherwise both commit from the same stale bag
  // snapshot, and the second update() would silently overwrite the first's
  // removal instead of compounding it (code review finding).
  function chooseToken(tokenId: string) {
    if (!draw) return;
    const currentGame = gameRef.current;
    const token = currentGame.bag.find((t) => t.id === tokenId);
    // The tapped token can already be gone from the bag if it was manually
    // assigned to a different seat while still shown face-down here —
    // reshuffle the grid from what's actually left rather than leaving a
    // dead, stale button on screen.
    if (!token) {
      setDraw({ ...draw, tokenOrder: shuffleTokens(currentGame.bag) });
      return;
    }

    update({
      ...currentGame,
      bag: currentGame.bag.filter((t) => t.id !== token.id),
      players: currentGame.players.map((player) =>
        player.id === draw.seatId
          ? { ...player, ...tokenAssignmentPatch(token) }
          : player,
      ),
    });
    setDraw({ ...draw, stage: "revealed" });
  }

  // The privacy guard only matters when someone else still needs to draw —
  // the last seat's reveal simply ends the session once hidden.
  function hideAndPass() {
    if (!draw) return;
    if (nextUnassignedSeat) {
      setDraw({ ...draw, stage: "hidden" });
    } else {
      setDraw(null);
    }
  }

  function readyForNextDraw() {
    if (nextUnassignedSeat) {
      setDraw({
        seatId: nextUnassignedSeat.id,
        stage: "choosing",
        tokenOrder: shuffleTokens(game.bag),
      });
    } else {
      setDraw(null);
    }
  }

  // Shares the draw's own bag, so a token taken here can't also be drawn.
  function assignManually(playerId: string, tokenId: string) {
    const token = game.bag.find((t) => t.id === tokenId);
    if (!token) return;

    update({
      ...game,
      bag: game.bag.filter((t) => t.id !== token.id),
      players: updatePlayer(playerId, tokenAssignmentPatch(token)),
    });
    if (draw?.seatId === playerId) setDraw(null);
  }

  function openTravellerForm() {
    setTravellerTokenId(game.travellerBag[0]?.id ?? "");
    setTravellerAlignment("good");
    setTravellerSeat(lastSeat(game.players) + 1);
    setTravellerFormOpen(true);
  }

  // Travellers join the circle from their own bag, at whichever seat the
  // storyteller chose — they never compete with the official-team target
  // counts.
  function addTraveller(event: FormEvent) {
    event.preventDefault();
    const token = game.travellerBag.find((t) => t.id === travellerTokenId);
    if (!token) return;

    const travellerCount = game.players.filter((p) => p.isTraveller).length;
    const newPlayer: Player = {
      id: crypto.randomUUID(),
      seat: travellerSeat,
      name: `Traveller ${travellerCount + 1}`,
      characterId: token.characterId,
      startingCharacterId: token.characterId,
      isDrunk: false,
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
      travellerBag: game.travellerBag.filter((t) => t.id !== token.id),
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
  // Every seat filled — the setup screens give way to the grimoire itself.
  const setupComplete =
    game.players.length > 0 &&
    game.players.every((p) => p.characterId !== null);
  // "Screen blurred/obscured" means the *whole* screen, not just the draw
  // card — every other control (seat names, manual-assign dropdowns listing
  // bag characters, traveller add, the grimoire board once every seat is
  // filled) has to disappear too, both while a character is privately on
  // screen and while the device is mid pass-around — i.e. whenever a draw is
  // active and it isn't the safe "choosing" stage. Written as a deny-list
  // (not `stage === "revealed" || stage === "hidden"`) so a future
  // privacy-sensitive stage is obscured by default instead of needing this
  // line remembered.
  const screenObscured = draw !== null && draw.stage !== "choosing";
  // Export/end-game/script-sharing stay reachable through a private reveal
  // (issue #21 AC: always reachable) — only the pass-around hand-off itself
  // hides them, so a drawing player can't see them mid-pass.
  const passAroundHidden = draw?.stage === "hidden";

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
        <button
          type="button"
          className={styles.back}
          onClick={() => router.back()}
        >
          ← {game.scriptName}
        </button>
      )}
      <h1 className={styles.title}>{game.scriptName}</h1>

      <p className={styles.progress}>
        {assignedCount}/{officialSeats.length} seats assigned
      </p>

      {!draw && nextUnassignedSeat && game.bag.length > 0 && (
        <button type="button" className={styles.startDraw} onClick={startDraw}>
          Start bag draw
        </button>
      )}

      {draw && drawingSeat && (
        <div className={styles.drawFlow} role="region" aria-label="Bag draw">
          {draw.stage === "choosing" && (
            <>
              <p>
                {drawingSeat.name}, tap a token to draw
              </p>
              <ul className={styles.tokenGrid}>
                {draw.tokenOrder.map((token, index) => (
                  <li key={token.id}>
                    <button
                      type="button"
                      className={styles.faceDownToken}
                      aria-label={`Face-down token ${index + 1}`}
                      onClick={() => chooseToken(token.id)}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}

          {draw.stage === "revealed" && revealedCharacter && (
            <div
              className={styles.reveal}
              role="dialog"
              aria-label={revealedCharacter.name}
              aria-modal="true"
            >
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
                  onSelect={(name) => renamePlayer(draw.seatId, name)}
                />
                <button type="button" onClick={hideAndPass}>
                  Hide &amp; pass
                </button>
              </div>
            </div>
          )}

          {draw.stage === "hidden" && (
            <div className={styles.privacyGuard}>
              <p>
                Card hidden. Pass the device to {nextUnassignedSeat?.name}.
              </p>
              <button type="button" onClick={readyForNextDraw}>
                Ready to draw
              </button>
            </div>
          )}
        </div>
      )}

      {!screenObscured && game.travellerBag.length > 0 && !travellerFormOpen && (
        <button
          type="button"
          className={styles.addTraveller}
          onClick={openTravellerForm}
        >
          Add traveller
        </button>
      )}

      {!screenObscured && travellerFormOpen && (
        <form className={styles.travellerForm} onSubmit={addTraveller}>
          <label>
            Traveller character
            <select
              value={travellerTokenId}
              onChange={(event) => setTravellerTokenId(event.target.value)}
            >
              {game.travellerBag.map((token) => (
                <option key={token.id} value={token.id}>
                  {characterById.get(token.characterId)?.name ??
                    token.characterId}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>Alignment</legend>
            <label>
              <input
                type="radio"
                name="traveller-alignment"
                value="good"
                checked={travellerAlignment === "good"}
                onChange={() => setTravellerAlignment("good")}
              />
              Good
            </label>
            <label>
              <input
                type="radio"
                name="traveller-alignment"
                value="evil"
                checked={travellerAlignment === "evil"}
                onChange={() => setTravellerAlignment("evil")}
              />
              Evil
            </label>
          </fieldset>
          <label>
            Seat position
            <select
              className={styles.select}
              value={travellerSeat}
              onChange={(event) => setTravellerSeat(Number(event.target.value))}
            >
              {seatPositionOptions(game.players).map((option) => (
                <option key={option.seat} value={option.seat}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Add to the circle</button>
        </form>
      )}

      {setupComplete && !screenObscured && !tokenFormOpen && (
        <button
          type="button"
          className={styles.addTraveller}
          onClick={openTokenForm}
        >
          Add character
        </button>
      )}

      {setupComplete && !screenObscured && tokenFormOpen && (
        <form className={styles.travellerForm} onSubmit={addToken}>
          <label>
            Character
            <select
              value={tokenCharacterId}
              onChange={(event) => setTokenCharacterId(event.target.value)}
            >
              {addTokenOptions.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Seat position
            <select
              className={styles.select}
              value={tokenSeat}
              onChange={(event) => setTokenSeat(Number(event.target.value))}
            >
              {seatPositionOptions(game.players).map((option) => (
                <option key={option.seat} value={option.seat}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Add to the grimoire</button>
          <button type="button" onClick={() => setTokenFormOpen(false)}>
            Cancel
          </button>
        </form>
      )}

      {setupComplete ? (
        <>
          {!showWalkthrough &&
            !screenObscured &&
            walkthroughSteps.length > 0 &&
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
                  {firstNightEnded(game) ? "pending." : "to make before the first night."}
                </p>
                <button
                  type="button"
                  className={styles.walkthroughStart}
                  onClick={openWalkthrough}
                >
                  Start walkthrough
                </button>
                <button
                  type="button"
                  className={styles.walkthroughSkip}
                  onClick={dismissWalkthroughOffer}
                >
                  Skip
                </button>
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
                onMove={movePlayer}
                onReCircle={reCircle}
                onReorderSeat={reorderSeat}
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
                onOpenSetupWalkthrough={
                  walkthroughSteps.length > 0 ? openWalkthrough : undefined
                }
              />
            </div>
            <div className={styles.nightListArea}>
              <NightList game={game} characterById={characterById} onChange={update} />
            </div>
            <div className={styles.dayPhaseArea}>
              <DayPhase game={game} onChange={update} />
            </div>
          </div>
          {/* Hidden rather than unmounted while the walkthrough is open, same
              reasoning as the circle above — DemonBluffsPanel owns its own
              session-only state ("Show all characters", an in-flight "Show
              to Demon" overlay) that unmounting would silently discard. Also
              hidden while a draw is obscured, same reasoning as the circle
              above. */}
          <div hidden={showWalkthrough || screenObscured}>
            <DemonBluffsPanel game={game} onChange={update} />
            <ClaimsList
              players={game.players}
              characterById={scriptCharacterById}
              collapsed={game.claimsCollapsed}
              onToggleCollapsed={(collapsed) => update({ ...game, claimsCollapsed: collapsed })}
            />
          </div>
          {showWalkthrough && (
            <SetupWalkthrough
              steps={walkthroughSteps}
              stepStatuses={game.setupWalkthroughSteps}
              players={game.players}
              characterPool={game.characterPool}
              onResolveStep={resolveWalkthroughStep}
              onReassignStandIn={reassignStandIn}
              onClose={() => setShowWalkthrough(false)}
            />
          )}
        </>
      ) : (
        !screenObscured && (
          <ul className={styles.seats} aria-label="Seats">
            {game.players.map((player) => {
              const character = player.characterId
                ? characterById.get(player.characterId)
                : undefined;
              return (
                <li key={player.id} className={styles.seat}>
                  {draw?.seatId === player.id && draw.stage === "revealed" ? (
                    // The reveal panel's PlayerNamePicker is this seat's only
                    // name editor while it's on-screen — a second live field
                    // here would let the two silently overwrite each other.
                    <p className={styles.assignedPlaceholder}>Naming above</p>
                  ) : (
                    <>
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
                      />
                    </>
                  )}
                  {character && draw && (
                    // A draw session is on-screen for a *different* seat
                    // right now, which means the device is mid pass-around
                    // — every other seat's already-revealed identity has
                    // to stay hidden too, not just the seat currently
                    // drawing.
                    <p className={styles.assignedPlaceholder}>Assigned</p>
                  )}
                  {character && !draw && (
                    <div className={styles.assignedCharacter}>
                      <CharacterToken character={character} />
                      <span>{character.name}</span>
                      {player.isTraveller && (
                        <span className={styles.alignment}>
                          {player.travellerAlignment}
                        </span>
                      )}
                      {player.isDrunk && (
                        <span className={styles.drunkNote}>
                          (actually the Drunk)
                        </span>
                      )}
                    </div>
                  )}
                  {!character && (
                    <label>
                      Assign seat {player.seat} manually
                      <select
                        className={styles.select}
                        value=""
                        onChange={(event) =>
                          assignManually(player.id, event.target.value)
                        }
                      >
                        <option value="">Choose a character…</option>
                        {game.bag.map((token) => (
                          <option key={token.id} value={token.id}>
                            {characterById.get(token.characterId)?.name ??
                              token.characterId}
                          </option>
                        ))}
                      </select>
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
          <ShareScriptButton
            meta={shareableScriptMeta}
            characters={game.characterPool}
          />
          <EndGamePanel game={game} onChange={update} />
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
