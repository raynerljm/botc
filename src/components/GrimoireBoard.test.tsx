import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getCharacter } from "@/lib/characters";
import type { Player, ReminderToken } from "@/lib/gameDocument";
import {
  getSelectOptions,
  openListbox,
  selectOption,
} from "@/testUtils/selectOption";

import { GrimoireBoard } from "./GrimoireBoard";
import styles from "./GrimoireBoard.module.css";

function makeReminder(overrides: Partial<ReminderToken> = {}): ReminderToken {
  return {
    id: "r1",
    characterId: "washerwoman",
    label: "Townsfolk",
    position: { x: 60, y: 40 },
    anchorPlayerId: null,
    ...overrides,
  };
}

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "p1",
    seat: 1,
    name: "Alice",
    characterId: "washerwoman",
    startingCharacterId: "washerwoman",
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

const characterById = new Map([
  ["washerwoman", getCharacter("washerwoman")!],
  ["imp", getCharacter("imp")!],
  ["philosopher", getCharacter("philosopher")!],
  ["alchemist", getCharacter("alchemist")!],
  ["boffin", getCharacter("boffin")!],
]);

// Deliberately distinct from the "washerwoman"/"imp" characters used as
// player tokens elsewhere in this file, so a claim <option>'s text (present
// in the DOM even inside a closed token menu) never collides with a token's
// own rendered name.
const claimOptions = [
  getCharacter("librarian")!,
  getCharacter("monk")!,
  getCharacter("recluse")!,
];

// jsdom has no real PointerEvent constructor, so a plain MouseEvent stands in
// with pointerId grafted on — React's synthetic event reads whatever
// properties exist on the native event, regardless of its class.
function pointerEvent(
  type: string,
  init: { pointerId: number; clientX: number; clientY: number },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX: init.clientX,
    clientY: init.clientY,
  });
  Object.defineProperty(event, "pointerId", { value: init.pointerId });
  return event;
}

// Opens the board's overflow menu (issue #217) — Re-circle, Rotate left/
// right, Setup walkthrough, Add traveller, and Add character all live
// behind it now, so any test exercising one of those needs this first. The
// summary has no accessible "button" role in this environment (unlike a
// real <button>), so it's found by its (visually hidden) label text instead
// — the same convention this file already uses for a token's own summary
// (queried by its rendered name text, not by role).
async function openBoardMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText("Board options"));
}

function makeHandlers() {
  return {
    onRename: vi.fn(),
    onRenameCommit: vi.fn(),
    onMove: vi.fn(),
    onReCircle: vi.fn(),
    onRotate: vi.fn(),
    onToggleDead: vi.fn(),
    onToggleGhostVote: vi.fn(),
    onAddReminder: vi.fn(),
    onMoveReminder: vi.fn(),
    onAttachReminder: vi.fn(),
    onRemoveReminder: vi.fn(),
    onRestoreReminder: vi.fn(),
    onSwapCharacter: vi.fn(),
    onRemovePlayer: vi.fn(),
    onRevealDrunk: vi.fn(),
    onRemoveFabled: vi.fn(),
    onSetClaim: vi.fn(),
    onSetActsAs: vi.fn(),
  };
}

const noop = makeHandlers();

afterEach(() => {
  vi.clearAllMocks();
});

function mockBoardRect(container: HTMLElement) {
  const board = container.querySelector("[data-board]") as HTMLElement;
  vi.spyOn(board, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 400,
    height: 400,
    right: 400,
    bottom: 400,
    x: 0,
    y: 0,
    toJSON() {},
  });
}

function renderBoard(
  players: Player[],
  overrides: Partial<
    ReturnType<typeof makeHandlers> & {
      almanacUrl?: string | null;
      reminders?: ReminderToken[];
      activeFabled?: string[];
      claimOptions?: typeof claimOptions;
      nominatorTodayIds?: ReadonlySet<string>;
      nomineeTodayIds?: ReadonlySet<string>;
      onOpenSetupWalkthrough?: () => void;
      onOpenAddTraveller?: () => void;
      onOpenAddCharacter?: () => void;
      rotation?: number;
    }
  > = {},
) {
  const {
    reminders = [],
    activeFabled,
    claimOptions: claimOptionsOverride,
    almanacUrl,
    nominatorTodayIds,
    nomineeTodayIds,
    rotation = 0,
    ...handlerOverrides
  } = overrides;
  const handlers = { ...makeHandlers(), ...handlerOverrides };
  const view = render(
    <GrimoireBoard
      players={players}
      characterById={characterById}
      claimOptions={claimOptionsOverride ?? claimOptions}
      almanacUrl={almanacUrl}
      reminders={reminders}
      activeFabled={activeFabled ?? []}
      nominatorTodayIds={nominatorTodayIds}
      nomineeTodayIds={nomineeTodayIds}
      rotation={rotation}
      {...handlers}
    />,
  );
  return { ...handlers, ...view };
}

describe("GrimoireBoard rendering", () => {
  it("renders every seat as a character token labelled with the player's name", () => {
    const { container } = render(
      <GrimoireBoard
        players={[
          makePlayer({
            id: "p1",
            seat: 1,
            name: "Alice",
            characterId: "washerwoman",
          }),
          makePlayer({ id: "p2", seat: 2, name: "Bob", characterId: "imp" }),
        ]}
        characterById={characterById}
        activeFabled={[]}
        claimOptions={claimOptions}
        rotation={0}
        {...noop}
      />,
    );

    const aliceSummary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;
    const bobSummary = container.querySelector(
      "[data-player-id='p2'] summary",
    ) as HTMLElement;
    expect(within(aliceSummary).getByText("Alice")).toBeInTheDocument();
    expect(within(bobSummary).getByText("Bob")).toBeInTheDocument();
    expect(within(aliceSummary).getByText("Washerwoman")).toBeInTheDocument();
    expect(within(bobSummary).getByText("Imp")).toBeInTheDocument();
    expect(container.querySelectorAll("img")).toHaveLength(2);
  });

  it("doesn't annotate a Drunk stand-in's token with inline copy (issue #186) — a reminder token carries that instead", () => {
    renderBoard([makePlayer({ isDrunk: true })]);

    expect(screen.queryByText(/actually the Drunk/i)).not.toBeInTheDocument();
  });

  // Capitalize is opt-in (.noteCapitalized) rather than the .note default —
  // applying it to every .note mangled the Lunatic's parenthesized note into
  // "(Actually The Lunatic)". The Lunatic note must render plain .note, not
  // the capitalized variant used by the traveller-alignment note.
  it("renders the Lunatic note without the capitalize modifier applied to the traveller-alignment note", () => {
    renderBoard([makePlayer({ isLunatic: true })]);

    const note = screen.getByText("(actually the Lunatic)");
    expect(styles.noteCapitalized).toBeTruthy();
    expect(note.className.split(" ")).not.toContain(styles.noteCapitalized);
  });

  it("marks a Lunatic stand-in as actually the Lunatic (issue #163)", () => {
    renderBoard([makePlayer({ isLunatic: true })]);

    expect(screen.getByText(/actually the Lunatic/i)).toBeInTheDocument();
  });

  it("doesn't show the Lunatic note for a seat that really is the stand-in character", () => {
    const byId = new Map([
      ["washerwoman", getCharacter("washerwoman")!],
      ["lunatic", getCharacter("lunatic")!],
    ]);
    render(
      <GrimoireBoard
        players={[makePlayer({ isLunatic: true, characterId: "lunatic" })]}
        characterById={byId}
        claimOptions={claimOptions}
        rotation={0}
        almanacUrl={null}
        reminders={[]}
        activeFabled={[]}
        {...makeHandlers()}
      />,
    );

    expect(screen.queryByText(/actually the Lunatic/i)).not.toBeInTheDocument();
  });

  it("shows a traveller's alignment", () => {
    const { container } = renderBoard([
      makePlayer({
        isTraveller: true,
        travellerAlignment: "evil",
        characterId: "imp",
      }),
    ]);

    const summary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;
    expect(within(summary).getByText(/evil/i)).toBeInTheDocument();
  });

  it("positions each seat around the circle by default, each at a distinct spot", () => {
    const { container } = renderBoard([
      makePlayer({ id: "p1", seat: 1 }),
      makePlayer({ id: "p2", seat: 2, characterId: "imp" }),
    ]);

    const wraps = container.querySelectorAll("[data-player-id]");
    expect(wraps).toHaveLength(2);
    const first = wraps[0] as HTMLElement;
    const second = wraps[1] as HTMLElement;
    expect(first.style.left).toMatch(/%$/);
    expect(first.style.top).toMatch(/%$/);
    expect(
      first.style.left !== second.style.left ||
        first.style.top !== second.style.top,
    ).toBe(true);
  });

  it("renders a dragged token at its stored position instead of the circle", () => {
    const { container } = renderBoard([
      makePlayer({ id: "p1", seat: 1, position: { x: 12, y: 34 } }),
    ]);

    const wrap = container.querySelector(
      "[data-player-id='p1']",
    ) as HTMLElement;
    expect(wrap.style.left).toBe("12%");
    expect(wrap.style.top).toBe("34%");
  });

  // Issue #167 code review finding: a hand-edited or legacy-schema game
  // document isn't guaranteed to have positions within clampPct's [4,96]
  // range (gameDocument.ts's anchoredReminderPosition already defends
  // against this for its anchor input). An unclamped out-of-range stored
  // position would render off the clamped drag surface and, on pickup,
  // make the drag's start position disagree with where the token is
  // actually grabbed — reproducing the "jumps on pickup" bug for legacy
  // data instead of the original in-range case.
  it("clamps an out-of-range stored position instead of rendering the token off the pad", () => {
    const { container } = renderBoard([
      makePlayer({ id: "p1", seat: 1, position: { x: 150, y: -20 } }),
    ]);

    const wrap = container.querySelector(
      "[data-player-id='p1']",
    ) as HTMLElement;
    expect(wrap.style.left).toBe("96%");
    expect(wrap.style.top).toBe("4%");
  });

  it("clamps an out-of-range stored reminder position the same way", () => {
    const { container } = renderBoard([makePlayer()], {
      reminders: [makeReminder({ id: "r1", position: { x: 150, y: -20 } })],
    });

    const wrap = container.querySelector(
      "[data-reminder-id='r1']",
    ) as HTMLElement;
    expect(wrap.style.left).toBe("96%");
    expect(wrap.style.top).toBe("4%");
  });

  it("badges a player who has already nominated or been nominated today (issue #20)", () => {
    const { container } = renderBoard(
      [
        makePlayer({ id: "p1", seat: 1 }),
        makePlayer({ id: "p2", seat: 2, characterId: "imp" }),
      ],
      {
        nominatorTodayIds: new Set(["p1"]),
        nomineeTodayIds: new Set(["p2"]),
      },
    );

    const p1Summary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;
    const p2Summary = container.querySelector(
      "[data-player-id='p2'] summary",
    ) as HTMLElement;
    expect(within(p1Summary).getByText("Nominator")).toBeInTheDocument();
    expect(within(p2Summary).getByText("Nominee")).toBeInTheDocument();
    expect(within(p1Summary).queryByText("Nominee")).not.toBeInTheDocument();
  });
});

describe("token menu", () => {
  it("lets the storyteller rename a player from the token menu", async () => {
    const user = userEvent.setup();
    const handlers = renderBoard([makePlayer()]);

    await user.click(screen.getByText("Alice"));
    const nameInput = screen.getByLabelText(/player name/i);
    fireEvent.change(nameInput, { target: { value: "Zed" } });

    expect(handlers.onRename).toHaveBeenLastCalledWith("p1", "Zed");
  });

  it("commits the rename when the name field loses focus", async () => {
    const user = userEvent.setup();
    const handlers = renderBoard([makePlayer()]);

    await user.click(screen.getByText("Alice"));
    const nameInput = screen.getByLabelText(/player name/i);
    fireEvent.change(nameInput, { target: { value: "Zed" } });
    fireEvent.blur(nameInput);

    expect(handlers.onRenameCommit).toHaveBeenCalledWith("p1");
  });

  it("marks a player dead and shows a shroud", async () => {
    const user = userEvent.setup();
    const handlers = renderBoard([makePlayer()]);

    await user.click(screen.getByText("Alice"));
    await user.click(screen.getByRole("button", { name: /mark dead/i }));

    expect(handlers.onToggleDead).toHaveBeenCalledWith("p1");
  });

  it("themes the 'Swap character' select instead of leaving it browser-default (issue #74)", async () => {
    const user = userEvent.setup();
    renderBoard([makePlayer()]);

    await user.click(screen.getByText("Alice"));

    expect(screen.getByLabelText("Swap character").className).not.toBe("");
  });

  it("shows a shroud and offers to mark alive once dead", async () => {
    const user = userEvent.setup();
    renderBoard([makePlayer({ dead: true })]);

    expect(screen.getByText(/dead/i)).toBeInTheDocument();
    await user.click(screen.getByText("Alice"));
    expect(
      screen.getByRole("button", { name: /mark alive/i }),
    ).toBeInTheDocument();
  });

  it("keeps the shroud element mounted while alive, so a later death fades it in via CSS rather than popping it in", () => {
    const { container } = renderBoard([makePlayer({ dead: false })]);

    const wrap = container.querySelector(
      "[data-player-id='p1']",
    ) as HTMLElement;
    // The shroud is always the last child of its wrapper span — unlike
    // `[aria-hidden="true"]` alone, this doesn't also match a fallback
    // CharacterToken's initials span (also aria-hidden) for a character
    // with no vendored art.
    const shroud = wrap.querySelector(
      '[aria-hidden="true"]:last-child',
    ) as HTMLElement;
    // The shroud's visibility keys off this ancestor's data-dead via CSS
    // (`.tokenSummary[data-dead] .shroud`), so that's the state that should
    // be absent while alive, not an attribute on the shroud itself.
    const summary = wrap.querySelector("summary") as HTMLElement;

    expect(shroud).toBeInTheDocument();
    expect(summary).not.toHaveAttribute("data-dead");
  });

  it("opens the character detail popover with ability text and an official wiki link", async () => {
    const user = userEvent.setup();
    renderBoard([makePlayer({ characterId: "washerwoman" })]);

    await user.click(screen.getByText("Alice"));
    await user.click(screen.getByText(/character detail/i));

    expect(
      screen.getByText(getCharacter("washerwoman")!.ability),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /wiki/i });
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("wiki.bloodontheclocktower.com"),
    );
  });

  it("links homebrew characters to the script's almanac instead of the wiki", async () => {
    const user = userEvent.setup();
    const homebrew = {
      ...getCharacter("washerwoman")!,
      id: "custom-oracle",
      name: "Custom Oracle",
    };
    const byId = new Map([["custom-oracle", homebrew]]);
    render(
      <GrimoireBoard
        players={[makePlayer({ characterId: "custom-oracle" })]}
        characterById={byId}
        claimOptions={claimOptions}
        rotation={0}
        almanacUrl="https://example.com/almanac"
        activeFabled={[]}
        {...noop}
      />,
    );

    await user.click(screen.getByText("Alice"));
    await user.click(screen.getByText(/character detail/i));

    const link = screen.getByRole("link", { name: /almanac/i });
    expect(link).toHaveAttribute("href", "https://example.com/almanac");
  });

  it("doesn't render a javascript: almanac link", async () => {
    const user = userEvent.setup();
    const homebrew = {
      ...getCharacter("washerwoman")!,
      id: "custom-oracle",
      name: "Custom Oracle",
    };
    const byId = new Map([["custom-oracle", homebrew]]);
    render(
      <GrimoireBoard
        players={[makePlayer({ characterId: "custom-oracle" })]}
        characterById={byId}
        claimOptions={claimOptions}
        rotation={0}
        almanacUrl="javascript:alert(1)"
        activeFabled={[]}
        {...noop}
      />,
    );

    await user.click(screen.getByText("Alice"));
    await user.click(screen.getByText(/character detail/i));

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("links to the almanac, not the wiki, for a homebrew character reusing an official id", async () => {
    const user = userEvent.setup();
    // A custom script can define its own object for an id that also exists
    // in the vendored dataset (e.g. a reskinned "imp") — it must not be
    // mistaken for the real official character.
    const reskinned = {
      ...getCharacter("imp")!,
      name: "Totally Different Demon",
      ability: "A homebrew ability, not the real Imp's.",
    };
    const byId = new Map([["imp", reskinned]]);
    render(
      <GrimoireBoard
        players={[makePlayer({ characterId: "imp" })]}
        characterById={byId}
        claimOptions={claimOptions}
        rotation={0}
        almanacUrl="https://example.com/almanac"
        activeFabled={[]}
        {...noop}
      />,
    );

    await user.click(screen.getByText("Alice"));
    await user.click(screen.getByText(/character detail/i));

    expect(screen.getByText(reskinned.ability)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /almanac/i });
    expect(link).toHaveAttribute("href", "https://example.com/almanac");
  });
});

describe("claims", () => {
  it("sets a player's claim from their token menu", async () => {
    const user = userEvent.setup();
    const handlers = renderBoard([makePlayer()]);

    await user.click(screen.getByText("Alice"));
    await selectOption(user, screen.getByLabelText(/claim/i), "librarian");

    expect(handlers.onSetClaim).toHaveBeenCalledWith("p1", "librarian");
  });

  it("clears a claim back to none", async () => {
    const user = userEvent.setup();
    const handlers = renderBoard([makePlayer({ claim: "librarian" })]);

    await user.click(screen.getByText("Alice"));
    await selectOption(user, screen.getByLabelText(/claim/i), "");

    expect(handlers.onSetClaim).toHaveBeenCalledWith("p1", null);
  });

  it("renders a small claim badge by the token", () => {
    renderBoard([makePlayer({ claim: "librarian" })]);

    expect(screen.getByText(/claims librarian/i)).toBeInTheDocument();
  });

  it("shows no claim badge when the player hasn't claimed anything", () => {
    renderBoard([makePlayer({ claim: null })]);

    expect(screen.queryByText(/claims/i)).not.toBeInTheDocument();
  });

  it("keeps a claim visible instead of silently resetting to 'No claim' when it isn't in claimOptions", async () => {
    const user = userEvent.setup();
    renderBoard([makePlayer({ claim: "poisoner" })]);

    await user.click(screen.getByText("Alice"));
    const select = screen.getByLabelText(/^claim$/i);

    expect(select.dataset.value).toBe("poisoner");
    const options = await getSelectOptions(user, select);
    expect(options.map((o) => o.value)).toContain("poisoner");
  });

  it("scopes the claim select to exactly 'No claim' plus every claimOptions character, grouped by team", async () => {
    const user = userEvent.setup();
    renderBoard([makePlayer()]);

    await user.click(screen.getByText("Alice"));
    const select = screen.getByLabelText(/^claim$/i);

    expect(await getSelectOptions(user, select)).toEqual([
      { value: "", label: "No claim" },
      { value: "librarian", label: claimOptions[0].name },
      { value: "monk", label: claimOptions[1].name },
      { value: "recluse", label: claimOptions[2].name },
    ]);
  });
});

describe("acts-as (issue #17)", () => {
  it("sets a player's acts-as target from their token menu", async () => {
    const user = userEvent.setup();
    const handlers = renderBoard([makePlayer({ characterId: "philosopher" })]);

    await user.click(screen.getByText("Alice"));
    await selectOption(user, screen.getByLabelText(/acts as/i), "librarian");

    expect(handlers.onSetActsAs).toHaveBeenCalledWith("p1", "librarian");
  });

  it("clears an acts-as target back to none", async () => {
    const user = userEvent.setup();
    const handlers = renderBoard([
      makePlayer({ characterId: "philosopher", actsAs: "librarian" }),
    ]);

    await user.click(screen.getByText("Alice"));
    await selectOption(user, screen.getByLabelText(/acts as/i), "");

    expect(handlers.onSetActsAs).toHaveBeenCalledWith("p1", null);
  });

  it("renders a small acts-as badge by the token", () => {
    const { container } = renderBoard([
      makePlayer({ characterId: "philosopher", actsAs: "librarian" }),
    ]);

    const summary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;
    expect(within(summary).getByText(/acts as librarian/i)).toBeInTheDocument();
  });

  it("shows no acts-as badge when the player has no acts-as target", () => {
    const { container } = renderBoard([
      makePlayer({ characterId: "philosopher", actsAs: null }),
    ]);

    const summary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;
    expect(within(summary).queryByText(/acts as/i)).not.toBeInTheDocument();
  });

  it("keeps an acts-as target visible instead of silently resetting to 'Not acting as anyone' when it isn't in claimOptions (Copilot review finding)", async () => {
    const user = userEvent.setup();
    renderBoard([
      makePlayer({ characterId: "philosopher", actsAs: "poisoner" }),
    ]);

    await user.click(screen.getByText("Alice"));
    const select = screen.getByLabelText(/acts as/i);

    expect(select.dataset.value).toBe("poisoner");
    const options = await getSelectOptions(user, select);
    expect(options.map((o) => o.value)).toContain("poisoner");
  });

  it.each(["philosopher", "alchemist", "boffin"])(
    "offers the acts-as picker for %s",
    async (characterId) => {
      const user = userEvent.setup();
      renderBoard([makePlayer({ characterId })]);

      await user.click(screen.getByText("Alice"));

      expect(screen.getByLabelText(/acts as/i)).toBeInTheDocument();
    },
  );

  it("does not offer the acts-as picker for a character other than Philosopher, Alchemist, or Boffin (issue #187)", async () => {
    const user = userEvent.setup();
    renderBoard([makePlayer({ characterId: "washerwoman" })]);

    await user.click(screen.getByText("Alice"));

    expect(screen.queryByLabelText(/acts as/i)).not.toBeInTheDocument();
  });

  it("does not render the acts-as badge for a character other than Philosopher, Alchemist, or Boffin, even with a stale acts-as target (issue #187)", () => {
    const { container } = renderBoard([
      makePlayer({ characterId: "washerwoman", actsAs: "librarian" }),
    ]);

    const summary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;
    expect(within(summary).queryByText(/acts as/i)).not.toBeInTheDocument();
  });

  it("still offers the acts-as picker when the eligible character id can't be resolved in characterById (Copilot review finding)", async () => {
    const user = userEvent.setup();
    // A hand-edited/inconsistent game document can reference a characterId
    // that isn't in the script's character pool — eligibility is a pure id
    // check and must not silently fail closed just because the id didn't
    // resolve to a full Character.
    const byId = new Map([["imp", getCharacter("imp")!]]);
    render(
      <GrimoireBoard
        players={[makePlayer({ characterId: "philosopher" })]}
        characterById={byId}
        claimOptions={claimOptions}
        rotation={0}
        almanacUrl={null}
        reminders={[]}
        activeFabled={[]}
        {...makeHandlers()}
      />,
    );

    await user.click(screen.getByText("Alice"));

    expect(screen.getByLabelText(/acts as/i)).toBeInTheDocument();
  });
});

describe("ghost votes", () => {
  it("shows a spent/unspent ghost vote marker only for dead players, toggleable with one tap", async () => {
    const user = userEvent.setup();
    const handlers = renderBoard([
      makePlayer({ dead: true, ghostVoteSpent: false }),
    ]);

    const marker = screen.getByRole("button", { name: /ghost vote/i });
    expect(marker).toHaveTextContent(/available/i);

    await user.click(marker);
    expect(handlers.onToggleGhostVote).toHaveBeenCalledWith("p1");
  });

  it("doesn't show a ghost vote marker for a living player", () => {
    renderBoard([makePlayer({ dead: false })]);
    expect(
      screen.queryByRole("button", { name: /ghost vote/i }),
    ).not.toBeInTheDocument();
  });
});

describe("seat reordering (issue #188)", () => {
  it("offers no 'Move seat earlier'/'Move seat later' controls — dragging is the only reorder gesture", async () => {
    const user = userEvent.setup();
    const { container } = renderBoard([
      makePlayer({ id: "p1", seat: 1, name: "Alice" }),
      makePlayer({ id: "p2", seat: 2, name: "Bob", characterId: "imp" }),
    ]);
    const aliceWrap = container.querySelector(
      "[data-player-id='p1']",
    ) as HTMLElement;
    const bobWrap = container.querySelector(
      "[data-player-id='p2']",
    ) as HTMLElement;

    await user.click(screen.getByText("Alice"));
    expect(
      within(aliceWrap).queryByRole("button", { name: /move seat/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByText("Bob"));
    expect(
      within(bobWrap).queryByRole("button", { name: /move seat/i }),
    ).not.toBeInTheDocument();
  });
});

describe("re-circle", () => {
  it("snaps dragged tokens back to the circle", async () => {
    const user = userEvent.setup();
    const handlers = renderBoard([
      makePlayer({ id: "p1", position: { x: 10, y: 10 } }),
    ]);

    await openBoardMenu(user);
    await user.click(screen.getByRole("button", { name: /re-circle/i }));

    expect(handlers.onReCircle).toHaveBeenCalled();
  });

  it("discards an in-progress drag so it can't override the re-circled layout", async () => {
    const user = userEvent.setup();
    const { container } = renderBoard([
      makePlayer({ position: { x: 10, y: 10 } }),
    ]);
    const board = container.querySelector("[data-board]") as HTMLElement;
    vi.spyOn(board, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 400,
      height: 400,
      right: 400,
      bottom: 400,
      x: 0,
      y: 0,
      toJSON() {},
    });
    const summary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;
    const wrap = container.querySelector(
      "[data-player-id='p1']",
    ) as HTMLElement;

    fireEvent(
      summary,
      pointerEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }),
    );
    fireEvent(
      summary,
      pointerEvent("pointermove", { pointerId: 1, clientX: 140, clientY: 180 }),
    );
    expect(wrap.style.left).toBe("20%");

    await openBoardMenu(user);
    await user.click(screen.getByRole("button", { name: /re-circle/i }));
    // The stale in-progress drag position must not resurface on the next
    // pointermove for the same (now-abandoned) gesture.
    fireEvent(
      summary,
      pointerEvent("pointermove", { pointerId: 1, clientX: 200, clientY: 200 }),
    );

    expect(wrap.style.left).not.toBe("20%");
  });
});

describe("rotate the grimoire (issue #192)", () => {
  it("offers controls to rotate the grimoire clockwise and counterclockwise, stepping the persisted rotation", async () => {
    const user = userEvent.setup();
    const handlers = renderBoard([makePlayer()], { rotation: 0 });

    await openBoardMenu(user);
    await user.click(screen.getByRole("button", { name: "Rotate right" }));
    expect(handlers.onRotate).toHaveBeenCalledWith(45);

    await openBoardMenu(user);
    await user.click(screen.getByRole("button", { name: "Rotate left" }));
    expect(handlers.onRotate).toHaveBeenCalledWith(315);
  });

  it("rotates a computed-circle seat around the centre by the persisted rotation", () => {
    // A single seat sits at circlePosition(0, 1) — the top, (50, 5). A
    // quarter turn should land it where the next seat clockwise would sit.
    const { container } = renderBoard([makePlayer({ id: "p1", seat: 1 })], {
      rotation: 90,
    });

    const wrap = container.querySelector("[data-player-id='p1']") as HTMLElement;
    expect(parseFloat(wrap.style.left)).toBeCloseTo(95);
    expect(parseFloat(wrap.style.top)).toBeCloseTo(50);
  });

  it("also rotates a hand-dragged token's stored position, not just computed seats", () => {
    const { container } = renderBoard(
      [makePlayer({ id: "p1", position: { x: 50, y: 5 } })],
      { rotation: 90 },
    );

    const wrap = container.querySelector("[data-player-id='p1']") as HTMLElement;
    expect(parseFloat(wrap.style.left)).toBeCloseTo(95);
    expect(parseFloat(wrap.style.top)).toBeCloseTo(50);
  });

  it("does not re-distort a free-standing reminder's out-of-range canonical position before rotating it for display (Copilot review finding)", () => {
    // Simulates the canonical position a rotated corner-drag can legitimately
    // produce for a free-standing reminder — out of the usual [4, 96] range,
    // but only because it hasn't been rotated back into display space yet.
    const { container } = renderBoard([makePlayer()], {
      rotation: 45,
      reminders: [
        makeReminder({ id: "r1", position: { x: 115.05382386916239, y: 50 } }),
      ],
    });

    const wrap = container.querySelector("[data-reminder-id='r1']") as HTMLElement;
    // Rotating the raw canonical value once and clamping only the result
    // lands it back at the pad's corner (96, 96) — pre-clamping the
    // canonical value before rotating (the bug) would instead distort it to
    // (~82.5, ~82.5), well short of the corner.
    expect(parseFloat(wrap.style.left)).toBeCloseTo(96);
    expect(parseFloat(wrap.style.top)).toBeCloseTo(96);
  });

  it("keeps a token's own label and art upright regardless of rotation", () => {
    const { container } = renderBoard([makePlayer({ id: "p1" })], {
      rotation: 90,
    });

    const summary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;
    // Only the token's *position* moves with rotation — nothing about its
    // own content ever gets a rotate transform, so it always renders upright.
    expect(summary.style.transform).toBe("");
  });

  it("keeps an anchored reminder tracking its seat through the rotation", () => {
    const { container } = renderBoard([makePlayer({ id: "p1", seat: 1 })], {
      rotation: 90,
      reminders: [makeReminder({ id: "r1", anchorPlayerId: "p1" })],
    });

    const reminderWrap = container.querySelector(
      "[data-reminder-id='r1']",
    ) as HTMLElement;
    // The seat itself rotates to (95, 50); the reminder should still park
    // directly beside it, not at its pre-rotation offset.
    expect(parseFloat(reminderWrap.style.left)).toBeCloseTo(95);
    expect(parseFloat(reminderWrap.style.top)).toBeCloseTo(62);
  });

  it("stores a seat-anchored reminder's fallback position in the canonical (un-rotated) frame, not the rotated display frame", async () => {
    const user = userEvent.setup();
    // Canonical (50, 5); displayed rotated 90 degrees at (95, 50).
    const { onAddReminder } = renderBoard(
      [makePlayer({ id: "p1", position: { x: 50, y: 5 } })],
      { rotation: 90 },
    );

    await user.click(screen.getByText("Alice"));
    const wrap = screen.getByText("Alice").closest("[data-player-id='p1']") as HTMLElement;
    await user.click(within(wrap).getByRole("button", { name: "Add reminder" }));
    const dialog = screen.getByRole("dialog", { name: "Add reminder" });
    const group = within(dialog).getByRole("group", { name: "Washerwoman" });
    await user.click(within(group).getByRole("button", { name: "Townsfolk" }));

    // parkBeside of the canonical (50, 5), not of the rotated (95, 50) —
    // otherwise this reminder's stored fallback position would be rotated a
    // second time once it's ever read as free-standing (e.g. after its
    // anchor seat is later removed and the removal is undone).
    expect(onAddReminder).toHaveBeenCalledWith({
      characterId: "washerwoman",
      label: "Townsfolk",
      position: { x: 55, y: 5 },
      anchorPlayerId: "p1",
    });
  });

  it("persists the un-rotated position when a hand-dragged token is moved while the circle is rotated", () => {
    const { container, onMove } = renderBoard(
      [makePlayer({ id: "p1", position: { x: 50, y: 20 } })],
      { rotation: 90 },
    );
    mockBoardRect(container);
    const summary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;

    // Displayed at (80, 50) on the 400px board, i.e. pixel (320, 200) —
    // dragging 20px right (+5%) moves the display position to (85, 50).
    fireEvent(summary, pointerEvent("pointerdown", { pointerId: 1, clientX: 320, clientY: 200 }));
    fireEvent(summary, pointerEvent("pointermove", { pointerId: 1, clientX: 340, clientY: 200 }));
    fireEvent(summary, pointerEvent("pointerup", { pointerId: 1, clientX: 340, clientY: 200 }));

    // The dropped (85, 50) display position, un-rotated by -90 degrees, is
    // (50, 15) in the canonical frame the game document actually stores.
    expect(onMove).toHaveBeenCalledTimes(1);
    const [, savedPosition] = onMove.mock.calls[0];
    expect(savedPosition.x).toBeCloseTo(50);
    expect(savedPosition.y).toBeCloseTo(15);
  });

  it("does not snap a token dropped near a corner under a non-90-degree rotation to a different spot than where it was released", () => {
    const { container, onMove } = renderBoard(
      [makePlayer({ id: "p1", position: { x: 50, y: 50 } })],
      { rotation: 45 },
    );
    mockBoardRect(container);
    const summary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;

    // A rotation around the centre fixes the centre, so this token displays
    // at (50, 50) regardless of rotation. Drag far enough that clampPct's
    // independent per-axis clamp kicks in on both axes, landing the drop at
    // the corner (96, 96).
    fireEvent(summary, pointerEvent("pointerdown", { pointerId: 1, clientX: 200, clientY: 200 }));
    fireEvent(summary, pointerEvent("pointermove", { pointerId: 1, clientX: 384, clientY: 384 }));
    fireEvent(summary, pointerEvent("pointerup", { pointerId: 1, clientX: 384, clientY: 384 }));

    expect(onMove).toHaveBeenCalledTimes(1);
    const [, savedPosition] = onMove.mock.calls[0];
    // Un-rotating (96, 96) by -45 degrees, unclamped, is (~115, 50). If this
    // were clamped a second time (as it used to be — code review finding),
    // it would come back as (96, 50) instead, and re-rendering that would
    // visibly snap the token away from the corner it was actually dropped at.
    expect(savedPosition.x).toBeCloseTo(115.05, 1);
    expect(savedPosition.y).toBeCloseTo(50);
  });
});

describe("drag", () => {
  it("moves the token visually once the pointer moves past the drag threshold, without saving yet", () => {
    const { container, onMove } = renderBoard([makePlayer()]);
    mockBoardRect(container);
    const summary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;
    const wrap = container.querySelector(
      "[data-player-id='p1']",
    ) as HTMLElement;

    fireEvent(
      summary,
      pointerEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }),
    );
    fireEvent(
      summary,
      pointerEvent("pointermove", { pointerId: 1, clientX: 140, clientY: 180 }),
    );

    expect(wrap.style.left).toBe("60%");
    expect(wrap.style.top).toBe("25%");
    // Persisting on every pointermove would mean dozens of full-document
    // localStorage writes a second during a real touch drag.
    expect(onMove).not.toHaveBeenCalled();
  });

  it("saves the final position once, on pointerup", () => {
    const { container, onMove } = renderBoard([makePlayer()]);
    mockBoardRect(container);
    const summary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;

    fireEvent(
      summary,
      pointerEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }),
    );
    fireEvent(
      summary,
      pointerEvent("pointermove", { pointerId: 1, clientX: 140, clientY: 180 }),
    );
    fireEvent(
      summary,
      pointerEvent("pointermove", { pointerId: 1, clientX: 160, clientY: 200 }),
    );
    fireEvent(
      summary,
      pointerEvent("pointerup", { pointerId: 1, clientX: 160, clientY: 200 }),
    );

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith("p1", { x: 65, y: 30 });
  });

  it("discards the in-progress move if the gesture is cancelled", () => {
    const { container, onMove } = renderBoard([makePlayer()]);
    mockBoardRect(container);
    const summary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;
    const wrap = container.querySelector(
      "[data-player-id='p1']",
    ) as HTMLElement;
    const originalLeft = wrap.style.left;

    fireEvent(
      summary,
      pointerEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }),
    );
    fireEvent(
      summary,
      pointerEvent("pointermove", { pointerId: 1, clientX: 140, clientY: 180 }),
    );
    fireEvent(
      summary,
      pointerEvent("pointercancel", {
        pointerId: 1,
        clientX: 140,
        clientY: 180,
      }),
    );

    expect(onMove).not.toHaveBeenCalled();
    expect(wrap.style.left).toBe(originalLeft);
  });

  it("ignores a second pointer touching the same token mid-drag, so the first pointer's drag still resolves", () => {
    const { container, onMove } = renderBoard([makePlayer()]);
    mockBoardRect(container);
    const summary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;

    fireEvent(
      summary,
      pointerEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }),
    );
    fireEvent(
      summary,
      pointerEvent("pointermove", { pointerId: 1, clientX: 140, clientY: 180 }),
    );
    // A second finger rests on the same token while pointer 1 is still down.
    fireEvent(
      summary,
      pointerEvent("pointerdown", { pointerId: 2, clientX: 105, clientY: 105 }),
    );
    fireEvent(
      summary,
      pointerEvent("pointermove", { pointerId: 1, clientX: 160, clientY: 200 }),
    );
    fireEvent(
      summary,
      pointerEvent("pointerup", { pointerId: 1, clientX: 160, clientY: 200 }),
    );

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith("p1", { x: 65, y: 30 });
  });

  it("doesn't move for tiny pointer jitter under the drag threshold", () => {
    const { container, onMove } = renderBoard([makePlayer()]);
    const summary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;

    fireEvent(
      summary,
      pointerEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }),
    );
    fireEvent(
      summary,
      pointerEvent("pointermove", { pointerId: 1, clientX: 101, clientY: 101 }),
    );

    expect(onMove).not.toHaveBeenCalled();
  });

  it("doesn't open the token menu after an actual drag", () => {
    const { container } = renderBoard([makePlayer()]);
    const summary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;
    const details = container.querySelector(
      "[data-player-id='p1'] details",
    ) as HTMLDetailsElement;

    fireEvent(
      summary,
      pointerEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }),
    );
    fireEvent(
      summary,
      pointerEvent("pointermove", { pointerId: 1, clientX: 140, clientY: 180 }),
    );
    fireEvent(
      summary,
      pointerEvent("pointerup", { pointerId: 1, clientX: 140, clientY: 180 }),
    );
    fireEvent.click(summary);

    expect(details.open).toBe(false);
  });

  // Issue #167: the drag used to set the token's centre to the raw pointer
  // position, ignoring where inside the token (icon vs. name label, a tall
  // stack) it was actually grabbed — snapping the token under the finger the
  // instant the drag threshold crossed. Grabbing off-centre and moving by a
  // known delta proves the grab offset is captured and preserved: the token
  // should move by exactly that delta, landing exactly where it started plus
  // the delta, not at the raw pointer position.
  it("keeps an off-centre grab point under the finger instead of snapping the token's centre to it", () => {
    const { container, onMove } = renderBoard([
      makePlayer({ id: "p1", position: { x: 30, y: 40 } }),
    ]);
    mockBoardRect(container);
    const summary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;
    const wrap = container.querySelector(
      "[data-player-id='p1']",
    ) as HTMLElement;

    // Token centre is at 30%/40% of the 400px board, i.e. (120, 160). Grab
    // 20px right and 10px down of centre — e.g. the name label below the icon.
    fireEvent(
      summary,
      pointerEvent("pointerdown", { pointerId: 1, clientX: 140, clientY: 170 }),
    );
    // Move the pointer 40px right, 0px down (past the drag threshold).
    fireEvent(
      summary,
      pointerEvent("pointermove", { pointerId: 1, clientX: 180, clientY: 170 }),
    );

    // The token must move by exactly the pointer's delta (+10% x, +0% y),
    // not jump to the raw pointer position (which would read 45%/42.5%).
    expect(wrap.style.left).toBe("40%");
    expect(wrap.style.top).toBe("40%");

    fireEvent(
      summary,
      pointerEvent("pointerup", { pointerId: 1, clientX: 180, clientY: 170 }),
    );
    expect(onMove).toHaveBeenCalledWith("p1", { x: 40, y: 40 });
  });

  // Issue #167 code review finding: dragging a token whose stored position
  // was out of range (legacy/hand-edited data) used to disagree with where
  // the token was actually grabbed, since the raw stored value fed the
  // drag's start position while the token itself rendered clamped. Now that
  // rendering clamps the stored position too, picking it up at its
  // displayed (already-clamped) spot must behave like any other drag — no
  // jump to the clamp edge on the first move.
  it("doesn't jump when dragging a token whose stored position was out of range", () => {
    const { container, onMove } = renderBoard([
      makePlayer({ id: "p1", position: { x: 150, y: 40 } }),
    ]);
    mockBoardRect(container);
    const summary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;
    const wrap = container.querySelector(
      "[data-player-id='p1']",
    ) as HTMLElement;
    // Clamped to 96% (384px on the 400px board) per the earlier rendering test.
    expect(wrap.style.left).toBe("96%");

    fireEvent(
      summary,
      pointerEvent("pointerdown", { pointerId: 1, clientX: 384, clientY: 160 }),
    );
    fireEvent(
      summary,
      pointerEvent("pointermove", { pointerId: 1, clientX: 344, clientY: 160 }),
    );

    // A 40px (10%) move left from the clamped edge, not a jump elsewhere.
    expect(wrap.style.left).toBe("86%");

    fireEvent(
      summary,
      pointerEvent("pointerup", { pointerId: 1, clientX: 344, clientY: 160 }),
    );
    expect(onMove).toHaveBeenCalledWith("p1", { x: 86, y: 40 });
  });
});

describe("hide grimoire", () => {
  it("blurs/obscures the board in one tap and needs a deliberate action to restore it", async () => {
    const user = userEvent.setup();
    const { container } = renderBoard([makePlayer()]);

    await user.click(screen.getByRole("button", { name: /hide grimoire/i }));

    const board = container.querySelector("[data-board]") as HTMLElement;
    expect(board).toHaveAttribute("data-hidden", "true");
    expect(
      screen.getByRole("button", { name: /show grimoire/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /show grimoire/i }));
    expect(board).toHaveAttribute("data-hidden", "false");
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("discards an in-progress drag, so the token isn't left at a stale unsaved position once re-shown", async () => {
    const user = userEvent.setup();
    const { container, onMove } = renderBoard([makePlayer()]);
    const board = container.querySelector("[data-board]") as HTMLElement;
    vi.spyOn(board, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 400,
      height: 400,
      right: 400,
      bottom: 400,
      x: 0,
      y: 0,
      toJSON() {},
    });
    const summary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;

    fireEvent(
      summary,
      pointerEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }),
    );
    fireEvent(
      summary,
      pointerEvent("pointermove", { pointerId: 1, clientX: 140, clientY: 180 }),
    );

    await user.click(screen.getByRole("button", { name: /hide grimoire/i }));
    await user.click(screen.getByRole("button", { name: /show grimoire/i }));

    // The abandoned gesture never reached pointerup, so it must never save.
    expect(onMove).not.toHaveBeenCalled();
    const wrap = container.querySelector(
      "[data-player-id='p1']",
    ) as HTMLElement;
    expect(wrap.style.left).not.toBe("35%");
  });
});

describe("reminders (issue #14)", () => {
  it("renders every reminder on the pad at its stored position, with the source character's art", () => {
    const { container } = renderBoard([makePlayer()], {
      reminders: [
        makeReminder({
          id: "r1",
          characterId: "washerwoman",
          label: "Townsfolk",
          position: { x: 60, y: 40 },
        }),
      ],
    });

    const wrap = container.querySelector(
      "[data-reminder-id='r1']",
    ) as HTMLElement;
    expect(wrap).toBeInTheDocument();
    expect(wrap.style.left).toBe("60%");
    expect(wrap.style.top).toBe("40%");
    expect(within(wrap).getByText("Townsfolk")).toBeInTheDocument();
  });

  it("renders a reminder with no source character (custom text) without character art", () => {
    const { container } = renderBoard([makePlayer()], {
      reminders: [
        makeReminder({ id: "r1", characterId: null, label: "Custom note" }),
      ],
    });

    const wrap = container.querySelector(
      "[data-reminder-id='r1']",
    ) as HTMLElement;
    expect(within(wrap).queryByRole("img")).not.toBeInTheDocument();
    expect(within(wrap).getByText("Custom note")).toBeInTheDocument();
  });

  it("opens the reminder picker from the pad, and adds the chosen reminder at a default position", async () => {
    const user = userEvent.setup();
    const { container, onAddReminder } = renderBoard([makePlayer()]);

    const controls = container.querySelector("[data-controls]") as HTMLElement;
    await user.click(
      within(controls).getByRole("button", { name: "Add reminder" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Add reminder" });
    const group = within(dialog).getByRole("group", { name: "Washerwoman" });
    await user.click(within(group).getByRole("button", { name: "Townsfolk" }));

    expect(onAddReminder).toHaveBeenCalledWith({
      characterId: "washerwoman",
      label: "Townsfolk",
      position: { x: 50, y: 50 },
      anchorPlayerId: null,
    });
  });

  it("opens the reminder picker from a player's token menu, and parks the new reminder next to them", async () => {
    const user = userEvent.setup();
    const { onAddReminder } = renderBoard([
      makePlayer({ id: "p1", position: { x: 30, y: 40 } }),
    ]);

    await user.click(screen.getByText("Alice"));
    const wrap = screen
      .getByText("Alice")
      .closest("[data-player-id='p1']") as HTMLElement;
    await user.click(
      within(wrap).getByRole("button", { name: "Add reminder" }),
    );

    const dialog = screen.getByRole("dialog", { name: "Add reminder" });
    const group = within(dialog).getByRole("group", { name: "Washerwoman" });
    await user.click(within(group).getByRole("button", { name: "Townsfolk" }));

    expect(onAddReminder).toHaveBeenCalledWith({
      characterId: "washerwoman",
      label: "Townsfolk",
      position: { x: 35, y: 40 },
      anchorPlayerId: "p1",
    });
  });

  it("drags a reminder the same way a player token drags, saving only on pointerup", () => {
    const { container, onMoveReminder, onMove } = renderBoard([makePlayer()], {
      reminders: [makeReminder({ id: "r1", position: { x: 60, y: 40 } })],
    });
    mockBoardRect(container);
    const summary = container.querySelector(
      "[data-reminder-id='r1'] summary",
    ) as HTMLElement;
    const wrap = container.querySelector(
      "[data-reminder-id='r1']",
    ) as HTMLElement;

    fireEvent(
      summary,
      pointerEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }),
    );
    fireEvent(
      summary,
      pointerEvent("pointermove", { pointerId: 1, clientX: 140, clientY: 180 }),
    );
    expect(wrap.style.left).toBe("70%");
    expect(onMoveReminder).not.toHaveBeenCalled();

    fireEvent(
      summary,
      pointerEvent("pointerup", { pointerId: 1, clientX: 140, clientY: 180 }),
    );
    expect(onMoveReminder).toHaveBeenCalledWith("r1", { x: 70, y: 60 });
    expect(onMove).not.toHaveBeenCalled();
  });

  it("removes a reminder in one tap, offering an undo that restores it", async () => {
    const user = userEvent.setup();
    const reminder = makeReminder({ id: "r1" });
    const { container, onRemoveReminder, onRestoreReminder } = renderBoard(
      [makePlayer()],
      {
        reminders: [reminder],
      },
    );

    await user.click(
      within(
        container.querySelector("[data-reminder-id='r1']") as HTMLElement,
      ).getByText("Townsfolk"),
    );
    await user.click(screen.getByRole("button", { name: "Remove reminder" }));

    expect(onRemoveReminder).toHaveBeenCalledWith("r1");
    await user.click(screen.getByRole("button", { name: /undo/i }));
    expect(onRestoreReminder).toHaveBeenCalledWith(reminder);
  });

  it("hides the undo banner along with the rest of the board when the grimoire is hidden", async () => {
    const user = userEvent.setup();
    const reminder = makeReminder({ id: "r1" });
    const { container } = renderBoard([makePlayer()], {
      reminders: [reminder],
    });

    await user.click(
      within(
        container.querySelector("[data-reminder-id='r1']") as HTMLElement,
      ).getByText("Townsfolk"),
    );
    await user.click(screen.getByRole("button", { name: "Remove reminder" }));
    expect(screen.getByRole("button", { name: /undo/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /hide grimoire/i }));
    expect(
      screen.queryByRole("button", { name: /undo/i }),
    ).not.toBeInTheDocument();
  });

  it("doesn't let a second 'Add reminder' tap silently discard an already-open picker's context", async () => {
    const user = userEvent.setup();
    const { container } = renderBoard([
      makePlayer({ id: "p1", position: { x: 30, y: 40 } }),
    ]);

    await user.click(screen.getByText("Alice"));
    const wrap = screen
      .getByText("Alice")
      .closest("[data-player-id='p1']") as HTMLElement;
    await user.click(
      within(wrap).getByRole("button", { name: "Add reminder" }),
    );

    const padControls = container.querySelector(
      "[data-controls]",
    ) as HTMLElement;
    expect(
      within(padControls).queryByRole("button", { name: "Add reminder" }),
    ).not.toBeInTheDocument();
  });

  it("closes the reminder picker and hides its pad trigger when the grimoire is hidden (code review: PR #37)", async () => {
    const user = userEvent.setup();
    const { container } = renderBoard([makePlayer()]);

    const padControls = container.querySelector(
      "[data-controls]",
    ) as HTMLElement;
    await user.click(
      within(padControls).getByRole("button", { name: "Add reminder" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Add reminder" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /hide grimoire/i }));
    expect(
      screen.queryByRole("dialog", { name: "Add reminder" }),
    ).not.toBeInTheDocument();
    expect(
      within(padControls).queryByRole("button", { name: "Add reminder" }),
    ).not.toBeInTheDocument();
  });

  it("closes an open reminder picker on re-circle, so a stale parked position can't be used (code review: PR #37)", async () => {
    const user = userEvent.setup();
    renderBoard([makePlayer({ id: "p1", position: { x: 30, y: 40 } })]);

    await user.click(screen.getByText("Alice"));
    const wrap = screen
      .getByText("Alice")
      .closest("[data-player-id='p1']") as HTMLElement;
    await user.click(
      within(wrap).getByRole("button", { name: "Add reminder" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Add reminder" }),
    ).toBeInTheDocument();

    await openBoardMenu(user);
    await user.click(screen.getByRole("button", { name: /re-circle/i }));
    expect(
      screen.queryByRole("dialog", { name: "Add reminder" }),
    ).not.toBeInTheDocument();
  });
});

describe("reminder placement (issue #71)", () => {
  it("spreads a second pad-added reminder away from an already-placed one instead of stacking at the same default point", async () => {
    const user = userEvent.setup();
    const existing = makeReminder({
      id: "r1",
      position: { x: 50, y: 50 },
      anchorPlayerId: null,
    });
    const { container, onAddReminder } = renderBoard([makePlayer()], {
      reminders: [existing],
    });

    const controls = container.querySelector("[data-controls]") as HTMLElement;
    await user.click(
      within(controls).getByRole("button", { name: "Add reminder" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Add reminder" });
    const group = within(dialog).getByRole("group", { name: "Washerwoman" });
    await user.click(within(group).getByRole("button", { name: "Townsfolk" }));

    expect(onAddReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        anchorPlayerId: null,
        position: expect.not.objectContaining({ x: 50, y: 50 }),
      }),
    );
  });

  it("renders a reminder anchored to a seat below that seat's token, clear of its name label", () => {
    const reminder = makeReminder({
      id: "r1",
      anchorPlayerId: "p1",
      position: { x: 1, y: 1 },
    });
    const { container } = renderBoard(
      [makePlayer({ id: "p1", position: { x: 30, y: 40 } })],
      { reminders: [reminder] },
    );

    const wrap = container.querySelector(
      "[data-reminder-id='r1']",
    ) as HTMLElement;
    expect(wrap.style.left).toBe("30%");
    expect(parseFloat(wrap.style.top)).toBeGreaterThan(40);
  });

  it("stacks a second reminder anchored to the same seat further down, not on top of the first", () => {
    const first = makeReminder({
      id: "r1",
      anchorPlayerId: "p1",
      label: "First",
    });
    const second = makeReminder({
      id: "r2",
      anchorPlayerId: "p1",
      label: "Second",
    });
    const { container } = renderBoard(
      [makePlayer({ id: "p1", position: { x: 30, y: 40 } })],
      { reminders: [first, second] },
    );

    const firstTop = parseFloat(
      (container.querySelector("[data-reminder-id='r1']") as HTMLElement).style
        .top,
    );
    const secondTop = parseFloat(
      (container.querySelector("[data-reminder-id='r2']") as HTMLElement).style
        .top,
    );
    expect(secondTop).toBeGreaterThan(firstTop);
  });

  it("keeps an anchored reminder tracking its seat when that seat is dragged to a new position", () => {
    const reminder = makeReminder({ id: "r1", anchorPlayerId: "p1" });
    const { container } = renderBoard(
      [makePlayer({ id: "p1", position: { x: 30, y: 40 } })],
      { reminders: [reminder] },
    );
    mockBoardRect(container);
    const summary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;

    fireEvent(
      summary,
      pointerEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }),
    );
    fireEvent(
      summary,
      pointerEvent("pointermove", { pointerId: 1, clientX: 180, clientY: 180 }),
    );

    const wrap = container.querySelector(
      "[data-reminder-id='r1']",
    ) as HTMLElement;
    expect(parseFloat(wrap.style.left)).toBeCloseTo(50);
  });

  // Issue #167 AC: an anchored reminder renders offset below its seat (see
  // "renders a reminder anchored to a seat below that seat's token" above),
  // not at its own stale stored `position`. Dragging it must start from that
  // displayed offset spot, not snap to the pointer on pickup.
  it("starts dragging an anchored reminder from its displayed offset position, not its stale stored position", () => {
    const reminder = makeReminder({
      id: "r1",
      anchorPlayerId: "p1",
      // Deliberately stale/unrelated to where the reminder actually renders
      // (below the seat) — proves the drag doesn't grab-offset against this.
      position: { x: 1, y: 1 },
    });
    const { container, onMoveReminder } = renderBoard(
      [makePlayer({ id: "p1", position: { x: 30, y: 40 } })],
      { reminders: [reminder] },
    );
    mockBoardRect(container);
    const reminderSummary = container.querySelector(
      "[data-reminder-id='r1'] summary",
    ) as HTMLElement;
    const wrap = container.querySelector(
      "[data-reminder-id='r1']",
    ) as HTMLElement;
    // Displayed anchored position: same x as the seat (30%), offset below
    // it in y (30%/52% per anchoredReminderPosition, i.e. (120, 208) on the
    // 400px board) — not the seat's own centre and not the stored (1, 1).
    expect(wrap.style.left).toBe("30%");
    expect(wrap.style.top).toBe("52%");

    fireEvent(
      reminderSummary,
      pointerEvent("pointerdown", { pointerId: 1, clientX: 120, clientY: 208 }),
    );
    fireEvent(
      reminderSummary,
      pointerEvent("pointermove", { pointerId: 1, clientX: 160, clientY: 208 }),
    );

    // Grabbed exactly at the displayed spot and moved 40px (10%) right, so
    // the reminder should land at 40%/52% — not jump to the raw pointer
    // position, and not offset against the stale stored (1, 1).
    expect(wrap.style.left).toBe("40%");
    expect(wrap.style.top).toBe("52%");

    fireEvent(
      reminderSummary,
      pointerEvent("pointerup", { pointerId: 1, clientX: 160, clientY: 208 }),
    );
    expect(onMoveReminder).toHaveBeenCalledWith("r1", { x: 40, y: 52 });
  });

  it("attaches an existing reminder to a seat by tapping it, without a drag gesture", async () => {
    const user = userEvent.setup();
    const reminder = makeReminder({ id: "r1", anchorPlayerId: null });
    const { container, onAttachReminder } = renderBoard(
      [makePlayer({ id: "p1", name: "Alice" })],
      { reminders: [reminder] },
    );

    await user.click(
      within(
        container.querySelector("[data-reminder-id='r1']") as HTMLElement,
      ).getByText("Townsfolk"),
    );
    await user.click(screen.getByRole("button", { name: "Attach to seat" }));
    expect(screen.getByText(/tap a seat/i)).toBeInTheDocument();

    const seatDetails = container.querySelector(
      "[data-player-id='p1'] details",
    ) as HTMLDetailsElement;
    const seatSummary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;
    fireEvent.click(seatSummary);

    expect(onAttachReminder).toHaveBeenCalledWith("r1", "p1");
    expect(screen.queryByText(/tap a seat/i)).not.toBeInTheDocument();
    // Tapping the seat while placing attaches the reminder instead of
    // opening that seat's own menu (jsdom doesn't hide a closed <details>'s
    // content from queries the way a real browser does, so `.open` is the
    // only reliable signal here — see "doesn't open the token menu after an
    // actual drag" above for the same check).
    expect(seatDetails.open).toBe(false);
  });

  it("cancels an in-progress attach without calling onAttachReminder", async () => {
    const user = userEvent.setup();
    const reminder = makeReminder({ id: "r1", anchorPlayerId: null });
    const { onAttachReminder } = renderBoard(
      [makePlayer({ id: "p1", name: "Alice" })],
      {
        reminders: [reminder],
      },
    );

    await user.click(
      screen
        .getByText("Townsfolk")
        .closest("[data-reminder-id='r1']")!
        .querySelector("summary")!,
    );
    await user.click(screen.getByRole("button", { name: "Attach to seat" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText(/tap a seat/i)).not.toBeInTheDocument();
    await user.click(screen.getByText("Alice"));
    expect(onAttachReminder).not.toHaveBeenCalled();
  });

  it("hides the pad-level 'Add reminder'/'Info tokens' buttons while placing a reminder", async () => {
    const user = userEvent.setup();
    const reminder = makeReminder({ id: "r1", anchorPlayerId: null });
    const { container } = renderBoard(
      [makePlayer({ id: "p1", name: "Alice" })],
      {
        reminders: [reminder],
      },
    );

    await user.click(
      screen
        .getByText("Townsfolk")
        .closest("[data-reminder-id='r1']")!
        .querySelector("summary")!,
    );
    await user.click(screen.getByRole("button", { name: "Attach to seat" }));

    const controls = container.querySelector("[data-controls]") as HTMLElement;
    expect(
      within(controls).queryByRole("button", { name: "Add reminder" }),
    ).not.toBeInTheDocument();
    expect(
      within(controls).queryByRole("button", { name: "Info tokens" }),
    ).not.toBeInTheDocument();
  });

  it("completes the attach even if the tap overshoots the drag threshold, instead of silently repositioning the seat (code review finding)", () => {
    const reminder = makeReminder({ id: "r1", anchorPlayerId: null });
    const { container, onAttachReminder, onMove } = renderBoard(
      [makePlayer({ id: "p1", name: "Alice", position: { x: 30, y: 40 } })],
      { reminders: [reminder] },
    );
    mockBoardRect(container);

    fireEvent.click(
      (
        container.querySelector("[data-reminder-id='r1']") as HTMLElement
      ).querySelector("summary")!,
    );
    fireEvent.click(screen.getByRole("button", { name: "Attach to seat" }));

    // A real finger tap easily drifts past the drag threshold — while
    // placement is armed this must still land as a tap-to-attach on this
    // seat, not get read as "reposition the seat" (which would silently
    // swallow the attach with no feedback other than the still-open banner).
    const seatSummary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;
    fireEvent(
      seatSummary,
      pointerEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }),
    );
    fireEvent(
      seatSummary,
      pointerEvent("pointermove", { pointerId: 1, clientX: 180, clientY: 180 }),
    );
    fireEvent(
      seatSummary,
      pointerEvent("pointerup", { pointerId: 1, clientX: 180, clientY: 180 }),
    );
    fireEvent.click(seatSummary);

    expect(onMove).not.toHaveBeenCalled();
    expect(onAttachReminder).toHaveBeenCalledWith("r1", "p1");
    expect(screen.queryByText(/tap a seat/i)).not.toBeInTheDocument();
  });

  it("clears the armed placement state when removing the reminder currently being placed (code review finding)", async () => {
    const user = userEvent.setup();
    const reminder = makeReminder({ id: "r1", anchorPlayerId: null });
    const { onAttachReminder } = renderBoard(
      [makePlayer({ id: "p1", name: "Alice" })],
      { reminders: [reminder] },
    );

    await user.click(
      screen
        .getByText("Townsfolk")
        .closest("[data-reminder-id='r1']")!
        .querySelector("summary")!,
    );
    await user.click(screen.getByRole("button", { name: "Attach to seat" }));
    await user.click(screen.getByRole("button", { name: "Remove reminder" }));

    expect(screen.queryByText(/tap a seat/i)).not.toBeInTheDocument();
    const seatSummary = screen
      .getByText("Alice")
      .closest("[data-player-id='p1']")!
      .querySelector("summary")!;
    fireEvent.click(seatSummary);
    expect(onAttachReminder).not.toHaveBeenCalled();
  });

  it("clears the armed placement state when the reminder currently being placed is dragged instead (code review finding)", () => {
    const reminder = makeReminder({
      id: "r1",
      anchorPlayerId: null,
      position: { x: 60, y: 40 },
    });
    const { container, onAttachReminder } = renderBoard(
      [makePlayer({ id: "p1", name: "Alice" })],
      { reminders: [reminder] },
    );
    mockBoardRect(container);

    const reminderSummary = container.querySelector(
      "[data-reminder-id='r1'] summary",
    ) as HTMLElement;
    fireEvent.click(reminderSummary);
    fireEvent.click(screen.getByRole("button", { name: "Attach to seat" }));

    fireEvent(
      reminderSummary,
      pointerEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }),
    );
    fireEvent(
      reminderSummary,
      pointerEvent("pointermove", { pointerId: 1, clientX: 140, clientY: 180 }),
    );
    fireEvent(
      reminderSummary,
      pointerEvent("pointerup", { pointerId: 1, clientX: 140, clientY: 180 }),
    );

    expect(screen.queryByText(/tap a seat/i)).not.toBeInTheDocument();
    const seatSummary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;
    fireEvent.click(seatSummary);
    expect(onAttachReminder).not.toHaveBeenCalled();
  });
});

describe("setup walkthrough reopen button (issue #26)", () => {
  it("renders the button in the board's overflow menu when a handler is provided", async () => {
    const user = userEvent.setup();
    renderBoard([makePlayer()], { onOpenSetupWalkthrough: vi.fn() });

    await openBoardMenu(user);
    expect(
      screen.getByRole("button", { name: "Setup walkthrough" }),
    ).toBeInTheDocument();
  });

  it("omits the button entirely when there's nothing for it to reopen", async () => {
    const user = userEvent.setup();
    renderBoard([makePlayer()]);

    await openBoardMenu(user);
    expect(
      screen.queryByRole("button", { name: "Setup walkthrough" }),
    ).not.toBeInTheDocument();
  });

  it("calls the handler on click", async () => {
    const user = userEvent.setup();
    const onOpenSetupWalkthrough = vi.fn();
    renderBoard([makePlayer()], { onOpenSetupWalkthrough });

    await openBoardMenu(user);
    await user.click(screen.getByRole("button", { name: "Setup walkthrough" }));
    expect(onOpenSetupWalkthrough).toHaveBeenCalled();
  });

  it("hides while the reminder picker is open (code review: matches 'Add reminder's own guard)", async () => {
    const user = userEvent.setup();
    const { container } = renderBoard([makePlayer()], {
      onOpenSetupWalkthrough: vi.fn(),
    });

    const controls = container.querySelector("[data-controls]") as HTMLElement;
    await user.click(
      within(controls).getByRole("button", { name: "Add reminder" }),
    );
    await openBoardMenu(user);

    expect(
      screen.queryByRole("button", { name: "Setup walkthrough" }),
    ).not.toBeInTheDocument();
  });
});

describe("board options overflow menu (issue #217)", () => {
  it("keeps the frequent actions directly on the board, not behind the overflow menu", () => {
    const { container } = renderBoard([makePlayer()]);

    const controls = container.querySelector("[data-controls]") as HTMLElement;
    // The overflow menu's own body is also inside [data-controls] — scoping
    // to controls alone wouldn't catch these three having been nested inside
    // it by mistake, so each is asserted absent from .boardMenuBody too.
    const menuBody = container.querySelector(
      `.${styles.boardMenuBody}`,
    ) as HTMLElement;
    for (const name of ["Hide grimoire", "Add reminder", "Info tokens"]) {
      expect(
        within(controls).getByRole("button", { name }),
      ).toBeInTheDocument();
      expect(
        within(menuBody).queryByRole("button", { name }),
      ).not.toBeInTheDocument();
    }
  });

  // jsdom doesn't implement the browser's native "hide non-summary content
  // while a <details> is closed" behavior, so a closed menu's items stay
  // queryable here even though a real browser would visually hide them —
  // the <details> element's own `open` property is what's actually
  // observable in this environment, so that's what these assert against
  // rather than the (here, unreliable) presence of its contents.
  it("tucks Rotate left/right and Re-circle behind the overflow menu, closed by default", async () => {
    const user = userEvent.setup();
    renderBoard([makePlayer()]);

    const menu = screen.getByText("Board options").closest("details")!;
    expect(menu.open).toBe(false);

    await openBoardMenu(user);

    expect(menu.open).toBe(true);
    expect(
      screen.getByRole("button", { name: "Rotate left" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Rotate right" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /re-circle/i }),
    ).toBeInTheDocument();
  });

  it("closes itself once an item is chosen", async () => {
    const user = userEvent.setup();
    renderBoard([makePlayer()]);

    const menu = screen.getByText("Board options").closest("details")!;
    await openBoardMenu(user);
    expect(menu.open).toBe(true);

    await user.click(screen.getByRole("button", { name: "Rotate right" }));

    expect(menu.open).toBe(false);
  });

  it("closes itself when 'Add reminder' or 'Info tokens' is opened instead of one of its own items (code review finding)", async () => {
    const user = userEvent.setup();
    const { container } = renderBoard([makePlayer()]);
    const menu = screen.getByText("Board options").closest("details")!;
    const controls = container.querySelector("[data-controls]") as HTMLElement;

    await openBoardMenu(user);
    expect(menu.open).toBe(true);
    await user.click(
      within(controls).getByRole("button", { name: "Add reminder" }),
    );
    expect(menu.open).toBe(false);
    // Close the picker before exercising the second trigger.
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    await openBoardMenu(user);
    expect(menu.open).toBe(true);
    await user.click(
      within(controls).getByRole("button", { name: "Info tokens" }),
    );
    expect(menu.open).toBe(false);
  });

  it("offers Add traveller/Add character only when a handler is provided, and calls it on click", async () => {
    const user = userEvent.setup();
    const onOpenAddTraveller = vi.fn();
    const onOpenAddCharacter = vi.fn();
    renderBoard([makePlayer()], { onOpenAddTraveller, onOpenAddCharacter });

    await openBoardMenu(user);
    await user.click(screen.getByRole("button", { name: "Add traveller" }));
    expect(onOpenAddTraveller).toHaveBeenCalled();

    await openBoardMenu(user);
    await user.click(screen.getByRole("button", { name: "Add character" }));
    expect(onOpenAddCharacter).toHaveBeenCalled();
  });

  it("omits Add traveller/Add character when no handler is provided", async () => {
    const user = userEvent.setup();
    renderBoard([makePlayer()]);

    await openBoardMenu(user);

    expect(
      screen.queryByRole("button", { name: "Add traveller" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add character" }),
    ).not.toBeInTheDocument();
  });
});

describe("info tokens (issue #19)", () => {
  it("opens the info token library from the pad", async () => {
    const user = userEvent.setup();
    const { container } = renderBoard([makePlayer()]);

    const controls = container.querySelector("[data-controls]") as HTMLElement;
    await user.click(
      within(controls).getByRole("button", { name: "Info tokens" }),
    );

    expect(
      screen.getByRole("dialog", { name: "Info tokens" }),
    ).toBeInTheDocument();
  });

  it("walks picking a standard card, attaching a token, and showing it full-screen", async () => {
    const user = userEvent.setup();
    const { container } = renderBoard([makePlayer({ characterId: "imp" })]);

    const controls = container.querySelector("[data-controls]") as HTMLElement;
    await user.click(
      within(controls).getByRole("button", { name: "Info tokens" }),
    );
    await user.click(screen.getByRole("button", { name: "This is the Demon" }));
    // Scoped to the Info tokens dialog — the board's own "Swap character"
    // <select> also has a Demons <optgroup> (an implicit role="group" too),
    // which would otherwise collide with this picker's fieldset.
    const dialog = screen.getByRole("dialog", { name: "Info tokens" });
    const group = within(dialog).getByRole("group", { name: "Demons" });
    await user.click(within(group).getByRole("button", { name: "Imp" }));
    await user.click(screen.getByRole("button", { name: "Show" }));

    expect(
      screen.queryByRole("dialog", { name: "Info tokens" }),
    ).not.toBeInTheDocument();
    const showMode = screen.getByRole("dialog", { name: "This is the Demon" });
    expect(within(showMode).getByText("Imp")).toBeInTheDocument();
  });

  it("never leaks the board behind it — no player name or control renders while showing", async () => {
    const user = userEvent.setup();
    const { container } = renderBoard([
      makePlayer({ name: "Alice", characterId: "imp" }),
    ]);

    const controls = container.querySelector("[data-controls]") as HTMLElement;
    await user.click(
      within(controls).getByRole("button", { name: "Info tokens" }),
    );
    await user.click(screen.getByRole("button", { name: "This is the Demon" }));
    await user.click(screen.getByRole("button", { name: "Show" }));

    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Re-circle" }),
    ).not.toBeInTheDocument();
  });

  it("returns to the board when the storyteller is done showing the card", async () => {
    const user = userEvent.setup();
    const { container } = renderBoard([makePlayer()]);

    const controls = container.querySelector("[data-controls]") as HTMLElement;
    await user.click(
      within(controls).getByRole("button", { name: "Info tokens" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Did you nominate today?" }),
    );
    await user.click(screen.getByRole("button", { name: "Show" }));
    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(
      screen.queryByRole("dialog", { name: "Did you nominate today?" }),
    ).not.toBeInTheDocument();
  });

  it("discards an in-progress drag before showing, so dragging isn't permanently stuck once back on the board", async () => {
    const user = userEvent.setup();
    const { container, onMove } = renderBoard([makePlayer({ id: "p1" })]);
    mockBoardRect(container);
    const summary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;

    // A drag is left mid-gesture (pointerdown + move, no pointerup) — e.g. a
    // second finger opens and completes the info token flow while the first
    // is still holding a token.
    fireEvent(
      summary,
      pointerEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }),
    );
    fireEvent(
      summary,
      pointerEvent("pointermove", { pointerId: 1, clientX: 140, clientY: 180 }),
    );

    const controls = container.querySelector("[data-controls]") as HTMLElement;
    await user.click(
      within(controls).getByRole("button", { name: "Info tokens" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Did you nominate today?" }),
    );
    await user.click(screen.getByRole("button", { name: "Show" }));
    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(onMove).not.toHaveBeenCalled();
    // The interrupted gesture's pointerId must have been released — a fresh
    // drag with a new pointerId has to still work, not silently no-op
    // against a dragRef stuck on the unmounted gesture. The board itself was
    // unmounted and remounted by the show/hide round-trip, so its rect mock
    // needs reapplying to the new DOM node.
    mockBoardRect(container);
    const summaryAfter = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;
    fireEvent(
      summaryAfter,
      pointerEvent("pointerdown", { pointerId: 2, clientX: 100, clientY: 100 }),
    );
    fireEvent(
      summaryAfter,
      pointerEvent("pointermove", { pointerId: 2, clientX: 140, clientY: 180 }),
    );
    fireEvent(
      summaryAfter,
      pointerEvent("pointerup", { pointerId: 2, clientX: 140, clientY: 180 }),
    );
    expect(onMove).toHaveBeenCalledWith("p1", { x: 60, y: 25 });
  });

  it("hides the pad's info tokens trigger while the reminder picker is open, and vice versa", async () => {
    const user = userEvent.setup();
    const { container } = renderBoard([makePlayer()]);
    const controls = container.querySelector("[data-controls]") as HTMLElement;

    await user.click(
      within(controls).getByRole("button", { name: "Add reminder" }),
    );
    expect(
      within(controls).queryByRole("button", { name: "Info tokens" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(
      within(controls).getByRole("button", { name: "Info tokens" }),
    );
    expect(
      within(controls).queryByRole("button", { name: "Add reminder" }),
    ).not.toBeInTheDocument();
  });

  it("hides the info tokens trigger when the grimoire is hidden", async () => {
    const user = userEvent.setup();
    const { container } = renderBoard([makePlayer()]);

    await user.click(screen.getByRole("button", { name: /hide grimoire/i }));

    const controls = container.querySelector("[data-controls]") as HTMLElement;
    expect(
      within(controls).queryByRole("button", { name: "Info tokens" }),
    ).not.toBeInTheDocument();
  });
});

describe("swap character", () => {
  it("lets the storyteller swap a player's character from their token menu", async () => {
    const user = userEvent.setup();
    const handlers = renderBoard([makePlayer()]);

    await user.click(screen.getByText("Alice"));
    await selectOption(user, screen.getByLabelText(/swap character/i), "imp");

    expect(handlers.onSwapCharacter).toHaveBeenCalledWith("p1", "imp");
  });

  it("never offers a Fabled or Loric character — they're never held by a player", async () => {
    const user = userEvent.setup();
    const byId = new Map([
      ["washerwoman", getCharacter("washerwoman")!],
      ["angel", getCharacter("angel")!],
    ]);
    render(
      <GrimoireBoard
        players={[makePlayer()]}
        characterById={byId}
        claimOptions={claimOptions}
        rotation={0}
        activeFabled={["angel"]}
        {...noop}
      />,
    );

    await user.click(screen.getByText("Alice"));
    const listbox = await openListbox(
      user,
      screen.getByLabelText(/swap character/i),
    );
    const options = within(listbox).getAllByRole("option");

    expect(options.some((o) => o.textContent === "Angel")).toBe(false);
  });

  it("never offers a Traveller character — swapping to one wouldn't set isTraveller/travellerAlignment", async () => {
    const user = userEvent.setup();
    renderBoard([makePlayer()]);

    await user.click(screen.getByText("Alice"));
    const listbox = await openListbox(
      user,
      screen.getByLabelText(/swap character/i),
    );
    const options = within(listbox).getAllByRole("option");

    expect(options.some((o) => o.textContent === "Scapegoat")).toBe(false);
  });

  it("scopes a Traveller's own swap select to traveller characters, showing their current character as its initial value (issue #70)", async () => {
    const user = userEvent.setup();
    renderBoard([
      makePlayer({
        isTraveller: true,
        travellerAlignment: "good",
        characterId: "scapegoat",
      }),
    ]);

    await user.click(screen.getByText("Alice"));
    const select = screen.getByLabelText(/swap character/i);

    expect(select.dataset.value).toBe("scapegoat");
    const listbox = await openListbox(user, select);
    const options = within(listbox).getAllByRole("option");
    expect(options.some((o) => o.textContent === "Washerwoman")).toBe(false);
    expect(options.some((o) => o.textContent === "Beggar")).toBe(true);
  });

  it("keeps a non-traveller seat's swap select scoped away from traveller characters (unchanged)", async () => {
    const user = userEvent.setup();
    renderBoard([makePlayer()]);

    await user.click(screen.getByText("Alice"));
    const listbox = await openListbox(
      user,
      screen.getByLabelText(/swap character/i),
    );
    const options = within(listbox).getAllByRole("option");

    expect(options.some((o) => o.textContent === "Beggar")).toBe(false);
  });

  it("lists the script's own characters first within each team group", async () => {
    const user = userEvent.setup();
    renderBoard([makePlayer()]);

    await user.click(screen.getByText("Alice"));
    const select = screen.getByLabelText(/swap character/i);
    const listbox = await openListbox(user, select);
    const options = within(listbox).getAllByRole("option");
    const townsfolkGroup = within(listbox).getByRole("group", {
      name: /townsfolk/i,
    });
    const demonGroup = within(listbox).getByRole("group", { name: /demons/i });

    // characterById (the script pool) only has washerwoman and imp — each is
    // first in its own team's group, with the rest of the dataset after.
    expect(within(townsfolkGroup).getAllByRole("option")[0]).toHaveTextContent(
      "Washerwoman",
    );
    expect(within(demonGroup).getAllByRole("option")[0]).toHaveTextContent(
      "Imp",
    );
    expect(options.length).toBeGreaterThan(2);
  });
});

describe("token menu exclusivity and dismissal (issue #70)", () => {
  it("closes a previously open seat's menu when another seat's menu is opened", async () => {
    const user = userEvent.setup();
    const { container } = renderBoard([
      makePlayer({ id: "p1", seat: 1, name: "Alice" }),
      makePlayer({ id: "p2", seat: 2, name: "Bob", characterId: "imp" }),
    ]);
    const aliceDetails = container.querySelector(
      "[data-player-id='p1'] details",
    ) as HTMLDetailsElement;
    const bobDetails = container.querySelector(
      "[data-player-id='p2'] details",
    ) as HTMLDetailsElement;

    await user.click(screen.getByText("Alice"));
    expect(aliceDetails.open).toBe(true);

    await user.click(screen.getByText("Bob"));
    expect(bobDetails.open).toBe(true);
    expect(aliceDetails.open).toBe(false);
  });

  it("dismisses the open menu when tapping outside it", async () => {
    const user = userEvent.setup();
    const { container } = renderBoard([makePlayer()]);
    const details = container.querySelector(
      "[data-player-id='p1'] details",
    ) as HTMLDetailsElement;

    await user.click(screen.getByText("Alice"));
    expect(details.open).toBe(true);

    await user.click(container.querySelector("[data-board]") as HTMLElement);
    expect(details.open).toBe(false);
  });

  it("keeps a seat's own menu open when its 'Add reminder' button opens the reminder picker overlay", async () => {
    const user = userEvent.setup();
    const { container } = renderBoard([makePlayer()]);
    const details = container.querySelector(
      "[data-player-id='p1'] details",
    ) as HTMLDetailsElement;

    await user.click(screen.getByText("Alice"));
    expect(details.open).toBe(true);

    const wrap = container.querySelector(
      "[data-player-id='p1']",
    ) as HTMLElement;
    await user.click(
      within(wrap).getByRole("button", { name: /add reminder/i }),
    );

    // Interacting inside the resulting picker overlay (which renders outside
    // Alice's own <details>) must not read as an "outside tap" that closes
    // her still-relevant menu.
    await user.click(
      screen.getByRole("checkbox", { name: /show all characters/i }),
    );
    expect(details.open).toBe(true);
  });

  it("closes an open seat menu when the grimoire is hidden via keyboard activation, and doesn't reopen it when shown again", async () => {
    const user = userEvent.setup();
    const { container } = renderBoard([makePlayer()]);
    const details = () =>
      container.querySelector(
        "[data-player-id='p1'] details",
      ) as HTMLDetailsElement;

    await user.click(screen.getByText("Alice"));
    expect(details().open).toBe(true);

    // fireEvent.click fires no preceding pointerdown — the same event
    // sequence a keyboard (Enter/Space) activation produces, unlike a real
    // pointer tap (userEvent.click, used above to open the menu).
    fireEvent.click(screen.getByRole("button", { name: /hide grimoire/i }));
    fireEvent.click(screen.getByRole("button", { name: /show grimoire/i }));

    expect(details().open).toBe(false);
  });

  it("marks a seat's wrap as having an open menu so CSS can stack it above neighbouring tokens and the sticky Day/Night panels (issue #117)", async () => {
    const user = userEvent.setup();
    const { container } = renderBoard([
      makePlayer({ id: "p1", seat: 1, name: "Alice" }),
      makePlayer({ id: "p2", seat: 2, name: "Bob", characterId: "imp" }),
    ]);
    const aliceWrap = container.querySelector(
      "[data-player-id='p1']",
    ) as HTMLElement;
    const bobWrap = container.querySelector(
      "[data-player-id='p2']",
    ) as HTMLElement;

    expect(aliceWrap).not.toHaveAttribute("data-menu-open");

    await user.click(screen.getByText("Alice"));
    expect(aliceWrap).toHaveAttribute("data-menu-open", "true");
    expect(bobWrap).not.toHaveAttribute("data-menu-open");

    // Opening Bob's menu closes Alice's (issue #70) — the stacking marker
    // must move with it, not linger on the now-closed seat.
    await user.click(screen.getByText("Bob"));
    expect(bobWrap).toHaveAttribute("data-menu-open", "true");
    expect(aliceWrap).not.toHaveAttribute("data-menu-open");
  });

  it("marks an open reminder's wrap the same way a seat's is marked (issue #117)", async () => {
    const user = userEvent.setup();
    const reminder = makeReminder({ id: "r1", anchorPlayerId: null });
    const { container } = renderBoard([makePlayer({ id: "p1" })], {
      reminders: [reminder],
    });
    const reminderWrap = container.querySelector(
      "[data-reminder-id='r1']",
    ) as HTMLElement;

    expect(reminderWrap).not.toHaveAttribute("data-menu-open");
    await user.click(within(reminderWrap).getByText("Townsfolk"));
    expect(reminderWrap).toHaveAttribute("data-menu-open", "true");
  });
});

describe("token menu viewport clamping (issue #124)", () => {
  it("marks a seat near the board's right edge so its menu can anchor left instead of overflowing", () => {
    const { container } = renderBoard([
      makePlayer({ id: "p1", position: { x: 92, y: 50 } }),
    ]);
    const wrap = container.querySelector(
      "[data-player-id='p1']",
    ) as HTMLElement;
    expect(wrap).toHaveAttribute("data-side", "right");
    expect(wrap).not.toHaveAttribute("data-vside");
  });

  it("marks a seat near the board's left edge so its menu can anchor right instead of overflowing", () => {
    const { container } = renderBoard([
      makePlayer({ id: "p1", position: { x: 8, y: 50 } }),
    ]);
    const wrap = container.querySelector(
      "[data-player-id='p1']",
    ) as HTMLElement;
    expect(wrap).toHaveAttribute("data-side", "left");
  });

  it("marks a seat near the board's bottom edge so its menu can flip above instead of overflowing", () => {
    const { container } = renderBoard([
      makePlayer({ id: "p1", position: { x: 50, y: 90 } }),
    ]);
    const wrap = container.querySelector(
      "[data-player-id='p1']",
    ) as HTMLElement;
    expect(wrap).toHaveAttribute("data-vside", "bottom");
    expect(wrap).not.toHaveAttribute("data-side");
  });

  it("leaves centred seats unmarked so their menu keeps its default centred anchor", () => {
    const { container } = renderBoard([
      makePlayer({ id: "p1", position: { x: 50, y: 50 } }),
    ]);
    const wrap = container.querySelector(
      "[data-player-id='p1']",
    ) as HTMLElement;
    expect(wrap).not.toHaveAttribute("data-side");
    expect(wrap).not.toHaveAttribute("data-vside");
  });

  it("marks a reminder's wrap the same way a seat's is marked", () => {
    const reminder = makeReminder({ id: "r1", position: { x: 90, y: 88 } });
    const { container } = renderBoard([makePlayer({ id: "p1" })], {
      reminders: [reminder],
    });
    const reminderWrap = container.querySelector(
      "[data-reminder-id='r1']",
    ) as HTMLElement;
    expect(reminderWrap).toHaveAttribute("data-side", "right");
    expect(reminderWrap).toHaveAttribute("data-vside", "bottom");
  });

  it("marks a reminder anchored to an edge seat using its own anchored position, not its own stored position (issue #71's anchoring)", () => {
    // A reminder's stored .position is stale once anchored — it tracks its
    // anchor seat's position via anchoredReminderPosition instead (see the
    // reminderWrap render logic). This anchor seat sits at the board's
    // right edge with no vertical clamp in play, so the reminder parks
    // beside it without any of anchoredReminderPosition's clearance-recovery
    // shifting it back toward centre — it should still read as edge-parked.
    const anchoredReminder = makeReminder({
      id: "r1",
      anchorPlayerId: "p1",
      position: { x: 50, y: 50 }, // stale/irrelevant once anchored
    });
    const { container } = renderBoard(
      [makePlayer({ id: "p1", position: { x: 90, y: 50 } })],
      { reminders: [anchoredReminder] },
    );
    const reminderWrap = container.querySelector(
      "[data-reminder-id='r1']",
    ) as HTMLElement;
    expect(reminderWrap).toHaveAttribute("data-side", "right");
    expect(reminderWrap).toHaveAttribute("data-vside", "bottom");
  });

  it("keeps a menu's anchor pinned to the token's resting position while dragging the same token, instead of flickering as the live drag preview crosses the side/vside thresholds", async () => {
    const user = userEvent.setup();
    const { container } = renderBoard([
      makePlayer({ id: "p1", position: { x: 90, y: 50 } }),
    ]);
    mockBoardRect(container);
    const wrap = container.querySelector(
      "[data-player-id='p1']",
    ) as HTMLElement;
    const summary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;

    await user.click(summary);
    expect(wrap).toHaveAttribute("data-side", "right");

    // Drag the same (now open-menu'd) token toward the board's centre —
    // the live position (and thus the token's on-screen left/top) follows
    // the drag, but the menu's anchor must not chase it.
    fireEvent(
      summary,
      pointerEvent("pointerdown", { pointerId: 1, clientX: 360, clientY: 200 }),
    );
    fireEvent(
      summary,
      pointerEvent("pointermove", { pointerId: 1, clientX: 200, clientY: 200 }),
    );

    expect(wrap.style.left).toBe("50%");
    expect(wrap).toHaveAttribute("data-side", "right");
  });
});

describe("remove player", () => {
  it("lets the storyteller remove a player from their token menu", async () => {
    const user = userEvent.setup();
    const handlers = renderBoard([makePlayer()]);

    await user.click(screen.getByText("Alice"));
    await user.click(screen.getByRole("button", { name: /remove player/i }));

    expect(handlers.onRemovePlayer).toHaveBeenCalledWith("p1");
  });
});

describe("Drunk reveal", () => {
  it("offers to reveal the Drunk for a stand-in seat, calling onRevealDrunk", async () => {
    const user = userEvent.setup();
    const handlers = renderBoard([makePlayer({ isDrunk: true })]);

    await user.click(screen.getByText("Alice"));
    await user.click(screen.getByRole("button", { name: /reveal drunk/i }));

    expect(handlers.onRevealDrunk).toHaveBeenCalledWith("p1");
  });

  it("doesn't offer to reveal the Drunk for a seat that isn't one", async () => {
    const user = userEvent.setup();
    renderBoard([makePlayer({ isDrunk: false })]);

    await user.click(screen.getByText("Alice"));
    expect(
      screen.queryByRole("button", { name: /reveal drunk/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the real Drunk token openly once revealed, dropping the stand-in note", async () => {
    const user = userEvent.setup();
    const byId = new Map([
      ["washerwoman", getCharacter("washerwoman")!],
      ["drunk", getCharacter("drunk")!],
    ]);
    const { container } = render(
      <GrimoireBoard
        players={[makePlayer({ isDrunk: true, characterId: "drunk" })]}
        characterById={byId}
        claimOptions={claimOptions}
        rotation={0}
        activeFabled={[]}
        {...noop}
      />,
    );

    const summary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;
    expect(within(summary).getByText("Drunk")).toBeInTheDocument();
    expect(
      within(summary).queryByText(/actually the Drunk/i),
    ).not.toBeInTheDocument();
    await user.click(screen.getByText("Alice"));
    expect(
      screen.queryByRole("button", { name: /reveal drunk/i }),
    ).not.toBeInTheDocument();
  });
});

describe("Fabled", () => {
  it("shows active Fabled outside the circle", () => {
    const byId = new Map([
      ["washerwoman", getCharacter("washerwoman")!],
      ["angel", getCharacter("angel")!],
    ]);
    const { container } = render(
      <GrimoireBoard
        players={[makePlayer()]}
        characterById={byId}
        claimOptions={claimOptions}
        rotation={0}
        activeFabled={["angel"]}
        {...noop}
      />,
    );

    const fabledRow = screen.getByRole("region", { name: "Fabled" });
    expect(within(fabledRow).getByText("Angel")).toBeInTheDocument();
    expect(container.querySelector("[data-board]")).not.toContainElement(
      within(fabledRow).getByText("Angel"),
    );
  });

  it("does not show an Add Fabled control", () => {
    const byId = new Map([
      ["washerwoman", getCharacter("washerwoman")!],
      ["angel", getCharacter("angel")!],
    ]);
    render(
      <GrimoireBoard
        players={[makePlayer()]}
        characterById={byId}
        claimOptions={claimOptions}
        rotation={0}
        activeFabled={["angel"]}
        {...makeHandlers()}
      />,
    );

    expect(screen.queryByLabelText(/add fabled/i)).not.toBeInTheDocument();
  });

  it("removes an active Fabled", async () => {
    const user = userEvent.setup();
    const byId = new Map([
      ["washerwoman", getCharacter("washerwoman")!],
      ["angel", getCharacter("angel")!],
    ]);
    const handlers = { ...makeHandlers() };
    render(
      <GrimoireBoard
        players={[makePlayer()]}
        characterById={byId}
        claimOptions={claimOptions}
        rotation={0}
        activeFabled={["angel"]}
        {...handlers}
      />,
    );

    await user.click(screen.getByRole("button", { name: /remove angel/i }));

    expect(handlers.onRemoveFabled).toHaveBeenCalledWith("angel");
  });
});

describe("board sizing (issue #78)", () => {
  const originalInnerHeight = window.innerHeight;

  afterEach(() => {
    Object.defineProperty(window, "innerHeight", {
      value: originalInnerHeight,
      configurable: true,
    });
  });

  function measureWith({
    innerHeight,
    wrapperWidth,
    boardTop,
  }: {
    innerHeight: number;
    wrapperWidth: number;
    boardTop: number;
  }) {
    const { container } = renderBoard([makePlayer()]);
    const board = container.querySelector("[data-board]") as HTMLElement;
    const wrapper = board.parentElement as HTMLElement;
    Object.defineProperty(window, "innerHeight", {
      value: innerHeight,
      configurable: true,
    });
    Object.defineProperty(wrapper, "clientWidth", {
      value: wrapperWidth,
      configurable: true,
    });
    vi.spyOn(board, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: boardTop,
      width: 0,
      height: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: boardTop,
      toJSON() {},
    });
    fireEvent(window, new Event("resize"));
    return board;
  }

  it("fits the shorter of the available width and available height", () => {
    // Landscape iPad (1180x820): plenty of width, but only 604px of height
    // remains below the board's top offset once the reserve is subtracted.
    const board = measureWith({
      innerHeight: 820,
      wrapperWidth: 1000,
      boardTop: 200,
    });

    expect(board.style.width).toBe("604px");
    expect(board.style.height).toBe("604px");
  });

  it("never shrinks the circle below the legibility floor", () => {
    const board = measureWith({
      innerHeight: 300,
      wrapperWidth: 200,
      boardTop: 250,
    });

    expect(board.style.width).toBe("320px");
    expect(board.style.height).toBe("320px");
  });

  it("caps the circle at 40rem once nothing is bottlenecking it", () => {
    const board = measureWith({
      innerHeight: 2000,
      wrapperWidth: 2000,
      boardTop: 0,
    });

    expect(board.style.width).toBe("640px");
    expect(board.style.height).toBe("640px");
  });

  describe("reserving space for the phase-aware bottom sheet (issue #194, #195)", () => {
    let sheet: HTMLElement;

    afterEach(() => {
      sheet?.remove();
    });

    // A `[data-bottom-sheet]` element elsewhere in the document — standing in
    // for BottomSheet's own fixed-position root (rendered by whichever of
    // NightList/DayPhase the current game phase mounts, issue #195), which
    // this suite doesn't render (renderBoard mounts GrimoireBoard in
    // isolation).
    function stubSheet(heightPx: number) {
      sheet = document.createElement("div");
      sheet.setAttribute("data-bottom-sheet", "");
      document.body.appendChild(sheet);
      vi.spyOn(sheet, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        width: 0,
        height: heightPx,
        right: 0,
        bottom: heightPx,
        x: 0,
        y: 0,
        toJSON() {},
      });
    }

    it("shrinks the circle by the sheet's current height", () => {
      stubSheet(200);
      // Same geometry as "fits the shorter of the available width and
      // available height" above (604px unreserved) minus the sheet's 200px.
      const board = measureWith({
        innerHeight: 820,
        wrapperWidth: 1000,
        boardTop: 200,
      });

      expect(board.style.width).toBe("404px");
      expect(board.style.height).toBe("404px");
    });

    it("never shrinks below the legibility floor even when the sheet alone would demand more room", () => {
      stubSheet(500);
      const board = measureWith({
        innerHeight: 820,
        wrapperWidth: 1000,
        boardTop: 200,
      });

      expect(board.style.width).toBe("320px");
      expect(board.style.height).toBe("320px");
    });

    it("grows back once the sheet collapses to a shorter peek height", () => {
      stubSheet(300);
      measureWith({ innerHeight: 820, wrapperWidth: 1000, boardTop: 200 });

      // The sheet collapsing (peek state) shrinks its own rendered box.
      // jsdom has no real ResizeObserver to fire on that box-size change on
      // its own, so this drives the same `measure()` recomputation through
      // the window-resize path instead — the formula under test
      // (`availableHeightPx` minus the sheet's *current* height) is
      // identical either way; only the trigger differs from a real browser.
      vi.spyOn(sheet, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        width: 0,
        height: 60,
        right: 0,
        bottom: 60,
        x: 0,
        y: 0,
        toJSON() {},
      });
      fireEvent(window, new Event("resize"));

      const board = document.querySelector("[data-board]") as HTMLElement;
      expect(board.style.width).toBe("544px");
      expect(board.style.height).toBe("544px");
    });

    it("re-attaches to a new sheet element that replaces the old one, e.g. a night/day phase swap (issue #195)", () => {
      stubSheet(200);
      measureWith({ innerHeight: 820, wrapperWidth: 1000, boardTop: 200 });
      const board = document.querySelector("[data-board]") as HTMLElement;
      expect(board.style.width).toBe("404px");

      // The mounted sheet is swapped for a physically different element with
      // the same marker — the night list unmounting and Day phase mounting
      // (or vice versa), rather than the same component's box merely
      // resizing. The old node is detached first, exactly as React would on
      // an unmount.
      sheet.remove();
      const replacement = document.createElement("div");
      replacement.setAttribute("data-bottom-sheet", "");
      document.body.appendChild(replacement);
      vi.spyOn(replacement, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        width: 0,
        height: 100,
        right: 0,
        bottom: 100,
        x: 0,
        y: 0,
        toJSON() {},
      });
      sheet = replacement;

      fireEvent(window, new Event("resize"));

      // 604px unreserved minus the new sheet's 100px, not the old sheet's
      // now-stale 200px — proof the observer re-found the new node instead
      // of silently measuring a detached one forever after.
      expect(board.style.width).toBe("504px");
      expect(board.style.height).toBe("504px");
    });

    it("attaches a ResizeObserver to the sheet on initial mount, not only after a phase swap (code review finding)", () => {
      // jsdom has no real ResizeObserver (every other test in this describe
      // block drives its assertions through a manual window resize instead,
      // per the comments above) — stubbed here specifically to catch a
      // regression where the sheet's own observer was never constructed at
      // mount at all: an earlier version of reattachSheetObserver's guard
      // checked the *sheet's* connectedness (always true immediately after
      // it's freshly queried) instead of whether an observer had ever been
      // created, so the explicit post-setup call was a guaranteed no-op and
      // this never fired until the first night/day phase swap happened to
      // occur.
      const observeCalls: unknown[] = [];
      class StubResizeObserver {
        observe(target: unknown) {
          observeCalls.push(target);
        }
        disconnect() {}
        unobserve() {}
      }
      const original = globalThis.ResizeObserver;
      globalThis.ResizeObserver =
        StubResizeObserver as unknown as typeof ResizeObserver;

      try {
        stubSheet(200);
        measureWith({ innerHeight: 820, wrapperWidth: 1000, boardTop: 200 });
      } finally {
        globalThis.ResizeObserver = original;
      }

      expect(observeCalls).toContain(sheet);
    });
  });

  describe("remeasureOn prop (issue #195)", () => {
    let sheet: HTMLElement | undefined;

    afterEach(() => {
      sheet?.remove();
    });

    it("re-fits immediately when remeasureOn changes, without waiting for a resize event", () => {
      Object.defineProperty(window, "innerHeight", {
        value: 820,
        configurable: true,
      });
      const { container, rerender } = render(
        <GrimoireBoard
          players={[makePlayer()]}
          characterById={characterById}
          activeFabled={[]}
          claimOptions={claimOptions}
          {...noop}
          rotation={0}
          remeasureOn="night"
        />,
      );
      const board = container.querySelector("[data-board]") as HTMLElement;
      const wrapper = board.parentElement as HTMLElement;
      Object.defineProperty(wrapper, "clientWidth", {
        value: 1000,
        configurable: true,
      });
      vi.spyOn(board, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 200,
        width: 0,
        height: 0,
        right: 0,
        bottom: 0,
        x: 0,
        y: 200,
        toJSON() {},
      });

      sheet = document.createElement("div");
      sheet.setAttribute("data-bottom-sheet", "");
      document.body.appendChild(sheet);
      let sheetHeightPx = 200;
      vi.spyOn(sheet, "getBoundingClientRect").mockImplementation(() => ({
        left: 0,
        top: 0,
        width: 0,
        height: sheetHeightPx,
        right: 0,
        bottom: sheetHeightPx,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }));

      // A real resize event establishes the baseline (the initial
      // ref-callback measurement ran before these mocks existed, same as
      // every other test in this file).
      fireEvent(window, new Event("resize"));
      expect(board.style.width).toBe("404px");

      // The sheet's own rendered height changes (Day phase's content isn't
      // the same height as the night list's) at the same moment the phase
      // itself flips — nothing dispatches a resize event this time, only
      // `remeasureOn` changes, mirroring how GrimoireSetup passes the
      // current sheet phase.
      sheetHeightPx = 100;
      rerender(
        <GrimoireBoard
          players={[makePlayer()]}
          characterById={characterById}
          activeFabled={[]}
          claimOptions={claimOptions}
          {...noop}
          rotation={0}
          remeasureOn="day"
        />,
      );

      expect(board.style.width).toBe("504px");
    });

    it("does not force an extra measurement pass on the initial render", () => {
      const measureSpy = vi.spyOn(
        HTMLElement.prototype,
        "getBoundingClientRect",
      );
      const callsBeforeMount = measureSpy.mock.calls.length;

      render(
        <GrimoireBoard
          players={[makePlayer()]}
          characterById={characterById}
          activeFabled={[]}
          claimOptions={claimOptions}
          {...noop}
          rotation={0}
          remeasureOn="night"
        />,
      );

      // The ref callback's own synchronous `measure()` call at mount already
      // reads the board's rect exactly once — asserting only that the count
      // grew by a small, fixed amount (not e.g. doubled) is enough to catch
      // a regression where the `remeasureOn` effect fired redundantly on
      // mount instead of only on later changes.
      const callsAfterMount = measureSpy.mock.calls.length;
      expect(callsAfterMount - callsBeforeMount).toBeLessThanOrEqual(2);
    });
  });

  it("keeps measuring the current board after it's unmounted and remounted", async () => {
    // Info tokens show mode (issue #19) replaces the whole board with a
    // different subtree, then swaps the original board back in on "Done" —
    // a *new* `.board` DOM node, not the same one re-shown. A stale
    // mount-only listener still pointed at the old, now-detached node would
    // read all-zero geometry and lock the circle at the legibility floor
    // forever after, regardless of the real, current layout.
    const user = userEvent.setup();
    const { container } = renderBoard([makePlayer({ characterId: "imp" })]);

    const controls = container.querySelector("[data-controls]") as HTMLElement;
    await user.click(
      within(controls).getByRole("button", { name: "Info tokens" }),
    );
    await user.click(screen.getByRole("button", { name: "This is the Demon" }));
    const dialog = screen.getByRole("dialog", { name: "Info tokens" });
    const group = within(dialog).getByRole("group", { name: "Demons" });
    await user.click(within(group).getByRole("button", { name: "Imp" }));
    await user.click(screen.getByRole("button", { name: "Show" }));
    await user.click(screen.getByRole("button", { name: "Done" }));

    const board = container.querySelector("[data-board]") as HTMLElement;
    const wrapper = board.parentElement as HTMLElement;
    Object.defineProperty(window, "innerHeight", {
      value: 820,
      configurable: true,
    });
    Object.defineProperty(wrapper, "clientWidth", {
      value: 1000,
      configurable: true,
    });
    vi.spyOn(board, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 200,
      width: 0,
      height: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 200,
      toJSON() {},
    });
    fireEvent(window, new Event("resize"));

    expect(board.style.width).toBe("604px");
    expect(board.style.height).toBe("604px");
  });
});
