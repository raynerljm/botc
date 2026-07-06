import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCharacter } from "@/lib/characters";
import { createGame, type GameDocument } from "@/lib/gameDocument";
import { clearGames, listGames, loadGame, saveGame } from "@/lib/gameStorage";

import { GamesList } from "./GamesList";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/gameExport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gameExport")>();
  return { ...actual, downloadGameSnapshot: vi.fn() };
});
import { downloadGameSnapshot } from "@/lib/gameExport";

let nextId = 0;
function makeGame(
  name: string,
  overrides: Partial<GameDocument> = {},
): GameDocument {
  return {
    ...createGame({
      scriptId: "tb",
      scriptName: name,
      playerCount: 5,
      selectedCharacters: [getCharacter("washerwoman")!],
      standIn: null,
      extraCopies: {},
      createdAt: "2026-07-04T00:00:00.000Z",
      newId: () => `id-${nextId++}`,
    }),
    ...overrides,
  };
}

beforeEach(() => {
  push.mockClear();
  vi.clearAllMocks();
});

afterEach(() => {
  clearGames();
  // A failed assertion between useFakeTimers()/useRealTimers() would otherwise
  // leave fake timers active for every later test, hanging userEvent (which
  // relies on real timers) until the test runner's timeout.
  vi.useRealTimers();
});

describe("GamesList", () => {
  it("renders nothing when there are no saved games", () => {
    const { container } = render(<GamesList />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists every saved game with its status", () => {
    saveGame(makeGame("Trouble Brewing"));
    saveGame(
      makeGame("Sects & Violets", {
        winner: "good",
        endedAt: "2026-07-04T02:00:00.000Z",
      }),
    );

    render(<GamesList />);

    expect(screen.getByText("Trouble Brewing")).toBeInTheDocument();
    const ended = screen.getByText("Sects & Violets").closest("li")!;
    expect(within(ended).getByText(/good won/i)).toBeInTheDocument();
    const inProgress = screen.getByText("Trouble Brewing").closest("li")!;
    expect(within(inProgress).getByText(/in progress/i)).toBeInTheDocument();
  });

  it("shows each game's SGT start time and elapsed time since start", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T02:15:00.000Z"));
    saveGame(makeGame("Trouble Brewing"));

    render(<GamesList />);

    const row = screen.getByText("Trouble Brewing").closest("li")!;
    expect(
      within(row).getByText(/started 4 jul, 08:00 sgt/i),
    ).toBeInTheDocument();
    expect(within(row).getByText(/elapsed 2h 15m/i)).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("shows an ended game's total duration instead of elapsed time", () => {
    saveGame(
      makeGame("Sects & Violets", {
        winner: "good",
        endedAt: "2026-07-04T02:00:00.000Z",
      }),
    );

    render(<GamesList />);

    const row = screen.getByText("Sects & Violets").closest("li")!;
    expect(
      within(row).getByText(/started 4 jul, 08:00 sgt/i),
    ).toBeInTheDocument();
    expect(within(row).getByText(/lasted 2h 0m/i)).toBeInTheDocument();
  });

  it("doesn't run a refresh timer when every game has ended", () => {
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    saveGame(
      makeGame("Sects & Violets", {
        winner: "good",
        endedAt: "2026-07-04T02:00:00.000Z",
      }),
    );

    render(<GamesList />);

    // 30_000 is GamesList's own elapsed-refresh interval (kept in sync with
    // its ELAPSED_REFRESH_MS constant) — other calls are React/jsdom internals.
    expect(setIntervalSpy).not.toHaveBeenCalledWith(expect.any(Function), 30_000);
  });

  it("keeps the elapsed time fresh while the list stays open", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T00:00:00.000Z"));
    saveGame(makeGame("Trouble Brewing"));

    render(<GamesList />);

    const row = screen.getByText("Trouble Brewing").closest("li")!;
    expect(within(row).getByText(/elapsed 0m/i)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(31 * 60 * 1000);
    });

    expect(within(row).getByText(/elapsed 31m/i)).toBeInTheDocument();
  });

  it("resumes a game: makes it active and navigates to the grimoire", async () => {
    const user = userEvent.setup();
    const first = makeGame("Trouble Brewing");
    const second = makeGame("Bad Moon Rising");
    saveGame(first);
    saveGame(second); // second is active

    render(<GamesList />);

    const row = screen.getByText("Trouble Brewing").closest("li")!;
    await user.click(within(row).getByRole("button", { name: /resume/i }));

    expect(loadGame()?.id).toBe(first.id);
    expect(push).toHaveBeenCalledWith("/game");
  });

  it("exports a game straight from the list", async () => {
    const user = userEvent.setup();
    const game = makeGame("Trouble Brewing");
    saveGame(game);

    render(<GamesList />);

    const row = screen.getByText("Trouble Brewing").closest("li")!;
    await user.click(within(row).getByRole("button", { name: /export/i }));

    expect(downloadGameSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ id: game.id }),
    );
  });

  it("deletes a game after confirmation", async () => {
    const user = userEvent.setup();
    saveGame(makeGame("Trouble Brewing"));

    render(<GamesList />);

    const row = screen.getByText("Trouble Brewing").closest("li")!;
    await user.click(within(row).getByRole("button", { name: /delete/i }));
    const dialog = screen.getByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: /delete/i }));

    expect(listGames()).toHaveLength(0);
  });

  it("keeps a game when deletion is cancelled", async () => {
    const user = userEvent.setup();
    saveGame(makeGame("Trouble Brewing"));

    render(<GamesList />);

    const row = screen.getByText("Trouble Brewing").closest("li")!;
    await user.click(within(row).getByRole("button", { name: /delete/i }));
    const dialog = screen.getByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: /cancel/i }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(listGames()).toHaveLength(1);
  });
});
