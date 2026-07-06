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

const characterById = new Map([
  ["washerwoman", getCharacter("washerwoman")!],
  ["imp", getCharacter("imp")!],
]);

function renderList(
  players: Player[],
  overrides: { collapsed?: boolean; onToggleCollapsed?: (collapsed: boolean) => void } = {},
) {
  return render(
    <ClaimsList
      players={players}
      characterById={characterById}
      collapsed={overrides.collapsed ?? false}
      onToggleCollapsed={overrides.onToggleCollapsed ?? vi.fn()}
    />,
  );
}

describe("ClaimsList", () => {
  it("lists every player with their current claim", () => {
    renderList([
      makePlayer({ id: "p1", seat: 1, name: "Alice", claim: "washerwoman" }),
      makePlayer({ id: "p2", seat: 2, name: "Bob", claim: "imp" }),
    ]);

    const alice = screen.getByText("Alice").closest("li")!;
    expect(within(alice).getByText("Washerwoman")).toBeInTheDocument();
    const bob = screen.getByText("Bob").closest("li")!;
    expect(within(bob).getByText("Imp")).toBeInTheDocument();
  });

  it("shows 'No claim' for a player who hasn't claimed anything", () => {
    renderList([makePlayer({ claim: null })]);

    expect(screen.getByText(/no claim/i)).toBeInTheDocument();
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
