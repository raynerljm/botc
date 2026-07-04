import type { Character } from "./characters";
import {
  seatedPlayerCount,
  type Alignment,
  type GameDocument,
  type Player,
} from "./gameDocument";

// The export is its own versioned format (ADR 0002), independent of the game
// document's schema version (ADR 0001) — a document-schema bump must not
// silently restamp exports whose shape hasn't changed.
export const EXPORT_SCHEMA_VERSION = 1;

// The exported snapshot shape (ADR 0002: a snapshot, not an event log). Fields
// that later slices fill in — final character (swaps, #15), dead (#13), claim
// and demonBluffs (#18) — are present now with safe defaults so the file
// format is stable from this slice on and those slices only have to populate
// them.
export interface SnapshotPlayer {
  name: string;
  seat: number;
  startingCharacter: string | null;
  finalCharacter: string | null;
  startingAlignment: Alignment | null;
  finalAlignment: Alignment | null;
  dead: boolean;
  claim: string | null;
}

export interface GameSnapshot {
  schemaVersion: typeof EXPORT_SCHEMA_VERSION;
  script: { name: string; characters: string[] };
  playerCount: number;
  players: SnapshotPlayer[];
  demonBluffs: string[];
  winner: Alignment | null;
  startedAt: string;
  endedAt: string | null;
  notes: string;
}

// A player's alignment for the snapshot: travellers carry the alignment the
// storyteller chose for them; everyone else derives it from their character's
// team. Fabled/Loric and unassigned seats have no good/evil alignment.
function alignmentOf(
  player: Player,
  character: Character | undefined,
): Alignment | null {
  if (player.isTraveller) return player.travellerAlignment;
  switch (character?.team) {
    case "minion":
    case "demon":
      return "evil";
    case "townsfolk":
    case "outsider":
      return "good";
    default:
      return null;
  }
}

export function buildGameSnapshot(game: GameDocument): GameSnapshot {
  const characterById = new Map(game.characterPool.map((c) => [c.id, c]));

  const players: SnapshotPlayer[] = game.players.map((player) => {
    const character = player.characterId
      ? characterById.get(player.characterId)
      : undefined;
    const alignment = alignmentOf(player, character);
    // No character-swap tracking yet (#15), so a player's starting and final
    // character/alignment are the same. The two fields still export
    // separately so a game with no swaps reads correctly and later slices
    // only need to diverge them.
    return {
      name: player.name,
      seat: player.seat,
      startingCharacter: player.characterId,
      finalCharacter: player.characterId,
      startingAlignment: alignment,
      finalAlignment: alignment,
      dead: false,
      claim: null,
    };
  });

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    script: {
      name: game.scriptName,
      characters: game.characterPool.map((c) => c.id),
    },
    playerCount: seatedPlayerCount(game),
    players,
    demonBluffs: [],
    winner: game.winner,
    startedAt: game.createdAt,
    endedAt: game.endedAt,
    notes: game.notes,
  };
}

export function serializeGameSnapshot(game: GameDocument): string {
  return JSON.stringify(buildGameSnapshot(game), null, 2);
}

export function gameSnapshotFilename(game: GameDocument): string {
  const slug =
    game.scriptName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "game";
  const date = (game.endedAt ?? game.createdAt).slice(0, 10);
  return `botc-${slug}-${date}.json`;
}

// Triggers a browser download of the snapshot JSON. The file is the interim
// database until a backend exists (ADR 0001/0002).
export function downloadGameSnapshot(game: GameDocument): void {
  const blob = new Blob([serializeGameSnapshot(game)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = gameSnapshotFilename(game);
  anchor.click();
  URL.revokeObjectURL(url);
}
