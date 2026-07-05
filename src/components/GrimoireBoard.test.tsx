import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getCharacter } from "@/lib/characters";
import type { Player, ReminderToken } from "@/lib/gameDocument";

import { GrimoireBoard } from "./GrimoireBoard";

function makeReminder(overrides: Partial<ReminderToken> = {}): ReminderToken {
  return {
    id: "r1",
    characterId: "washerwoman",
    label: "Townsfolk",
    position: { x: 60, y: 40 },
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

function makeHandlers() {
  return {
    onRename: vi.fn(),
    onMove: vi.fn(),
    onReCircle: vi.fn(),
    onReorderSeat: vi.fn(),
    onToggleDead: vi.fn(),
    onToggleGhostVote: vi.fn(),
    onAddReminder: vi.fn(),
    onMoveReminder: vi.fn(),
    onRemoveReminder: vi.fn(),
    onRestoreReminder: vi.fn(),
    onSwapCharacter: vi.fn(),
    onRemovePlayer: vi.fn(),
    onRevealDrunk: vi.fn(),
    onAddFabled: vi.fn(),
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
          makePlayer({ id: "p1", seat: 1, name: "Alice", characterId: "washerwoman" }),
          makePlayer({ id: "p2", seat: 2, name: "Bob", characterId: "imp" }),
        ]}
        characterById={characterById}
        activeFabled={[]}
        claimOptions={claimOptions}
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

  it("marks a Drunk stand-in as actually the Drunk", () => {
    renderBoard([makePlayer({ isDrunk: true })]);

    expect(screen.getByText(/actually the Drunk/i)).toBeInTheDocument();
  });

  it("shows a traveller's alignment", () => {
    const { container } = renderBoard([
      makePlayer({ isTraveller: true, travellerAlignment: "evil", characterId: "imp" }),
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
      first.style.left !== second.style.left || first.style.top !== second.style.top,
    ).toBe(true);
  });

  it("renders a dragged token at its stored position instead of the circle", () => {
    const { container } = renderBoard([
      makePlayer({ id: "p1", seat: 1, position: { x: 12, y: 34 } }),
    ]);

    const wrap = container.querySelector("[data-player-id='p1']") as HTMLElement;
    expect(wrap.style.left).toBe("12%");
    expect(wrap.style.top).toBe("34%");
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
    expect(within(p1Summary).getByText("Nominated")).toBeInTheDocument();
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

  it("marks a player dead and shows a shroud", async () => {
    const user = userEvent.setup();
    const handlers = renderBoard([makePlayer()]);

    await user.click(screen.getByText("Alice"));
    await user.click(screen.getByRole("button", { name: /mark dead/i }));

    expect(handlers.onToggleDead).toHaveBeenCalledWith("p1");
  });

  it("shows a shroud and offers to mark alive once dead", async () => {
    const user = userEvent.setup();
    renderBoard([makePlayer({ dead: true })]);

    expect(screen.getByText(/dead/i)).toBeInTheDocument();
    await user.click(screen.getByText("Alice"));
    expect(screen.getByRole("button", { name: /mark alive/i })).toBeInTheDocument();
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
    await user.selectOptions(screen.getByLabelText(/claim/i), "librarian");

    expect(handlers.onSetClaim).toHaveBeenCalledWith("p1", "librarian");
  });

  it("clears a claim back to none", async () => {
    const user = userEvent.setup();
    const handlers = renderBoard([makePlayer({ claim: "librarian" })]);

    await user.click(screen.getByText("Alice"));
    await user.selectOptions(screen.getByLabelText(/claim/i), "");

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
});

describe("acts-as (issue #17)", () => {
  it("sets a player's acts-as target from their token menu", async () => {
    const user = userEvent.setup();
    const handlers = renderBoard([makePlayer()]);

    await user.click(screen.getByText("Alice"));
    await user.selectOptions(screen.getByLabelText(/acts as/i), "librarian");

    expect(handlers.onSetActsAs).toHaveBeenCalledWith("p1", "librarian");
  });

  it("clears an acts-as target back to none", async () => {
    const user = userEvent.setup();
    const handlers = renderBoard([makePlayer({ actsAs: "librarian" })]);

    await user.click(screen.getByText("Alice"));
    await user.selectOptions(screen.getByLabelText(/acts as/i), "");

    expect(handlers.onSetActsAs).toHaveBeenCalledWith("p1", null);
  });

  it("renders a small acts-as badge by the token", () => {
    const { container } = renderBoard([makePlayer({ actsAs: "librarian" })]);

    const summary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;
    expect(within(summary).getByText(/acts as librarian/i)).toBeInTheDocument();
  });

  it("shows no acts-as badge when the player has no acts-as target", () => {
    const { container } = renderBoard([makePlayer({ actsAs: null })]);

    const summary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;
    expect(within(summary).queryByText(/acts as/i)).not.toBeInTheDocument();
  });
});

describe("ghost votes", () => {
  it("shows a spent/unspent ghost vote marker only for dead players, toggleable with one tap", async () => {
    const user = userEvent.setup();
    const handlers = renderBoard([makePlayer({ dead: true, ghostVoteSpent: false })]);

    const marker = screen.getByRole("button", { name: /ghost vote/i });
    expect(marker).toHaveTextContent(/available/i);

    await user.click(marker);
    expect(handlers.onToggleGhostVote).toHaveBeenCalledWith("p1");
  });

  it("doesn't show a ghost vote marker for a living player", () => {
    renderBoard([makePlayer({ dead: false })]);
    expect(screen.queryByRole("button", { name: /ghost vote/i })).not.toBeInTheDocument();
  });
});

describe("seat reordering", () => {
  it("moves a seat earlier or later from its token menu", async () => {
    const user = userEvent.setup();
    const handlers = renderBoard([
      makePlayer({ id: "p1", seat: 1, name: "Alice" }),
      makePlayer({ id: "p2", seat: 2, name: "Bob", characterId: "imp" }),
    ]);

    await user.click(screen.getByText("Bob"));
    const bobWrap = handlers.container.querySelector(
      "[data-player-id='p2']",
    ) as HTMLElement;
    await user.click(within(bobWrap).getByRole("button", { name: /move seat earlier/i }));

    expect(handlers.onReorderSeat).toHaveBeenCalledWith("p2", "earlier");
  });

  it("disables moving the first seat earlier and the last seat later", async () => {
    const user = userEvent.setup();
    const { container } = renderBoard([
      makePlayer({ id: "p1", seat: 1, name: "Alice" }),
      makePlayer({ id: "p2", seat: 2, name: "Bob", characterId: "imp" }),
    ]);
    const aliceWrap = container.querySelector("[data-player-id='p1']") as HTMLElement;
    const bobWrap = container.querySelector("[data-player-id='p2']") as HTMLElement;

    await user.click(screen.getByText("Alice"));
    expect(
      within(aliceWrap).getByRole("button", { name: /move seat earlier/i }),
    ).toBeDisabled();

    await user.click(screen.getByText("Bob"));
    expect(
      within(bobWrap).getByRole("button", { name: /move seat later/i }),
    ).toBeDisabled();
  });
});

describe("re-circle", () => {
  it("snaps dragged tokens back to the circle", async () => {
    const user = userEvent.setup();
    const handlers = renderBoard([
      makePlayer({ id: "p1", position: { x: 10, y: 10 } }),
    ]);

    await user.click(screen.getByRole("button", { name: /re-circle/i }));

    expect(handlers.onReCircle).toHaveBeenCalled();
  });

  it("discards an in-progress drag so it can't override the re-circled layout", async () => {
    const user = userEvent.setup();
    const { container } = renderBoard([makePlayer({ position: { x: 10, y: 10 } })]);
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
    const wrap = container.querySelector("[data-player-id='p1']") as HTMLElement;

    fireEvent(summary, pointerEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }));
    fireEvent(summary, pointerEvent("pointermove", { pointerId: 1, clientX: 140, clientY: 180 }));
    expect(wrap.style.left).toBe("35%");

    await user.click(screen.getByRole("button", { name: /re-circle/i }));
    // The stale in-progress drag position must not resurface on the next
    // pointermove for the same (now-abandoned) gesture.
    fireEvent(summary, pointerEvent("pointermove", { pointerId: 1, clientX: 200, clientY: 200 }));

    expect(wrap.style.left).not.toBe("35%");
  });
});

describe("drag", () => {
  it("moves the token visually once the pointer moves past the drag threshold, without saving yet", () => {
    const { container, onMove } = renderBoard([makePlayer()]);
    mockBoardRect(container);
    const summary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;
    const wrap = container.querySelector("[data-player-id='p1']") as HTMLElement;

    fireEvent(summary, pointerEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }));
    fireEvent(summary, pointerEvent("pointermove", { pointerId: 1, clientX: 140, clientY: 180 }));

    expect(wrap.style.left).toBe("35%");
    expect(wrap.style.top).toBe("45%");
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

    fireEvent(summary, pointerEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }));
    fireEvent(summary, pointerEvent("pointermove", { pointerId: 1, clientX: 140, clientY: 180 }));
    fireEvent(summary, pointerEvent("pointermove", { pointerId: 1, clientX: 160, clientY: 200 }));
    fireEvent(summary, pointerEvent("pointerup", { pointerId: 1, clientX: 160, clientY: 200 }));

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith("p1", { x: 40, y: 50 });
  });

  it("discards the in-progress move if the gesture is cancelled", () => {
    const { container, onMove } = renderBoard([makePlayer()]);
    mockBoardRect(container);
    const summary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;
    const wrap = container.querySelector("[data-player-id='p1']") as HTMLElement;
    const originalLeft = wrap.style.left;

    fireEvent(summary, pointerEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }));
    fireEvent(summary, pointerEvent("pointermove", { pointerId: 1, clientX: 140, clientY: 180 }));
    fireEvent(summary, pointerEvent("pointercancel", { pointerId: 1, clientX: 140, clientY: 180 }));

    expect(onMove).not.toHaveBeenCalled();
    expect(wrap.style.left).toBe(originalLeft);
  });

  it("ignores a second pointer touching the same token mid-drag, so the first pointer's drag still resolves", () => {
    const { container, onMove } = renderBoard([makePlayer()]);
    mockBoardRect(container);
    const summary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;

    fireEvent(summary, pointerEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }));
    fireEvent(summary, pointerEvent("pointermove", { pointerId: 1, clientX: 140, clientY: 180 }));
    // A second finger rests on the same token while pointer 1 is still down.
    fireEvent(summary, pointerEvent("pointerdown", { pointerId: 2, clientX: 105, clientY: 105 }));
    fireEvent(summary, pointerEvent("pointermove", { pointerId: 1, clientX: 160, clientY: 200 }));
    fireEvent(summary, pointerEvent("pointerup", { pointerId: 1, clientX: 160, clientY: 200 }));

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith("p1", { x: 40, y: 50 });
  });

  it("doesn't move for tiny pointer jitter under the drag threshold", () => {
    const { container, onMove } = renderBoard([makePlayer()]);
    const summary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;

    fireEvent(summary, pointerEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }));
    fireEvent(summary, pointerEvent("pointermove", { pointerId: 1, clientX: 101, clientY: 101 }));

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

    fireEvent(summary, pointerEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }));
    fireEvent(summary, pointerEvent("pointermove", { pointerId: 1, clientX: 140, clientY: 180 }));
    fireEvent(summary, pointerEvent("pointerup", { pointerId: 1, clientX: 140, clientY: 180 }));
    fireEvent.click(summary);

    expect(details.open).toBe(false);
  });
});

describe("hide grimoire", () => {
  it("blurs/obscures the board in one tap and needs a deliberate action to restore it", async () => {
    const user = userEvent.setup();
    const { container } = renderBoard([makePlayer()]);

    await user.click(screen.getByRole("button", { name: /hide grimoire/i }));

    const board = container.querySelector("[data-board]") as HTMLElement;
    expect(board).toHaveAttribute("data-hidden", "true");
    expect(screen.getByRole("button", { name: /show grimoire/i })).toBeInTheDocument();
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

    fireEvent(summary, pointerEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }));
    fireEvent(summary, pointerEvent("pointermove", { pointerId: 1, clientX: 140, clientY: 180 }));

    await user.click(screen.getByRole("button", { name: /hide grimoire/i }));
    await user.click(screen.getByRole("button", { name: /show grimoire/i }));

    // The abandoned gesture never reached pointerup, so it must never save.
    expect(onMove).not.toHaveBeenCalled();
    const wrap = container.querySelector("[data-player-id='p1']") as HTMLElement;
    expect(wrap.style.left).not.toBe("35%");
  });
});

describe("reminders (issue #14)", () => {
  it("renders every reminder on the pad at its stored position, with the source character's art", () => {
    const { container } = renderBoard([makePlayer()], {
      reminders: [makeReminder({ id: "r1", characterId: "washerwoman", label: "Townsfolk", position: { x: 60, y: 40 } })],
    });

    const wrap = container.querySelector("[data-reminder-id='r1']") as HTMLElement;
    expect(wrap).toBeInTheDocument();
    expect(wrap.style.left).toBe("60%");
    expect(wrap.style.top).toBe("40%");
    expect(within(wrap).getByText("Townsfolk")).toBeInTheDocument();
  });

  it("renders a reminder with no source character (custom text) without character art", () => {
    const { container } = renderBoard([makePlayer()], {
      reminders: [makeReminder({ id: "r1", characterId: null, label: "Custom note" })],
    });

    const wrap = container.querySelector("[data-reminder-id='r1']") as HTMLElement;
    expect(within(wrap).queryByRole("img")).not.toBeInTheDocument();
    expect(within(wrap).getByText("Custom note")).toBeInTheDocument();
  });

  it("opens the reminder picker from the pad, and adds the chosen reminder at a default position", async () => {
    const user = userEvent.setup();
    const { container, onAddReminder } = renderBoard([makePlayer()]);

    const controls = container.querySelector("[data-controls]") as HTMLElement;
    await user.click(within(controls).getByRole("button", { name: "Add reminder" }));
    const dialog = screen.getByRole("dialog", { name: "Add reminder" });
    const group = within(dialog).getByRole("group", { name: "Washerwoman" });
    await user.click(within(group).getByRole("button", { name: "Townsfolk" }));

    expect(onAddReminder).toHaveBeenCalledWith({
      characterId: "washerwoman",
      label: "Townsfolk",
      position: { x: 50, y: 50 },
    });
  });

  it("opens the reminder picker from a player's token menu, and parks the new reminder next to them", async () => {
    const user = userEvent.setup();
    const { onAddReminder } = renderBoard([
      makePlayer({ id: "p1", position: { x: 30, y: 40 } }),
    ]);

    await user.click(screen.getByText("Alice"));
    const wrap = screen.getByText("Alice").closest("[data-player-id='p1']") as HTMLElement;
    await user.click(within(wrap).getByRole("button", { name: "Add reminder" }));

    const dialog = screen.getByRole("dialog", { name: "Add reminder" });
    const group = within(dialog).getByRole("group", { name: "Washerwoman" });
    await user.click(within(group).getByRole("button", { name: "Townsfolk" }));

    expect(onAddReminder).toHaveBeenCalledWith({
      characterId: "washerwoman",
      label: "Townsfolk",
      position: { x: 35, y: 40 },
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
    const wrap = container.querySelector("[data-reminder-id='r1']") as HTMLElement;

    fireEvent(summary, pointerEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }));
    fireEvent(summary, pointerEvent("pointermove", { pointerId: 1, clientX: 140, clientY: 180 }));
    expect(wrap.style.left).toBe("35%");
    expect(onMoveReminder).not.toHaveBeenCalled();

    fireEvent(summary, pointerEvent("pointerup", { pointerId: 1, clientX: 140, clientY: 180 }));
    expect(onMoveReminder).toHaveBeenCalledWith("r1", { x: 35, y: 45 });
    expect(onMove).not.toHaveBeenCalled();
  });

  it("removes a reminder in one tap, offering an undo that restores it", async () => {
    const user = userEvent.setup();
    const reminder = makeReminder({ id: "r1" });
    const { container, onRemoveReminder, onRestoreReminder } = renderBoard([makePlayer()], {
      reminders: [reminder],
    });

    await user.click(within(container.querySelector("[data-reminder-id='r1']") as HTMLElement).getByText("Townsfolk"));
    await user.click(screen.getByRole("button", { name: "Remove reminder" }));

    expect(onRemoveReminder).toHaveBeenCalledWith("r1");
    await user.click(screen.getByRole("button", { name: /undo/i }));
    expect(onRestoreReminder).toHaveBeenCalledWith(reminder);
  });

  it("hides the undo banner along with the rest of the board when the grimoire is hidden", async () => {
    const user = userEvent.setup();
    const reminder = makeReminder({ id: "r1" });
    const { container } = renderBoard([makePlayer()], { reminders: [reminder] });

    await user.click(within(container.querySelector("[data-reminder-id='r1']") as HTMLElement).getByText("Townsfolk"));
    await user.click(screen.getByRole("button", { name: "Remove reminder" }));
    expect(screen.getByRole("button", { name: /undo/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /hide grimoire/i }));
    expect(screen.queryByRole("button", { name: /undo/i })).not.toBeInTheDocument();
  });

  it("doesn't let a second 'Add reminder' tap silently discard an already-open picker's context", async () => {
    const user = userEvent.setup();
    const { container } = renderBoard([
      makePlayer({ id: "p1", position: { x: 30, y: 40 } }),
    ]);

    await user.click(screen.getByText("Alice"));
    const wrap = screen.getByText("Alice").closest("[data-player-id='p1']") as HTMLElement;
    await user.click(within(wrap).getByRole("button", { name: "Add reminder" }));

    const padControls = container.querySelector("[data-controls]") as HTMLElement;
    expect(
      within(padControls).queryByRole("button", { name: "Add reminder" }),
    ).not.toBeInTheDocument();
  });

  it("closes the reminder picker and hides its pad trigger when the grimoire is hidden (code review: PR #37)", async () => {
    const user = userEvent.setup();
    const { container } = renderBoard([makePlayer()]);

    const padControls = container.querySelector("[data-controls]") as HTMLElement;
    await user.click(within(padControls).getByRole("button", { name: "Add reminder" }));
    expect(screen.getByRole("dialog", { name: "Add reminder" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /hide grimoire/i }));
    expect(screen.queryByRole("dialog", { name: "Add reminder" })).not.toBeInTheDocument();
    expect(
      within(padControls).queryByRole("button", { name: "Add reminder" }),
    ).not.toBeInTheDocument();
  });

  it("closes an open reminder picker on re-circle, so a stale parked position can't be used (code review: PR #37)", async () => {
    const user = userEvent.setup();
    renderBoard([makePlayer({ id: "p1", position: { x: 30, y: 40 } })]);

    await user.click(screen.getByText("Alice"));
    const wrap = screen.getByText("Alice").closest("[data-player-id='p1']") as HTMLElement;
    await user.click(within(wrap).getByRole("button", { name: "Add reminder" }));
    expect(screen.getByRole("dialog", { name: "Add reminder" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /re-circle/i }));
    expect(screen.queryByRole("dialog", { name: "Add reminder" })).not.toBeInTheDocument();
  });
});

describe("setup walkthrough reopen button (issue #26)", () => {
  it("renders the button when a handler is provided", () => {
    renderBoard([makePlayer()], { onOpenSetupWalkthrough: vi.fn() });

    expect(
      screen.getByRole("button", { name: "Setup walkthrough" }),
    ).toBeInTheDocument();
  });

  it("omits the button entirely when there's nothing for it to reopen", () => {
    renderBoard([makePlayer()]);

    expect(
      screen.queryByRole("button", { name: "Setup walkthrough" }),
    ).not.toBeInTheDocument();
  });

  it("calls the handler on click", async () => {
    const user = userEvent.setup();
    const onOpenSetupWalkthrough = vi.fn();
    renderBoard([makePlayer()], { onOpenSetupWalkthrough });

    await user.click(screen.getByRole("button", { name: "Setup walkthrough" }));
    expect(onOpenSetupWalkthrough).toHaveBeenCalled();
  });

  it("hides while the reminder picker is open (code review: matches 'Add reminder's own guard)", async () => {
    const user = userEvent.setup();
    const { container } = renderBoard([makePlayer()], {
      onOpenSetupWalkthrough: vi.fn(),
    });

    const controls = container.querySelector("[data-controls]") as HTMLElement;
    await user.click(within(controls).getByRole("button", { name: "Add reminder" }));

    expect(
      screen.queryByRole("button", { name: "Setup walkthrough" }),
    ).not.toBeInTheDocument();
  });
});

describe("info tokens (issue #19)", () => {
  it("opens the info token library from the pad", async () => {
    const user = userEvent.setup();
    const { container } = renderBoard([makePlayer()]);

    const controls = container.querySelector("[data-controls]") as HTMLElement;
    await user.click(within(controls).getByRole("button", { name: "Info tokens" }));

    expect(screen.getByRole("dialog", { name: "Info tokens" })).toBeInTheDocument();
  });

  it("walks picking a standard card, attaching a token, and showing it full-screen", async () => {
    const user = userEvent.setup();
    const { container } = renderBoard([makePlayer({ characterId: "imp" })]);

    const controls = container.querySelector("[data-controls]") as HTMLElement;
    await user.click(within(controls).getByRole("button", { name: "Info tokens" }));
    await user.click(screen.getByRole("button", { name: "This is the Demon" }));
    // Scoped to the Info tokens dialog — the board's own "Swap character"
    // <select> also has a Demons <optgroup> (an implicit role="group" too),
    // which would otherwise collide with this picker's fieldset.
    const dialog = screen.getByRole("dialog", { name: "Info tokens" });
    const group = within(dialog).getByRole("group", { name: "Demons" });
    await user.click(within(group).getByRole("button", { name: "Imp" }));
    await user.click(screen.getByRole("button", { name: "Show" }));

    expect(screen.queryByRole("dialog", { name: "Info tokens" })).not.toBeInTheDocument();
    const showMode = screen.getByRole("dialog", { name: "This is the Demon" });
    expect(within(showMode).getByText("Imp")).toBeInTheDocument();
  });

  it("never leaks the board behind it — no player name or control renders while showing", async () => {
    const user = userEvent.setup();
    const { container } = renderBoard([makePlayer({ name: "Alice", characterId: "imp" })]);

    const controls = container.querySelector("[data-controls]") as HTMLElement;
    await user.click(within(controls).getByRole("button", { name: "Info tokens" }));
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
    await user.click(within(controls).getByRole("button", { name: "Info tokens" }));
    await user.click(screen.getByRole("button", { name: "Did you nominate today?" }));
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
    fireEvent(summary, pointerEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }));
    fireEvent(summary, pointerEvent("pointermove", { pointerId: 1, clientX: 140, clientY: 180 }));

    const controls = container.querySelector("[data-controls]") as HTMLElement;
    await user.click(within(controls).getByRole("button", { name: "Info tokens" }));
    await user.click(screen.getByRole("button", { name: "Did you nominate today?" }));
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
    fireEvent(summaryAfter, pointerEvent("pointerdown", { pointerId: 2, clientX: 100, clientY: 100 }));
    fireEvent(summaryAfter, pointerEvent("pointermove", { pointerId: 2, clientX: 140, clientY: 180 }));
    fireEvent(summaryAfter, pointerEvent("pointerup", { pointerId: 2, clientX: 140, clientY: 180 }));
    expect(onMove).toHaveBeenCalledWith("p1", { x: 35, y: 45 });
  });

  it("hides the pad's info tokens trigger while the reminder picker is open, and vice versa", async () => {
    const user = userEvent.setup();
    const { container } = renderBoard([makePlayer()]);
    const controls = container.querySelector("[data-controls]") as HTMLElement;

    await user.click(within(controls).getByRole("button", { name: "Add reminder" }));
    expect(
      within(controls).queryByRole("button", { name: "Info tokens" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(within(controls).getByRole("button", { name: "Info tokens" }));
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
    await user.selectOptions(screen.getByLabelText(/swap character/i), "imp");

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
        activeFabled={["angel"]}
        {...noop}
      />,
    );

    await user.click(screen.getByText("Alice"));
    const options = within(
      screen.getByLabelText(/swap character/i),
    ).getAllByRole("option");

    expect(options.some((o) => o.textContent === "Angel")).toBe(false);
  });

  it("never offers a Traveller character — swapping to one wouldn't set isTraveller/travellerAlignment", async () => {
    const user = userEvent.setup();
    renderBoard([makePlayer()]);

    await user.click(screen.getByText("Alice"));
    const options = within(
      screen.getByLabelText(/swap character/i),
    ).getAllByRole("option");

    expect(options.some((o) => o.textContent === "Scapegoat")).toBe(false);
  });

  it("lists the script's own characters first within each team group", async () => {
    const user = userEvent.setup();
    renderBoard([makePlayer()]);

    await user.click(screen.getByText("Alice"));
    const select = screen.getByLabelText(/swap character/i);
    const options = within(select).getAllByRole("option");
    const townsfolkGroup = within(select).getByRole("group", {
      name: /townsfolk/i,
    });
    const demonGroup = within(select).getByRole("group", { name: /demons/i });

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
        activeFabled={[]}
        {...noop}
      />,
    );

    const summary = container.querySelector(
      "[data-player-id='p1'] summary",
    ) as HTMLElement;
    expect(within(summary).getByText("Drunk")).toBeInTheDocument();
    expect(within(summary).queryByText(/actually the Drunk/i)).not.toBeInTheDocument();
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

  it("adds a Fabled from the picker", async () => {
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
        activeFabled={[]}
        {...handlers}
      />,
    );

    await user.selectOptions(screen.getByLabelText(/add fabled/i), "angel");

    expect(handlers.onAddFabled).toHaveBeenCalledWith("angel");
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
        activeFabled={["angel"]}
        {...handlers}
      />,
    );

    await user.click(screen.getByRole("button", { name: /remove angel/i }));

    expect(handlers.onRemoveFabled).toHaveBeenCalledWith("angel");
  });
});
