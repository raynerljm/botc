import { isOfficialCharacter, type Team } from "./characters";
import { DRUNK_ID, LUNATIC_ID, type GameDocument, type Player } from "./gameDocument";

// The post-draw setup walkthrough (issue #26): a curated table of official
// characters whose ability needs a storyteller decision before the first
// night, one step per player holding such a character, plus a generic
// fallback for homebrew characters the table doesn't cover. Steps carry
// enough data to render their own picker; resolving one only ever produces
// ordinary reminder tokens — nothing here is a new persisted state kind.
export type SetupWalkthroughStepKind =
  | "demonBluffs"
  | "playerPick"
  | "characterAndTwoPlayers"
  | "neighborCheck"
  | "acknowledge"
  | "review"
  | "generic";

// The id of the walkthrough's one script-level step (CONTEXT.md: Demon
// bluffs — "exactly three slots, script-wide, not per-player"). Fixed and
// exported so callers can key off it without restating the literal.
export const DEMON_BLUFFS_STEP_ID = "demonBluffs";

// Shared by every step kind, player-anchored or not.
interface StepShared {
  id: string;
  title: string;
  ruleText: string;
}

interface StepBase extends StepShared {
  // The holding player's id — stable across re-renders, since steps are
  // rebuilt fresh from players/characterPool every time.
  characterId: string;
  characterName: string;
  playerId: string;
  playerName: string;
}

// Unlike every other step kind, this one isn't anchored to a seat — Demon
// bluffs are chosen once for the whole script, not per-player — so it
// deliberately extends StepShared rather than StepBase, which every other
// kind uses for its playerId/characterId fields.
export interface DemonBluffsStep extends StepShared {
  kind: "demonBluffs";
}

export interface PlayerPickStep extends StepBase {
  kind: "playerPick";
  reminderLabel: string;
  // Set only for the fake step generated for a Drunk's believed character
  // (issue #254) — "drunk", mirroring ReviewStep's own disguiseId. Its
  // presence tells the UI to anchor this step's reminder to the disguised
  // seat itself rather than whichever other player was picked, since the
  // pick is fictional and has no real ability interaction with that player.
  disguiseId?: string;
}

export interface CharacterAndTwoPlayersStep extends StepBase {
  kind: "characterAndTwoPlayers";
  candidateTeam: Team;
  trueLabel: string;
  falseLabel: string;
  // Same meaning as PlayerPickStep.disguiseId above — additionally tells the
  // UI to offer the full script's candidate characters (like the stand-in
  // picker's own #242 fix) rather than the narrower in-play pool, since a
  // fabricated claim isn't bound to "characters actually in this bag" the
  // way a real reveal is.
  disguiseId?: string;
}

export interface NeighborCheckStep extends StepBase {
  kind: "neighborCheck";
  reminderLabel: string;
  seatedCorrectly: boolean;
}

export interface AcknowledgeStep extends StepBase {
  kind: "acknowledge";
  message: string;
}

export interface ReviewStep extends StepBase {
  kind: "review";
  reminderLabel: string;
  // The seat's true identity behind the disguise ("drunk" or "lunatic") —
  // used for the review reminder's own characterId (not the stand-in's, per
  // issue #163's generalisation of issue #52's Drunk-only review step).
  disguiseId: string;
  // Which team the reassignment picker offers candidates from (townsfolk for
  // the Drunk, demon for the Lunatic).
  standInTeam: Team;
}

export interface GenericStep extends StepBase {
  kind: "generic";
  reminderOptions: string[];
}

export type SetupWalkthroughStep =
  | DemonBluffsStep
  | PlayerPickStep
  | CharacterAndTwoPlayersStep
  | NeighborCheckStep
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

// The id prefix a believed-character step's own id is built from — exported
// so GrimoireSetup.tsx can recognise (and clean up) one without duplicating
// the format. Prefixed, not suffixed like `${seatId}:believed` would be:
// GrimoireSetup's resolveWalkthroughStep matches a step's reminders by
// `id.startsWith("setupwalkthrough:{stepId}:")`, so a believed step's id
// must not itself start with the review step's own id (`seatId`) followed
// by ":" — `${seatId}:believed` would, and the review step's own resolve
// (reminders: []) would then wipe the believed step's just-placed reminders
// as a false-positive prefix match (code review finding).
export const BELIEVED_STEP_ID_PREFIX = "believed:";

// A Drunk's ability doesn't function, but the storyteller must still
// maintain the illusion for whichever character they believe they are
// (issue #254) — a fake Grandmother still needs a fake grandchild, a fake
// Washerwoman a fake character + two players, etc. Generates that believed
// character's own curated step, reframed as fake and keyed by a distinct id
// so it coexists with the Drunk's own review step for the same seat.
// Returns undefined when the believed character has no curated step at all
// (e.g. Chef, Empath) — those seats keep only the review step, as today.
function believedCharacterStep(
  base: Pick<StepBase, "characterId" | "characterName" | "playerId" | "playerName">,
  seatId: string,
): PlayerPickStep | CharacterAndTwoPlayersStep | undefined {
  const believedFraming = `${base.playerName} believes they are the ${base.characterName}.`;
  const id = `${BELIEVED_STEP_ID_PREFIX}${seatId}`;

  const playerPick = PLAYER_PICK_TABLE[base.characterId];
  if (playerPick) {
    return {
      ...base,
      id,
      kind: "playerPick",
      title: `Drunk's ${playerPick.title}`,
      ruleText: `${believedFraming} ${playerPick.ruleText}`,
      reminderLabel: playerPick.reminderLabel,
      disguiseId: DRUNK_ID,
    };
  }

  const characterAndTwoPlayers = CHARACTER_AND_TWO_PLAYERS_TABLE[base.characterId];
  if (characterAndTwoPlayers) {
    return {
      ...base,
      id,
      kind: "characterAndTwoPlayers",
      title: `Drunk's ${characterAndTwoPlayers.title}`,
      ruleText: `${believedFraming} ${characterAndTwoPlayers.ruleText}`,
      candidateTeam: characterAndTwoPlayers.candidateTeam,
      trueLabel: characterAndTwoPlayers.trueLabel,
      falseLabel: characterAndTwoPlayers.falseLabel,
      disguiseId: DRUNK_ID,
    };
  }

  return undefined;
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
  // Excludes the Lunatic even though their characterId can now match the
  // real Demon's (issue #241 lets the Lunatic's stand-in be the in-play
  // Demon) — this check is about the real Demon's seat, not whichever seat
  // merely displays that character's name.
  const demonIndex = sorted.findIndex(
    (p) =>
      !p.isLunatic &&
      p.characterId &&
      characterById.get(p.characterId)?.team === "demon",
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
  // Always present, first, and regardless of who's in play — Demon bluffs
  // are a script-wide decision, not conditioned on any character being
  // seated (issue #155 AC: "whenever the walkthrough is shown").
  const steps: SetupWalkthroughStep[] = [
    {
      id: DEMON_BLUFFS_STEP_ID,
      kind: "demonBluffs",
      title: "Demon bluffs",
      ruleText:
        "Choose the three not-in-play good characters to show the Demon on the first night.",
    },
  ];

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
        disguiseId: DRUNK_ID,
        standInTeam: "townsfolk",
      });
      const believed = believedCharacterStep(base, player.id);
      if (believed) steps.push(believed);
      continue;
    }

    // Same mechanic as the Drunk above, for the Lunatic's Demon stand-in
    // (issue #163) — the initial pick already happened at bag build, so this
    // is a review step, not a fresh up-front pick.
    if (player.isLunatic) {
      steps.push({
        ...base,
        kind: "review",
        title: "Lunatic — review the stand-in",
        ruleText: `${player.name} was given the Lunatic's stand-in Demon during the bag draw and believes they are it. Confirm this is still correct before the first night.`,
        reminderLabel: "Lunatic",
        disguiseId: LUNATIC_ID,
        standInTeam: "demon",
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
