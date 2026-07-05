import { isOfficialCharacter, type Team } from "./characters";
import type { GameDocument, Player } from "./gameDocument";

// The post-draw setup walkthrough (issue #26): a curated table of official
// characters whose ability needs a storyteller decision before the first
// night, one step per player holding such a character, plus a generic
// fallback for homebrew characters the table doesn't cover. Steps carry
// enough data to render their own picker; resolving one only ever produces
// ordinary reminder tokens — nothing here is a new persisted state kind.
export type SetupWalkthroughStepKind =
  | "playerPick"
  | "characterAndTwoPlayers"
  | "neighborCheck"
  | "believedDemon"
  | "acknowledge"
  | "review"
  | "generic";

interface StepBase {
  // The holding player's id — stable across re-renders, since steps are
  // rebuilt fresh from players/characterPool every time.
  id: string;
  characterId: string;
  characterName: string;
  playerId: string;
  playerName: string;
  title: string;
  ruleText: string;
}

export interface PlayerPickStep extends StepBase {
  kind: "playerPick";
  reminderLabel: string;
}

export interface CharacterAndTwoPlayersStep extends StepBase {
  kind: "characterAndTwoPlayers";
  candidateTeam: Team;
  trueLabel: string;
  falseLabel: string;
}

export interface NeighborCheckStep extends StepBase {
  kind: "neighborCheck";
  reminderLabel: string;
  seatedCorrectly: boolean;
}

export interface BelievedDemonStep extends StepBase {
  kind: "believedDemon";
}

export interface AcknowledgeStep extends StepBase {
  kind: "acknowledge";
  message: string;
}

export interface ReviewStep extends StepBase {
  kind: "review";
  reminderLabel: string;
}

export interface GenericStep extends StepBase {
  kind: "generic";
  reminderOptions: string[];
}

export type SetupWalkthroughStep =
  | PlayerPickStep
  | CharacterAndTwoPlayersStep
  | NeighborCheckStep
  | BelievedDemonStep
  | AcknowledgeStep
  | ReviewStep
  | GenericStep;

const PLAYER_PICK_TABLE: Record<
  string,
  { title: string; ruleText: string; reminderLabel: string }
> = {
  fortuneteller: {
    title: "Fortune Teller — red herring",
    ruleText:
      "Pick one good player who will always register as a demon to the Fortune Teller.",
    reminderLabel: "Red herring",
  },
  grandmother: {
    title: "Grandmother — grandchild",
    ruleText: "Pick which player is the Grandmother's grandchild.",
    reminderLabel: "Grandchild",
  },
  eviltwin: {
    title: "Evil Twin — twin",
    ruleText: "Pick the good player who is the Evil Twin's counterpart.",
    reminderLabel: "Twin",
  },
};

const CHARACTER_AND_TWO_PLAYERS_TABLE: Record<
  string,
  {
    title: string;
    ruleText: string;
    candidateTeam: Team;
    trueLabel: string;
    falseLabel: string;
  }
> = {
  washerwoman: {
    title: "Washerwoman — character and two players",
    ruleText:
      "Pick a Townsfolk character and two players; one of them holds it.",
    candidateTeam: "townsfolk",
    trueLabel: "Townsfolk",
    falseLabel: "Wrong",
  },
  librarian: {
    title: "Librarian — character and two players",
    ruleText:
      "Pick an Outsider character and two players; one of them holds it (or confirm there are none in play).",
    candidateTeam: "outsider",
    trueLabel: "Outsider",
    falseLabel: "Wrong",
  },
  investigator: {
    title: "Investigator — character and two players",
    ruleText: "Pick a Minion character and two players; one of them holds it.",
    candidateTeam: "minion",
    trueLabel: "Minion",
    falseLabel: "Wrong",
  },
};

function seatSorted(players: Player[]): Player[] {
  return [...players].sort((a, b) => a.seat - b.seat);
}

// True when the given player sits immediately beside the game's Demon,
// wrapping around the circle (issue #26 AC: "Marionette seated-next-to-Demon
// check"). False (with no crash) when there's no Demon in play or too few
// seats for the concept of "neighbour" to apply.
function seatedNextToDemon(
  player: Player,
  players: Player[],
  characterById: Map<string, { team: Team }>,
): boolean {
  const sorted = seatSorted(players);
  const total = sorted.length;
  if (total < 2) return false;
  const demonIndex = sorted.findIndex(
    (p) => p.characterId && characterById.get(p.characterId)?.team === "demon",
  );
  if (demonIndex === -1) return false;
  const beforeId = sorted[(demonIndex - 1 + total) % total].id;
  const afterId = sorted[(demonIndex + 1) % total].id;
  return player.id === beforeId || player.id === afterId;
}

export function buildSetupWalkthroughSteps(
  game: Pick<GameDocument, "players" | "characterPool">,
): SetupWalkthroughStep[] {
  const characterById = new Map(
    game.characterPool.map((c) => [c.id, c] as const),
  );
  const steps: SetupWalkthroughStep[] = [];

  for (const player of seatSorted(game.players)) {
    if (!player.characterId) continue;
    const character = characterById.get(player.characterId);
    if (!character) continue;
    const base = {
      id: player.id,
      characterId: character.id,
      characterName: character.name,
      playerId: player.id,
      playerName: player.name,
    };

    // A Drunk's apparent character is a fake stand-in — their ability
    // doesn't function, so they get only the Drunk's own review step, never
    // that character's curated/generic step.
    if (player.isDrunk) {
      steps.push({
        ...base,
        kind: "review",
        title: "Drunk — review the stand-in",
        ruleText: `${player.name} was given the Drunk's stand-in character during the bag draw and believes they are it. Confirm this is still correct before the first night.`,
        reminderLabel: "Drunk",
      });
      continue;
    }

    const playerPick = PLAYER_PICK_TABLE[character.id];
    if (playerPick) {
      steps.push({ ...base, kind: "playerPick", ...playerPick });
      continue;
    }

    const characterAndTwoPlayers = CHARACTER_AND_TWO_PLAYERS_TABLE[character.id];
    if (characterAndTwoPlayers) {
      steps.push({
        ...base,
        kind: "characterAndTwoPlayers",
        ...characterAndTwoPlayers,
      });
      continue;
    }

    if (character.id === "marionette") {
      steps.push({
        ...base,
        kind: "neighborCheck",
        title: "Marionette — seating check",
        ruleText:
          "The Marionette must sit next to the Demon — move a player if not.",
        reminderLabel: "Is the Marionette",
        seatedCorrectly: seatedNextToDemon(player, game.players, characterById),
      });
      continue;
    }

    if (character.id === "lunatic") {
      steps.push({
        ...base,
        kind: "believedDemon",
        title: "Lunatic — believed demon",
        ruleText:
          "Pick which Demon character the Lunatic believes they are, so you know which fake info and attacks to feed them.",
      });
      continue;
    }

    if (character.id === "damsel") {
      steps.push({
        ...base,
        kind: "acknowledge",
        title: "Damsel — tell the Minions",
        ruleText: "All Minions must be told that the Damsel is in play.",
        message: "Tell all Minions that the Damsel is in play.",
      });
      continue;
    }

    // Fallback for anything the curated table doesn't cover. Restricted to
    // genuinely homebrew characters (not just any official character the
    // table hasn't gotten to) — otherwise nearly every game would surface a
    // step for ordinary mid-game reminders like the Imp's "Dead", which
    // isn't a setup-time decision at all.
    if (!isOfficialCharacter(character) && character.reminders.length > 0) {
      steps.push({
        ...base,
        kind: "generic",
        title: `${character.name} — reminder tokens`,
        ruleText: `${character.name} isn't in the curated setup list. Place any of its reminder tokens now if this game needs them.`,
        reminderOptions: character.reminders,
      });
    }
  }

  return steps;
}
