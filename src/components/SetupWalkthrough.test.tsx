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
    startingCharacterId: "fortuneteller",
    isDrunk: false,
    isTraveller: false,
    travellerAlignment: null,
    dead: false,
    ghostVoteSpent: false,
    position: null,
    claim: null,
    actsAs: null,
    actsAsSetOnNight: null,
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
    onResolveStep: ReturnType<typeof vi.fn>;
    onReassignStandIn: ReturnType<typeof vi.fn>;
    onClose: ReturnType<typeof vi.fn>;
  }> = {},
) {
  const onResolveStep = overrides.onResolveStep ?? vi.fn();
  const onReassignStandIn = overrides.onReassignStandIn ?? vi.fn();
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
      onResolveStep={onResolveStep}
      onReassignStandIn={onReassignStandIn}
      onClose={onClose}
    />,
  );
  return { onResolveStep, onReassignStandIn, onClose, players, ...view };
}

// Player options now carry "Name — Role" (issue #56); select by the name
// prefix so tests don't hardcode the exact role suffix at every call site.
function selectPlayerNamed(select: HTMLElement, name: string) {
  return within(select).getByRole("option", {
    name: new RegExp(`^${name}\\b`),
  });
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

  it("skips a step with one tap, without producing any reminder", async () => {
    const user = userEvent.setup();
    const { onResolveStep } = renderWalkthrough({
      steps: [fortuneTellerStep],
    });

    const step = screen.getByRole("group", { name: fortuneTellerStep.title });
    await user.click(within(step).getByRole("button", { name: /skip/i }));

    expect(onResolveStep).toHaveBeenCalledWith("p1", "skipped", []);
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

  it("re-answering after Redo replaces the previous reminders in one call (no stale duplicate)", async () => {
    const user = userEvent.setup();
    const { onResolveStep } = renderWalkthrough({
      steps: [fortuneTellerStep],
      stepStatuses: { p1: "answered" },
    });

    const step = screen.getByRole("group", { name: fortuneTellerStep.title });
    await user.click(within(step).getByRole("button", { name: /redo/i }));
    const playerSelect = within(step).getByLabelText(/player/i);
    await user.selectOptions(playerSelect, selectPlayerNamed(playerSelect, "Cara"));
    await user.click(within(step).getByRole("button", { name: /confirm/i }));

    // The component only ever hands back the *current* set of reminders for
    // this call — GrimoireSetup's resolveWalkthroughStep is what actually
    // removes the previous answer's tokens before adding these.
    expect(onResolveStep).toHaveBeenCalledWith(
      "p1",
      "answered",
      expect.arrayContaining([
        expect.objectContaining({ characterId: "fortuneteller", label: "Red herring" }),
      ]),
    );
    expect(onResolveStep).toHaveBeenCalledTimes(1);
  });
});

describe("playerPick step", () => {
  it("places the reminder on the chosen player and marks the step answered", async () => {
    const user = userEvent.setup();
    const { onResolveStep } = renderWalkthrough({
      steps: [fortuneTellerStep],
    });

    // Cara (Chef) rather than Bob (Imp) — the candidate must be good, and
    // Bob is evil (see the alignment-filtering tests below).
    const step = screen.getByRole("group", { name: fortuneTellerStep.title });
    const playerSelect = within(step).getByLabelText(/player/i);
    await user.selectOptions(playerSelect, selectPlayerNamed(playerSelect, "Cara"));
    await user.click(within(step).getByRole("button", { name: /confirm/i }));

    expect(onResolveStep).toHaveBeenCalledWith("p1", "answered", [
      expect.objectContaining({ characterId: "fortuneteller", label: "Red herring" }),
    ]);
  });

  it("doesn't offer the step's own player as a candidate", () => {
    renderWalkthrough({ steps: [fortuneTellerStep] });
    const step = screen.getByRole("group", { name: fortuneTellerStep.title });
    const select = within(step).getByLabelText(/player/i) as HTMLSelectElement;
    const optionNames = Array.from(select.options).map((o) => o.text);
    expect(optionNames.some((n) => n.startsWith("Alice"))).toBe(false);
  });

  it("only offers good players as candidates (code review: red herring/twin/grandchild must be good)", () => {
    // Default players: p1 Alice (Fortune Teller, good), p2 Bob (Imp, evil),
    // p3 Cara (Chef, good).
    renderWalkthrough({ steps: [fortuneTellerStep] });
    const step = screen.getByRole("group", { name: fortuneTellerStep.title });
    const select = within(step).getByLabelText(/player/i) as HTMLSelectElement;
    const optionNames = Array.from(select.options).map((o) => o.text);
    expect(optionNames.some((n) => n.startsWith("Bob"))).toBe(false);
    expect(optionNames.some((n) => n.startsWith("Cara"))).toBe(true);
  });

  it("shows each candidate's assigned character role next to their name (issue #56)", () => {
    renderWalkthrough({ steps: [fortuneTellerStep] });
    const step = screen.getByRole("group", { name: fortuneTellerStep.title });
    const select = within(step).getByLabelText(/player/i) as HTMLSelectElement;
    const optionNames = Array.from(select.options).map((o) => o.text);
    expect(optionNames).toContain("Cara — Chef");
  });

  it("treats a Traveller candidate's alignment as their travellerAlignment, not their character's team", () => {
    renderWalkthrough({
      steps: [fortuneTellerStep],
      players: [
        makePlayer({ id: "p1", seat: 1, name: "Alice", characterId: "fortuneteller" }),
        makePlayer({
          id: "p2",
          seat: 2,
          name: "Bob",
          characterId: "scapegoat",
          isTraveller: true,
          travellerAlignment: "evil",
        }),
        makePlayer({
          id: "p3",
          seat: 3,
          name: "Cara",
          characterId: "scapegoat",
          isTraveller: true,
          travellerAlignment: "good",
        }),
      ],
    });

    const step = screen.getByRole("group", { name: fortuneTellerStep.title });
    const select = within(step).getByLabelText(/player/i) as HTMLSelectElement;
    const optionNames = Array.from(select.options).map((o) => o.text);
    expect(optionNames.some((n) => n.startsWith("Bob"))).toBe(false);
    expect(optionNames.some((n) => n.startsWith("Cara"))).toBe(true);
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

  it("places the true and wrong reminders on the two chosen players, naming the claimed character", async () => {
    const user = userEvent.setup();
    const { onResolveStep } = renderWalkthrough({
      steps: [washerwomanStep],
    });

    const step = screen.getByRole("group", { name: washerwomanStep.title });
    await user.selectOptions(within(step).getByLabelText("Character"), "Chef");
    const trueSelect = within(step).getByLabelText(/shown as townsfolk/i);
    await user.selectOptions(trueSelect, selectPlayerNamed(trueSelect, "Bob"));
    const falseSelect = within(step).getByLabelText(/shown as wrong/i);
    await user.selectOptions(falseSelect, selectPlayerNamed(falseSelect, "Cara"));
    await user.click(within(step).getByRole("button", { name: /confirm/i }));

    expect(onResolveStep).toHaveBeenCalledWith(
      "p1",
      "answered",
      expect.arrayContaining([
        expect.objectContaining({ characterId: "washerwoman", label: "Townsfolk (Chef)" }),
        expect.objectContaining({ characterId: "washerwoman", label: "Wrong (Chef)" }),
      ]),
    );
  });

  it("shows each player's assigned character role next to their name in both player pickers (issue #56)", () => {
    renderWalkthrough({ steps: [washerwomanStep] });
    const step = screen.getByRole("group", { name: washerwomanStep.title });

    const trueSelect = within(step).getByLabelText(/shown as townsfolk/i) as HTMLSelectElement;
    const trueOptionNames = Array.from(trueSelect.options).map((o) => o.text);
    expect(trueOptionNames).toContain("Bob — Imp");

    const falseSelect = within(step).getByLabelText(/shown as wrong/i) as HTMLSelectElement;
    const falseOptionNames = Array.from(falseSelect.options).map((o) => o.text);
    expect(falseOptionNames).toContain("Cara — Chef");
  });

  it("resets the selected character if 'show all' is unchecked while an off-script character is chosen", async () => {
    const user = userEvent.setup();
    renderWalkthrough({ steps: [washerwomanStep] });
    const step = screen.getByRole("group", { name: washerwomanStep.title });

    await user.click(within(step).getByRole("checkbox", { name: /show all/i }));
    await user.selectOptions(within(step).getByLabelText("Character"), "Empath");
    await user.click(within(step).getByRole("checkbox", { name: /show all/i }));

    const select = within(step).getByLabelText("Character") as HTMLSelectElement;
    expect(select.value).toBe("");
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
    const { onResolveStep } = renderWalkthrough({
      steps: [marionetteStep],
    });

    const step = screen.getByRole("group", { name: marionetteStep.title });
    expect(within(step).getByText(/correctly seated/i)).toBeInTheDocument();
    await user.click(within(step).getByRole("button", { name: /confirm/i }));

    expect(onResolveStep).toHaveBeenCalledWith("p1", "answered", [
      expect.objectContaining({
        characterId: "marionette",
        label: "Is the Marionette",
      }),
    ]);
  });

  it("warns when not seated next to the Demon", () => {
    renderWalkthrough({ steps: [{ ...marionetteStep, seatedCorrectly: false }] });
    const step = screen.getByRole("group", { name: marionetteStep.title });
    expect(within(step).getByText(/not seated next to the demon/i)).toBeInTheDocument();
  });

  it("produces no reminder when the placement checkbox is unchecked", async () => {
    const user = userEvent.setup();
    const { onResolveStep } = renderWalkthrough({ steps: [marionetteStep] });

    const step = screen.getByRole("group", { name: marionetteStep.title });
    await user.click(within(step).getByRole("checkbox", { name: /place/i }));
    await user.click(within(step).getByRole("button", { name: /confirm/i }));

    expect(onResolveStep).toHaveBeenCalledWith("p1", "answered", []);
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
    const { onResolveStep } = renderWalkthrough({
      steps: [lunaticStep],
    });

    const step = screen.getByRole("group", { name: lunaticStep.title });
    await user.selectOptions(within(step).getByLabelText(/demon/i), "Imp");
    await user.click(within(step).getByRole("button", { name: /confirm/i }));

    expect(onResolveStep).toHaveBeenCalledWith("p1", "answered", [
      expect.objectContaining({ characterId: null, label: expect.stringContaining("Imp") }),
    ]);
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

  it("marks the step answered on confirm, without producing a reminder", async () => {
    const user = userEvent.setup();
    const { onResolveStep } = renderWalkthrough({
      steps: [damselStep],
    });

    const step = screen.getByRole("group", { name: damselStep.title });
    expect(within(step).getByText(damselStep.message)).toBeInTheDocument();
    await user.click(within(step).getByRole("button", { name: /confirm|done/i }));

    expect(onResolveStep).toHaveBeenCalledWith("p1", "answered", []);
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

  it("places the Drunk reminder (not the stand-in character's) on confirm", async () => {
    const user = userEvent.setup();
    const { onResolveStep } = renderWalkthrough({
      steps: [drunkStep],
    });

    const step = screen.getByRole("group", { name: drunkStep.title });
    await user.click(within(step).getByRole("button", { name: /confirm/i }));

    expect(onResolveStep).toHaveBeenCalledWith("p1", "answered", [
      expect.objectContaining({ characterId: "drunk", label: "Drunk" }),
    ]);
  });

  it("shows the current stand-in and offers a way to change it (issue #52)", () => {
    renderWalkthrough({ steps: [drunkStep] });

    const step = screen.getByRole("group", { name: drunkStep.title });
    expect(within(step).getByText(/current stand-in: washerwoman/i)).toBeInTheDocument();
    expect(within(step).getByLabelText(/new stand-in/i)).toBeInTheDocument();
  });

  it("keeps the stand-in picker visible after the step is answered, unlike the reminder controls (code review finding)", () => {
    renderWalkthrough({
      steps: [drunkStep],
      stepStatuses: { p1: "answered" },
    });

    const step = screen.getByRole("group", { name: drunkStep.title });
    expect(within(step).getByText(/answered/i)).toBeInTheDocument();
    expect(within(step).getByLabelText(/new stand-in/i)).toBeInTheDocument();
    expect(
      within(step).getByRole("button", { name: /change stand-in/i }),
    ).toBeInTheDocument();
  });

  it("reassigns the stand-in without touching the reminder/status resolution", async () => {
    const user = userEvent.setup();
    const { onReassignStandIn, onResolveStep } = renderWalkthrough({
      steps: [drunkStep],
      players: [
        makePlayer({ id: "p1", seat: 1, name: "Alice", characterId: "washerwoman" }),
        makePlayer({ id: "p2", seat: 2, name: "Bob", characterId: "imp" }),
      ],
    });

    const step = screen.getByRole("group", { name: drunkStep.title });
    await user.selectOptions(within(step).getByLabelText(/new stand-in/i), "Chef");
    await user.click(within(step).getByRole("button", { name: /change stand-in/i }));

    expect(onReassignStandIn).toHaveBeenCalledWith("p1", "chef");
    expect(onResolveStep).not.toHaveBeenCalled();
  });

  it("excludes Townsfolk already held by another player from the stand-in picker", async () => {
    renderWalkthrough({
      steps: [drunkStep],
      players: [
        makePlayer({ id: "p1", seat: 1, name: "Alice", characterId: "washerwoman" }),
        makePlayer({ id: "p2", seat: 2, name: "Bob", characterId: "chef" }),
        makePlayer({ id: "p3", seat: 3, name: "Cara", characterId: "grandmother" }),
      ],
    });

    const step = screen.getByRole("group", { name: drunkStep.title });
    const options = within(step)
      .getByLabelText(/new stand-in/i)
      .querySelectorAll("option");
    const optionText = Array.from(options).map((o) => o.textContent);

    expect(optionText).not.toContain("Chef");
    expect(optionText).not.toContain("Grandmother");
    expect(optionText).toContain("Washerwoman");
  });

  it("disables the change button until a different character is chosen", async () => {
    renderWalkthrough({ steps: [drunkStep] });

    const step = screen.getByRole("group", { name: drunkStep.title });
    expect(
      within(step).getByRole("button", { name: /change stand-in/i }),
    ).toBeDisabled();
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

  it("stages a chosen reminder and only resolves once, on Done", async () => {
    const user = userEvent.setup();
    const { onResolveStep } = renderWalkthrough({ steps: [genericStep] });

    const step = screen.getByRole("group", { name: genericStep.title });
    await user.click(within(step).getByRole("button", { name: "Marked" }));
    expect(onResolveStep).not.toHaveBeenCalled();

    await user.click(within(step).getByRole("button", { name: /^done$/i }));
    expect(onResolveStep).toHaveBeenCalledWith("p1", "answered", [
      expect.objectContaining({ characterId: "custom-oracle", label: "Marked" }),
    ]);
  });

  it("marks the step answered via Done, without requiring every reminder placed", async () => {
    const user = userEvent.setup();
    const { onResolveStep } = renderWalkthrough({ steps: [genericStep] });

    const step = screen.getByRole("group", { name: genericStep.title });
    await user.click(within(step).getByRole("button", { name: /^done$/i }));

    expect(onResolveStep).toHaveBeenCalledWith("p1", "answered", []);
  });
});
