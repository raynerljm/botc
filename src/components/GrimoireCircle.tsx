import type { CSSProperties } from "react";

import type { Character } from "@/lib/characters";
import type { Player } from "@/lib/gameDocument";

import { CharacterToken } from "./CharacterToken";
import styles from "./GrimoireCircle.module.css";

export interface GrimoireCircleProps {
  players: Player[];
  characterById: Map<string, Character>;
  onRename: (playerId: string, name: string) => void;
}

interface SeatStyle extends CSSProperties {
  "--angle": string;
}

// The first visible grimoire: every seat laid out evenly around a circle,
// token art with the player's name — CONTEXT.md's "seat" and "bag draw"
// finally converge into the board the storyteller reads at the table.
export function GrimoireCircle({
  players,
  characterById,
  onRename,
}: GrimoireCircleProps) {
  const total = players.length;

  return (
    <div className={styles.circle}>
      {players.map((player, index) => {
        const character = player.characterId
          ? characterById.get(player.characterId)
          : undefined;
        const angle = (360 / total) * index;
        const style: SeatStyle = { "--angle": `${angle}deg` };

        return (
          <div key={player.id} className={styles.token} style={style}>
            <div className={styles.tokenContent}>
              {character && <CharacterToken character={character} />}
              {character && (
                <span className={styles.characterName}>{character.name}</span>
              )}
              <label className={styles.srOnly} htmlFor={`circle-name-${player.id}`}>
                Seat {player.seat} name
              </label>
              <input
                id={`circle-name-${player.id}`}
                className={styles.nameInput}
                type="text"
                value={player.name}
                onChange={(event) => onRename(player.id, event.target.value)}
              />
              {player.isDrunk && (
                <span className={styles.note}>(actually the Drunk)</span>
              )}
              {player.isTraveller && (
                <span className={styles.note}>{player.travellerAlignment}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
