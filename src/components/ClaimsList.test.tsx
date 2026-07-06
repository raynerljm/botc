import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { getCharacter } from "@/lib/characters";
import type { Player } from "@/lib/gameDocument";

import { ClaimsList } from "./ClaimsList";

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "p1",
    seat: 1,
    name: "Alice",
    characterId: null,
    startingCharacterId: null,
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

// This script's claim options — deliberately just two characters so a test
// asserting "exactly these options" doesn't also have to assert an absence
// of every other character in the dataset.
const claimOptions = [getCharacter("washerwoman")!, getCharacter("imp")!];

function renderList(
  players: Player[],
  overrides: {
    collapsed?: boolean;
    onToggleCollapsed?: (collapsed: boolean) => void;
    onSetClaim?: (playerId: string, characterId: string | null) => void;
  } = {},
) {
  return render(
    <ClaimsList
      players={players}
      claimOptions={claimOptions}
      collapsed={overrides.collapsed ?? false}
      onToggleCollapsed={overrides.onToggleCollapsed ?? vi.fn()}
      onSetClaim={overrides.onSetClaim ?? vi.fn()}
    />,
  );
}

function optionValues(select: HTMLElement) {
  return Array.from(select.querySelectorAll("option")).map((o) => ({
    value: (o as HTMLOptionElement).value,
    label: o.textContent,
  }));
}

describe("ClaimsList", () => {
  it("lists every player with a claim select showing their current claim", () => {
    renderList([
      makePlayer({ id: "p1", seat: 1, name: "Alice", claim: "washerwoman" }),
      makePlayer({ id: "p2", seat: 2, name: "Bob", claim: "imp" }),
    ]);

    const alice = screen.getByText("Alice").closest("li")!;
    expect(within(alice).getByRole("combobox")).toHaveValue("washerwoman");
    const bob = screen.getByText("Bob").closest("li")!;
    expect(within(bob).getByRole("combobox")).toHaveValue("imp");
  });

  it("shows the 'No claim' placeholder selected for a player who hasn't claimed anything", () => {
    renderList([makePlayer({ claim: null })]);

    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(screen.getByRole("option", { name: "No claim" })).toBeInTheDocument();
  });

  it("scopes every player's select to exactly the script's claim options", () => {
    renderList([
      makePlayer({ id: "p1", seat: 1 }),
      makePlayer({ id: "p2", seat: 2 }),
    ]);

    for (const select of screen.getAllByRole("combobox")) {
      expect(optionValues(select)).toEqual([
        { value: "", label: "No claim" },
        { value: "washerwoman", label: "Washerwoman" },
        { value: "imp", label: "Imp" },
      ]);
    }
  });

  it("calls onSetClaim when a claim is changed from the panel", async () => {
    const user = userEvent.setup();
    const onSetClaim = vi.fn();
    renderList([makePlayer({ id: "p1", claim: null })], { onSetClaim });

    await user.selectOptions(screen.getByRole("combobox"), "imp");

    expect(onSetClaim).toHaveBeenCalledWith("p1", "imp");
  });

  it("calls onSetClaim with null when reset to 'No claim'", async () => {
    const user = userEvent.setup();
    const onSetClaim = vi.fn();
    renderList([makePlayer({ id: "p1", claim: "imp" })], { onSetClaim });

    await user.selectOptions(screen.getByRole("combobox"), "No claim");

    expect(onSetClaim).toHaveBeenCalledWith("p1", null);
  });

  it("lists players in seat order regardless of array order", () => {
    const { container } = renderList([
      makePlayer({ id: "p2", seat: 2, name: "Bob" }),
      makePlayer({ id: "p1", seat: 1, name: "Alice" }),
    ]);

    const names = Array.from(container.querySelectorAll("li")).map(
      (li) => li.textContent,
    );
    expect(names[0]).toContain("Alice");
    expect(names[1]).toContain("Bob");
  });

  it("hides the list while collapsed, but keeps the heading reachable (issue #79)", () => {
    renderList([makePlayer({ name: "Alice", claim: "washerwoman" })], {
      collapsed: true,
    });

    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Claims" })).toBeInTheDocument();
  });

  it("toggles collapsed state via the heading", async () => {
    const user = userEvent.setup();
    const onToggleCollapsed = vi.fn();
    renderList([makePlayer()], { collapsed: false, onToggleCollapsed });

    await user.click(screen.getByRole("button", { name: "Claims" }));

    expect(onToggleCollapsed).toHaveBeenCalledWith(true);
  });
});
