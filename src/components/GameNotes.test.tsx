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

function precedes(a: Element, b: Element): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
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

  it("renders sections newest-first: latest phase on top, General last (issue #214)", () => {
    renderGameNotes(
      makeGame({
        notes: [
          { id: "general", title: "General", text: "" },
          { id: "night-1", title: "Night 1", text: "" },
          { id: "day-1", title: "Day 1", text: "" },
          { id: "night-2", title: "Night 2", text: "" },
        ],
      }),
    );

    const night2 = screen.getByLabelText("Night 2");
    const day1 = screen.getByLabelText("Day 1");
    const night1 = screen.getByLabelText("Night 1");
    const general = screen.getByLabelText("General");

    expect(precedes(night2, day1)).toBe(true);
    expect(precedes(day1, night1)).toBe(true);
    expect(precedes(night1, general)).toBe(true);
  });

  it("keeps a newly added phase section on top as its phase begins (issue #214)", () => {
    const game = makeGame({
      notes: [
        { id: "general", title: "General", text: "" },
        { id: "night-1", title: "Night 1", text: "" },
      ],
    });
    const { rerender } = renderGameNotes(game);

    rerender(
      <GameNotes
        game={{
          ...game,
          notes: [...game.notes, { id: "day-1", title: "Day 1", text: "" }],
        }}
        onChangeSection={vi.fn()}
        onToggleCollapsed={vi.fn()}
      />,
    );

    const day1 = screen.getByLabelText("Day 1");
    const night1 = screen.getByLabelText("Night 1");
    const general = screen.getByLabelText("General");

    expect(precedes(day1, night1)).toBe(true);
    expect(precedes(night1, general)).toBe(true);
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
