import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { getCharacter, type Character } from "@/lib/characters";
import { createGame, type GameDocument, type Player } from "@/lib/gameDocument";

import { NightList } from "./NightList";

function characters(...ids: string[]): Character[] {
  return ids.map((id) => getCharacter(id)!);
}

function gameWith(selectedIds: string[], overrides: Partial<GameDocument> = {}): GameDocument {
  const game = createGame({
    scriptId: "tb",
    scriptName: "Trouble Brewing",
    playerCount: selectedIds.length,
    selectedCharacters: characters(...selectedIds),
    standIn: null,
    extraCopies: {},
    createdAt: "2026-07-04T00:00:00.000Z",
  });
  const players: Player[] = game.players.map((player, index) => ({
    ...player,
    characterId: selectedIds[index],
    name: `Seat ${index + 1}`,
  }));
  return { ...game, players, ...overrides };
}

function characterById(game: GameDocument): Map<string, Character> {
  return new Map(game.characterPool.map((c) => [c.id, c]));
}

function renderNightList(
  game: GameDocument,
  onChange: (next: GameDocument) => void = () => {},
) {
  return render(
    <NightList game={game} characterById={characterById(game)} onChange={onChange} />,
  );
}

describe("Night list: starting and ending a night", () => {
  it("offers to start the first night before any night has been opened", () => {
    const game = gameWith(["washerwoman", "imp"]);
    renderNightList(game);

    expect(
      screen.getByRole("button", { name: "Start First night" }),
    ).toBeInTheDocument();
  });

  it("opens the night with every box cleared, even if a stale check-off lingered", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp"], {
      night: 0,
      nightChecked: ["stale"],
      nightUnskipped: ["stale"],
    });
    let latest = game;
    renderNightList(game, (next) => {
      latest = next;
    });

    await user.click(screen.getByRole("button", { name: "Start First night" }));

    expect(latest.nightOpen).toBe(true);
    expect(latest.nightChecked).toEqual([]);
    expect(latest.nightUnskipped).toEqual([]);
  });

  it("increments the night counter and closes the night when ended", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp"], { night: 0, nightOpen: true });
    let latest = game;
    const { rerender } = renderNightList(game, (next) => {
      latest = next;
    });

    await user.click(screen.getByRole("button", { name: /End First night/ }));

    expect(latest.night).toBe(1);
    expect(latest.nightOpen).toBe(false);

    rerender(
      <NightList game={latest} characterById={characterById(latest)} onChange={() => {}} />,
    );
    expect(
      screen.getByRole("button", { name: "Start Night 2" }),
    ).toBeInTheDocument();
  });

  it("clears today's nominations when a night ends, since eligibility resets at dawn", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp"], {
      night: 0,
      nightOpen: true,
      nominations: [
        { id: "n1", nominatorId: "p1", nomineeId: "p2", votes: [] },
      ],
    });
    let latest = game;
    renderNightList(game, (next) => {
      latest = next;
    });

    await user.click(screen.getByRole("button", { name: /End First night/ }));

    expect(latest.nominations).toEqual([]);
  });
});

describe("Night list: entries", () => {
  it("shows each entry's token, holding player, reminder text, and a checkbox", () => {
    const game = gameWith(["washerwoman", "imp"], { night: 0, nightOpen: true });
    renderNightList(game);

    const washerwoman = getCharacter("washerwoman")!;
    expect(screen.getByText(washerwoman.name)).toBeInTheDocument();
    expect(screen.getByText(/Seat 1/)).toBeInTheDocument();
    expect(screen.getByText(washerwoman.firstNightReminder)).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: `${washerwoman.name} — Seat 1` }),
    ).toBeInTheDocument();
  });

  it("checking an entry persists into the game document, and shows a progress count", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp"], { night: 0, nightOpen: true });
    let latest = game;
    renderNightList(game, (next) => {
      latest = next;
    });

    const washerwoman = getCharacter("washerwoman")!;
    await user.click(
      screen.getByRole("checkbox", { name: `${washerwoman.name} — Seat 1` }),
    );

    expect(latest.nightChecked).toContain(`char:${latest.players[0].id}`);
  });
});

describe("Night list: dead players", () => {
  it("dims and auto-skips a dead player's entry, but keeps it visible", () => {
    const game = gameWith(["washerwoman", "imp"], { night: 1, nightOpen: true });
    const dead: GameDocument = {
      ...game,
      players: game.players.map((p) =>
        p.characterId === "imp" ? { ...p, dead: true } : p,
      ),
    };
    renderNightList(dead);

    const imp = getCharacter("imp")!;
    expect(screen.getByText(imp.name)).toBeInTheDocument();
    expect(screen.getByText(/\(skipped\)/)).toBeInTheDocument();
    // A skipped entry can't silently check off "done" for something the
    // storyteller never did — un-skip it first to act on it.
    expect(
      screen.getByRole("checkbox", { name: `${imp.name} — Seat 2` }),
    ).toBeDisabled();
  });

  it("re-enables the checkbox once a skipped entry is un-skipped", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp"], { night: 1, nightOpen: true });
    const dead: GameDocument = {
      ...game,
      players: game.players.map((p) =>
        p.characterId === "imp" ? { ...p, dead: true } : p,
      ),
    };
    let latest = dead;
    const { rerender } = renderNightList(dead, (next) => {
      latest = next;
    });

    const imp = getCharacter("imp")!;
    await user.click(screen.getByRole("button", { name: "Un-skip" }));
    rerender(
      <NightList game={latest} characterById={characterById(latest)} onChange={() => {}} />,
    );

    expect(
      screen.getByRole("checkbox", { name: `${imp.name} — Seat 2` }),
    ).toBeEnabled();
  });

  it("un-skips a dead player's entry on request", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp"], { night: 1, nightOpen: true });
    const dead: GameDocument = {
      ...game,
      players: game.players.map((p) =>
        p.characterId === "imp" ? { ...p, dead: true } : p,
      ),
    };
    let latest = dead;
    renderNightList(dead, (next) => {
      latest = next;
    });

    await user.click(screen.getByRole("button", { name: "Un-skip" }));

    const impPlayerId = dead.players.find((p) => p.characterId === "imp")!.id;
    expect(latest.nightUnskipped).toContain(`char:${impPlayerId}`);
  });
});

describe("Night list: show-all toggle", () => {
  it("hides non-acting characters by default and reveals them via show-all", async () => {
    const user = userEvent.setup();
    // Recluse has no first-night action.
    const game = gameWith(["recluse", "imp"], { night: 0, nightOpen: true });
    renderNightList(game);

    const recluse = getCharacter("recluse")!;
    expect(screen.queryByText(recluse.name)).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Show all" }));

    expect(screen.getByText(recluse.name)).toBeInTheDocument();
  });
});
