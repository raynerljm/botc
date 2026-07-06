import { render, screen, within } from "@testing-library/react";
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

// Defaults to a night already having ended, so the panel starts expanded
// (issue #79) and every pre-existing test below keeps exercising the panel's
// own behavior rather than re-opening it first; the dedicated "starts
// collapsed" tests further down override `night` back to 0.
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
    night: 1,
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

  it("asks for confirmation before declaring a winner, then stamps the end time (issue #79)", async () => {
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
    expect(onChange).not.toHaveBeenCalled();

    const dialog = screen.getByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: /declare/i }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        winner: "good",
        endedAt: "2026-07-04T05:00:00.000Z",
      }),
    );
  });

  it("cancels a pending winner declaration without changing the game", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<EndGamePanel game={makeGame()} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /evil wins/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
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

  it("starts collapsed before the first night has ended (issue #79)", () => {
    render(<EndGamePanel game={makeGame({ night: 0 })} onChange={vi.fn()} />);

    expect(screen.queryByLabelText(/notes/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Game" })).toBeInTheDocument();
  });

  it("is always manually openable before the first night has ended (rule zero)", async () => {
    const user = userEvent.setup();
    const game = makeGame({ night: 0 });
    let latest = game;
    const { rerender } = render(
      <EndGamePanel
        game={game}
        onChange={(next) => {
          latest = next;
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Game" }));
    rerender(<EndGamePanel game={latest} onChange={vi.fn()} />);

    expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
  });

  it("persists a manual collapse toggle onto the game document", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const game = makeGame();
    render(<EndGamePanel game={game} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Game" }));

    expect(onChange).toHaveBeenCalledWith({ ...game, endGamePanelCollapsed: true });
  });
});
