import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { getCharacter, type Character } from "@/lib/characters";
import { createGame, type GameDocument, type Player } from "@/lib/gameDocument";
import { getSelectOptions, selectOption } from "@/testUtils/selectOption";

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

// DayPhase no longer guards on "before the first night ends" or "while a
// night is open" — GrimoireSetup only ever mounts it once the game phase is
// genuinely "day" (issue #195), so those states are the night list's
// business instead (its own "Start/Reopen" content covers them).

describe("Day phase: recording a nomination", () => {
  it("starts with no nominator or nominee selected, and the submit button disabled", () => {
    const game = gameWith(["washerwoman", "imp", "recluse"]);
    renderDayPhase(game);

    const nominatorSelect = screen.getByLabelText("Nominator");
    const nomineeSelect = screen.getByLabelText("Nominee");
    expect(nominatorSelect.dataset.value).toBe("");
    expect(nomineeSelect.dataset.value).toBe("");
    expect(
      screen.getByRole("button", { name: "Record nomination" }),
    ).toBeDisabled();
  });

  it("shows a placeholder preview until both a nominator and a nominee are chosen, then names them", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp", "recluse"]);
    renderDayPhase(game);
    const [nominator, nominee] = game.players;

    expect(
      screen.getByText(
        "Choose a nominator and a nominee to start a nomination.",
      ),
    ).toBeInTheDocument();

    await selectOption(user, screen.getByLabelText("Nominator"), nominator.id);
    expect(
      screen.getByText(
        "Choose a nominator and a nominee to start a nomination.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Record nomination" }),
    ).toBeDisabled();

    await selectOption(user, screen.getByLabelText("Nominee"), nominee.id);
    expect(
      screen.getByText(`${nominator.name} will nominate ${nominee.name}`),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Record nomination" }),
    ).toBeEnabled();
  });

  it("clears the selection back to the placeholder state after recording, so the next nomination (once the first is locked in) is a fresh explicit choice", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp", "recluse"]);
    let latest = game;
    const { rerender } = renderDayPhase(game, (next) => {
      latest = next;
    });
    const [nominator, nominee] = game.players;

    await selectOption(user, screen.getByLabelText("Nominator"), nominator.id);
    await selectOption(user, screen.getByLabelText("Nominee"), nominee.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    // The form is hidden while this nomination is open (issue #191) — lock
    // it in to bring it back and check the pickers reset underneath it.
    await user.click(screen.getByRole("button", { name: "Lock in votes" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    expect(screen.getByLabelText("Nominator").dataset.value).toBe("");
    expect(screen.getByLabelText("Nominee").dataset.value).toBe("");
    expect(
      screen.getByRole("button", { name: "Record nomination" }),
    ).toBeDisabled();
  });

  it("clears an unsubmitted nominator/nominee pick once a new day begins, since it was never recorded (DayPhase stays mounted across day transitions)", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp", "recluse"]);
    const { rerender } = renderDayPhase(game);

    // Pick both, but never submit — e.g. the storyteller moved on to the
    // night instead of recording the nomination.
    const [nominator, nominee] = game.players;
    // getAllByLabelText(...)[0], not getByLabelText: the custom Select's
    // trigger and its (conditionally rendered) open listbox share the same
    // aria-label, so a select left open makes a plain getByLabelText
    // ambiguous — the trigger is always the first match in document order.
    await selectOption(
      user,
      screen.getAllByLabelText("Nominator")[0],
      nominator.id,
    );
    await selectOption(
      user,
      screen.getAllByLabelText("Nominee")[0],
      nominee.id,
    );
    expect(screen.getAllByLabelText("Nominator")[0].dataset.value).toBe(
      nominator.id,
    );

    // Day 2 begins. DayPhase is never unmounted by its parent (GrimoireSetup
    // renders it unconditionally), so its useState would otherwise carry the
    // abandoned day 1 picks straight into day 2 as a misleading pre-filled
    // pair — the same problem issue #166 removed for the initial render.
    rerender(<DayPhase game={{ ...game, night: 2 }} onChange={() => {}} />);

    expect(screen.getAllByLabelText("Nominator")[0].dataset.value).toBe("");
    expect(screen.getAllByLabelText("Nominee")[0].dataset.value).toBe("");
    expect(
      screen.getByRole("button", { name: "Record nomination" }),
    ).toBeDisabled();
  });

  it("records who nominated whom", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp", "recluse"]);
    let latest = game;
    renderDayPhase(game, (next) => {
      latest = next;
    });

    const [nominator, nominee] = game.players;
    await selectOption(user, screen.getByLabelText("Nominator"), nominator.id);
    await selectOption(user, screen.getByLabelText("Nominee"), nominee.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));

    expect(latest.nominations).toHaveLength(1);
    expect(latest.nominations[0]).toMatchObject({
      nominatorId: nominator.id,
      nomineeId: nominee.id,
      votes: [],
    });
  });

  it("marks already-nominated players in the nominator and nominee options", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp", "recluse"]);
    const [p1, p2] = game.players;
    const withNomination = {
      ...game,
      nominations: [
        {
          id: "n1",
          nominatorId: p1.id,
          nomineeId: p2.id,
          votes: [],
          threshold: 2,
          isExile: false,
          lockedIn: true,
          ghostVoteSpenderIds: [],
        },
      ],
    };
    renderDayPhase(withNomination);

    const nominatorOptions = await getSelectOptions(
      user,
      screen.getByLabelText("Nominator"),
    );
    const nomineeOptions = await getSelectOptions(
      user,
      screen.getByLabelText("Nominee"),
    );
    expect(nominatorOptions.find((o) => o.value === p1.id)?.label).toContain(
      "already nominated",
    );
    expect(nomineeOptions.find((o) => o.value === p2.id)?.label).toContain(
      "already nominated",
    );
  });
});

// Moved here from NightList (issue #195): a non-null `lastEndedNightSnapshot`
// always means day >= 1 with no night open — exactly the state where the
// single bottom sheet shows Day phase's content, not the night list's.
describe("Day phase: reopening a just-ended night (issue #165)", () => {
  it("does not offer to reopen when no night has ended", () => {
    const game = gameWith(["washerwoman", "imp"]);
    renderDayPhase(game);

    expect(
      screen.queryByRole("button", { name: /^← Reopen/ }),
    ).not.toBeInTheDocument();
  });

  it("offers to reopen the just-ended night once one has ended", () => {
    const game = gameWith(["washerwoman", "imp"], {
      lastEndedNightSnapshot: {
        nightChecked: [],
        nightUnskipped: [],
        nominations: [],
      },
    });
    renderDayPhase(game);

    expect(
      screen.getByRole("button", { name: "← Reopen First night" }),
    ).toBeInTheDocument();
  });

  it("undoes End night: restores the night counter, checklist, and the snapshotted nominations", async () => {
    const user = userEvent.setup();
    const nomination = {
      id: "n1",
      nominatorId: "p1",
      nomineeId: "p2",
      votes: ["p3"],
      threshold: 1,
      isExile: false,
      lockedIn: false,
      ghostVoteSpenderIds: [],
    };
    const game = gameWith(["washerwoman", "imp"], {
      night: 1,
      lastEndedNightSnapshot: {
        nightChecked: ["char:p1"],
        nightUnskipped: ["char:p2"],
        nominations: [nomination],
      },
    });
    let latest = game;
    renderDayPhase(game, (next) => {
      latest = next;
    });

    await user.click(
      screen.getByRole("button", { name: "← Reopen First night" }),
    );

    expect(latest.night).toBe(0);
    expect(latest.nightOpen).toBe(true);
    expect(latest.nightChecked).toEqual(["char:p1"]);
    expect(latest.nightUnskipped).toEqual(["char:p2"]);
    expect(latest.nominations).toEqual([nomination]);
    expect(latest.lastEndedNightSnapshot).toBeNull();
  });

  it("does not silently overwrite nominations already recorded since End night (issue #165 AC)", async () => {
    const user = userEvent.setup();
    const recordedSinceEnd = {
      id: "n2",
      nominatorId: "p4",
      nomineeId: "p5",
      votes: [],
      threshold: 1,
      isExile: false,
      lockedIn: false,
      ghostVoteSpenderIds: [],
    };
    const game = gameWith(["washerwoman", "imp"], {
      night: 1,
      nominations: [recordedSinceEnd],
      lastEndedNightSnapshot: {
        nightChecked: [],
        nightUnskipped: [],
        nominations: [],
      },
    });
    let latest = game;
    renderDayPhase(game, (next) => {
      latest = next;
    });

    await user.click(
      screen.getByRole("button", { name: "← Reopen First night" }),
    );

    expect(latest.nominations).toEqual([recordedSinceEnd]);
  });

  it("removes the Day 1 notes section End night created, if it's still empty, on Reopen (issue #193)", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp"], {
      lastEndedNightSnapshot: {
        nightChecked: [],
        nightUnskipped: [],
        nominations: [],
      },
      notes: [
        { id: "general", title: "General", text: "" },
        { id: "day-1", title: "Day 1", text: "" },
      ],
    });
    let latest = game;
    renderDayPhase(game, (next) => {
      latest = next;
    });

    await user.click(
      screen.getByRole("button", { name: "← Reopen First night" }),
    );

    expect(latest.notes.find((s) => s.id === "day-1")).toBeUndefined();
  });

  it("keeps the Day 1 notes section on Reopen once the storyteller has written something in it (issue #193)", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp"], {
      lastEndedNightSnapshot: {
        nightChecked: [],
        nightUnskipped: [],
        nominations: [],
      },
      notes: [
        { id: "general", title: "General", text: "" },
        { id: "day-1", title: "Day 1", text: "Alice nominated Bob." },
      ],
    });
    let latest = game;
    renderDayPhase(game, (next) => {
      latest = next;
    });

    await user.click(
      screen.getByRole("button", { name: "← Reopen First night" }),
    );

    expect(latest.notes).toContainEqual({
      id: "day-1",
      title: "Day 1",
      text: "Alice nominated Bob.",
    });
  });

  it("also pauses a running day timer on undoing End night (Copilot review finding on issue #190: this path reopens the night too)", async () => {
    const user = userEvent.setup();
    const endAt = new Date(Date.now() + 5 * 60_000).toISOString();
    const game = gameWith(["washerwoman", "imp"], {
      lastEndedNightSnapshot: {
        nightChecked: [],
        nightUnskipped: [],
        nominations: [],
      },
      dayTimer: { status: "running", endAt, remainingMs: 5 * 60_000 },
    });
    let latest = game;
    renderDayPhase(game, (next) => {
      latest = next;
    });

    await user.click(
      screen.getByRole("button", { name: "← Reopen First night" }),
    );

    expect(latest.dayTimer.status).toBe("paused");
    expect(latest.dayTimer.endAt).toBeNull();
    expect(latest.dayTimer.remainingMs).toBeGreaterThan(4.9 * 60_000);
    expect(latest.dayTimer.remainingMs).toBeLessThanOrEqual(5 * 60_000);
  });

  it("consumes the reopen offer once used, so it can't be replayed a second time", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp"], {
      lastEndedNightSnapshot: {
        nightChecked: [],
        nightUnskipped: [],
        nominations: [],
      },
    });
    let latest = game;
    const { rerender } = renderDayPhase(game, (next) => {
      latest = next;
    });

    await user.click(
      screen.getByRole("button", { name: "← Reopen First night" }),
    );
    // The reopened night is genuinely a different phase now (nightOpen),
    // which GrimoireSetup would stop mounting DayPhase for — but this suite
    // exercises DayPhase in isolation, so re-render it directly with the
    // post-reopen document to confirm the offer itself is consumed.
    rerender(<DayPhase game={latest} onChange={() => {}} />);

    expect(latest.lastEndedNightSnapshot).toBeNull();
    expect(
      screen.queryByRole("button", { name: /^← Reopen/ }),
    ).not.toBeInTheDocument();
  });

  it("labels the reopen control for a later night correctly", () => {
    const game = gameWith(["washerwoman", "imp"], {
      night: 2,
      lastEndedNightSnapshot: {
        nightChecked: [],
        nightUnskipped: [],
        nominations: [],
      },
    });
    renderDayPhase(game);

    expect(
      screen.getByRole("button", { name: "← Reopen Night 2" }),
    ).toBeInTheDocument();
  });
});

// "Start Night N" moved here from the night list (issue #195): the single
// bottom sheet only ever shows Day phase's content while a day is in
// progress, so ending the day has to be one of Day phase's own controls.
describe("Day phase: starting the next night", () => {
  it("offers to start the next night, labeled by its number", () => {
    const game = gameWith(["washerwoman", "imp"], { night: 1 });
    renderDayPhase(game);

    expect(
      screen.getByRole("button", { name: "Start Night 2" }),
    ).toBeInTheDocument();
  });

  it("opens the night with every box cleared, even if a stale check-off lingered", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp"], {
      night: 1,
      nightChecked: ["stale"],
      nightUnskipped: ["stale"],
    });
    let latest = game;
    renderDayPhase(game, (next) => {
      latest = next;
    });

    await user.click(screen.getByRole("button", { name: "Start Night 2" }));

    expect(latest.nightOpen).toBe(true);
    expect(latest.nightChecked).toEqual([]);
    expect(latest.nightUnskipped).toEqual([]);
  });

  it("pauses a running day timer on Start night, so it can't drift blind while its controls are unreachable (issue #190)", async () => {
    const user = userEvent.setup();
    const endAt = new Date(Date.now() + 5 * 60_000).toISOString();
    const game = gameWith(["washerwoman", "imp"], {
      night: 1,
      dayTimer: { status: "running", endAt, remainingMs: 5 * 60_000 },
    });
    let latest = game;
    renderDayPhase(game, (next) => {
      latest = next;
    });

    await user.click(screen.getByRole("button", { name: "Start Night 2" }));

    expect(latest.dayTimer.status).toBe("paused");
    expect(latest.dayTimer.endAt).toBeNull();
    expect(latest.dayTimer.remainingMs).toBeGreaterThan(4.9 * 60_000);
    expect(latest.dayTimer.remainingMs).toBeLessThanOrEqual(5 * 60_000);
  });

  it("creates a Night 2 notes section when the next night starts (issue #193)", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp"], { night: 1 });
    let latest = game;
    renderDayPhase(game, (next) => {
      latest = next;
    });

    await user.click(screen.getByRole("button", { name: "Start Night 2" }));

    expect(latest.notes).toContainEqual({
      id: "night-2",
      title: "Night 2",
      text: "",
    });
  });
});

describe("Day phase: collapsing the panel (issue #168)", () => {
  it("keeps the glanceable block-holder status visible even while collapsed", () => {
    const game = gameWith(["washerwoman", "imp", "recluse", "baron"], {
      nightListCollapsed: true,
    });
    const [nominator, nominee, voter1, voter2] = game.players;
    const withBlock: GameDocument = {
      ...game,
      nominations: [
        {
          id: "n1",
          nominatorId: nominator.id,
          nomineeId: nominee.id,
          votes: [voter1.id, voter2.id],
          threshold: 2,
          isExile: false,
          lockedIn: false,
          ghostVoteSpenderIds: [],
        },
      ],
    };
    renderDayPhase(withBlock);

    expect(
      screen.queryByRole("button", { name: "Record nomination" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(`On the block: ${nominee.name}`),
    ).toBeInTheDocument();
  });

  it("hides the nomination form and record while collapsed during an active day", () => {
    const game = gameWith(["washerwoman", "imp"], { nightListCollapsed: true });
    renderDayPhase(game);

    expect(
      screen.queryByRole("button", { name: "Record nomination" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Day 1" })).toBeInTheDocument();
  });

  it("toggles the persisted collapsed state via the heading", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp"]);
    let latest = game;
    renderDayPhase(game, (next) => {
      latest = next;
    });

    await user.click(screen.getByRole("button", { name: "Day 1" }));

    expect(latest).toEqual({ ...game, nightListCollapsed: true });
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
    await selectOption(user, screen.getByLabelText("Nominator"), nominator.id);
    await selectOption(user, screen.getByLabelText("Nominee"), nominee.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    expect(screen.getByText("0/2 votes")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: voter1.name }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    expect(screen.getByText("1/2 votes")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: voter2.name }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    expect(
      screen.getByText(/2\/2 votes — meets threshold/),
    ).toBeInTheDocument();
  });

  it("uses the exile threshold (all players, dead included) for a Traveller nominee", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp", "recluse", "baron"], {
      players: (() => {
        const base = gameWith([
          "washerwoman",
          "imp",
          "recluse",
          "baron",
        ]).players;
        return [
          ...base,
          {
            id: "traveller-1",
            seat: 5,
            name: "Traveller",
            characterId: "scapegoat",
            startingCharacterId: "scapegoat",
            isDrunk: false,
            isLunatic: false,
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

    await selectOption(
      user,
      screen.getByLabelText("Nominator"),
      game.players[0].id,
    );
    await selectOption(user, screen.getByLabelText("Nominee"), "traveller-1");
    await user.click(screen.getByRole("button", { name: "Record nomination" }));

    // 5 players total -> exile threshold 3, snapshotted onto the nomination.
    expect(latest.nominations[0].nomineeId).toBe("traveller-1");
    expect(latest.nominations[0].threshold).toBe(3);
  });
});

describe("Day phase: vote roster order (issue #248)", () => {
  it("lists voters starting with the seat clockwise of the nominee, wrapping around so the nominee votes last", async () => {
    const user = userEvent.setup();
    const game = gameWith([
      "washerwoman",
      "imp",
      "recluse",
      "baron",
      "empath",
    ]);
    let latest = game;
    const { rerender } = renderDayPhase(game, (next) => {
      latest = next;
    });
    const [seat1, seat2, seat3, seat4, seat5] = game.players;

    await selectOption(user, screen.getByLabelText("Nominator"), seat1.id);
    await selectOption(user, screen.getByLabelText("Nominee"), seat3.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    const names = screen
      .getAllByRole("checkbox")
      .map((checkbox) => checkbox.closest("label")?.textContent);
    expect(names).toEqual([
      seat4.name,
      seat5.name,
      seat1.name,
      seat2.name,
      seat3.name,
    ]);
  });

  it("derives the roster order from seat number, not player array order, so it's correct after a reseat", async () => {
    const user = userEvent.setup();
    const base = gameWith(["washerwoman", "imp", "recluse"]);
    // Array order intentionally does NOT match seat order, the way a reseat
    // or insertion can leave it (CONTEXT.md: Seat) — a fix that merely reads
    // `game.players` in array order would still pass the happy-path test
    // above by coincidence, since that one's array already happens to sit in
    // seat order.
    const reseated: Player[] = [
      { ...base.players[0], seat: 1 },
      { ...base.players[1], seat: 3 },
      { ...base.players[2], seat: 2 },
    ];
    const game: GameDocument = { ...base, players: reseated };
    let latest = game;
    const { rerender } = renderDayPhase(game, (next) => {
      latest = next;
    });
    const [firstSeat, thirdSeat, secondSeat] = reseated;

    await selectOption(user, screen.getByLabelText("Nominator"), firstSeat.id);
    await selectOption(user, screen.getByLabelText("Nominee"), secondSeat.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    const names = screen
      .getAllByRole("checkbox")
      .map((checkbox) => checkbox.closest("label")?.textContent);
    // Nominee is seat 2 -> clockwise order is seat 3, seat 1, seat 2 (last).
    expect(names).toEqual([thirdSeat.name, firstSeat.name, secondSeat.name]);
  });

  it("still records a vote against the right player once the roster is reordered", async () => {
    const user = userEvent.setup();
    const game = gameWith([
      "washerwoman",
      "imp",
      "recluse",
      "baron",
      "empath",
    ]);
    let latest = game;
    const { rerender } = renderDayPhase(game, (next) => {
      latest = next;
    });
    const [seat1, , seat3, seat4] = game.players;

    await selectOption(user, screen.getByLabelText("Nominator"), seat1.id);
    await selectOption(user, screen.getByLabelText("Nominee"), seat3.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    await user.click(screen.getByRole("checkbox", { name: seat4.name }));

    expect(latest.nominations[0].votes).toEqual([seat4.id]);
  });
});

describe("Day phase: distinguishing open vs. locked-in nominations in the record (issue #191)", () => {
  it("labels the open nomination as accepting votes, and locks it in once votes are locked in, before a second can be recorded", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp", "recluse", "baron"]);
    let latest = game;
    const { rerender } = renderDayPhase(game, (next) => {
      latest = next;
    });
    const [a, b, c] = game.players;

    await selectOption(user, screen.getByLabelText("Nominator"), a.id);
    await selectOption(user, screen.getByLabelText("Nominee"), b.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    const [firstItem] = screen.getAllByRole("listitem");
    expect(
      within(firstItem).getByText("Open — accepting votes"),
    ).toBeInTheDocument();
    expect(firstItem.dataset.status).toBe("open");
    // While it's open, starting a second nomination isn't offered.
    expect(
      screen.queryByRole("button", { name: "Record nomination" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "A nomination is open. Lock in its votes to start another.",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Lock in votes" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    const [lockedItem] = screen.getAllByRole("listitem");
    expect(within(lockedItem).getByText("Locked in")).toBeInTheDocument();
    expect(lockedItem.dataset.status).toBe("locked-in");

    await selectOption(user, screen.getByLabelText("Nominator"), b.id);
    await selectOption(user, screen.getByLabelText("Nominee"), c.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    const [firstAfter, openItem] = screen.getAllByRole("listitem");
    expect(within(firstAfter).getByText("Locked in")).toBeInTheDocument();
    expect(firstAfter.dataset.status).toBe("locked-in");
    expect(
      within(openItem).getByText("Open — accepting votes"),
    ).toBeInTheDocument();
    expect(openItem.dataset.status).toBe("open");
  });

  it("reopens a locked-in nomination, making it read-only-editable again and hiding the record-nomination form", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp", "recluse", "baron"]);
    let latest = game;
    const { rerender } = renderDayPhase(game, (next) => {
      latest = next;
    });
    const [a, b] = game.players;

    await selectOption(user, screen.getByLabelText("Nominator"), a.id);
    await selectOption(user, screen.getByLabelText("Nominee"), b.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    await user.click(screen.getByRole("button", { name: "Lock in votes" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    expect(
      screen.getByRole("button", { name: "Record nomination" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reopen" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    const [item] = screen.getAllByRole("listitem");
    expect(
      within(item).getByText("Open — accepting votes"),
    ).toBeInTheDocument();
    expect(item.dataset.status).toBe("open");
    expect(
      screen.queryByRole("button", { name: "Record nomination" }),
    ).not.toBeInTheDocument();
  });

  it("hides Reopen on a locked-in nomination while a different nomination is already open (code review finding: two nominations must never both be open)", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp", "recluse", "baron"]);
    let latest = game;
    const { rerender } = renderDayPhase(game, (next) => {
      latest = next;
    });
    const [a, b, c] = game.players;

    // First nomination: locked in.
    await selectOption(user, screen.getByLabelText("Nominator"), a.id);
    await selectOption(user, screen.getByLabelText("Nominee"), b.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    await user.click(screen.getByRole("button", { name: "Lock in votes" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    // Second nomination: left open.
    await selectOption(user, screen.getByLabelText("Nominator"), b.id);
    await selectOption(user, screen.getByLabelText("Nominee"), c.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    // The first (locked-in) nomination no longer offers Reopen — clicking it
    // would put two nominations in the open/editable state at once, letting
    // a dead voter's ghost vote be recorded (and locked in) on both.
    expect(
      screen.queryByRole("button", { name: "Reopen" }),
    ).not.toBeInTheDocument();

    const nominations = latest.nominations;
    expect(nominations[0].lockedIn).toBe(true);
    expect(nominations[1].lockedIn).toBe(false);
  });
});

describe("Day phase: distinguishing executions from exiles in the record", () => {
  it("labels an execution nomination and an exile call differently", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp", "recluse"], {
      players: [
        ...gameWith(["washerwoman", "imp", "recluse"]).players,
        {
          id: "traveller-1",
          seat: 4,
          name: "Traveller",
          characterId: "scapegoat",
          startingCharacterId: "scapegoat",
          isDrunk: false,
          isLunatic: false,
          isTraveller: true,
          travellerAlignment: "good" as const,
          dead: false,
          ghostVoteSpent: false,
          position: null,
          claim: null,
          actsAs: null,
          actsAsSetOnNight: null,
        },
      ],
    });
    let latest = game;
    const { rerender } = renderDayPhase(game, (next) => {
      latest = next;
    });
    const [a, b] = game.players;

    await selectOption(user, screen.getByLabelText("Nominator"), a.id);
    await selectOption(user, screen.getByLabelText("Nominee"), b.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    await user.click(screen.getByRole("button", { name: "Lock in votes" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    await selectOption(user, screen.getByLabelText("Nominator"), b.id);
    await selectOption(user, screen.getByLabelText("Nominee"), "traveller-1");
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    const [executionItem, exileItem] = screen.getAllByRole("listitem");
    expect(within(executionItem).getByText("Execution")).toBeInTheDocument();
    expect(within(exileItem).getByText("Exile call")).toBeInTheDocument();
  });
});

describe("Day phase: surfacing the block on the nomination that holds it", () => {
  it("badges the specific nomination that currently holds the block", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp", "recluse", "baron"]);
    let latest = game;
    const { rerender } = renderDayPhase(game, (next) => {
      latest = next;
    });
    const [nominator, nominee, voter1, voter2] = game.players;

    await selectOption(user, screen.getByLabelText("Nominator"), nominator.id);
    await selectOption(user, screen.getByLabelText("Nominee"), nominee.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    const [item] = screen.getAllByRole("listitem");
    expect(within(item).queryByText("On the block")).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: voter1.name }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    await user.click(screen.getByRole("checkbox", { name: voter2.name }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    expect(within(item).getByText("On the block")).toBeInTheDocument();
  });

  it("never badges an earlier, non-block-holding nomination just because it shares the same nominee (code review finding)", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp", "recluse", "baron"]);
    let latest = game;
    const { rerender } = renderDayPhase(game, (next) => {
      latest = next;
    });
    const [a, b, c] = game.players;

    // First nomination of B falls short of the threshold (2) and is
    // locked in without meeting it — it never held the block.
    // wasNominatedToday only advisory-labels a repeat nominee; it doesn't
    // block re-nominating B.
    await selectOption(user, screen.getByLabelText("Nominator"), a.id);
    await selectOption(user, screen.getByLabelText("Nominee"), b.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    await user.click(screen.getByRole("checkbox", { name: a.name }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    await user.click(screen.getByRole("button", { name: "Lock in votes" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    // Second nomination, also of B, meets the threshold and takes the block.
    await selectOption(user, screen.getByLabelText("Nominator"), c.id);
    await selectOption(user, screen.getByLabelText("Nominee"), b.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    await user.click(screen.getByRole("checkbox", { name: a.name }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    await user.click(screen.getByRole("checkbox", { name: c.name }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    const [firstItem, secondItem] = screen.getAllByRole("listitem");
    expect(
      within(firstItem).queryByText("On the block"),
    ).not.toBeInTheDocument();
    expect(within(secondItem).getByText("On the block")).toBeInTheDocument();
  });

  it("keeps the block badge below the voter checkboxes, so it can never shift one mid-vote (issue #125, per-item regression)", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp", "recluse", "baron"]);
    let latest = game;
    const { rerender } = renderDayPhase(game, (next) => {
      latest = next;
    });
    const [nominator, nominee, voter1, voter2] = game.players;

    await selectOption(user, screen.getByLabelText("Nominator"), nominator.id);
    await selectOption(user, screen.getByLabelText("Nominee"), nominee.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    await user.click(screen.getByRole("checkbox", { name: voter1.name }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    await user.click(screen.getByRole("checkbox", { name: voter2.name }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    // Compare against the LAST checkbox (queried fresh, post-rerender), not
    // just the first — a badge inserted after checkbox 1 but before the
    // rest would wrongly pass a first-checkbox-only comparison (Copilot
    // review finding).
    const checkboxes = screen.getAllByRole("checkbox");
    const lastCheckbox = checkboxes[checkboxes.length - 1];
    const blockBadge = within(screen.getAllByRole("listitem")[0]).getByText(
      "On the block",
    );
    expect(
      lastCheckbox.compareDocumentPosition(blockBadge) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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
    await selectOption(user, screen.getByLabelText("Nominator"), nominator.id);
    await selectOption(user, screen.getByLabelText("Nominee"), nominee.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    await user.click(screen.getByRole("checkbox", { name: voter1.name }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    await user.click(screen.getByRole("checkbox", { name: voter2.name }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    expect(
      screen.getByText(`On the block: ${nominee.name}`),
    ).toBeInTheDocument();
  });

  it("renders the block status after the nominations list, never above it, so it can't shift voter checkboxes mid-count (issue #125)", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp", "recluse", "baron"]);
    let latest = game;
    const { rerender } = renderDayPhase(game, (next) => {
      latest = next;
    });

    const [nominator, nominee, voter1, voter2] = game.players;
    await selectOption(user, screen.getByLabelText("Nominator"), nominator.id);
    await selectOption(user, screen.getByLabelText("Nominee"), nominee.id);
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

    async function nominateAndVote(
      nomineeIndex: number,
      voterIndices: number[],
    ) {
      await selectOption(
        user,
        screen.getByLabelText("Nominator"),
        players[0].id,
      );
      await selectOption(
        user,
        screen.getByLabelText("Nominee"),
        players[nomineeIndex].id,
      );
      await user.click(
        screen.getByRole("button", { name: "Record nomination" }),
      );
      rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
      for (const voterIndex of voterIndices) {
        await user.click(
          screen.getByRole("checkbox", { name: players[voterIndex].name }),
        );
        rerender(
          <DayPhase game={latest} onChange={(next) => (latest = next)} />,
        );
      }
      // Lock in so the next nomination can be recorded (issue #191: only
      // one nomination is ever open at a time).
      await user.click(screen.getByRole("button", { name: "Lock in votes" }));
      rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    }

    // 7 living -> threshold 4. Three nominations in a row each get exactly
    // 4 votes: the first takes the block, the second ties it (clearing it),
    // and the third must not retake it — 4 only matches the tied high-water
    // mark, it doesn't beat it.
    await nominateAndVote(1, [0, 1, 2, 3]);
    expect(
      screen.getByText(`On the block: ${players[1].name}`),
    ).toBeInTheDocument();

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
    await selectOption(user, screen.getByLabelText("Nominator"), players[0].id);
    await selectOption(user, screen.getByLabelText("Nominee"), players[1].id);
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
      isLunatic: false,
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
    await selectOption(user, screen.getByLabelText("Nominator"), alex.id);
    await selectOption(user, screen.getByLabelText("Nominee"), tessa.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    for (const voter of game.players.slice(0, 5)) {
      await user.click(screen.getByRole("checkbox", { name: voter.name }));
      rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    }
    expect(screen.getByText("5/5 votes — meets threshold")).toBeInTheDocument();
    expect(screen.queryByText(/On the block/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Lock in votes" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    // 2. Neither Alex's nomination nor Tessa's exile is "already nominated"
    // — exile calls are unlimited per day and don't spend the execution
    // once-per-day nomination gate.
    const nominatorOptions = await getSelectOptions(
      user,
      screen.getByLabelText("Nominator"),
    );
    const nomineeOptions = await getSelectOptions(
      user,
      screen.getByLabelText("Nominee"),
    );
    expect(
      nominatorOptions.find((o) => o.value === alex.id)?.label,
    ).not.toContain("already nominated");
    expect(
      nomineeOptions.find((o) => o.value === tessa.id)?.label,
    ).not.toContain("already nominated");

    // 3. Alex (still eligible) nominates Harper for execution; 9 living
    // (traveller included) -> execution threshold 5, same tally as the
    // exile's. Under the old bug, an equal-tallied nomination already in
    // the fold cleared the block on a tie — here Harper must still take
    // the block outright, since the exile never entered the fold at all.
    await selectOption(user, screen.getByLabelText("Nominator"), alex.id);
    await selectOption(user, screen.getByLabelText("Nominee"), harper.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    for (const voter of game.players.slice(0, 5)) {
      await user.click(screen.getByRole("checkbox", { name: voter.name }));
      rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    }
    expect(
      screen.getByText(`On the block: ${harper.name}`),
    ).toBeInTheDocument();
  });
});

describe("Day phase: ghost votes (issue #191: spent at lock-in, not on toggle)", () => {
  it("doesn't spend a dead player's ghost vote while a nomination is merely open, only once it's locked in", async () => {
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
    await selectOption(user, screen.getByLabelText("Nominator"), nominator.id);
    await selectOption(user, screen.getByLabelText("Nominee"), nominee.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    const ghostCheckbox = screen.getByRole("checkbox", {
      name: `${ghost.name} (ghost vote)`,
    });
    await user.click(ghostCheckbox);

    expect(latest.players.find((p) => p.id === ghost.id)?.ghostVoteSpent).toBe(
      false,
    );
    expect(latest.nominations[0].votes).toContain(ghost.id);
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    await user.click(screen.getByRole("button", { name: "Lock in votes" }));

    expect(latest.players.find((p) => p.id === ghost.id)?.ghostVoteSpent).toBe(
      true,
    );
    expect(latest.nominations[0].lockedIn).toBe(true);
  });

  it("reopening a locked-in nomination restores a ghost vote it spent, and it can be un-recorded again", async () => {
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

    await selectOption(user, screen.getByLabelText("Nominator"), nominator.id);
    await selectOption(user, screen.getByLabelText("Nominee"), nominee.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    await user.click(
      screen.getByRole("checkbox", { name: `${ghost.name} (ghost vote)` }),
    );
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    await user.click(screen.getByRole("button", { name: "Lock in votes" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    expect(latest.players.find((p) => p.id === ghost.id)?.ghostVoteSpent).toBe(
      true,
    );

    await user.click(screen.getByRole("button", { name: "Reopen" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    expect(latest.players.find((p) => p.id === ghost.id)?.ghostVoteSpent).toBe(
      false,
    );
    expect(latest.nominations[0].lockedIn).toBe(false);
    expect(latest.nominations[0].votes).toContain(ghost.id);

    await user.click(
      screen.getByRole("checkbox", { name: `${ghost.name} (ghost vote)` }),
    );

    expect(latest.nominations[0].votes).not.toContain(ghost.id);
  });

  it("restores a lock-in's ghost vote on reopen even if that voter was revived in the meantime (Copilot review finding)", async () => {
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

    await selectOption(user, screen.getByLabelText("Nominator"), nominator.id);
    await selectOption(user, screen.getByLabelText("Nominee"), nominee.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    await user.click(
      screen.getByRole("checkbox", { name: `${ghost.name} (ghost vote)` }),
    );
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    await user.click(screen.getByRole("button", { name: "Lock in votes" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    expect(latest.players.find((p) => p.id === ghost.id)?.ghostVoteSpent).toBe(
      true,
    );
    expect(latest.nominations[0].ghostVoteSpenderIds).toEqual([ghost.id]);

    // The storyteller corrects a mistaken death — the ghost is marked alive
    // again — entirely outside this nomination, before it's ever reopened.
    const revived: GameDocument = {
      ...latest,
      players: latest.players.map((p) =>
        p.id === ghost.id ? { ...p, dead: false } : p,
      ),
    };
    rerender(<DayPhase game={revived} onChange={(next) => (latest = next)} />);

    await user.click(screen.getByRole("button", { name: "Reopen" }));

    // Restored via the nomination's own snapshotted spender ids, not by
    // recomputing "who's currently dead" — the now-alive ghost's earlier
    // spend is still found and undone.
    expect(latest.players.find((p) => p.id === ghost.id)?.ghostVoteSpent).toBe(
      false,
    );
    expect(latest.nominations[0].lockedIn).toBe(false);
    expect(latest.nominations[0].ghostVoteSpenderIds).toEqual([]);
  });

  it("never spends a ghost vote on an exile (Traveller) nomination, even once locked in", async () => {
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
            isLunatic: false,
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

    await selectOption(
      user,
      screen.getByLabelText("Nominator"),
      game.players[0].id,
    );
    await selectOption(user, screen.getByLabelText("Nominee"), "traveller-1");
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    await user.click(
      screen.getByRole("checkbox", { name: `${ghost.name} (vote free)` }),
    );
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    await user.click(screen.getByRole("button", { name: "Lock in votes" }));

    expect(latest.players.find((p) => p.id === ghost.id)?.ghostVoteSpent).toBe(
      false,
    );
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
            isLunatic: false,
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

    await selectOption(
      user,
      screen.getByLabelText("Nominator"),
      game.players[0].id,
    );
    await selectOption(user, screen.getByLabelText("Nominee"), "traveller-1");
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

    await selectOption(
      user,
      screen.getByLabelText("Nominator"),
      dead.players[0].id,
    );
    await selectOption(
      user,
      screen.getByLabelText("Nominee"),
      dead.players[1].id,
    );
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

  it("doesn't wrongly refund a ghost vote still held by a different, locked-in nomination today", async () => {
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

    // First nomination: the ghost votes, then it's locked in, spending
    // their one vote for the day.
    await selectOption(
      user,
      screen.getByLabelText("Nominator"),
      dead.players[0].id,
    );
    await selectOption(
      user,
      screen.getByLabelText("Nominee"),
      dead.players[1].id,
    );
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    await user.click(
      screen.getByRole("checkbox", { name: `${ghost.name} (ghost vote)` }),
    );
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    await user.click(screen.getByRole("button", { name: "Lock in votes" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    expect(latest.players.find((p) => p.id === ghost.id)?.ghostVoteSpent).toBe(
      true,
    );

    // Second nomination opens (the first is now locked in/read-only); the
    // storyteller records — then un-records — the same ghost's vote here.
    // Un-checking must NOT refund the ghost vote, since the first
    // nomination still genuinely holds their one vote for the day.
    await selectOption(
      user,
      screen.getByLabelText("Nominator"),
      dead.players[3].id,
    );
    await selectOption(
      user,
      screen.getByLabelText("Nominee"),
      dead.players[4].id,
    );
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);

    const ghostCheckboxOnSecond = screen.getByRole("checkbox", {
      name: `${ghost.name} (ghost vote — already spent)`,
    });
    await user.click(ghostCheckboxOnSecond);
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    // Now checked, the label drops "already spent" (that note only applies
    // to the not-yet-voted state) — uncheck via the plain label instead.
    await user.click(
      screen.getByRole("checkbox", { name: `${ghost.name} (ghost vote)` }),
    );
    rerender(<DayPhase game={latest} onChange={(next) => (latest = next)} />);
    // Locking in the second nomination — which no longer records the
    // ghost's vote — must not touch their already-spent state either.
    await user.click(screen.getByRole("button", { name: "Lock in votes" }));

    expect(latest.players.find((p) => p.id === ghost.id)?.ghostVoteSpent).toBe(
      true,
    );
    expect(latest.nominations[0].votes).toContain(ghost.id);
    expect(latest.nominations[1].votes).not.toContain(ghost.id);
  });
});

describe("Day phase: dead players in the nominator and nominee pickers", () => {
  it("advisory-labels a dead player in both pickers, without removing them", async () => {
    const user = userEvent.setup();
    const game = gameWith(["washerwoman", "imp", "recluse"]);
    const dead: GameDocument = {
      ...game,
      players: game.players.map((p, i) => (i === 0 ? { ...p, dead: true } : p)),
    };
    renderDayPhase(dead);

    const nominatorOptions = await getSelectOptions(
      user,
      screen.getByLabelText("Nominator"),
    );
    const nomineeOptions = await getSelectOptions(
      user,
      screen.getByLabelText("Nominee"),
    );
    expect(
      nominatorOptions.find((o) => o.value === dead.players[0].id)?.label,
    ).toContain("(dead)");
    expect(
      nomineeOptions.find((o) => o.value === dead.players[0].id)?.label,
    ).toContain("(dead)");
  });
});
