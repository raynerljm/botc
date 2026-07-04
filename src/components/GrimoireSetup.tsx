"use client";

import { useMemo, useState, type FormEvent } from "react";

import type { Character } from "@/lib/characters";
import {
  shuffleTokens,
  type Alignment,
  type BagToken,
  type GameDocument,
  type Player,
} from "@/lib/gameDocument";
import { saveGame } from "@/lib/gameStorage";

import { CharacterToken } from "./CharacterToken";
import { GrimoireCircle } from "./GrimoireCircle";
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
  tokenOrder: string[];
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

  function renamePlayer(playerId: string, name: string) {
    update({
      ...game,
      players: game.players.map((player) =>
        player.id === playerId ? { ...player, name } : player,
      ),
    });
  }

  function startDraw() {
    if (!nextUnassignedSeat) return;
    setDraw({
      seatId: nextUnassignedSeat.id,
      stage: "choosing",
      tokenOrder: shuffleTokens(game.bag).map((t) => t.id),
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
    if (!token) return;

    update({
      ...game,
      bag: game.bag.filter((t) => t.id !== token.id),
      players: game.players.map((player) =>
        player.id === draw.seatId
          ? {
              ...player,
              characterId: token.characterId,
              isDrunk: token.isDrunkStandIn,
            }
          : player,
      ),
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
        tokenOrder: shuffleTokens(game.bag).map((t) => t.id),
      });
    } else {
      setDraw(null);
    }
  }

  // Assigns any seat directly from the remaining bag, pulling from the same
  // pool the draw flow uses — no reveal, no privacy guard, storyteller-driven.
  function assignManually(playerId: string, tokenId: string) {
    const token = game.bag.find((t) => t.id === tokenId);
    if (!token) return;

    update({
      ...game,
      bag: game.bag.filter((t) => t.id !== token.id),
      players: game.players.map((player) =>
        player.id === playerId
          ? {
              ...player,
              characterId: token.characterId,
              isDrunk: token.isDrunkStandIn,
            }
          : player,
      ),
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
  const bagById = new Map(game.bag.map((t) => [t.id, t] as const));
  const shuffledBag: BagToken[] = draw
    ? draw.tokenOrder
        .map((id) => bagById.get(id))
        .filter((t): t is BagToken => t !== undefined)
    : [];
  // Every seat filled — the setup screens give way to the grimoire itself.
  const setupComplete =
    game.players.length > 0 &&
    game.players.every((p) => p.characterId !== null);

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
                {shuffledBag.map((token, index) => (
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

      {game.travellerBag.length > 0 && !travellerFormOpen && (
        <button
          type="button"
          className={styles.addTraveller}
          onClick={openTravellerForm}
        >
          Add traveller
        </button>
      )}

      {travellerFormOpen && (
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
          <GrimoireCircle
            players={game.players}
            characterById={characterById}
            onRename={renamePlayer}
          />
        </div>
      ) : (
        <ul className={styles.seats}>
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
                {character && (
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
      )}
    </div>
  );
}
