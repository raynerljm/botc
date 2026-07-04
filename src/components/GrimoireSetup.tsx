"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";

import type { Character } from "@/lib/characters";
import {
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
import { buildSetupWalkthroughSteps } from "@/lib/setupWalkthrough";

import { CharacterToken } from "./CharacterToken";
import { EndGamePanel } from "./EndGamePanel";
import { GrimoireBoard } from "./GrimoireBoard";
import styles from "./GrimoireSetup.module.css";
import { SetupWalkthrough, type SetupWalkthroughReminderInput } from "./SetupWalkthrough";

export interface GrimoireSetupProps {
  game: GameDocument;
}

type DrawStage = "choosing" | "confirming" | "revealed" | "hidden";

interface DrawState {
  seatId: string;
  stage: DrawStage;
  chosenTokenId?: string;
  revealedCharacterId?: string;
  // Shuffled once per seat's turn — tokens are face-down either way, but
  // this keeps faith with the physical bag-draw ritual (issue #12 AC).
  tokenOrder: BagToken[];
}

export function GrimoireSetup({ game: initialGame }: GrimoireSetupProps) {
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
  // Tracks which reminder ids each walkthrough step last placed, so
  // resolveWalkthroughStep can remove exactly those before adding a fresh
  // set — otherwise re-answering a step (Redo) would leave the previous
  // answer's tokens on the board alongside the new ones. Session-local only
  // (not part of GameDocument): it's bookkeeping for this component, not a
  // new persisted state kind — the reminders themselves are the only
  // decision data that survives a reload.
  const stepReminderIdsRef = useRef<Record<string, string[]>>({});

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

  // A token landing on a seat always sets the same two fields, whether it
  // got there by draw or by manual assignment.
  function tokenAssignmentPatch(
    token: BagToken,
  ): Pick<Player, "characterId" | "isDrunk"> {
    return { characterId: token.characterId, isDrunk: token.isDrunkStandIn };
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
  }) {
    const reminder: ReminderToken = { id: crypto.randomUUID(), ...input };
    update({
      ...gameRef.current,
      reminders: [...gameRef.current.reminders, reminder],
    });
  }

  function moveReminder(reminderId: string, position: PlayerPosition) {
    update({
      ...game,
      reminders: game.reminders.map((r) =>
        r.id === reminderId ? { ...r, position } : r,
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
  function restoreReminder(reminder: ReminderToken) {
    update({ ...game, reminders: withRestoredReminder(game.reminders, reminder) });
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

  // Atomically swaps out whatever reminders this step last placed for the
  // ones it just produced, then records its status — one update() call, so
  // a Redo can never leave a stale token from the previous answer behind,
  // and a step with two reminders (Washerwoman) never risks a partial write.
  function resolveWalkthroughStep(
    stepId: string,
    status: SetupWalkthroughStepStatus,
    reminders: SetupWalkthroughReminderInput[],
  ) {
    const previousIds = stepReminderIdsRef.current[stepId] ?? [];
    const newReminders: ReminderToken[] = reminders.map((input) => ({
      id: crypto.randomUUID(),
      ...input,
    }));
    stepReminderIdsRef.current = {
      ...stepReminderIdsRef.current,
      [stepId]: newReminders.map((r) => r.id),
    };

    update({
      ...gameRef.current,
      reminders: [
        ...gameRef.current.reminders.filter((r) => !previousIds.includes(r.id)),
        ...newReminders,
      ],
      setupWalkthroughSteps: {
        ...gameRef.current.setupWalkthroughSteps,
        [stepId]: status,
      },
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

  function chooseToken(tokenId: string) {
    setDraw((current) =>
      current ? { ...current, stage: "confirming", chosenTokenId: tokenId } : current,
    );
  }

  function chooseAgain() {
    setDraw((current) =>
      current
        ? { ...current, stage: "choosing", chosenTokenId: undefined }
        : current,
    );
  }

  function keepToken() {
    if (!draw?.chosenTokenId) return;
    const token = game.bag.find((t) => t.id === draw.chosenTokenId);
    // The chosen token can vanish from the bag if it was manually assigned
    // to a different seat while this one was still confirming — fall back
    // to choosing again from what's actually left rather than leaving the
    // confirm dialog stuck on a token that no longer exists.
    if (!token) {
      setDraw({
        ...draw,
        stage: "choosing",
        chosenTokenId: undefined,
        tokenOrder: shuffleTokens(game.bag),
      });
      return;
    }

    update({
      ...game,
      bag: game.bag.filter((t) => t.id !== token.id),
      players: updatePlayer(draw.seatId, tokenAssignmentPatch(token)),
    });
    setDraw({
      ...draw,
      stage: "revealed",
      revealedCharacterId: token.characterId,
    });
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
    setTravellerFormOpen(true);
  }

  // Travellers join the circle from their own bag, at a new seat appended to
  // the end — they never compete with the official-team target counts.
  function addTraveller(event: FormEvent) {
    event.preventDefault();
    const token = game.travellerBag.find((t) => t.id === travellerTokenId);
    if (!token) return;

    const travellerCount = game.players.filter((p) => p.isTraveller).length;
    const newPlayer: Player = {
      id: crypto.randomUUID(),
      seat: game.players.length + 1,
      name: `Traveller ${travellerCount + 1}`,
      characterId: token.characterId,
      isDrunk: false,
      isTraveller: true,
      travellerAlignment,
      dead: false,
      ghostVoteSpent: false,
      position: null,
    };

    update({
      ...game,
      players: [...game.players, newPlayer],
      travellerBag: game.travellerBag.filter((t) => t.id !== token.id),
    });
    setTravellerFormOpen(false);
  }

  const drawingSeat = draw
    ? game.players.find((p) => p.id === draw.seatId)
    : undefined;
  const revealedCharacter: Character | undefined = draw?.revealedCharacterId
    ? characterById.get(draw.revealedCharacterId)
    : undefined;
  // Every seat filled — the setup screens give way to the grimoire itself.
  const setupComplete =
    game.players.length > 0 &&
    game.players.every((p) => p.characterId !== null);
  // "Screen blurred/obscured until the next player deliberately confirms"
  // means the *whole* screen, not just the draw card — every other control
  // (seat names, manual-assign dropdowns listing bag characters, traveller
  // add) has to disappear too while the device is mid pass-around.
  const screenObscured = draw?.stage === "hidden";

  return (
    <div className={styles.main}>
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

          {draw.stage === "confirming" && (
            <div className={styles.confirm}>
              <p>Keep this token?</p>
              <button type="button" onClick={keepToken}>
                Keep this token
              </button>
              <button type="button" onClick={chooseAgain}>
                Choose again
              </button>
            </div>
          )}

          {draw.stage === "revealed" && revealedCharacter && (
            <div className={styles.reveal}>
              <CharacterToken character={revealedCharacter} />
              <h2>{revealedCharacter.name}</h2>
              <p>{revealedCharacter.ability}</p>
              <button type="button" onClick={hideAndPass}>
                Hide &amp; pass
              </button>
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
          <button type="submit">Add to the circle</button>
        </form>
      )}

      {setupComplete ? (
        <>
          {!showWalkthrough &&
            walkthroughSteps.length > 0 &&
            !game.setupWalkthroughOffered && (
              <div
                role="region"
                aria-label="Setup walkthrough offer"
                className={styles.walkthroughOffer}
              >
                <p>
                  {walkthroughSteps.length} setup decision
                  {walkthroughSteps.length === 1 ? "" : "s"} to make before the
                  first night.
                </p>
                <button type="button" onClick={openWalkthrough}>
                  Start walkthrough
                </button>
                <button type="button" onClick={dismissWalkthroughOffer}>
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
              anything that queries by role. */}
          <div
            role="region"
            aria-label="Grimoire circle"
            hidden={showWalkthrough}
          >
            <GrimoireBoard
              players={game.players}
              characterById={characterById}
              almanacUrl={game.almanacUrl}
              reminders={game.reminders}
              onRename={renamePlayer}
              onMove={movePlayer}
              onReCircle={reCircle}
              onReorderSeat={reorderSeat}
              onToggleDead={toggleDead}
              onToggleGhostVote={toggleGhostVote}
              onAddReminder={addReminder}
              onMoveReminder={moveReminder}
              onRemoveReminder={removeReminder}
              onRestoreReminder={restoreReminder}
              onOpenSetupWalkthrough={
                walkthroughSteps.length > 0 ? openWalkthrough : undefined
              }
            />
          </div>
          {showWalkthrough && (
            <SetupWalkthrough
              steps={walkthroughSteps}
              stepStatuses={game.setupWalkthroughSteps}
              players={game.players}
              characterPool={game.characterPool}
              onResolveStep={resolveWalkthroughStep}
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

      {/* End-game and export are always reachable (export works mid-game too,
          issue #21 AC), but hidden while the device is mid pass-around so a
          drawing player can't see it. */}
      {!screenObscured && <EndGamePanel game={game} onChange={update} />}
    </div>
  );
}
