import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createGame, type GameDocument } from "@/lib/gameDocument";

import { DayTimer } from "./DayTimer";

afterEach(() => {
  // A failed assertion between useFakeTimers()/useRealTimers() would
  // otherwise leave fake timers active for a later test, hanging userEvent
  // (which relies on real timers).
  vi.useRealTimers();
});

function makeGame(overrides: Partial<GameDocument> = {}): GameDocument {
  const game = createGame({
    scriptId: "tb",
    scriptName: "Trouble Brewing",
    playerCount: 5,
    selectedCharacters: [],
    standIn: null,
    extraCopies: {},
    createdAt: "2026-07-10T00:00:00.000Z",
  });
  return { ...game, night: 1, ...overrides };
}

function renderTimer(
  game: GameDocument,
  onChange: (next: GameDocument) => void = () => {},
) {
  return render(<DayTimer game={game} onChange={onChange} />);
}

describe("DayTimer: idle", () => {
  it("shows the 2/3/6 minute quick-action presets and no countdown", () => {
    renderTimer(makeGame());

    expect(screen.getByRole("button", { name: "2 min" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3 min" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "6 min" })).toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });
});

describe("DayTimer: starting a countdown", () => {
  it("starts a running countdown at the chosen preset's duration", async () => {
    const user = userEvent.setup();
    const game = makeGame();
    let latest = game;
    renderTimer(game, (next) => {
      latest = next;
    });

    await user.click(screen.getByRole("button", { name: "3 min" }));

    expect(latest.dayTimer.status).toBe("running");
    expect(latest.dayTimer.remainingMs).toBe(3 * 60_000);
  });

  it("displays the remaining time and counts down while running", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T12:00:00.000Z"));
    const game = makeGame({
      dayTimer: { status: "running", endAt: "2026-07-10T12:02:00.000Z", remainingMs: 120_000 },
    });
    renderTimer(game);

    expect(screen.getByRole("timer")).toHaveTextContent("2:00");

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(screen.getByRole("timer")).toHaveTextContent("1:30");
  });
});

describe("DayTimer: pause and resume", () => {
  it("pauses a running timer, freezing the remaining time", async () => {
    const user = userEvent.setup();
    const game = makeGame({
      dayTimer: { status: "running", endAt: "2026-07-10T12:02:00.000Z", remainingMs: 120_000 },
    });
    let latest = game;
    renderTimer(game, (next) => {
      latest = next;
    });

    await user.click(screen.getByRole("button", { name: "Pause" }));

    expect(latest.dayTimer.status).toBe("paused");
  });

  it("resumes a paused timer", async () => {
    const user = userEvent.setup();
    const game = makeGame({
      dayTimer: { status: "paused", endAt: null, remainingMs: 45_000 },
    });
    let latest = game;
    renderTimer(game, (next) => {
      latest = next;
    });

    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resume" }));

    expect(latest.dayTimer.status).toBe("running");
  });
});

describe("DayTimer: peek footprint while active (issue #216)", () => {
  it("hides the start-a-timer presets while a countdown is running, so the always-visible peek widget stays compact", () => {
    const game = makeGame({
      dayTimer: { status: "running", endAt: "2026-07-10T12:02:00.000Z", remainingMs: 120_000 },
    });
    renderTimer(game);

    expect(screen.queryByRole("button", { name: "2 min" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "3 min" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "6 min" })).not.toBeInTheDocument();
    expect(screen.getByRole("timer")).toBeInTheDocument();
  });

  it("hides the presets while paused too", () => {
    const game = makeGame({
      dayTimer: { status: "paused", endAt: null, remainingMs: 45_000 },
    });
    renderTimer(game);

    expect(screen.queryByRole("button", { name: "2 min" })).not.toBeInTheDocument();
  });
});

describe("DayTimer: reset", () => {
  it("clears a running timer back to idle", async () => {
    const user = userEvent.setup();
    const game = makeGame({
      dayTimer: { status: "running", endAt: "2026-07-10T12:02:00.000Z", remainingMs: 120_000 },
    });
    let latest = game;
    const { rerender } = renderTimer(game, (next) => {
      latest = next;
    });

    await user.click(screen.getByRole("button", { name: "Reset" }));
    rerender(<DayTimer game={latest} onChange={(next) => (latest = next)} />);

    expect(latest.dayTimer).toEqual({ status: "idle", endAt: null, remainingMs: 0 });
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });
});

describe("DayTimer: reload mid-count (issue #190 AC)", () => {
  it("shows the correct remaining time derived from the persisted end time, not a value that drifted", () => {
    vi.useFakeTimers();
    // The timer was started 20s before "now" — simulating a fresh mount
    // (e.g. after a reload) picking up a running timer with no prior
    // in-memory countdown state.
    vi.setSystemTime(new Date("2026-07-10T12:00:20.000Z"));
    const game = makeGame({
      dayTimer: { status: "running", endAt: "2026-07-10T12:02:00.000Z", remainingMs: 120_000 },
    });
    renderTimer(game);

    expect(screen.getByRole("timer")).toHaveTextContent("1:40");
  });
});

describe("DayTimer: reaching zero", () => {
  it("clearly signals expiry instead of showing a countdown", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T12:02:30.000Z"));
    const game = makeGame({
      dayTimer: { status: "running", endAt: "2026-07-10T12:02:00.000Z", remainingMs: 120_000 },
    });
    renderTimer(game);

    const timer = screen.getByRole("timer");
    expect(timer).toHaveTextContent("Time's up");
    expect(timer.closest("[data-expired]")).not.toBeNull();
  });
});
