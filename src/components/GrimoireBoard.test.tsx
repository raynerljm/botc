import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getCharacter } from "@/lib/characters";
import type { Player } from "@/lib/gameDocument";

import { GrimoireBoard } from "./GrimoireBoard";

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "p1",
    seat: 1,
    name: "Alice",
    characterId: "washerwoman",
    isDrunk: false,
    isTraveller: false,
    travellerAlignment: null,
    dead: false,
    ghostVoteSpent: false,
    position: null,
    ...overrides,
  };
}

const characterById = new Map([
  ["washerwoman", getCharacter("washerwoman")!],
  ["imp", getCharacter("imp")!],
]);

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
  };
}

const noop = makeHandlers();

afterEach(() => {
  vi.clearAllMocks();
});

function renderBoard(
  players: Player[],
  overrides: Partial<ReturnType<typeof makeHandlers> & { almanacUrl?: string | null }> = {},
) {
  const handlers = { ...makeHandlers(), ...overrides };
  const view = render(
    <GrimoireBoard
      players={players}
      characterById={characterById}
      almanacUrl={overrides.almanacUrl}
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
        {...noop}
      />,
    );

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Washerwoman")).toBeInTheDocument();
    expect(screen.getByText("Imp")).toBeInTheDocument();
    expect(container.querySelectorAll("img")).toHaveLength(2);
  });

  it("marks a Drunk stand-in as actually the Drunk", () => {
    renderBoard([makePlayer({ isDrunk: true })]);

    expect(screen.getByText(/actually the Drunk/i)).toBeInTheDocument();
  });

  it("shows a traveller's alignment", () => {
    renderBoard([
      makePlayer({ isTraveller: true, travellerAlignment: "evil", characterId: "imp" }),
    ]);

    expect(screen.getByText(/evil/i)).toBeInTheDocument();
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
        almanacUrl="https://example.com/almanac"
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
        almanacUrl="javascript:alert(1)"
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
        almanacUrl="https://example.com/almanac"
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
});

describe("drag", () => {
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
});
