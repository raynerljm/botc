import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { getCharacter, getEditionCharacters } from "@/lib/characters";
import { createGame, type GameDocument, type Player } from "@/lib/gameDocument";
import { DEMON_BLUFFS_STEP_ID, type SetupWalkthroughStep } from "@/lib/setupWalkthrough";
import { getSelectOptions, selectOption } from "@/testUtils/selectOption";

import { SetupWalkthrough } from "./SetupWalkthrough";

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "p1",
    seat: 1,
    name: "Alice",
    characterId: "fortuneteller",
    startingCharacterId: "fortuneteller",
    isDrunk: false,
    isLunatic: false,
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
  getCharacter("zombuul")!,
  getCharacter("chef")!,
  getCharacter("baron")!,
];

// Only the demonBluffs step needs a real GameDocument (it mounts
// DemonBluffsFields, the same component the standalone board panel uses) —
// every other step kind in this file ignores game/onChangeGame entirely.
function makeGame(overrides: Partial<GameDocument> = {}): GameDocument {
  const base = createGame({
    scriptId: "tb",
    scriptName: "Trouble Brewing",
    playerCount: 3,
    selectedCharacters: [
      getCharacter("fortuneteller")!,
      getCharacter("imp")!,
      getCharacter("chef")!,
    ],
    standIn: null,
    extraCopies: {},
  });
  return { ...base, ...overrides };
}

function renderWalkthrough(
  overrides: Partial<{
    steps: SetupWalkthroughStep[];
    players: Player[];
    stepStatuses: Record<string, "answered" | "skipped">;
    game: GameDocument;
    characterPool: typeof characterPool;
    onChangeGame: ReturnType<typeof vi.fn>;
    onResolveStep: ReturnType<typeof vi.fn>;
    onReassignStandIn: ReturnType<typeof vi.fn>;
    onClose: ReturnType<typeof vi.fn>;
  }> = {},
) {
  const onResolveStep = overrides.onResolveStep ?? vi.fn();
  const onReassignStandIn = overrides.onReassignStandIn ?? vi.fn();
  const onClose = overrides.onClose ?? vi.fn();
  const onChangeGame = overrides.onChangeGame ?? vi.fn();
  const game = overrides.game ?? makeGame({ scriptCharacters: characterPool });
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
      characterPool={overrides.characterPool ?? characterPool}
      game={game}
      onChangeGame={onChangeGame}
      onResolveStep={onResolveStep}
      onReassignStandIn={onReassignStandIn}
      onClose={onClose}
    />,
  );
  return { onResolveStep, onReassignStandIn, onClose, onChangeGame, game, players, ...view };
}

// Player options now carry "Name — Role" (issue #56); select by the name
// prefix so tests don't hardcode the exact role suffix at every call site.
// The \b boundary (rather than plain startsWith) is what keeps "Player 1"
// from also matching "Player 10" — escaping first is what keeps a name
// with regex-special characters from building a broken pattern (code
// review finding).
function playerNamedMatcher(name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}\\b`);
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

  it("closes via a Done button at the bottom of the walkthrough (issue #244)", async () => {
    const user = userEvent.setup();
    const { onClose } = renderWalkthrough({ steps: [fortuneTellerStep] });
    await user.click(screen.getByRole("button", { name: /^done$/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps Done enabled no matter how many steps are unresolved (advisory, ADR 0003)", () => {
    renderWalkthrough({ steps: [fortuneTellerStep], stepStatuses: {} });
    expect(screen.getByRole("button", { name: /^done$/i })).toBeEnabled();
  });

  it("renders as a modal dialog, prominent regardless of where it mounts in the page (issue #57)", () => {
    renderWalkthrough({ steps: [fortuneTellerStep] });
    expect(
      screen.getByRole("dialog", { name: "Setup walkthrough" }),
    ).toHaveAttribute("aria-modal", "true");
  });

  it("moves focus into the dialog when opened, so a keyboard user doesn't start behind it", () => {
    renderWalkthrough({ steps: [fortuneTellerStep] });
    expect(screen.getByRole("button", { name: /close/i })).toHaveFocus();
  });

  it("traps Tab within the dialog's own controls, including the footer Done button (code review: the page behind the backdrop stays focusable otherwise; issue #244)", async () => {
    const user = userEvent.setup();
    renderWalkthrough({ steps: [fortuneTellerStep] });

    const step = screen.getByRole("group", { name: fortuneTellerStep.title });
    within(step).getByRole("button", { name: /skip/i }).focus();
    await user.tab();
    expect(screen.getByRole("button", { name: /^done$/i })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: /close/i })).toHaveFocus();

    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: /^done$/i })).toHaveFocus();

    await user.tab({ shift: true });
    expect(within(step).getByRole("button", { name: /skip/i })).toHaveFocus();
  });

  it("keeps focus inside the dialog after resolving a step, so the Tab trap doesn't fall through to <body> (code review)", async () => {
    // A bare renderWalkthrough() call doesn't feed onResolveStep back into
    // stepStatuses, so the step would never actually leave its "editing"
    // view — this needs a real stateful wrapper (as GrimoireSetup is) to
    // reproduce the step transition that unmounts the just-clicked Confirm
    // button in the same commit.
    const user = userEvent.setup();
    function Wrapper() {
      const [stepStatuses, setStepStatuses] = useState<
        Record<string, "answered" | "skipped">
      >({});
      return (
        <SetupWalkthrough
          steps={[fortuneTellerStep]}
          stepStatuses={stepStatuses}
          players={[
            makePlayer({ id: "p1", seat: 1, name: "Alice", characterId: "fortuneteller" }),
            makePlayer({ id: "p2", seat: 2, name: "Bob", characterId: "imp" }),
            makePlayer({ id: "p3", seat: 3, name: "Cara", characterId: "chef" }),
          ]}
          characterPool={characterPool}
          game={makeGame()}
          onChangeGame={vi.fn()}
          onResolveStep={(stepId, status) =>
            setStepStatuses((current) => ({ ...current, [stepId]: status }))
          }
          onReassignStandIn={vi.fn()}
          onClose={vi.fn()}
        />
      );
    }
    render(<Wrapper />);

    const step = screen.getByRole("group", { name: fortuneTellerStep.title });
    const playerSelect = within(step).getByLabelText(/player/i);
    await selectOption(user, playerSelect, playerNamedMatcher("Cara"));
    await user.click(within(step).getByRole("button", { name: /confirm/i }));

    const dialog = screen.getByRole("dialog", { name: "Setup walkthrough" });
    expect(document.activeElement).not.toBe(document.body);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("calls onClose on Escape and restores focus to the trigger on close (issue #122)", async () => {
    const user = userEvent.setup();
    function ToggleHarness() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            Setup walkthrough
          </button>
          {open && (
            <SetupWalkthrough
              steps={[fortuneTellerStep]}
              stepStatuses={{}}
              players={[
                makePlayer({ id: "p1", seat: 1, name: "Alice", characterId: "fortuneteller" }),
              ]}
              characterPool={characterPool}
              game={makeGame()}
              onChangeGame={vi.fn()}
              onResolveStep={vi.fn()}
              onReassignStandIn={vi.fn()}
              onClose={() => setOpen(false)}
            />
          )}
        </div>
      );
    }
    render(<ToggleHarness />);

    const trigger = screen.getByRole("button", { name: "Setup walkthrough" });
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Setup walkthrough" })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("themes the per-step Skip button instead of leaving it bare (issue #74)", () => {
    renderWalkthrough({ steps: [fortuneTellerStep] });
    const step = screen.getByRole("group", { name: fortuneTellerStep.title });
    expect(within(step).getByRole("button", { name: /skip/i }).className).not.toBe("");
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
    await selectOption(user, playerSelect, playerNamedMatcher("Cara"));
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
    await selectOption(user, playerSelect, playerNamedMatcher("Cara"));
    await user.click(within(step).getByRole("button", { name: /confirm/i }));

    expect(onResolveStep).toHaveBeenCalledWith("p1", "answered", [
      expect.objectContaining({ characterId: "fortuneteller", label: "Red herring" }),
    ]);
  });

  it("doesn't offer the step's own player as a candidate", async () => {
    const user = userEvent.setup();
    renderWalkthrough({ steps: [fortuneTellerStep] });
    const step = screen.getByRole("group", { name: fortuneTellerStep.title });
    const select = within(step).getByLabelText(/player/i);
    const optionNames = (await getSelectOptions(user, select)).map((o) => o.label);
    expect(optionNames.some((n) => n.startsWith("Alice"))).toBe(false);
  });

  it("only offers good players as candidates (code review: red herring/twin/grandchild must be good)", async () => {
    const user = userEvent.setup();
    // Default players: p1 Alice (Fortune Teller, good), p2 Bob (Imp, evil),
    // p3 Cara (Chef, good).
    renderWalkthrough({ steps: [fortuneTellerStep] });
    const step = screen.getByRole("group", { name: fortuneTellerStep.title });
    const select = within(step).getByLabelText(/player/i);
    const optionNames = (await getSelectOptions(user, select)).map((o) => o.label);
    expect(optionNames.some((n) => n.startsWith("Bob"))).toBe(false);
    expect(optionNames.some((n) => n.startsWith("Cara"))).toBe(true);
  });

  it("shows each candidate's assigned character role next to their name (issue #56)", async () => {
    const user = userEvent.setup();
    renderWalkthrough({ steps: [fortuneTellerStep] });
    const step = screen.getByRole("group", { name: fortuneTellerStep.title });
    const select = within(step).getByLabelText(/player/i);
    const optionNames = (await getSelectOptions(user, select)).map((o) => o.label);
    expect(optionNames).toContain("Cara — Chef");
  });

  it("flags a disguised Drunk candidate, since this picker has no token/reminder nearby to show it another way (issue #186)", async () => {
    const user = userEvent.setup();
    renderWalkthrough({
      steps: [fortuneTellerStep],
      players: [
        makePlayer({ id: "p1", seat: 1, name: "Alice", characterId: "fortuneteller" }),
        makePlayer({
          id: "p2",
          seat: 2,
          name: "Bob",
          characterId: "chef",
          isDrunk: true,
        }),
      ],
    });

    const step = screen.getByRole("group", { name: fortuneTellerStep.title });
    const select = within(step).getByLabelText(/player/i);
    const optionNames = (await getSelectOptions(user, select)).map((o) => o.label);
    expect(optionNames).toContain("Bob — Chef (actually the Drunk)");
  });

  it("treats a Traveller candidate's alignment as their travellerAlignment, not their character's team", async () => {
    const user = userEvent.setup();
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
    const select = within(step).getByLabelText(/player/i);
    const optionNames = (await getSelectOptions(user, select)).map((o) => o.label);
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
    await selectOption(user, within(step).getByLabelText("Character"), "Chef");
    const trueSelect = within(step).getByLabelText(/shown as townsfolk/i);
    await selectOption(user, trueSelect, playerNamedMatcher("Bob"));
    const falseSelect = within(step).getByLabelText(/shown as wrong/i);
    await selectOption(user, falseSelect, playerNamedMatcher("Cara"));
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

  it("shows each player's assigned character role next to their name in both player pickers (issue #56)", async () => {
    const user = userEvent.setup();
    renderWalkthrough({ steps: [washerwomanStep] });
    const step = screen.getByRole("group", { name: washerwomanStep.title });

    const trueSelect = within(step).getByLabelText(/shown as townsfolk/i);
    const trueOptionNames = (await getSelectOptions(user, trueSelect)).map((o) => o.label);
    expect(trueOptionNames).toContain("Bob — Imp");

    const falseSelect = within(step).getByLabelText(/shown as wrong/i);
    const falseOptionNames = (await getSelectOptions(user, falseSelect)).map((o) => o.label);
    expect(falseOptionNames).toContain("Cara — Chef");
  });

  it("resets the selected character if 'show all' is unchecked while an off-script character is chosen", async () => {
    const user = userEvent.setup();
    renderWalkthrough({ steps: [washerwomanStep] });
    const step = screen.getByRole("group", { name: washerwomanStep.title });

    await user.click(within(step).getByRole("checkbox", { name: /show all/i }));
    await selectOption(user, within(step).getByLabelText("Character"), "Empath");
    await user.click(within(step).getByRole("checkbox", { name: /show all/i }));

    const select = within(step).getByLabelText("Character");
    expect(select.dataset.value).toBe("");
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
    disguiseId: "drunk",
    standInTeam: "townsfolk",
  };

  // Issue #186: the "Drunk" reminder is now placed automatically the moment
  // the stand-in lands on a seat (GrimoireSetup's chooseToken/assignManually)
  // — this step no longer places one itself, or it would duplicate it.
  it("doesn't place its own reminder on confirm — the auto-placed one already covers it", async () => {
    const user = userEvent.setup();
    const { onResolveStep } = renderWalkthrough({
      steps: [drunkStep],
    });

    const step = screen.getByRole("group", { name: drunkStep.title });
    await user.click(within(step).getByRole("button", { name: /confirm/i }));

    expect(onResolveStep).toHaveBeenCalledWith("p1", "answered", []);
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
    await selectOption(user, within(step).getByLabelText(/new stand-in/i), "Chef");
    await user.click(within(step).getByRole("button", { name: /change stand-in/i }));

    expect(onReassignStandIn).toHaveBeenCalledWith("p1", "chef");
    expect(onResolveStep).not.toHaveBeenCalled();
  });

  it("excludes Townsfolk already held by another player from the stand-in picker", async () => {
    const user = userEvent.setup();
    renderWalkthrough({
      steps: [drunkStep],
      players: [
        makePlayer({ id: "p1", seat: 1, name: "Alice", characterId: "washerwoman" }),
        makePlayer({ id: "p2", seat: 2, name: "Bob", characterId: "chef" }),
        makePlayer({ id: "p3", seat: 3, name: "Cara", characterId: "grandmother" }),
      ],
    });

    const step = screen.getByRole("group", { name: drunkStep.title });
    const optionText = (
      await getSelectOptions(user, within(step).getByLabelText(/new stand-in/i))
    ).map((o) => o.label);

    expect(optionText).not.toContain("Chef");
    expect(optionText).not.toContain("Grandmother");
    expect(optionText).toContain("Washerwoman");
  });

  // Issue #242: the picker used to source candidates from the narrow
  // `characterPool` prop (already-selected/built characters only), which in
  // a fully-seated game collapses to just the current stand-in — every
  // other selected Townsfolk is already held by some other seat. Sourcing
  // from game.scriptCharacters (the full script) instead, like the bag
  // builder's own stand-in picker, is what this test locks in.
  it("offers the full script's Townsfolk, not just the narrow in-play pool (issue #242)", async () => {
    const user = userEvent.setup();
    // Mirrors production: the characterPool prop only holds what's already
    // selected/built into the bag (gameDocument.ts), which in a
    // fully-seated game is entirely accounted for by held seats — the bug
    // this issue fixes. game.scriptCharacters (the module-level
    // characterPool fixture, the full script) is wider — named distinctly
    // here so the two pools' identifiers can't be confused with each other.
    const narrowCharacterPool = [getCharacter("washerwoman")!, getCharacter("imp")!];
    renderWalkthrough({
      steps: [drunkStep],
      characterPool: narrowCharacterPool,
      players: [
        makePlayer({ id: "p1", seat: 1, name: "Alice", characterId: "washerwoman" }),
        makePlayer({ id: "p2", seat: 2, name: "Bob", characterId: "imp" }),
      ],
      game: makeGame({ scriptCharacters: characterPool }),
    });

    const step = screen.getByRole("group", { name: drunkStep.title });
    const optionText = (
      await getSelectOptions(user, within(step).getByLabelText(/new stand-in/i))
    ).map((o) => o.label);

    // Librarian is on the script (scriptCharacters), isn't held by any seat,
    // and isn't the current stand-in — a correct picker offers it even
    // though it isn't in the narrow characterPool prop.
    expect(optionText).toContain("Librarian");
  });

  it("has no 'Show all characters' checkbox (issue #242 — the full script is always offered)", () => {
    renderWalkthrough({ steps: [drunkStep] });

    const step = screen.getByRole("group", { name: drunkStep.title });
    expect(within(step).queryByText(/show all characters/i)).not.toBeInTheDocument();
  });

  it("disables the change button until a different character is chosen", async () => {
    renderWalkthrough({ steps: [drunkStep] });

    const step = screen.getByRole("group", { name: drunkStep.title });
    expect(
      within(step).getByRole("button", { name: /change stand-in/i }),
    ).toBeDisabled();
  });
});

describe("review step (Lunatic, issue #163)", () => {
  const lunaticStep: SetupWalkthroughStep = {
    id: "p1",
    kind: "review",
    characterId: "imp",
    characterName: "Imp",
    playerId: "p1",
    playerName: "Alice",
    title: "Lunatic — review the stand-in",
    ruleText: "Alice believes they are the Imp.",
    reminderLabel: "Lunatic",
    disguiseId: "lunatic",
    standInTeam: "demon",
  };

  it("places the Lunatic reminder (not the stand-in character's) on confirm", async () => {
    const user = userEvent.setup();
    const { onResolveStep } = renderWalkthrough({
      steps: [lunaticStep],
    });

    const step = screen.getByRole("group", { name: lunaticStep.title });
    await user.click(within(step).getByRole("button", { name: /confirm/i }));

    expect(onResolveStep).toHaveBeenCalledWith("p1", "answered", [
      expect.objectContaining({ characterId: "lunatic", label: "Lunatic" }),
    ]);
  });

  it("shows the current stand-in and offers a way to change it", () => {
    renderWalkthrough({ steps: [lunaticStep] });

    const step = screen.getByRole("group", { name: lunaticStep.title });
    expect(within(step).getByText(/current stand-in: imp/i)).toBeInTheDocument();
    expect(within(step).getByLabelText(/new stand-in/i)).toBeInTheDocument();
  });

  it("reassigns the stand-in without touching the reminder/status resolution", async () => {
    const user = userEvent.setup();
    const { onReassignStandIn, onResolveStep } = renderWalkthrough({
      steps: [lunaticStep],
      players: [
        makePlayer({ id: "p1", seat: 1, name: "Alice", characterId: "imp" }),
        makePlayer({ id: "p2", seat: 2, name: "Bob", characterId: "chef" }),
      ],
    });

    const step = screen.getByRole("group", { name: lunaticStep.title });
    await selectOption(user, within(step).getByLabelText(/new stand-in/i), "Zombuul");
    await user.click(within(step).getByRole("button", { name: /change stand-in/i }));

    expect(onReassignStandIn).toHaveBeenCalledWith("p1", "zombuul");
    expect(onResolveStep).not.toHaveBeenCalled();
  });

  it("offers only Demons, excluding any already held by another player", async () => {
    const user = userEvent.setup();
    renderWalkthrough({
      steps: [lunaticStep],
      players: [
        makePlayer({ id: "p1", seat: 1, name: "Alice", characterId: "imp" }),
        makePlayer({ id: "p2", seat: 2, name: "Bob", characterId: "zombuul" }),
        makePlayer({ id: "p3", seat: 3, name: "Cara", characterId: "chef" }),
      ],
    });

    const step = screen.getByRole("group", { name: lunaticStep.title });
    const optionText = (
      await getSelectOptions(user, within(step).getByLabelText(/new stand-in/i))
    ).map((o) => o.label);

    expect(optionText).not.toContain("Zombuul");
    expect(optionText).not.toContain("Chef");
    expect(optionText).toContain("Imp");
  });

  it("disables the change button until a different character is chosen", async () => {
    renderWalkthrough({ steps: [lunaticStep] });

    const step = screen.getByRole("group", { name: lunaticStep.title });
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

  it("stages a chosen reminder and only resolves once, on Confirm", async () => {
    const user = userEvent.setup();
    const { onResolveStep } = renderWalkthrough({ steps: [genericStep] });

    const step = screen.getByRole("group", { name: genericStep.title });
    await user.click(within(step).getByRole("button", { name: "Marked" }));
    expect(onResolveStep).not.toHaveBeenCalled();

    await user.click(within(step).getByRole("button", { name: /^confirm$/i }));
    expect(onResolveStep).toHaveBeenCalledWith("p1", "answered", [
      expect.objectContaining({ characterId: "custom-oracle", label: "Marked" }),
    ]);
  });

  it("marks the step answered via Confirm, without requiring every reminder placed", async () => {
    const user = userEvent.setup();
    const { onResolveStep } = renderWalkthrough({ steps: [genericStep] });

    const step = screen.getByRole("group", { name: genericStep.title });
    await user.click(within(step).getByRole("button", { name: /^confirm$/i }));

    expect(onResolveStep).toHaveBeenCalledWith("p1", "answered", []);
  });
});

describe("demonBluffs step (issue #155)", () => {
  const demonBluffsStep: SetupWalkthroughStep = {
    id: DEMON_BLUFFS_STEP_ID,
    kind: "demonBluffs",
    title: "Demon bluffs",
    ruleText:
      "Choose the three not-in-play good characters to show the Demon on the first night.",
  };

  // A full script (not just the three characters in play) so there's a real
  // "not in play good character" candidate to pick, matching
  // DemonBluffsPanel.test.tsx's own fixture.
  function bluffsGame(overrides: Partial<GameDocument> = {}): GameDocument {
    return makeGame({ scriptCharacters: getEditionCharacters("tb"), ...overrides });
  }

  it("shows the same three bluff slots DemonBluffsPanel renders on the board", () => {
    renderWalkthrough({ steps: [demonBluffsStep], game: bluffsGame() });

    const step = screen.getByRole("group", { name: "Demon bluffs" });
    expect(within(step).getByLabelText("Bluff slot 1")).toBeInTheDocument();
    expect(within(step).getByLabelText("Bluff slot 2")).toBeInTheDocument();
    expect(within(step).getByLabelText("Bluff slot 3")).toBeInTheDocument();
  });

  it("writes a picked bluff through onChangeGame, into the same game.demonBluffs DemonBluffsPanel reads", async () => {
    const user = userEvent.setup();
    const game = bluffsGame();
    const { onChangeGame } = renderWalkthrough({
      steps: [demonBluffsStep],
      game,
    });

    const step = screen.getByRole("group", { name: "Demon bluffs" });
    await selectOption(user, 
      within(step).getByLabelText("Bluff slot 1"),
      "washerwoman",
    );

    expect(onChangeGame).toHaveBeenCalledWith({
      ...game,
      demonBluffs: ["washerwoman", null, null],
    });
  });

  it("does not offer 'Show to Demon' in the walkthrough — bluffs are revealed during the first night, not setup (issue #211)", () => {
    renderWalkthrough({
      steps: [demonBluffsStep],
      game: bluffsGame({ demonBluffs: ["washerwoman", null, null] }),
    });

    const step = screen.getByRole("group", { name: "Demon bluffs" });
    expect(
      within(step).queryByRole("button", { name: /show to demon/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: /demon bluffs/i }),
    ).not.toBeInTheDocument();
  });

  it("resolves answered via Confirm, without producing any reminder", async () => {
    const user = userEvent.setup();
    const { onResolveStep } = renderWalkthrough({
      steps: [demonBluffsStep],
      game: bluffsGame({ demonBluffs: ["washerwoman", null, null] }),
    });

    const step = screen.getByRole("group", { name: "Demon bluffs" });
    await user.click(within(step).getByRole("button", { name: /confirm/i }));

    expect(onResolveStep).toHaveBeenCalledWith(DEMON_BLUFFS_STEP_ID, "answered", []);
  });

  it("can be skipped like any other step", async () => {
    const user = userEvent.setup();
    const { onResolveStep } = renderWalkthrough({
      steps: [demonBluffsStep],
      game: bluffsGame(),
    });

    const step = screen.getByRole("group", { name: "Demon bluffs" });
    await user.click(within(step).getByRole("button", { name: /skip/i }));

    expect(onResolveStep).toHaveBeenCalledWith(DEMON_BLUFFS_STEP_ID, "skipped", []);
  });

  it("hides the picker behind an Answered/Redo note once resolved, same as every other step", () => {
    renderWalkthrough({
      steps: [demonBluffsStep],
      game: bluffsGame(),
      stepStatuses: { demonBluffs: "answered" },
    });

    const step = screen.getByRole("group", { name: "Demon bluffs" });
    expect(within(step).getByText(/answered/i)).toBeInTheDocument();
    expect(within(step).queryByLabelText("Bluff slot 1")).not.toBeInTheDocument();

    within(step).getByRole("button", { name: /redo/i });
  });
});
