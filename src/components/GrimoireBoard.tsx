"use client";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { getCharacter, wikiUrl, type Character } from "@/lib/characters";
import {
  circlePosition,
  type Player,
  type PlayerPosition,
} from "@/lib/gameDocument";

import { CharacterToken } from "./CharacterToken";
import styles from "./GrimoireBoard.module.css";

export interface GrimoireBoardProps {
  players: Player[];
  characterById: Map<string, Character>;
  almanacUrl?: string | null;
  onRename: (playerId: string, name: string) => void;
  onMove: (playerId: string, position: PlayerPosition) => void;
  onReCircle: () => void;
  onReorderSeat: (playerId: string, direction: "earlier" | "later") => void;
  onToggleDead: (playerId: string) => void;
  onToggleGhostVote: (playerId: string) => void;
}

const MIN_TOKEN_REM = 1.9;
const MAX_TOKEN_REM = 3.4;
const MIN_TOKEN_COUNT = 5;
const MAX_TOKEN_COUNT = 20;

// Interpolates token size down as the pad gets busier, so 20 tokens don't
// overlap and 5 tokens aren't lost in all that space.
function tokenSizeRem(total: number): number {
  const clamped = Math.min(MAX_TOKEN_COUNT, Math.max(MIN_TOKEN_COUNT, total));
  const t = (clamped - MIN_TOKEN_COUNT) / (MAX_TOKEN_COUNT - MIN_TOKEN_COUNT);
  return MAX_TOKEN_REM - t * (MAX_TOKEN_REM - MIN_TOKEN_REM);
}

// Keeps a dragged token's centre within the pad instead of off the edge.
function clampPct(value: number): number {
  return Math.min(96, Math.max(4, value));
}

// A real finger drag always moves a few pixels before settling — without a
// threshold, every tap-to-open-the-menu would also fire a (near-zero) move.
const DRAG_THRESHOLD_PX = 6;

interface DragState {
  playerId: string;
  pointerId: number;
  startX: number;
  startY: number;
  dragged: boolean;
}

export function GrimoireBoard({
  players,
  characterById,
  almanacUrl,
  onRename,
  onMove,
  onReCircle,
  onReorderSeat,
  onToggleDead,
  onToggleGhostVote,
}: GrimoireBoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const justDraggedRef = useRef<string | null>(null);
  const [hidden, setHidden] = useState(false);

  const sorted = useMemo(
    () => [...players].sort((a, b) => a.seat - b.seat),
    [players],
  );
  const total = sorted.length;
  const tokenSize = tokenSizeRem(total);

  function handlePointerDown(
    event: ReactPointerEvent<HTMLElement>,
    playerId: string,
  ) {
    dragRef.current = {
      playerId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragged: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    const board = boardRef.current;
    if (!drag || !board || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    drag.dragged = true;

    const rect = board.getBoundingClientRect();
    onMove(drag.playerId, {
      x: clampPct(((event.clientX - rect.left) / rect.width) * 100),
      y: clampPct(((event.clientY - rect.top) / rect.height) * 100),
    });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.dragged) justDraggedRef.current = drag.playerId;
    dragRef.current = null;
  }

  // <summary> toggles open on click by default — after an actual drag, that
  // click still fires, so it has to be swallowed once or every drag would
  // also pop the menu open.
  function handleSummaryClick(
    event: React.MouseEvent<HTMLElement>,
    playerId: string,
  ) {
    if (justDraggedRef.current === playerId) {
      event.preventDefault();
      justDraggedRef.current = null;
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.controls}>
        <button type="button" onClick={onReCircle}>
          Re-circle
        </button>
        {!hidden && (
          <button type="button" onClick={() => setHidden(true)}>
            Hide grimoire
          </button>
        )}
      </div>

      <div
        ref={boardRef}
        className={styles.board}
        data-board
        data-hidden={hidden}
        style={{ "--token-size": `${tokenSize}rem` } as React.CSSProperties}
      >
        {!hidden &&
          sorted.map((player, index) => {
            const character = player.characterId
              ? characterById.get(player.characterId)
              : undefined;
            const position = player.position ?? circlePosition(index, total);
            const official = character ? Boolean(getCharacter(character.id)) : false;

            return (
              <div
                key={player.id}
                className={styles.tokenWrap}
                data-player-id={player.id}
                style={{ left: `${position.x}%`, top: `${position.y}%` }}
              >
                <details className={styles.menu}>
                  <summary
                    className={styles.tokenSummary}
                    data-dead={player.dead || undefined}
                    onPointerDown={(event) => handlePointerDown(event, player.id)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onClick={(event) => handleSummaryClick(event, player.id)}
                    // The character art is an <img>, which browsers make
                    // natively draggable — without this, the OS's own
                    // drag-and-drop takes over after the first pointermove
                    // and no further pointer events reach this handler.
                    onDragStart={(event) => event.preventDefault()}
                  >
                    <span className={styles.tokenVisual}>
                      {character && <CharacterToken character={character} />}
                      {player.dead && (
                        <span className={styles.shroud} aria-hidden="true" />
                      )}
                    </span>
                    {character && (
                      <span className={styles.characterName}>{character.name}</span>
                    )}
                    <span className={styles.playerName}>
                      {player.name}
                      {player.dead && (
                        <span className={styles.srOnly}> (dead)</span>
                      )}
                    </span>
                    {player.isDrunk && (
                      <span className={styles.note}>(actually the Drunk)</span>
                    )}
                    {player.isTraveller && (
                      <span className={styles.note}>{player.travellerAlignment}</span>
                    )}
                  </summary>

                  <div className={styles.menuBody}>
                    <label className={styles.field}>
                      Player name
                      <input
                        type="text"
                        value={player.name}
                        onChange={(event) => onRename(player.id, event.target.value)}
                      />
                    </label>

                    <button type="button" onClick={() => onToggleDead(player.id)}>
                      {player.dead ? "Mark alive" : "Mark dead"}
                    </button>

                    <div className={styles.seatControls}>
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => onReorderSeat(player.id, "earlier")}
                      >
                        Move seat earlier
                      </button>
                      <button
                        type="button"
                        disabled={index === total - 1}
                        onClick={() => onReorderSeat(player.id, "later")}
                      >
                        Move seat later
                      </button>
                    </div>

                    {character && (
                      <details className={styles.detail}>
                        <summary>Character detail</summary>
                        <p>{character.ability}</p>
                        {official ? (
                          <a
                            href={wikiUrl(character)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Official wiki page
                          </a>
                        ) : (
                          almanacUrl && (
                            <a href={almanacUrl} target="_blank" rel="noreferrer">
                              Script almanac
                            </a>
                          )
                        )}
                      </details>
                    )}
                  </div>
                </details>

                {player.dead && (
                  <button
                    type="button"
                    className={styles.ghostVote}
                    aria-pressed={player.ghostVoteSpent}
                    onClick={() => onToggleGhostVote(player.id)}
                  >
                    Ghost vote: {player.ghostVoteSpent ? "spent" : "available"}
                  </button>
                )}
              </div>
            );
          })}

        {hidden && (
          <div className={styles.hiddenOverlay}>
            <button type="button" onClick={() => setHidden(false)}>
              Show grimoire
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
