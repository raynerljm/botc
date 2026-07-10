import type { Character } from "./characters";
import {
  seatedPlayerCount,
  type Alignment,
  type GameDocument,
  type Player,
} from "./gameDocument";
import type { NotesSection } from "./gameNotes";
import { formatDateStampSGT } from "./gameTime";

// The export is its own versioned format (ADR 0002), independent of the game
// document's schema version (ADR 0001) — a document-schema bump must not
// silently restamp exports whose shape hasn't changed. Bumped to 2 for issue
// #15's activeFabled field, to 3 for issue #126's isDrunk field, to 4 for
// issue #163's isLunatic field, and to 5 for issue #193's `notes` shape
// change (freeform string to sectioned notes) — additions/shape changes to
// the snapshot shape itself (unlike claim/demonBluffs, which were already
// part of v1's shape as placeholders).
export const EXPORT_SCHEMA_VERSION = 5;

// The exported snapshot shape (ADR 0002: a snapshot, not an event log).
export interface SnapshotPlayer {
  name: string;
  seat: number;
  startingCharacter: string | null;
  finalCharacter: string | null;
  // Whether this player is standing in as a Townsfolk while secretly the
  // Drunk (CONTEXT.md: Stand-in — "the grimoire records them as the
  // Drunk"). Without this, a Drunk's stand-in character is indistinguishable
  // from a genuine copy of it.
  isDrunk: boolean;
  // Same mechanic as isDrunk, for the Lunatic's Demon stand-in (issue #163).
  isLunatic: boolean;
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
  activeFabled: string[];
  winner: Alignment | null;
  startedAt: string;
  endedAt: string | null;
  notes: NotesSection[];
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
    const startingCharacter = player.startingCharacterId
      ? characterById.get(player.startingCharacterId)
      : undefined;
    const finalCharacter = player.characterId
      ? characterById.get(player.characterId)
      : undefined;
    return {
      name: player.name,
      seat: player.seat,
      startingCharacter: player.startingCharacterId,
      finalCharacter: player.characterId,
      isDrunk: player.isDrunk,
      isLunatic: player.isLunatic,
      startingAlignment: alignmentOf(player, startingCharacter),
      finalAlignment: alignmentOf(player, finalCharacter),
      dead: player.dead,
      claim: player.claim,
    };
  });

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    script: {
      name: game.scriptName,
      // The full script pool, not just characterPool (in-play) — a claim or
      // Demon bluff can reference a not-in-play character (CONTEXT.md:
      // Script is "the list of characters available", not "in play"), and
      // the snapshot would otherwise reference ids missing from its own
      // script.characters list.
      characters: game.scriptCharacters.map((c) => c.id),
    },
    playerCount: seatedPlayerCount(game),
    players,
    demonBluffs: game.demonBluffs.filter((id): id is string => id !== null),
    activeFabled: game.activeFabled,
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
  const date = formatDateStampSGT(game.endedAt ?? game.createdAt);
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
  // Some browsers (notably Safari) need the anchor in the DOM to honor the
  // download, and can cancel it if the object URL is revoked synchronously —
  // so remove the anchor and defer the revoke past this tick instead.
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
