import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { getCharacter } from "@/lib/characters";
import type { Player } from "@/lib/gameDocument";
import type { SetupWalkthroughStep } from "@/lib/setupWalkthrough";

import { SetupWalkthrough } from "./SetupWalkthrough";

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "p1",
    seat: 1,
    name: "Alice",
    characterId: "fortuneteller",
    isDrunk: false,
    isTraveller: false,
    travellerAlignment: null,
    dead: false,
    ghostVoteSpent: false,
    position: null,
    ...overrides,
  };
}

const characterPool = [
  getCharacter("fortuneteller")!,
  getCharacter("washerwoman")!,
  getCharacter("librarian")!,
  getCharacter("investigator")!,
  getCharacter("grandmother")!,
  getCharacter("eviltwin")!,
  getCharacter("marionette")!,
  getCharacter("lunatic")!,
  getCharacter("damsel")!,
  getCharacter("drunk")!,
  getCharacter("imp")!,
  getCharacter("chef")!,
  getCharacter("baron")!,
];

function renderWalkthrough(
  overrides: Partial<{
    steps: SetupWalkthroughStep[];
    players: Player[];
    stepStatuses: Record<string, "answered" | "skipped">;
    onAddReminder: ReturnType<typeof vi.fn>;
    onResolveStep: ReturnType<typeof vi.fn>;
    onClose: ReturnType<typeof vi.fn>;
  }> = {},
) {
  const onAddReminder = overrides.onAddReminder ?? vi.fn();
  const onResolveStep = overrides.onResolveStep ?? vi.fn();
  const onClose = overrides.onClose ?? vi.fn();
  const players = overrides.players ?? [
    makePlayer({ id: "p1", seat: 1, name: "Alice", characterId: "fortuneteller" }),
    makePlayer({ id: "p2", seat: 2, name: "Bob", characterId: "imp" }),
    makePlayer({ id: "p3", seat: 3, name: "Cara", characterId: "chef" }),
  ];
  const steps = overrides.steps ?? [];

  const view = render(
    <SetupWalkthrough
      steps={steps}
      stepStatuses={overrides.stepStatuses ?? {}}
      players={players}
      characterPool={characterPool}
      onAddReminder={onAddReminder}
      onResolveStep={onResolveStep}
      onClose={onClose}
    />,
  );
  return { onAddReminder, onResolveStep, onClose, players, ...view };
}

const fortuneTellerStep: SetupWalkthroughStep = {
  id: "p1",
  kind: "playerPick",
  characterId: "fortuneteller",
  characterName: "Fortune Teller",
  playerId: "p1",
  playerName: "Alice",
  title: "Fortune Teller — red herring",
  ruleText: "Pick one good player who will always register as a demon.",
  reminderLabel: "Red herring",
};

describe("SetupWalkthrough shell", () => {
  it("shows the step's title and rule text", () => {
    renderWalkthrough({ steps: [fortuneTellerStep] });
    expect(screen.getByText(fortuneTellerStep.title)).toBeInTheDocument();
    expect(screen.getByText(fortuneTellerStep.ruleText)).toBeInTheDocument();
  });

  it("closes via the Close button", async () => {
    const user = userEvent.setup();
    const { onClose } = renderWalkthrough({ steps: [fortuneTellerStep] });
    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("skips a step with one tap, without adding any reminder", async () => {
    const user = userEvent.setup();
    const { onResolveStep, onAddReminder } = renderWalkthrough({
      steps: [fortuneTellerStep],
    });

    const step = screen.getByRole("group", { name: fortuneTellerStep.title });
    await user.click(within(step).getByRole("button", { name: /skip/i }));

    expect(onResolveStep).toHaveBeenCalledWith("p1", "skipped");
    expect(onAddReminder).not.toHaveBeenCalled();
  });

  it("keeps a skipped step visible, marked as skipped", () => {
    renderWalkthrough({
      steps: [fortuneTellerStep],
      stepStatuses: { p1: "skipped" },
    });

    const step = screen.getByRole("group", { name: fortuneTellerStep.title });
    expect(within(step).getByText(/skipped/i)).toBeInTheDocument();
  });

  it("keeps an answered step visible, marked as answered, and offers redo", () => {
    renderWalkthrough({
      steps: [fortuneTellerStep],
      stepStatuses: { p1: "answered" },
    });

    const step = screen.getByRole("group", { name: fortuneTellerStep.title });
    expect(within(step).getByText(/answered/i)).toBeInTheDocument();
    expect(within(step).getByRole("button", { name: /redo/i })).toBeInTheDocument();
  });
});

describe("playerPick step", () => {
  it("places the reminder on the chosen player and marks the step answered", async () => {
    const user = userEvent.setup();
    const { onAddReminder, onResolveStep } = renderWalkthrough({
      steps: [fortuneTellerStep],
    });

    const step = screen.getByRole("group", { name: fortuneTellerStep.title });
    await user.selectOptions(within(step).getByLabelText(/player/i), "Bob");
    await user.click(within(step).getByRole("button", { name: /confirm/i }));

    expect(onAddReminder).toHaveBeenCalledWith(
      expect.objectContaining({ characterId: "fortuneteller", label: "Red herring" }),
    );
    expect(onResolveStep).toHaveBeenCalledWith("p1", "answered");
  });

  it("doesn't offer the step's own player as a candidate", () => {
    renderWalkthrough({ steps: [fortuneTellerStep] });
    const step = screen.getByRole("group", { name: fortuneTellerStep.title });
    const select = within(step).getByLabelText(/player/i) as HTMLSelectElement;
    const optionNames = Array.from(select.options).map((o) => o.text);
    expect(optionNames).not.toContain("Alice");
  });
});

describe("characterAndTwoPlayers step", () => {
  const washerwomanStep: SetupWalkthroughStep = {
    id: "p1",
    kind: "characterAndTwoPlayers",
    characterId: "washerwoman",
    characterName: "Washerwoman",
    playerId: "p1",
    playerName: "Alice",
    title: "Washerwoman — character and two players",
    ruleText: "Pick a Townsfolk character and two players.",
    candidateTeam: "townsfolk",
    trueLabel: "Townsfolk",
    falseLabel: "Wrong",
  };

  it("places the true and wrong reminders on the two chosen players", async () => {
    const user = userEvent.setup();
    const { onAddReminder, onResolveStep } = renderWalkthrough({
      steps: [washerwomanStep],
    });

    const step = screen.getByRole("group", { name: washerwomanStep.title });
    await user.selectOptions(within(step).getByLabelText("Character"), "Chef");
    await user.selectOptions(within(step).getByLabelText(/shown as townsfolk/i), "Bob");
    await user.selectOptions(within(step).getByLabelText(/shown as wrong/i), "Cara");
    await user.click(within(step).getByRole("button", { name: /confirm/i }));

    expect(onAddReminder).toHaveBeenCalledWith(
      expect.objectContaining({ characterId: "washerwoman", label: "Townsfolk" }),
    );
    expect(onAddReminder).toHaveBeenCalledWith(
      expect.objectContaining({ characterId: "washerwoman", label: "Wrong" }),
    );
    expect(onResolveStep).toHaveBeenCalledWith("p1", "answered");
  });
});

describe("neighborCheck step (Marionette)", () => {
  const marionetteStep: SetupWalkthroughStep = {
    id: "p1",
    kind: "neighborCheck",
    characterId: "marionette",
    characterName: "Marionette",
    playerId: "p1",
    playerName: "Alice",
    title: "Marionette — seating check",
    ruleText: "The Marionette must sit next to the Demon.",
    reminderLabel: "Is the Marionette",
    seatedCorrectly: true,
  };

  it("shows a correctly-seated confirmation and places the reminder on confirm", async () => {
    const user = userEvent.setup();
    const { onAddReminder, onResolveStep } = renderWalkthrough({
      steps: [marionetteStep],
    });

    const step = screen.getByRole("group", { name: marionetteStep.title });
    expect(within(step).getByText(/correctly seated/i)).toBeInTheDocument();
    await user.click(within(step).getByRole("button", { name: /confirm/i }));

    expect(onAddReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        characterId: "marionette",
        label: "Is the Marionette",
      }),
    );
    expect(onResolveStep).toHaveBeenCalledWith("p1", "answered");
  });

  it("warns when not seated next to the Demon", () => {
    renderWalkthrough({ steps: [{ ...marionetteStep, seatedCorrectly: false }] });
    const step = screen.getByRole("group", { name: marionetteStep.title });
    expect(within(step).getByText(/not seated next to the demon/i)).toBeInTheDocument();
  });
});

describe("believedDemon step (Lunatic)", () => {
  const lunaticStep: SetupWalkthroughStep = {
    id: "p1",
    kind: "believedDemon",
    characterId: "lunatic",
    characterName: "Lunatic",
    playerId: "p1",
    playerName: "Alice",
    title: "Lunatic — believed demon",
    ruleText: "Pick which Demon character the Lunatic believes they are.",
  };

  it("places a custom reminder naming the believed demon", async () => {
    const user = userEvent.setup();
    const { onAddReminder, onResolveStep } = renderWalkthrough({
      steps: [lunaticStep],
    });

    const step = screen.getByRole("group", { name: lunaticStep.title });
    await user.selectOptions(within(step).getByLabelText(/demon/i), "Imp");
    await user.click(within(step).getByRole("button", { name: /confirm/i }));

    expect(onAddReminder).toHaveBeenCalledWith(
      expect.objectContaining({ characterId: null, label: expect.stringContaining("Imp") }),
    );
    expect(onResolveStep).toHaveBeenCalledWith("p1", "answered");
  });
});

describe("acknowledge step (Damsel)", () => {
  const damselStep: SetupWalkthroughStep = {
    id: "p1",
    kind: "acknowledge",
    characterId: "damsel",
    characterName: "Damsel",
    playerId: "p1",
    playerName: "Alice",
    title: "Damsel — tell the Minions",
    ruleText: "All Minions must be told the Damsel is in play.",
    message: "Tell all Minions that the Damsel is in play.",
  };

  it("marks the step answered on confirm, without adding a reminder", async () => {
    const user = userEvent.setup();
    const { onAddReminder, onResolveStep } = renderWalkthrough({
      steps: [damselStep],
    });

    const step = screen.getByRole("group", { name: damselStep.title });
    expect(within(step).getByText(damselStep.message)).toBeInTheDocument();
    await user.click(within(step).getByRole("button", { name: /confirm|done/i }));

    expect(onResolveStep).toHaveBeenCalledWith("p1", "answered");
    expect(onAddReminder).not.toHaveBeenCalled();
  });
});

describe("review step (Drunk)", () => {
  const drunkStep: SetupWalkthroughStep = {
    id: "p1",
    kind: "review",
    characterId: "washerwoman",
    characterName: "Washerwoman",
    playerId: "p1",
    playerName: "Alice",
    title: "Drunk — review the stand-in",
    ruleText: "Alice believes they are the Washerwoman.",
    reminderLabel: "Drunk",
  };

  it("places the Drunk reminder on confirm", async () => {
    const user = userEvent.setup();
    const { onAddReminder, onResolveStep } = renderWalkthrough({
      steps: [drunkStep],
    });

    const step = screen.getByRole("group", { name: drunkStep.title });
    await user.click(within(step).getByRole("button", { name: /confirm/i }));

    expect(onAddReminder).toHaveBeenCalledWith(
      expect.objectContaining({ characterId: "drunk", label: "Drunk" }),
    );
    expect(onResolveStep).toHaveBeenCalledWith("p1", "answered");
  });
});

describe("generic step (homebrew fallback)", () => {
  const genericStep: SetupWalkthroughStep = {
    id: "p1",
    kind: "generic",
    characterId: "custom-oracle",
    characterName: "Custom Oracle",
    playerId: "p1",
    playerName: "Alice",
    title: "Custom Oracle — reminder tokens",
    ruleText: "Custom Oracle isn't in the curated setup list.",
    reminderOptions: ["Marked", "Foretold"],
  };

  it("places a chosen reminder token on the character's own player", async () => {
    const user = userEvent.setup();
    const { onAddReminder } = renderWalkthrough({ steps: [genericStep] });

    const step = screen.getByRole("group", { name: genericStep.title });
    await user.click(within(step).getByRole("button", { name: "Marked" }));

    expect(onAddReminder).toHaveBeenCalledWith(
      expect.objectContaining({ characterId: "custom-oracle", label: "Marked" }),
    );
  });

  it("marks the step answered via Done, without requiring every reminder placed", async () => {
    const user = userEvent.setup();
    const { onResolveStep } = renderWalkthrough({ steps: [genericStep] });

    const step = screen.getByRole("group", { name: genericStep.title });
    await user.click(within(step).getByRole("button", { name: /^done$/i }));

    expect(onResolveStep).toHaveBeenCalledWith("p1", "answered");
  });
});
