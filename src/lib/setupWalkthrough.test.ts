import { describe, expect, it } from "vitest";

import { getCharacter, type Character } from "./characters";
import { buildSetupWalkthroughSteps, DEMON_BLUFFS_STEP_ID } from "./setupWalkthrough";
import { createGame, type GameDocument } from "./gameDocument";

function characters(...ids: string[]) {
  return ids.map((id) => getCharacter(id)!);
}

// Builds a game with one player per given character id, seated in order,
// each already assigned (as if the bag draw just finished).
function gameWithCharacters(
  ids: string[],
  drunkStandInFor?: string,
  lunaticStandInFor?: string,
): GameDocument {
  const selected = characters(...ids);
  const standIn = drunkStandInFor ? getCharacter(drunkStandInFor)! : null;
  const lunaticStandIn = lunaticStandInFor ? getCharacter(lunaticStandInFor)! : null;
  const game = createGame({
    scriptId: "custom",
    scriptName: "Test script",
    playerCount: ids.length,
    selectedCharacters: selected,
    standIn,
    lunaticStandIn,
    extraCopies: {},
    newId: (() => {
      let n = 0;
      return () => `id-${n++}`;
    })(),
  });

  const assignable = ids
    .filter((id) => id !== "drunk" && id !== "lunatic")
    .map((id, i) => ({ playerIndex: i, characterId: id }));

  let players = game.players;
  for (const { playerIndex, characterId } of assignable) {
    const isDrunk = drunkStandInFor !== undefined && characterId === drunkStandInFor;
    const isLunatic =
      lunaticStandInFor !== undefined && characterId === lunaticStandInFor;
    players = players.map((p, i) =>
      i === playerIndex ? { ...p, characterId, isDrunk, isLunatic } : p,
    );
  }
  return { ...game, players };
}

// The demonBluffs step has no playerId (it isn't anchored to a seat) — this
// is the one place that guard lives, so every per-player lookup below shares
// it instead of repeating "playerId" in s at each call site.
function stepsForPlayerId(steps: ReturnType<typeof buildSetupWalkthroughSteps>, playerId: string) {
  return steps.filter((s) => "playerId" in s && s.playerId === playerId);
}

function stepFor(game: GameDocument, characterId: string) {
  const player = game.players.find((p) => p.characterId === characterId);
  const steps = buildSetupWalkthroughSteps(game);
  return player ? stepsForPlayerId(steps, player.id)[0] : undefined;
}

// The demonBluffs step is always present and always first (issue #155) —
// every other assertion in this file cares only about the per-player steps
// that follow it, so tests strip it off before checking "no steps"/ordering.
function playerSteps(game: GameDocument) {
  return buildSetupWalkthroughSteps(game).filter((s) => s.kind !== "demonBluffs");
}

describe("buildSetupWalkthroughSteps (issue #26)", () => {
  it("always includes exactly one demonBluffs step, first, regardless of who's in play (issue #155)", () => {
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 5,
      selectedCharacters: characters("imp"),
      standIn: null,
      extraCopies: {},
    });

    const steps = buildSetupWalkthroughSteps(game);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ id: DEMON_BLUFFS_STEP_ID, kind: "demonBluffs" });
  });

  it("returns no per-player steps for a game with no players assigned yet", () => {
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 5,
      selectedCharacters: characters("imp"),
      standIn: null,
      extraCopies: {},
    });

    expect(playerSteps(game)).toEqual([]);
  });

  it("returns no per-player steps when every in-play character needs no setup decision", () => {
    const game = gameWithCharacters(["imp", "chef", "recluse"]);
    expect(playerSteps(game)).toEqual([]);
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

  it("flags the Librarian's step as having no candidates in play when there are no Outsiders in the bag (issue #262)", () => {
    const game = gameWithCharacters(["librarian", "imp", "chef"]);
    const step = stepFor(game, "librarian");

    expect(step).toMatchObject({
      kind: "characterAndTwoPlayers",
      noCandidatesInPlay: true,
    });
  });

  it("does not flag the Librarian's step as having no candidates when an Outsider is in the bag", () => {
    const game = gameWithCharacters(["librarian", "recluse", "imp", "chef"]);
    const step = stepFor(game, "librarian");

    expect(step).toMatchObject({
      kind: "characterAndTwoPlayers",
      noCandidatesInPlay: false,
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

  it("gives the Lunatic a review step keyed by the stand-in player, not their apparent character's own step (issue #163)", () => {
    const game = gameWithCharacters(
      ["lunatic", "imp", "chef"],
      undefined,
      "imp",
    );
    const steps = buildSetupWalkthroughSteps(game);
    const lunaticPlayer = game.players.find((p) => p.isLunatic)!;
    const lunaticSteps = stepsForPlayerId(steps, lunaticPlayer.id);

    expect(lunaticSteps[0]).toMatchObject({
      kind: "review",
      reminderLabel: "Lunatic",
      disguiseId: "lunatic",
      standInTeam: "demon",
    });
    // Only one step for that seat — not also a stray step for the Imp.
    expect(lunaticSteps).toHaveLength(1);
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

  it("checks the Marionette against the real Demon's seat, not a Lunatic disguised as that same Demon (issue #241)", () => {
    // Seats: 0 Marionette, 1 Lunatic (stand-in "Imp"), 2 Imp (the real
    // Demon), 3 Chef. The Marionette's actual neighbours are seat 3 (Chef)
    // and seat 1 (the Lunatic) — not seat 2, the real Demon — so this must
    // be flagged incorrect even though the Lunatic's characterId is also
    // "imp" (issue #241 lets the Lunatic's stand-in be the in-play Demon).
    const selected = characters("marionette", "imp", "lunatic", "chef");
    const game = createGame({
      scriptId: "custom",
      scriptName: "Test script",
      playerCount: 4,
      selectedCharacters: selected,
      standIn: null,
      lunaticStandIn: getCharacter("imp")!,
      extraCopies: {},
      newId: (() => {
        let n = 0;
        return () => `id-${n++}`;
      })(),
    });
    const players = game.players.map((p, i) => {
      if (i === 0) return { ...p, characterId: "marionette" };
      if (i === 1) return { ...p, characterId: "imp", isLunatic: true };
      if (i === 2) return { ...p, characterId: "imp" };
      return { ...p, characterId: "chef" };
    });

    const step = stepFor({ ...game, players }, "marionette");

    expect(step).toMatchObject({
      kind: "neighborCheck",
      seatedCorrectly: false,
    });
  });

  it("gives the Drunk a review step keyed by the stand-in player, not their apparent character's own plain step", () => {
    const game = gameWithCharacters(["drunk", "chef", "imp"], "chef");
    const steps = buildSetupWalkthroughSteps(game);
    const drunkPlayer = game.players.find((p) => p.isDrunk)!;
    const drunkSteps = stepsForPlayerId(steps, drunkPlayer.id);

    expect(drunkSteps[0]).toMatchObject({ kind: "review", reminderLabel: "Drunk" });
    // Chef has no curated setup step of its own — only the review step.
    expect(drunkSteps).toHaveLength(1);
  });

  describe("believed-character step for a Drunk (issue #254)", () => {
    it("also gives the Drunk the stand-in's own curated characterAndTwoPlayers step, framed as fake", () => {
      const game = gameWithCharacters(["drunk", "washerwoman", "imp"], "washerwoman");
      const steps = buildSetupWalkthroughSteps(game);
      const drunkPlayer = game.players.find((p) => p.isDrunk)!;
      const drunkSteps = stepsForPlayerId(steps, drunkPlayer.id);

      expect(drunkSteps).toHaveLength(2);
      expect(drunkSteps[0]).toMatchObject({ kind: "review" });
      expect(drunkSteps[1]).toMatchObject({
        kind: "characterAndTwoPlayers",
        characterId: "washerwoman",
        candidateTeam: "townsfolk",
        trueLabel: "Townsfolk",
        falseLabel: "Wrong",
        disguiseId: "drunk",
      });
      expect(drunkSteps[1].title).toMatch(/washerwoman/i);
      expect(drunkSteps[1].ruleText).toMatch(/believes they are the washerwoman/i);
    });

    it("also gives the Drunk the stand-in's own curated playerPick step, framed as fake", () => {
      const game = gameWithCharacters(["drunk", "grandmother", "imp"], "grandmother");
      const steps = buildSetupWalkthroughSteps(game);
      const drunkPlayer = game.players.find((p) => p.isDrunk)!;
      const drunkSteps = stepsForPlayerId(steps, drunkPlayer.id);

      expect(drunkSteps).toHaveLength(2);
      expect(drunkSteps[1]).toMatchObject({
        kind: "playerPick",
        characterId: "grandmother",
        reminderLabel: "Grandchild",
        disguiseId: "drunk",
      });
      expect(drunkSteps[1].ruleText).toMatch(/believes they are the grandmother/i);
    });

    it("gives the believed-character step a distinct id from the review step, for the same seat", () => {
      const game = gameWithCharacters(["drunk", "fortuneteller", "imp"], "fortuneteller");
      const steps = buildSetupWalkthroughSteps(game);
      const drunkPlayer = game.players.find((p) => p.isDrunk)!;
      const drunkSteps = stepsForPlayerId(steps, drunkPlayer.id);

      expect(drunkSteps[0].id).not.toBe(drunkSteps[1].id);
    });

    it("gives no extra step when the stand-in has no curated setup step (e.g. Chef)", () => {
      const game = gameWithCharacters(["drunk", "chef", "imp"], "chef");
      const drunkPlayer = game.players.find((p) => p.isDrunk)!;
      const drunkSteps = stepsForPlayerId(buildSetupWalkthroughSteps(game), drunkPlayer.id);

      expect(drunkSteps).toHaveLength(1);
      expect(drunkSteps[0].kind).toBe("review");
    });

    it("does not give the Lunatic's own believed-Demon step an extra step (out of this issue's scope)", () => {
      const game = gameWithCharacters(["lunatic", "imp", "chef"], undefined, "imp");
      const lunaticPlayer = game.players.find((p) => p.isLunatic)!;
      const lunaticSteps = stepsForPlayerId(
        buildSetupWalkthroughSteps(game),
        lunaticPlayer.id,
      );

      expect(lunaticSteps).toHaveLength(1);
      expect(lunaticSteps[0].kind).toBe("review");
    });
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

    expect(playerSteps(gameWithPlayer)).toMatchObject([
      { kind: "generic", characterId: "custom-oracle", reminderOptions: ["Marked"] },
    ]);
  });

  it("gives no per-player step for an uncovered official character with no reminders to place", () => {
    const game = gameWithCharacters(["chef"]);
    expect(playerSteps(game)).toEqual([]);
  });

  it("does not give a generic step to an official character just for having an ordinary reminder (e.g. Imp's 'Dead')", () => {
    const game = gameWithCharacters(["imp"]);
    expect(playerSteps(game)).toEqual([]);
  });

  it("orders per-player steps by seat, after the demonBluffs step", () => {
    const game = gameWithCharacters(["grandmother", "fortuneteller", "eviltwin"]);
    const steps = buildSetupWalkthroughSteps(game);
    expect(steps[0].kind).toBe("demonBluffs");
    expect(playerSteps(game).map((s) => (s as { characterId: string }).characterId)).toEqual([
      "grandmother",
      "fortuneteller",
      "eviltwin",
    ]);
  });
});
