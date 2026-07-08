import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { getCharacter, type Character } from "@/lib/characters";
import { createGame, type GameDocument, type Player } from "@/lib/gameDocument";

import { DayPhase } from "./DayPhase";

function characters(...ids: string[]): Character[] {
  return ids.map((id) => getCharacter(id)!);
}

function gameWith(
  selectedIds: string[],
  overrides: Partial<GameDocument> = {},
): GameDocument {
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
  return { ...game, players, night: 1, ...overrides };
}

function renderDayPhase(
  game: GameDocument,
  onChange: (next: GameDocument) => void = () => {},
) {
  return render(<DayPhase game={game} onChange={onChange} />);
}

describe("Day phase: before the first night ends", () => {
  it("shows a placeholder instead of the panel", () => {
    const game = gameWith(["washerwoman", "imp"], { night: 0 });
    renderDayPhase(game);

    expect(screen.getByText(/Begins once the first night ends/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record nomination" })).not.toBeInTheDocument();
  });
});

describe("Day phase: while a night is open", () => {
  it("shows a placeholder instead of the panel, even once a day has started", () => {
    // Night 2 has been started (nightOpen) but hasn't ended yet — day 1's
    // business is done until dawn, even though `night` hasn't incremented.
    const game = gameWith(["washerwoman", "imp"], { night: 1, nightOpen: true });
    renderDayPhase(game);

    expect(
      screen.getByText(/Resumes once tonight's night list ends/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record nomination" })).not.toBeInTheDocument();
  });
});

describe("Day phase: recording a nomination", () => {
  it("defaults the nominator and nominee to two different players, not a self-nomination", () => {
    const game = gameWith(["washerwoman", "imp", "recluse"]);
    renderDayPhase(game);

    const nominatorSelect = screen.getByLabelText("Nominator") as HTMLSelectElement;
    const nomineeSelect = screen.getByLabelText("Nominee") as HTMLSelectElement;
    expect(nominatorSelect.value).not.toBe(nomineeSelect.value);
  });

  it("records who nominated whom", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp", "recluse"]);
    let latest = game;
    renderDayPhase(game, (next) => {
      latest = next;
    });

    const [nominator, nominee] = game.players;
    await user.selectOptions(screen.getByLabelText("Nominator"), nominator.id);
    await user.selectOptions(screen.getByLabelText("Nominee"), nominee.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));

    expect(latest.nominations).toHaveLength(1);
    expect(latest.nominations[0]).toMatchObject({
      nominatorId: nominator.id,
      nomineeId: nominee.id,
      votes: [],
    });
  });

  it("marks already-nominated players in the nominator and nominee options", () => {
    const game = gameWith(["washerwoman", "imp", "recluse"]);
    const [p1, p2] = game.players;
    const withNomination = {
      ...game,
      nominations: [
        { id: "n1", nominatorId: p1.id, nomineeId: p2.id, votes: [], threshold: 2, isExile: false },
      ],
    };
    renderDayPhase(withNomination);

    const nominatorSelect = screen.getByLabelText("Nominator") as HTMLSelectElement;
    const nomineeSelect = screen.getByLabelText("Nominee") as HTMLSelectElement;
    expect(
      Array.from(nominatorSelect.options).find((o) => o.value === p1.id)?.text,
    ).toContain("already nominated");
    expect(
      Array.from(nomineeSelect.options).find((o) => o.value === p2.id)?.text,
    ).toContain("already nominated");
  });
});

describe("Day phase: vote tally and threshold", () => {
  it("shows the live tally against the threshold, with a meets-threshold indicator", async () => {
    const user = userEvent.setup();
    // 4 living players -> threshold 2.
    const game = gameWith(["washerwoman", "imp", "recluse", "baron"]);
    let latest = game;
    const { rerender } = renderDayPhase(game, (next) => {
      latest = next;
    });

    const [nominator, nominee, voter1, voter2] = game.players;
    await user.selectOptions(screen.getByLabelText("Nominator"), nominator.id);
    await user.selectOptions(screen.getByLabelText("Nominee"), nominee.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    expect(screen.getByText("0/2 votes")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: voter1.name }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    expect(screen.getByText("1/2 votes")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: voter2.name }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    expect(screen.getByText(/2\/2 votes — meets threshold/)).toBeInTheDocument();
  });

  it("uses the exile threshold (all players, dead included) for a Traveller nominee", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp", "recluse", "baron"], {
      players: (() => {
        const base = gameWith(["washerwoman", "imp", "recluse", "baron"]).players;
        return [
          ...base,
          {
            id: "traveller-1",
            seat: 5,
            name: "Traveller",
            characterId: "scapegoat",
            startingCharacterId: "scapegoat",
            isDrunk: false,
            isTraveller: true,
            travellerAlignment: "good" as const,
            dead: false,
            ghostVoteSpent: false,
            position: null,
            claim: null,
            actsAs: null,
            actsAsSetOnNight: null,
          },
        ];
      })(),
    });
    let latest = game;
    renderDayPhase(game, (next) => {
      latest = next;
    });

    await user.selectOptions(screen.getByLabelText("Nominator"), game.players[0].id);
    await user.selectOptions(screen.getByLabelText("Nominee"), "traveller-1");
    await user.click(screen.getByRole("button", { name: "Record nomination" }));

    // 5 players total -> exile threshold 3, snapshotted onto the nomination.
    expect(latest.nominations[0].nomineeId).toBe("traveller-1");
    expect(latest.nominations[0].threshold).toBe(3);
  });
});

describe("Day phase: the block", () => {
  it("shows the current block-holder once a nomination meets threshold", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp", "recluse", "baron"]);
    let latest = game;
    const { rerender } = renderDayPhase(game, (next) => {
      latest = next;
    });

    const [nominator, nominee, voter1, voter2] = game.players;
    await user.selectOptions(screen.getByLabelText("Nominator"), nominator.id);
    await user.selectOptions(screen.getByLabelText("Nominee"), nominee.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    await user.click(screen.getByRole("checkbox", { name: voter1.name }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    await user.click(screen.getByRole("checkbox", { name: voter2.name }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    expect(screen.getByText(`On the block: ${nominee.name}`)).toBeInTheDocument();
  });

  it("renders the block status after the nominations list, never above it, so it can't shift voter checkboxes mid-count (issue #125)", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp", "recluse", "baron"]);
    let latest = game;
    const { rerender } = renderDayPhase(game, (next) => {
      latest = next;
    });

    const [nominator, nominee, voter1, voter2] = game.players;
    await user.selectOptions(screen.getByLabelText("Nominator"), nominator.id);
    await user.selectOptions(screen.getByLabelText("Nominee"), nominee.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    const [firstCheckbox] = screen.getAllByRole("checkbox");
    await user.click(screen.getByRole("checkbox", { name: voter1.name }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    await user.click(screen.getByRole("checkbox", { name: voter2.name }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    const blockStatus = screen.getByText(`On the block: ${nominee.name}`);
    // DOCUMENT_POSITION_FOLLOWING: firstCheckbox comes before blockStatus in
    // the DOM, so the block line can never push a checkbox above it down.
    expect(
      firstCheckbox.compareDocumentPosition(blockStatus) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("doesn't let a third nomination retake the block by matching a tied high-water mark (issue #113 repro)", async () => {
    const user = userEvent.setup();
    const game = gameWith([
      "washerwoman",
      "librarian",
      "investigator",
      "chef",
      "empath",
      "monk",
      "imp",
    ]);
    let latest = game;
    const { rerender } = renderDayPhase(game, (next) => {
      latest = next;
    });
    const players = game.players;

    async function nominateAndVote(nomineeIndex: number, voterIndices: number[]) {
      await user.selectOptions(screen.getByLabelText("Nominator"), players[0].id);
      await user.selectOptions(
        screen.getByLabelText("Nominee"),
        players[nomineeIndex].id,
      );
      await user.click(screen.getByRole("button", { name: "Record nomination" }));
      rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
      for (const voterIndex of voterIndices) {
        await user.click(
          screen.getByRole("checkbox", { name: players[voterIndex].name }),
        );
        rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
      }
    }

    // 7 living -> threshold 4. Three nominations in a row each get exactly
    // 4 votes: the first takes the block, the second ties it (clearing it),
    // and the third must not retake it — 4 only matches the tied high-water
    // mark, it doesn't beat it.
    await nominateAndVote(1, [0, 1, 2, 3]);
    expect(screen.getByText(`On the block: ${players[1].name}`)).toBeInTheDocument();

    await nominateAndVote(2, [0, 1, 2, 3]);
    expect(screen.queryByText(/On the block/)).not.toBeInTheDocument();

    await nominateAndVote(3, [0, 1, 2, 3]);
    expect(screen.queryByText(/On the block/)).not.toBeInTheDocument();
  });

  it("keeps a closed nomination's snapshotted threshold after a mid-day death (issue #113 repro)", async () => {
    const user = userEvent.setup();
    const game = gameWith([
      "washerwoman",
      "librarian",
      "investigator",
      "chef",
      "empath",
      "monk",
      "imp",
    ]);
    let latest = game;
    const { rerender } = renderDayPhase(game, (next) => {
      latest = next;
    });
    const players = game.players;

    // A nomination recorded at 7 living (threshold 4) falls short at 3/4.
    await user.selectOptions(screen.getByLabelText("Nominator"), players[0].id);
    await user.selectOptions(screen.getByLabelText("Nominee"), players[1].id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    for (const voterIndex of [0, 1, 2]) {
      await user.click(
        screen.getByRole("checkbox", { name: players[voterIndex].name }),
      );
      rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    }
    expect(screen.getByText("3/4 votes")).toBeInTheDocument();

    // A different player dies mid-day (dropping living count to 6, which
    // would recompute the threshold to 3 if it weren't snapshotted).
    const afterMiddayDeath: GameDocument = {
      ...latest,
      players: latest.players.map((player) =>
        player.id === players[3].id ? { ...player, dead: true } : player,
      ),
    };
    rerender(
      <DayPhase game={afterMiddayDeath} onChange={(next) => (latest = next)} />,
    );

    expect(screen.getByText("3/4 votes")).toBeInTheDocument();
    expect(screen.queryByText(/3\/3 votes/)).not.toBeInTheDocument();
  });
});

describe("Day phase: exile calls never compete with the execution block (issue #114)", () => {
  function gameWithTraveller(): GameDocument {
    const base = gameWith([
      "washerwoman",
      "librarian",
      "investigator",
      "chef",
      "empath",
      "monk",
      "imp",
      "baron",
    ]);
    const traveller: Player = {
      id: "traveller-1",
      seat: base.players.length + 1,
      name: "Tessa",
      characterId: "scapegoat",
      startingCharacterId: "scapegoat",
      isDrunk: false,
      isTraveller: true,
      travellerAlignment: "good",
      dead: false,
      ghostVoteSpent: false,
      position: null,
      claim: null,
      actsAs: null,
      actsAsSetOnNight: null,
    };
    return { ...base, players: [...base.players, traveller] };
  }

  it("matches the issue #114 repro: an exile at its own threshold doesn't outrank a lower-tallied execution, and doesn't consume either party's nomination", async () => {
    const user = userEvent.setup();
    const game = gameWithTraveller();
    let latest = game;
    const { rerender } = renderDayPhase(game, (next) => {
      latest = next;
    });
    const [alex, , , , , , , harper] = game.players;
    const tessa = game.players.find((p) => p.id === "traveller-1")!;

    // 1. Alex calls exile on Tessa; 9 players total -> exile threshold 5.
    await user.selectOptions(screen.getByLabelText("Nominator"), alex.id);
    await user.selectOptions(screen.getByLabelText("Nominee"), tessa.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    for (const voter of game.players.slice(0, 5)) {
      await user.click(screen.getByRole("checkbox", { name: voter.name }));
      rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    }
    expect(screen.getByText("5/5 votes — meets threshold")).toBeInTheDocument();
    expect(screen.queryByText(/On the block/)).not.toBeInTheDocument();

    // 2. Neither Alex's nomination nor Tessa's exile is "already nominated"
    // — exile calls are unlimited per day and don't spend the execution
    // once-per-day nomination gate.
    const nominatorSelect = screen.getByLabelText("Nominator") as HTMLSelectElement;
    const nomineeSelect = screen.getByLabelText("Nominee") as HTMLSelectElement;
    expect(
      Array.from(nominatorSelect.options).find((o) => o.value === alex.id)?.text,
    ).not.toContain("already nominated");
    expect(
      Array.from(nomineeSelect.options).find((o) => o.value === tessa.id)?.text,
    ).not.toContain("already nominated");

    // 3. Alex (still eligible) nominates Harper for execution; 9 living
    // (traveller included) -> execution threshold 5, same tally as the
    // exile's. Under the old bug, an equal-tallied nomination already in
    // the fold cleared the block on a tie — here Harper must still take
    // the block outright, since the exile never entered the fold at all.
    await user.selectOptions(screen.getByLabelText("Nominator"), alex.id);
    await user.selectOptions(screen.getByLabelText("Nominee"), harper.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    for (const voter of game.players.slice(0, 5)) {
      await user.click(screen.getByRole("checkbox", { name: voter.name }));
      rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    }
    expect(screen.getByText(`On the block: ${harper.name}`)).toBeInTheDocument();
  });
});

describe("Day phase: ghost votes", () => {
  it("auto-spends a dead player's ghost vote when recording their vote, and un-checking restores it", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp", "recluse", "baron"]);
    const dead: GameDocument = {
      ...game,
      players: game.players.map((p, i) => (i === 2 ? { ...p, dead: true } : p)),
    };
    let latest = dead;
    const { rerender } = renderDayPhase(dead, (next) => {
      latest = next;
    });

    const [nominator, nominee, ghost] = dead.players;
    await user.selectOptions(screen.getByLabelText("Nominator"), nominator.id);
    await user.selectOptions(screen.getByLabelText("Nominee"), nominee.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    const ghostCheckbox = screen.getByRole("checkbox", { name: `${ghost.name} (ghost vote)` });
    await user.click(ghostCheckbox);

    expect(latest.players.find((p) => p.id === ghost.id)?.ghostVoteSpent).toBe(true);
    expect(latest.nominations[0].votes).toContain(ghost.id);

    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    await user.click(screen.getByRole("checkbox", { name: `${ghost.name} (ghost vote)` }));

    expect(latest.players.find((p) => p.id === ghost.id)?.ghostVoteSpent).toBe(false);
    expect(latest.nominations[0].votes).not.toContain(ghost.id);
  });

  it("never spends a ghost vote on an exile (Traveller) nomination", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp", "recluse"], {
      players: (() => {
        const base = gameWith(["washerwoman", "imp", "recluse"]).players.map(
          (p, i) => (i === 2 ? { ...p, dead: true } : p),
        );
        return [
          ...base,
          {
            id: "traveller-1",
            seat: 4,
            name: "Traveller",
            characterId: "scapegoat",
            startingCharacterId: "scapegoat",
            isDrunk: false,
            isTraveller: true,
            travellerAlignment: "good" as const,
            dead: false,
            ghostVoteSpent: false,
            position: null,
            claim: null,
            actsAs: null,
            actsAsSetOnNight: null,
          },
        ];
      })(),
    });
    let latest = game;
    const ghost = game.players[2];
    const { rerender } = renderDayPhase(game, (next) => {
      latest = next;
    });

    await user.selectOptions(screen.getByLabelText("Nominator"), game.players[0].id);
    await user.selectOptions(screen.getByLabelText("Nominee"), "traveller-1");
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    await user.click(screen.getByRole("checkbox", { name: `${ghost.name} (vote free)` }));

    expect(latest.players.find((p) => p.id === ghost.id)?.ghostVoteSpent).toBe(false);
    expect(latest.nominations[0].votes).toContain(ghost.id);
  });

  it("labels a dead voter's row on an exile as a free vote, never as a ghost vote", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp", "recluse"], {
      players: (() => {
        const base = gameWith(["washerwoman", "imp", "recluse"]).players.map(
          (p, i) => (i === 2 ? { ...p, dead: true, ghostVoteSpent: true } : p),
        );
        return [
          ...base,
          {
            id: "traveller-1",
            seat: 4,
            name: "Traveller",
            characterId: "scapegoat",
            startingCharacterId: "scapegoat",
            isDrunk: false,
            isTraveller: true,
            travellerAlignment: "good" as const,
            dead: false,
            ghostVoteSpent: false,
            position: null,
            claim: null,
            actsAs: null,
            actsAsSetOnNight: null,
          },
        ];
      })(),
    });
    let latest = game;
    const ghost = game.players[2];
    const { rerender } = renderDayPhase(game, (next) => {
      latest = next;
    });

    await user.selectOptions(screen.getByLabelText("Nominator"), game.players[0].id);
    await user.selectOptions(screen.getByLabelText("Nominee"), "traveller-1");
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    expect(
      screen.getByRole("checkbox", { name: `${ghost.name} (vote free)` }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: `${ghost.name} (ghost vote)` }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/ghost vote/)).not.toBeInTheDocument();
  });

  it("advisory-labels (but never disables) a dead player's checkbox once their ghost vote is already spent, for an execution", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp", "recluse", "baron"]);
    const dead: GameDocument = {
      ...game,
      players: game.players.map((p, i) =>
        i === 2 ? { ...p, dead: true, ghostVoteSpent: true } : p,
      ),
    };
    const ghost = dead.players[2];
    let latest = dead;
    const { rerender } = renderDayPhase(dead, (next) => {
      latest = next;
    });

    await user.selectOptions(screen.getByLabelText("Nominator"), dead.players[0].id);
    await user.selectOptions(screen.getByLabelText("Nominee"), dead.players[1].id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    const ghostCheckbox = screen.getByRole("checkbox", {
      name: `${ghost.name} (ghost vote — already spent)`,
    });
    expect(ghostCheckbox).toBeEnabled();

    // Never blocked (ADR 0003) — the storyteller can still record the vote.
    await user.click(ghostCheckbox);
    expect(latest.nominations[0].votes).toContain(ghost.id);
  });

  it("doesn't wrongly refund a ghost vote still held by a different, earlier nomination today", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp", "recluse", "baron", "monk"]);
    const dead: GameDocument = {
      ...game,
      players: game.players.map((p, i) => (i === 2 ? { ...p, dead: true } : p)),
    };
    let latest = dead;
    const { rerender } = renderDayPhase(dead, (next) => {
      latest = next;
    });
    const ghost = dead.players[2];

    // First nomination: the ghost votes, spending their one vote for the day.
    await user.selectOptions(screen.getByLabelText("Nominator"), dead.players[0].id);
    await user.selectOptions(screen.getByLabelText("Nominee"), dead.players[1].id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    await user.click(screen.getByRole("checkbox", { name: `${ghost.name} (ghost vote)` }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    expect(latest.players.find((p) => p.id === ghost.id)?.ghostVoteSpent).toBe(true);

    // Second nomination opens (the first is now closed/read-only); the
    // storyteller records — then un-records — the same ghost's vote here.
    // Un-checking must NOT refund the ghost vote, since the first
    // nomination still genuinely holds their one vote for the day.
    await user.selectOptions(screen.getByLabelText("Nominator"), dead.players[3].id);
    await user.selectOptions(screen.getByLabelText("Nominee"), dead.players[4].id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    const ghostCheckboxOnSecond = screen.getByRole("checkbox", {
      name: `${ghost.name} (ghost vote — already spent)`,
    });
    await user.click(ghostCheckboxOnSecond);
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    // Now checked, the label drops "already spent" (that note only applies
    // to the not-yet-voted state) — uncheck via the plain label instead.
    await user.click(screen.getByRole("checkbox", { name: `${ghost.name} (ghost vote)` }));

    expect(latest.players.find((p) => p.id === ghost.id)?.ghostVoteSpent).toBe(true);
    expect(latest.nominations[0].votes).toContain(ghost.id);
    expect(latest.nominations[1].votes).not.toContain(ghost.id);
  });
});

describe("Day phase: dead players in the nominator and nominee pickers", () => {
  it("advisory-labels a dead player in both pickers, without removing them", () => {
    const game = gameWith(["washerwoman", "imp", "recluse"]);
    const dead: GameDocument = {
      ...game,
      players: game.players.map((p, i) => (i === 0 ? { ...p, dead: true } : p)),
    };
    renderDayPhase(dead);

    const nominatorSelect = screen.getByLabelText("Nominator") as HTMLSelectElement;
    const nomineeSelect = screen.getByLabelText("Nominee") as HTMLSelectElement;
    expect(
      Array.from(nominatorSelect.options).find((o) => o.value === dead.players[0].id)?.text,
    ).toContain("(dead)");
    expect(
      Array.from(nomineeSelect.options).find((o) => o.value === dead.players[0].id)?.text,
    ).toContain("(dead)");
  });
});
