import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { getCharacter, type Character } from "@/lib/characters";
import { createGame, type GameDocument, type Player } from "@/lib/gameDocument";

import { DayPhasePanel } from "./DayPhasePanel";

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

function renderPanel(
  game: GameDocument,
  props: Partial<{
    onRecordNomination: (nominatorId: string, nomineeId: string) => void;
    onToggleVote: (nominationId: string, playerId: string) => void;
  }> = {},
) {
  return render(
    <DayPhasePanel
      game={game}
      onRecordNomination={props.onRecordNomination ?? (() => {})}
      onToggleVote={props.onToggleVote ?? (() => {})}
    />,
  );
}

describe("Day phase panel: visibility", () => {
  it("renders nothing before the first night has ever ended", () => {
    const game = gameWith(["washerwoman", "imp"], { night: 0, nightOpen: false });
    const { container } = renderPanel(game);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while a night is open", () => {
    const game = gameWith(["washerwoman", "imp"], { night: 1, nightOpen: true });
    const { container } = renderPanel(game);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the day panel once a night has ended and no new night has started", () => {
    const game = gameWith(["washerwoman", "imp"], { night: 1, nightOpen: false });
    renderPanel(game);
    expect(screen.getByRole("heading", { name: "Day 1" })).toBeInTheDocument();
  });
});

describe("Day phase panel: recording a nomination", () => {
  it("records who nominated whom on submit", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp", "chef"], { night: 1, nightOpen: false });
    const onRecordNomination = vi.fn();
    renderPanel(game, { onRecordNomination });

    await user.selectOptions(screen.getByLabelText("Nominator"), game.players[0].id);
    await user.selectOptions(screen.getByLabelText("Nominee"), game.players[1].id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));

    expect(onRecordNomination).toHaveBeenCalledWith(game.players[0].id, game.players[1].id);
  });
});

describe("Day phase panel: an open nomination's tally", () => {
  it("shows votes/threshold and lets the storyteller toggle each player's vote", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp", "chef"], { night: 1, nightOpen: false });
    // 3 players, threshold ceil(3/2) = 2.
    const nomination = {
      id: "n1",
      nominatorId: game.players[0].id,
      nomineeId: game.players[1].id,
      voterIds: [],
    };
    const withNomination = { ...game, nominations: [nomination] };
    const onToggleVote = vi.fn();
    renderPanel(withNomination, { onToggleVote });

    expect(screen.getByText("0 / 2")).toBeInTheDocument();

    await user.click(screen.getByLabelText(game.players[2].name));

    expect(onToggleVote).toHaveBeenCalledWith("n1", game.players[2].id);
  });
});

describe("Day phase panel: the block", () => {
  it("badges the nomination currently on the block", () => {
    const game = gameWith(["washerwoman", "imp", "chef"], { night: 1, nightOpen: false });
    // 3 players, threshold ceil(3/2) = 2 — 2 voters meets it.
    const withNomination = {
      ...game,
      nominations: [
        {
          id: "n1",
          nominatorId: game.players[0].id,
          nomineeId: game.players[1].id,
          voterIds: [game.players[0].id, game.players[2].id],
        },
      ],
    };
    renderPanel(withNomination);

    expect(screen.getByText("On the block")).toBeInTheDocument();
  });

  it("doesn't badge a nomination that hasn't met threshold", () => {
    const game = gameWith(["washerwoman", "imp", "chef"], { night: 1, nightOpen: false });
    const withNomination = {
      ...game,
      nominations: [
        {
          id: "n1",
          nominatorId: game.players[0].id,
          nomineeId: game.players[1].id,
          voterIds: [game.players[0].id],
        },
      ],
    };
    renderPanel(withNomination);

    expect(screen.queryByText("On the block")).not.toBeInTheDocument();
  });

  it("badges an exile nomination against a Traveller", () => {
    const game = gameWith(["washerwoman", "imp", "chef"], { night: 1, nightOpen: false });
    const players = game.players.map((p, i) => (i === 1 ? { ...p, isTraveller: true } : p));
    const withNomination = {
      ...game,
      players,
      nominations: [
        {
          id: "n1",
          nominatorId: players[0].id,
          nomineeId: players[1].id,
          voterIds: [],
        },
      ],
    };
    renderPanel(withNomination);

    expect(screen.getByText("(exile)")).toBeInTheDocument();
  });
});

describe("Day phase panel: dead-player voter notes", () => {
  it("notes a dead player's voter checkbox spends their ghost vote, for an execution", () => {
    const game = gameWith(["washerwoman", "imp", "chef"], { night: 1, nightOpen: false });
    const players = game.players.map((p, i) => (i === 2 ? { ...p, dead: true } : p));
    const withNomination = {
      ...game,
      players,
      nominations: [
        { id: "n1", nominatorId: players[0].id, nomineeId: players[1].id, voterIds: [] },
      ],
    };
    renderPanel(withNomination);

    expect(screen.getByText("(ghost vote)")).toBeInTheDocument();
  });

  it("doesn't note a ghost vote for an exile (Travellers don't spend one)", () => {
    const game = gameWith(["washerwoman", "imp", "chef"], { night: 1, nightOpen: false });
    const players = game.players.map((p, i) => {
      if (i === 1) return { ...p, isTraveller: true };
      if (i === 2) return { ...p, dead: true };
      return p;
    });
    const withNomination = {
      ...game,
      players,
      nominations: [
        { id: "n1", nominatorId: players[0].id, nomineeId: players[1].id, voterIds: [] },
      ],
    };
    renderPanel(withNomination);

    expect(screen.queryByText("(ghost vote)")).not.toBeInTheDocument();
  });
});

describe("Day phase panel: nomination eligibility badges", () => {
  it("marks a player who has already nominated or been nominated today", () => {
    const game = gameWith(["washerwoman", "imp", "chef"], { night: 1, nightOpen: false });
    const withNomination = {
      ...game,
      nominations: [
        {
          id: "n1",
          nominatorId: game.players[0].id,
          nomineeId: game.players[1].id,
          voterIds: [],
        },
      ],
    };
    renderPanel(withNomination);

    const nominatorSelect = screen.getByLabelText("Nominator") as HTMLSelectElement;
    const nomineeSelect = screen.getByLabelText("Nominee") as HTMLSelectElement;
    expect(
      Array.from(nominatorSelect.options).find((o) => o.value === game.players[0].id)?.text,
    ).toBe("Seat 1 (nominated)");
    expect(
      Array.from(nomineeSelect.options).find((o) => o.value === game.players[1].id)?.text,
    ).toBe("Seat 2 (nominated)");
  });
});
