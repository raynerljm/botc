import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { getCharacter } from "@/lib/characters";
import { createGame, type GameDocument } from "@/lib/gameDocument";

import { EndGamePanel } from "./EndGamePanel";

vi.mock("@/lib/gameExport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gameExport")>();
  return { ...actual, downloadGameSnapshot: vi.fn() };
});
import { downloadGameSnapshot } from "@/lib/gameExport";

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

describe("EndGamePanel", () => {
  it("exports the current game document, in-progress and all", async () => {
    const user = userEvent.setup();
    const game = makeGame();
    render(<EndGamePanel game={game} onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /export/i }));

    expect(downloadGameSnapshot).toHaveBeenCalledWith(game);
  });

  it("declares a winner and stamps the end time", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <EndGamePanel
        game={makeGame()}
        onChange={onChange}
        now={() => "2026-07-04T05:00:00.000Z"}
      />,
    );

    await user.click(screen.getByRole("button", { name: /good wins/i }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        winner: "good",
        endedAt: "2026-07-04T05:00:00.000Z",
      }),
    );
  });

  it("shows the result once the game has ended", () => {
    render(
      <EndGamePanel
        game={makeGame({ winner: "evil", endedAt: "2026-07-04T05:00:00.000Z" })}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/evil won/i)).toBeInTheDocument();
    // No winner buttons once ended — the game is decided.
    expect(
      screen.queryByRole("button", { name: /good wins/i }),
    ).not.toBeInTheDocument();
  });

  it("still exports an ended game", async () => {
    const user = userEvent.setup();
    const game = makeGame({
      winner: "good",
      endedAt: "2026-07-04T05:00:00.000Z",
    });
    render(<EndGamePanel game={game} onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /export/i }));

    expect(downloadGameSnapshot).toHaveBeenCalledWith(game);
  });

  it("records free-text notes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<EndGamePanel game={makeGame()} onChange={onChange} />);

    await user.type(screen.getByLabelText(/notes/i), "x");

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ notes: "x" }),
    );
  });

  it("can reopen an ended game to keep playing", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <EndGamePanel
        game={makeGame({ winner: "good", endedAt: "2026-07-04T05:00:00.000Z" })}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /reopen/i }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ winner: null, endedAt: null }),
    );
  });
});
