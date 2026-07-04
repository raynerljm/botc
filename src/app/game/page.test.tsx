import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCharacter } from "@/lib/characters";
import { createGame } from "@/lib/gameDocument";
import { clearGames, saveGame } from "@/lib/gameStorage";

import GamePage from "./page";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

beforeEach(() => {
  replace.mockClear();
});

afterEach(() => {
  clearGames();
});

describe("game page", () => {
  it("redirects home when there is no active game", () => {
    render(<GamePage />);

    expect(replace).toHaveBeenCalledWith("/");
  });

  it("renders the persisted game's setup", () => {
    saveGame(
      createGame({
        scriptId: "tb",
        scriptName: "Trouble Brewing",
        playerCount: 5,
        selectedCharacters: [getCharacter("washerwoman")!],
        standIn: null,
        extraCopies: {},
      }),
    );

    render(<GamePage />);

    expect(
      screen.getByRole("heading", { name: "Trouble Brewing" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Seat 1 name")).toHaveValue("Player 1");
    expect(replace).not.toHaveBeenCalled();
  });
});
