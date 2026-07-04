import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { getCharacter } from "@/lib/characters";
import type { Player } from "@/lib/gameDocument";

import { ClaimsList } from "./ClaimsList";

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "p1",
    seat: 1,
    name: "Alice",
    characterId: null,
    isDrunk: false,
    isTraveller: false,
    travellerAlignment: null,
    dead: false,
    ghostVoteSpent: false,
    position: null,
    claim: null,
    ...overrides,
  };
}

const characterById = new Map([
  ["washerwoman", getCharacter("washerwoman")!],
  ["imp", getCharacter("imp")!],
]);

describe("ClaimsList", () => {
  it("lists every player with their current claim", () => {
    render(
      <ClaimsList
        players={[
          makePlayer({ id: "p1", seat: 1, name: "Alice", claim: "washerwoman" }),
          makePlayer({ id: "p2", seat: 2, name: "Bob", claim: "imp" }),
        ]}
        characterById={characterById}
      />,
    );

    const alice = screen.getByText("Alice").closest("li")!;
    expect(within(alice).getByText("Washerwoman")).toBeInTheDocument();
    const bob = screen.getByText("Bob").closest("li")!;
    expect(within(bob).getByText("Imp")).toBeInTheDocument();
  });

  it("shows 'No claim' for a player who hasn't claimed anything", () => {
    render(
      <ClaimsList players={[makePlayer({ claim: null })]} characterById={characterById} />,
    );

    expect(screen.getByText(/no claim/i)).toBeInTheDocument();
  });

  it("lists players in seat order regardless of array order", () => {
    const { container } = render(
      <ClaimsList
        players={[
          makePlayer({ id: "p2", seat: 2, name: "Bob" }),
          makePlayer({ id: "p1", seat: 1, name: "Alice" }),
        ]}
        characterById={characterById}
      />,
    );

    const names = Array.from(container.querySelectorAll("li")).map(
      (li) => li.textContent,
    );
    expect(names[0]).toContain("Alice");
    expect(names[1]).toContain("Bob");
  });
});
