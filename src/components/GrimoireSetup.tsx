"use client";

import { useMemo, useState, type FormEvent } from "react";

import type { Character } from "@/lib/characters";
import {
  shuffleTokens,
  type Alignment,
  type BagToken,
  type GameDocument,
  type Player,
  type PlayerPosition,
} from "@/lib/gameDocument";
import { saveGame } from "@/lib/gameStorage";

import { CharacterToken } from "./CharacterToken";
import { EndGamePanel } from "./EndGamePanel";
import { GrimoireBoard } from "./GrimoireBoard";
import styles from "./GrimoireSetup.module.css";

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
  const [draw, setDraw] = useState<DrawState | null>(null);
  const [travellerFormOpen, setTravellerFormOpen] = useState(false);
  const [travellerTokenId, setTravellerTokenId] = useState("");
  const [travellerAlignment, setTravellerAlignment] =
    useState<Alignment>("good");

  const characterById = useMemo(
    () => new Map(game.characterPool.map((c) => [c.id, c] as const)),
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
        <div role="region" aria-label="Grimoire circle">
          <GrimoireBoard
            players={game.players}
            characterById={characterById}
            almanacUrl={game.almanacUrl}
            onRename={renamePlayer}
            onMove={movePlayer}
            onReCircle={reCircle}
            onReorderSeat={reorderSeat}
            onToggleDead={toggleDead}
            onToggleGhostVote={toggleGhostVote}
          />
        </div>
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
