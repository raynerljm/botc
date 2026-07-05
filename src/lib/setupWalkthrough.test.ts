import { describe, expect, it } from "vitest";

import { getCharacter, type Character } from "./characters";
import { buildSetupWalkthroughSteps } from "./setupWalkthrough";
import { createGame, type GameDocument } from "./gameDocument";

function characters(...ids: string[]) {
  return ids.map((id) => getCharacter(id)!);
}

// Builds a game with one player per given character id, seated in order,
// each already assigned (as if the bag draw just finished).
function gameWithCharacters(ids: string[], drunkStandInFor?: string): GameDocument {
  const selected = characters(...ids);
  const standIn = drunkStandInFor ? getCharacter(drunkStandInFor)! : null;
  const game = createGame({
    scriptId: "custom",
    scriptName: "Test script",
    playerCount: ids.length,
    selectedCharacters: selected,
    standIn,
    extraCopies: {},
    newId: (() => {
      let n = 0;
      return () => `id-${n++}`;
    })(),
  });

  const assignable = ids
    .filter((id) => id !== "drunk")
    .map((id, i) => ({ playerIndex: i, characterId: id }));

  let players = game.players;
  for (const { playerIndex, characterId } of assignable) {
    const isDrunk = drunkStandInFor !== undefined && characterId === drunkStandInFor;
    players = players.map((p, i) =>
      i === playerIndex ? { ...p, characterId, isDrunk } : p,
    );
  }
  return { ...game, players };
}

function stepFor(game: GameDocument, characterId: string) {
  const player = game.players.find((p) => p.characterId === characterId);
  const steps = buildSetupWalkthroughSteps(game);
  return steps.find((s) => s.playerId === player?.id);
}

describe("buildSetupWalkthroughSteps (issue #26)", () => {
  it("returns no steps for a game with no players assigned yet", () => {
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 5,
      selectedCharacters: characters("imp"),
      standIn: null,
      extraCopies: {},
    });

    expect(buildSetupWalkthroughSteps(game)).toEqual([]);
  });

  it("returns no steps when every in-play character needs no setup decision", () => {
    const game = gameWithCharacters(["imp", "chef", "recluse"]);
    expect(buildSetupWalkthroughSteps(game)).toEqual([]);
  });

  it("gives the Fortune Teller a playerPick step for the red herring", () => {
    const game = gameWithCharacters(["fortuneteller", "imp", "chef"]);
    const step = stepFor(game, "fortuneteller");

    expect(step).toMatchObject({
      kind: "playerPick",
      characterId: "fortuneteller",
      reminderLabel: "Red herring",
    });
  });

  it("gives the Grandmother a playerPick step for the grandchild", () => {
    const game = gameWithCharacters(["grandmother", "imp", "chef"]);
    const step = stepFor(game, "grandmother");

    expect(step).toMatchObject({
      kind: "playerPick",
      characterId: "grandmother",
      reminderLabel: "Grandchild",
    });
  });

  it("gives the Evil Twin a playerPick step for the twin", () => {
    const game = gameWithCharacters(["eviltwin", "imp", "chef"]);
    const step = stepFor(game, "eviltwin");

    expect(step).toMatchObject({
      kind: "playerPick",
      characterId: "eviltwin",
      reminderLabel: "Twin",
    });
  });

  it("gives the Washerwoman a characterAndTwoPlayers step over Townsfolk", () => {
    const game = gameWithCharacters(["washerwoman", "imp", "chef"]);
    const step = stepFor(game, "washerwoman");

    expect(step).toMatchObject({
      kind: "characterAndTwoPlayers",
      characterId: "washerwoman",
      candidateTeam: "townsfolk",
      trueLabel: "Townsfolk",
      falseLabel: "Wrong",
    });
  });

  it("gives the Librarian a characterAndTwoPlayers step over Outsiders", () => {
    const game = gameWithCharacters(["librarian", "imp", "chef"]);
    const step = stepFor(game, "librarian");

    expect(step).toMatchObject({
      kind: "characterAndTwoPlayers",
      characterId: "librarian",
      candidateTeam: "outsider",
      trueLabel: "Outsider",
      falseLabel: "Wrong",
    });
  });

  it("gives the Investigator a characterAndTwoPlayers step over Minions", () => {
    const game = gameWithCharacters(["investigator", "imp", "chef"]);
    const step = stepFor(game, "investigator");

    expect(step).toMatchObject({
      kind: "characterAndTwoPlayers",
      characterId: "investigator",
      candidateTeam: "minion",
      trueLabel: "Minion",
      falseLabel: "Wrong",
    });
  });

  it("gives the Lunatic a believedDemon step", () => {
    const game = gameWithCharacters(["lunatic", "imp", "chef"]);
    const step = stepFor(game, "lunatic");

    expect(step).toMatchObject({
      kind: "believedDemon",
      characterId: "lunatic",
    });
  });

  it("gives the Damsel an acknowledge step for telling the Minions", () => {
    const game = gameWithCharacters(["damsel", "imp", "chef"]);
    const step = stepFor(game, "damsel");

    expect(step).toMatchObject({
      kind: "acknowledge",
      characterId: "damsel",
    });
    expect((step as { message: string }).message.length).toBeGreaterThan(0);
  });

  it("gives the Marionette a neighborCheck step, correct when seated beside the Demon", () => {
    // Seats: 0 Marionette, 1 Imp (Demon), 2 Chef — Marionette neighbours the Demon.
    const game = gameWithCharacters(["marionette", "imp", "chef"]);
    const step = stepFor(game, "marionette");

    expect(step).toMatchObject({
      kind: "neighborCheck",
      characterId: "marionette",
      reminderLabel: "Is the Marionette",
      seatedCorrectly: true,
    });
  });

  it("flags the Marionette's neighborCheck as incorrect when not seated beside the Demon", () => {
    // Seats: 0 Marionette, 1 Chef, 2 Imp (Demon), 3 Recluse, 4 Alsaahir — the
    // Demon's neighbours are seats 1 and 3, so the Marionette at seat 0 (not
    // adjacent even via wraparound, since there are 5 seats) is misseated.
    const game = gameWithCharacters([
      "marionette",
      "chef",
      "imp",
      "recluse",
      "alsaahir",
    ]);
    const step = stepFor(game, "marionette");

    expect(step).toMatchObject({
      kind: "neighborCheck",
      seatedCorrectly: false,
    });
  });

  it("gives the Drunk a review step keyed by the stand-in player, not their apparent character's own step", () => {
    const game = gameWithCharacters(["drunk", "washerwoman", "imp"], "washerwoman");
    const steps = buildSetupWalkthroughSteps(game);
    const drunkPlayer = game.players.find((p) => p.isDrunk);

    const drunkStep = steps.find((s) => s.playerId === drunkPlayer?.id);
    expect(drunkStep).toMatchObject({ kind: "review", reminderLabel: "Drunk" });
    // Only one step for that seat — not also a Washerwoman characterAndTwoPlayers step.
    expect(steps.filter((s) => s.playerId === drunkPlayer?.id)).toHaveLength(1);
  });

  it("gives a homebrew character with reminders a generic step", () => {
    const homebrew: Character = {
      id: "custom-oracle",
      name: "Custom Oracle",
      edition: null,
      team: "townsfolk",
      ability: "A homebrew ability.",
      firstNight: 0,
      firstNightReminder: "",
      otherNight: 0,
      otherNightReminder: "",
      reminders: ["Marked"],
      remindersGlobal: [],
      setup: false,
      jinxes: [],
      image: null,
    };
    const game = createGame({
      scriptId: "custom",
      scriptName: "Custom",
      playerCount: 1,
      selectedCharacters: [homebrew],
      standIn: null,
      extraCopies: {},
    });
    const gameWithPlayer = {
      ...game,
      players: game.players.map((p) => ({ ...p, characterId: "custom-oracle" })),
    };

    const steps = buildSetupWalkthroughSteps(gameWithPlayer);
    expect(steps).toMatchObject([
      { kind: "generic", characterId: "custom-oracle", reminderOptions: ["Marked"] },
    ]);
  });

  it("gives no step for an uncovered official character with no reminders to place", () => {
    const game = gameWithCharacters(["chef"]);
    expect(buildSetupWalkthroughSteps(game)).toEqual([]);
  });

  it("does not give a generic step to an official character just for having an ordinary reminder (e.g. Imp's 'Dead')", () => {
    const game = gameWithCharacters(["imp"]);
    expect(buildSetupWalkthroughSteps(game)).toEqual([]);
  });

  it("orders steps by seat", () => {
    const game = gameWithCharacters(["grandmother", "fortuneteller", "eviltwin"]);
    const steps = buildSetupWalkthroughSteps(game);
    expect(steps.map((s) => s.characterId)).toEqual([
      "grandmother",
      "fortuneteller",
      "eviltwin",
    ]);
  });
});
