"use client";

import { useMemo, useState, type FormEvent } from "react";

import {
  characterPickerPool,
  getCharacter,
  SEAT_HOLDING_TEAMS,
  type Character,
} from "@/lib/characters";
import {
  DRUNK_ID,
  insertAtSeat,
  shuffleTokens,
  withRestoredReminder,
  type Alignment,
  type BagToken,
  type GameDocument,
  type Player,
  type PlayerPosition,
  type ReminderToken,
} from "@/lib/gameDocument";
import { saveGame } from "@/lib/gameStorage";

import { CharacterToken } from "./CharacterToken";
import { ClaimsList } from "./ClaimsList";
import { DayPhase } from "./DayPhase";
import { DemonBluffsPanel } from "./DemonBluffsPanel";
import { EndGamePanel } from "./EndGamePanel";
import { GrimoireBoard } from "./GrimoireBoard";
import { NightList } from "./NightList";
import styles from "./GrimoireSetup.module.css";
import { ShareScriptButton } from "./ShareScriptButton";

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
  const [game, setGame] = useState(initialGame);
  const [draw, setDraw] = useState<DrawState | null>(null);
  const [travellerFormOpen, setTravellerFormOpen] = useState(false);
  const [travellerTokenId, setTravellerTokenId] = useState("");
  const [travellerAlignment, setTravellerAlignment] =
    useState<Alignment>("good");
  const [travellerSeat, setTravellerSeat] = useState(1);
  const [tokenFormOpen, setTokenFormOpen] = useState(false);
  const [tokenCharacterId, setTokenCharacterId] = useState("");
  const [tokenSeat, setTokenSeat] = useState(1);

  const characterById = useMemo(
    () => new Map(game.characterPool.map((c) => [c.id, c] as const)),
    [game.characterPool],
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
  // then the rest of the dataset — travellers and Fabled have their own add
  // flows, so they're excluded here.
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

  function addReminder(input: {
    characterId: string | null;
    label: string;
    position: PlayerPosition;
  }) {
    const reminder: ReminderToken = { id: crypto.randomUUID(), ...input };
    update({ ...game, reminders: [...game.reminders, reminder] });
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

  // Any mutation that can introduce a character id the game hasn't seen
  // before (a swap, a mid-game add, a Fabled) has to also add it here —
  // characterPool is what every token/board lookup resolves display info
  // from, official or homebrew (gameDocument.ts).
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
  // isDrunk always clears: a deliberate swap — whether it's the dedicated
  // Drunk reveal or a storyteller correction to some other character — ends
  // the stand-in illusion either way, so there's nothing left to disguise.
  function swapCharacter(playerId: string, characterId: string) {
    const character = getCharacter(characterId);
    update({
      ...game,
      players: updatePlayer(playerId, { characterId, isDrunk: false }),
      characterPool: withCharacterInPool(game.characterPool, character),
    });
  }

  function removePlayer(playerId: string) {
    const player = game.players.find((p) => p.id === playerId);
    if (!player) return;
    if (!window.confirm(`Remove ${player.name} from the grimoire?`)) return;
    update({
      ...game,
      players: game.players.filter((p) => p.id !== playerId),
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

  function addFabled(characterId: string) {
    if (game.activeFabled.includes(characterId)) return;
    const character = getCharacter(characterId);
    update({
      ...game,
      activeFabled: [...game.activeFabled, characterId],
      characterPool: withCharacterInPool(game.characterPool, character),
    });
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
          <label>
            Seat position
            <select
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

      {!screenObscured && !tokenFormOpen && (
        <button
          type="button"
          className={styles.addTraveller}
          onClick={openTokenForm}
        >
          Add character
        </button>
      )}

      {!screenObscured && tokenFormOpen && (
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
        </form>
      )}

      {setupComplete ? (
        <>
          <div className={styles.circleLayout}>
            <div role="region" aria-label="Grimoire circle">
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
                onRemoveReminder={removeReminder}
                onRestoreReminder={restoreReminder}
                onSwapCharacter={swapCharacter}
                onRemovePlayer={removePlayer}
                onRevealDrunk={revealDrunk}
                onAddFabled={addFabled}
                onRemoveFabled={removeFabled}
                onSetClaim={setClaim}
              />
            </div>
            <div className={styles.sidePanels}>
              <NightList game={game} characterById={characterById} onChange={update} />
              <DayPhase game={game} onChange={update} />
            </div>
          </div>
          <DemonBluffsPanel game={game} onChange={update} />
          <ClaimsList players={game.players} characterById={scriptCharacterById} />
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

      {/* End-game, export, and script sharing are always reachable (export
          works mid-game too, issue #21 AC), but hidden while the device is
          mid pass-around so a drawing player can't see it. */}
      {!screenObscured && (
        <>
          <ShareScriptButton
            meta={shareableScriptMeta}
            characters={game.characterPool}
          />
          <EndGamePanel game={game} onChange={update} />
        </>
      )}
    </div>
  );
}
