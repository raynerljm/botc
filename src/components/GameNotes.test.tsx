import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { getCharacter } from "@/lib/characters";
import { createGame, type GameDocument } from "@/lib/gameDocument";

import { GameNotes } from "./GameNotes";

function makeGame(overrides: Partial<GameDocument> = {}): GameDocument {
  return {
    ...createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 5,
      selectedCharacters: [getCharacter("washerwoman")!, getCharacter("imp")!],
      standIn: null,
      extraCopies: {},
      createdAt: "2026-07-04T00:00:00.000Z",
    }),
    ...overrides,
  };
}

function renderGameNotes(
  game: GameDocument,
  overrides: {
    onChangeSection?: (id: string, text: string) => void;
    onToggleCollapsed?: (collapsed: boolean) => void;
  } = {},
) {
  return render(
    <GameNotes
      game={game}
      onChangeSection={overrides.onChangeSection ?? vi.fn()}
      onToggleCollapsed={overrides.onToggleCollapsed ?? vi.fn()}
    />,
  );
}

describe("GameNotes", () => {
  it("starts expanded, showing the General section for a fresh game", () => {
    renderGameNotes(makeGame());

    expect(screen.getByLabelText("General")).toBeInTheDocument();
  });

  it("renders a labeled textarea per section (issue #193)", () => {
    const game = makeGame({
      notes: [
        { id: "general", title: "General", text: "" },
        { id: "night-1", title: "Night 1", text: "" },
        { id: "day-1", title: "Day 1", text: "Alice nominated Bob." },
      ],
    });
    renderGameNotes(game);

    expect(screen.getByLabelText("General")).toBeInTheDocument();
    expect(screen.getByLabelText("Night 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Day 1")).toHaveValue("Alice nominated Bob.");
  });

  it("reports just the edited section's id and new text — never a precomputed full notes array — so the parent can always apply it against its own freshest state (issue #193 code review finding)", async () => {
    const user = userEvent.setup();
    const onChangeSection = vi.fn();
    const game = makeGame({
      notes: [
        { id: "general", title: "General", text: "" },
        { id: "night-1", title: "Night 1", text: "" },
      ],
    });
    renderGameNotes(game, { onChangeSection });

    await user.type(screen.getByLabelText("Night 1"), "x");

    expect(onChangeSection).toHaveBeenLastCalledWith("night-1", "x");
  });

  it("persists a manual collapse toggle via onToggleCollapsed", async () => {
    const user = userEvent.setup();
    const onToggleCollapsed = vi.fn();
    renderGameNotes(makeGame(), { onToggleCollapsed });

    await user.click(screen.getByRole("button", { name: "Notes" }));

    expect(onToggleCollapsed).toHaveBeenCalledWith(true);
  });

  it("hides section textareas while collapsed", () => {
    renderGameNotes(makeGame({ notesCollapsed: true }));

    expect(screen.queryByLabelText("General")).not.toBeInTheDocument();
  });

  it("stays reachable regardless of whether the game has ended", () => {
    renderGameNotes(
      makeGame({ winner: "good", endedAt: "2026-07-04T05:00:00.000Z" }),
    );

    expect(screen.getByLabelText("General")).toBeInTheDocument();
  });
});
