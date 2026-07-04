import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { getCharacter } from "@/lib/characters";
import type { Player } from "@/lib/gameDocument";

import { GrimoireCircle } from "./GrimoireCircle";

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "p1",
    seat: 1,
    name: "Alice",
    characterId: "washerwoman",
    isDrunk: false,
    isTraveller: false,
    travellerAlignment: null,
    ...overrides,
  };
}

const characterById = new Map([
  ["washerwoman", getCharacter("washerwoman")!],
  ["imp", getCharacter("imp")!],
]);

describe("GrimoireCircle", () => {
  it("renders every seat as a character token labelled with the player's name", () => {
    const { container } = render(
      <GrimoireCircle
        players={[
          makePlayer({ id: "p1", seat: 1, name: "Alice", characterId: "washerwoman" }),
          makePlayer({ id: "p2", seat: 2, name: "Bob", characterId: "imp" }),
        ]}
        characterById={characterById}
        onRename={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue("Alice")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Bob")).toBeInTheDocument();
    expect(container.querySelectorAll("img")).toHaveLength(2);
  });

  it("lets the storyteller rename a token from the circle", () => {
    const onRename = vi.fn();
    render(
      <GrimoireCircle
        players={[makePlayer()]}
        characterById={characterById}
        onRename={onRename}
      />,
    );

    const nameInput = screen.getByDisplayValue("Alice");
    fireEvent.change(nameInput, { target: { value: "Zed" } });

    expect(onRename).toHaveBeenLastCalledWith("p1", "Zed");
  });

  it("marks a Drunk stand-in as actually the Drunk", () => {
    render(
      <GrimoireCircle
        players={[makePlayer({ isDrunk: true })]}
        characterById={characterById}
        onRename={vi.fn()}
      />,
    );

    expect(screen.getByText(/actually the Drunk/i)).toBeInTheDocument();
  });

  it("shows a traveller's alignment", () => {
    render(
      <GrimoireCircle
        players={[
          makePlayer({
            isTraveller: true,
            travellerAlignment: "evil",
            characterId: "imp",
          }),
        ]}
        characterById={characterById}
        onRename={vi.fn()}
      />,
    );

    expect(screen.getByText(/evil/i)).toBeInTheDocument();
  });
});
