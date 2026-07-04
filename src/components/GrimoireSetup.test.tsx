import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { getCharacter } from "@/lib/characters";
import { createGame, type GameDocument } from "@/lib/gameDocument";
import { clearGames, loadGame } from "@/lib/gameStorage";

import { GrimoireSetup } from "./GrimoireSetup";

function makeGame(overrides: Partial<Parameters<typeof createGame>[0]> = {}) {
  return createGame({
    scriptId: "tb",
    scriptName: "Trouble Brewing",
    playerCount: 5,
    selectedCharacters: [
      getCharacter("washerwoman")!,
      getCharacter("imp")!,
    ],
    standIn: null,
    extraCopies: {},
    ...overrides,
  });
}

afterEach(() => {
  clearGames();
});

describe("seat list generated from player count", () => {
  it("shows one editable, named seat per player, in seat order", () => {
    const game = makeGame({ playerCount: 5 });
    render(<GrimoireSetup game={game} />);

    for (let seat = 1; seat <= 5; seat++) {
      expect(
        screen.getByLabelText(`Seat ${seat} name`),
      ).toHaveValue(`Player ${seat}`);
    }
  });

  it("lets the storyteller rename a seat at any time", async () => {
    const user = userEvent.setup();
    const game = makeGame({ playerCount: 5 });
    render(<GrimoireSetup game={game} />);

    const seat1Name = screen.getByLabelText("Seat 1 name");
    await user.clear(seat1Name);
    await user.type(seat1Name, "Alice");

    expect(seat1Name).toHaveValue("Alice");
  });
});

describe("bag draw: shuffle, confirm, reveal, hide & pass", () => {
  function twoSeatTwoCharacterGame() {
    return makeGame({ playerCount: 2 });
  }

  it("offers to start the bag draw while any seat is unassigned", () => {
    render(<GrimoireSetup game={twoSeatTwoCharacterGame()} />);

    expect(screen.getByText("0/2 seats assigned")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start bag draw" }),
    ).toBeInTheDocument();
  });

  it("walks a full draw: tap, confirm, private reveal, hide & pass, next seat", async () => {
    const user = userEvent.setup();
    const washerwoman = getCharacter("washerwoman")!;
    const imp = getCharacter("imp")!;
    render(<GrimoireSetup game={twoSeatTwoCharacterGame()} />);

    await user.click(screen.getByRole("button", { name: "Start bag draw" }));

    // Seat 1's turn: two face-down tokens, no identity visible in the draw
    // itself (a manual-assign dropdown for the *other* unassigned seat is
    // allowed to list names — that's storyteller-driven, not a blind draw).
    const drawRegion = screen.getByRole("region", { name: "Bag draw" });
    expect(screen.getByText(/Player 1.*tap a token/i)).toBeInTheDocument();
    let faceDownTokens = screen.getAllByRole("button", {
      name: /Face-down token/,
    });
    expect(faceDownTokens).toHaveLength(2);
    expect(within(drawRegion).queryByText(washerwoman.name)).not.toBeInTheDocument();
    expect(within(drawRegion).queryByText(imp.name)).not.toBeInTheDocument();

    await user.click(faceDownTokens[0]);

    // Deliberate confirm step before anything is revealed or committed.
    expect(screen.getByText("Keep this token?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep this token" }));

    // Full-screen private reveal: character name + ability.
    const firstDrawnName = [washerwoman.name, imp.name].find((name) =>
      screen.queryByRole("heading", { name }),
    );
    expect(firstDrawnName).toBeDefined();
    const firstDrawn = firstDrawnName === washerwoman.name ? washerwoman : imp;
    const secondDrawn = firstDrawn === washerwoman ? imp : washerwoman;
    expect(screen.getByText(firstDrawn.ability)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide & pass" }));

    // Privacy guard: the reveal is gone until the next player confirms.
    expect(screen.queryByText(firstDrawn.ability)).not.toBeInTheDocument();
    expect(screen.getByText(/Pass the device to Player 2/)).toBeInTheDocument();
    expect(loadGame()!.players[0].characterId).toBe(firstDrawn.id);
    expect(loadGame()!.bag).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Ready to draw" }));

    // Seat 2's turn: exactly one face-down token remains.
    expect(screen.getByText(/Player 2.*tap a token/i)).toBeInTheDocument();
    faceDownTokens = screen.getAllByRole("button", {
      name: /Face-down token/,
    });
    expect(faceDownTokens).toHaveLength(1);

    await user.click(faceDownTokens[0]);
    await user.click(screen.getByRole("button", { name: "Keep this token" }));

    expect(
      screen.getByRole("heading", { name: secondDrawn.name }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide & pass" }));

    // Draw session ends once every seat is assigned.
    expect(screen.getByText("2/2 seats assigned")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Start bag draw" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Face-down token/ }),
    ).not.toBeInTheDocument();

    const finalGame = loadGame()!;
    expect(finalGame.bag).toHaveLength(0);
    expect(finalGame.players[1].characterId).toBe(secondDrawn.id);
  });

  it("keeps every already-drawn seat's identity hidden while another seat is mid-draw", async () => {
    const user = userEvent.setup();
    const candidates = [
      getCharacter("washerwoman")!,
      getCharacter("imp")!,
      getCharacter("baron")!,
    ];
    const game = makeGame({ playerCount: 3, selectedCharacters: candidates });
    render(<GrimoireSetup game={game} />);

    await user.click(screen.getByRole("button", { name: "Start bag draw" }));
    await user.click(
      screen.getAllByRole("button", { name: /Face-down token/ })[0],
    );
    await user.click(screen.getByRole("button", { name: "Keep this token" }));

    // Capture whichever character seat 1 actually drew.
    const seat1Character = candidates.find((c) =>
      screen.queryByRole("heading", { name: c.name }),
    )!;
    expect(seat1Character).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Hide & pass" }));
    await user.click(screen.getByRole("button", { name: "Ready to draw" }));

    // Seat 1 is fully drawn and revealed by now — but seat 2 is mid-draw,
    // holding the device, so seat 1's identity must not leak anywhere on
    // the screen (not just inside the draw region).
    expect(screen.queryByText(seat1Character.name)).not.toBeInTheDocument();
  });

  it("obscures the whole setup screen — not just the draw region — while a card is hidden mid-pass", async () => {
    const user = userEvent.setup();
    const game = makeGame({
      playerCount: 3,
      selectedCharacters: [
        getCharacter("washerwoman")!,
        getCharacter("imp")!,
        getCharacter("baron")!,
        getCharacter("scapegoat")!,
      ],
    });
    render(<GrimoireSetup game={game} />);

    await user.click(screen.getByRole("button", { name: "Start bag draw" }));
    await user.click(
      screen.getAllByRole("button", { name: /Face-down token/ })[0],
    );
    await user.click(screen.getByRole("button", { name: "Keep this token" }));
    await user.click(screen.getByRole("button", { name: "Hide & pass" }));

    // Mid pass-around: the privacy message is up, and nothing else on the
    // setup screen — seat names, manual-assign dropdowns (which would list
    // the remaining bag characters by name), or the traveller control —
    // should render alongside it.
    expect(
      screen.getByText(/Card hidden\. Pass the device to/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Seat \d name/)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Assign seat \d manually/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add traveller" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ready to draw" }));

    // Once the next player has confirmed, the setup screen is back.
    expect(screen.getByLabelText("Seat 1 name")).toBeInTheDocument();
  });

  it("recovers gracefully if the pending token gets manually assigned to another seat first", async () => {
    const user = userEvent.setup();
    // A single official token so seat 2's manual-assign dropdown and seat
    // 1's pending draw are racing over the exact same token.
    const game = makeGame({
      playerCount: 2,
      selectedCharacters: [getCharacter("washerwoman")!],
    });
    render(<GrimoireSetup game={game} />);

    await user.click(screen.getByRole("button", { name: "Start bag draw" }));
    await user.click(
      screen.getAllByRole("button", { name: /Face-down token/ })[0],
    );
    expect(screen.getByText("Keep this token?")).toBeInTheDocument();

    // Before confirming, the storyteller manually grabs the same (only)
    // token for the other seat instead.
    await user.selectOptions(
      screen.getByLabelText("Assign seat 2 manually"),
      "Washerwoman",
    );

    // Confirming a token that's since vanished must not leave the dialog
    // stuck — it falls back to choosing from whatever's left.
    await user.click(screen.getByRole("button", { name: "Keep this token" }));

    expect(screen.queryByText("Keep this token?")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Keep this token" }),
    ).not.toBeInTheDocument();

    const reloaded = loadGame()!;
    expect(reloaded.players[0].characterId).toBeNull();
    expect(reloaded.players[1].characterId).toBe("washerwoman");
    expect(reloaded.bag).toHaveLength(0);
  });

  it("lets the storyteller choose again before committing to a token", async () => {
    const user = userEvent.setup();
    render(<GrimoireSetup game={twoSeatTwoCharacterGame()} />);

    await user.click(screen.getByRole("button", { name: "Start bag draw" }));
    await user.click(
      screen.getAllByRole("button", { name: /Face-down token/ })[0],
    );
    await user.click(screen.getByRole("button", { name: "Choose again" }));

    // Nothing was committed: still 2 undrawn tokens, no seat assigned.
    expect(
      screen.getAllByRole("button", { name: /Face-down token/ }),
    ).toHaveLength(2);
    expect(loadGame()).toBeNull();
  });
});

describe("manual assignment mode (mixable with draw)", () => {
  it("assigns any seat directly from the bag, skipping the reveal entirely", async () => {
    const user = userEvent.setup();
    const game = makeGame({ playerCount: 2 });
    render(<GrimoireSetup game={game} />);

    await user.selectOptions(
      screen.getByLabelText("Assign seat 2 manually"),
      "Imp",
    );

    expect(
      screen.queryByRole("region", { name: "Bag draw" }),
    ).not.toBeInTheDocument();
    const seat2 = screen.getByLabelText("Seat 2 name").closest("li")!;
    expect(within(seat2).getByText("Imp")).toBeInTheDocument();

    const reloaded = loadGame()!;
    expect(reloaded.players[1].characterId).toBe("imp");
    expect(reloaded.bag.map((t) => t.characterId)).toEqual(["washerwoman"]);
  });

  it("no longer offers an already-assigned seat for manual assignment", async () => {
    const user = userEvent.setup();
    render(<GrimoireSetup game={makeGame({ playerCount: 2 })} />);

    await user.selectOptions(
      screen.getByLabelText("Assign seat 2 manually"),
      "Imp",
    );

    expect(
      screen.queryByLabelText("Assign seat 2 manually"),
    ).not.toBeInTheDocument();
  });

  it("mixes manual assignment and bag draw freely across seats", async () => {
    const user = userEvent.setup();
    const game = makeGame({
      playerCount: 3,
      selectedCharacters: [
        getCharacter("washerwoman")!,
        getCharacter("imp")!,
        getCharacter("baron")!,
      ],
    });
    render(<GrimoireSetup game={game} />);

    // Manually assign the middle seat before touching the draw at all.
    await user.selectOptions(
      screen.getByLabelText("Assign seat 2 manually"),
      "Baron",
    );

    // The draw flow still targets the lowest unassigned seat (seat 1).
    await user.click(screen.getByRole("button", { name: "Start bag draw" }));
    expect(screen.getByText(/Player 1.*tap a token/i)).toBeInTheDocument();
    await user.click(
      screen.getAllByRole("button", { name: /Face-down token/ })[0],
    );
    await user.click(screen.getByRole("button", { name: "Keep this token" }));
    await user.click(screen.getByRole("button", { name: "Hide & pass" }));
    await user.click(screen.getByRole("button", { name: "Ready to draw" }));

    // Seat 3 is the only one left — finish it manually instead of drawing.
    const remainingOption = within(
      screen.getByLabelText("Assign seat 3 manually"),
    )
      .getAllByRole("option")
      .find((option) => option.textContent !== "Choose a character…")!;
    await user.selectOptions(
      screen.getByLabelText("Assign seat 3 manually"),
      remainingOption.textContent!,
    );

    expect(screen.getByText("3/3 seats assigned")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Start bag draw" }),
    ).not.toBeInTheDocument();

    const finalGame = loadGame()!;
    expect(finalGame.bag).toHaveLength(0);
    expect(finalGame.players.map((p) => p.characterId).sort()).toEqual([
      "baron",
      "imp",
      "washerwoman",
    ]);
  });
});

describe("travellers addable at setup with alignment", () => {
  function gameWithTraveller() {
    return makeGame({
      playerCount: 2,
      selectedCharacters: [
        getCharacter("washerwoman")!,
        getCharacter("imp")!,
        getCharacter("scapegoat")!,
      ],
    });
  }

  it("offers to add a traveller while the traveller bag has tokens", () => {
    render(<GrimoireSetup game={gameWithTraveller()} />);

    expect(
      screen.getByRole("button", { name: "Add traveller" }),
    ).toBeInTheDocument();
  });

  it("hides the action once every traveller token has been added", () => {
    const game = makeGame({ playerCount: 2 });
    render(<GrimoireSetup game={game} />);

    expect(
      screen.queryByRole("button", { name: "Add traveller" }),
    ).not.toBeInTheDocument();
  });

  it("appends a new seat with the chosen character and alignment, without touching the official target counts", async () => {
    const user = userEvent.setup();
    render(<GrimoireSetup game={gameWithTraveller()} />);

    // The official 2 seats start out unassigned; adding a traveller must not
    // change that count (travellers don't come from the official bag).
    expect(screen.getByText("0/2 seats assigned")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add traveller" }));
    await user.selectOptions(
      screen.getByLabelText("Traveller character"),
      "Scapegoat",
    );
    await user.click(screen.getByLabelText("Evil"));
    await user.click(screen.getByRole("button", { name: "Add to the circle" }));

    expect(screen.getByText("0/2 seats assigned")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add traveller" }),
    ).not.toBeInTheDocument();

    const seat3 = screen.getByLabelText("Seat 3 name").closest("li")!;
    expect(within(seat3).getByText("Scapegoat")).toBeInTheDocument();
    expect(within(seat3).getByText(/evil/i)).toBeInTheDocument();

    const reloaded = loadGame()!;
    expect(reloaded.players).toHaveLength(3);
    const traveller = reloaded.players[2];
    expect(traveller.isTraveller).toBe(true);
    expect(traveller.characterId).toBe("scapegoat");
    expect(traveller.travellerAlignment).toBe("evil");
    expect(reloaded.travellerBag).toHaveLength(0);
  });
});

describe("Drunk seat display (stand-in identity + actually the Drunk)", () => {
  it("shows both the stand-in identity and that they're actually the Drunk", async () => {
    const user = userEvent.setup();
    const washerwoman = getCharacter("washerwoman")!;
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 1,
      selectedCharacters: [getCharacter("drunk")!],
      standIn: washerwoman,
      extraCopies: {},
    });
    render(<GrimoireSetup game={game} />);

    await user.selectOptions(
      screen.getByLabelText("Assign seat 1 manually"),
      "Washerwoman",
    );

    // A single seat, now fully assigned, renders as the completed circle.
    const circle = screen.getByRole("region", { name: "Grimoire circle" });
    expect(within(circle).getByText("Washerwoman")).toBeInTheDocument();
    expect(within(circle).getByText(/actually the Drunk/i)).toBeInTheDocument();

    expect(loadGame()!.players[0].isDrunk).toBe(true);
  });

  it("doesn't show the Drunk note for a seat that really is the stand-in character", async () => {
    const user = userEvent.setup();
    render(<GrimoireSetup game={makeGame({ playerCount: 2 })} />);

    await user.selectOptions(
      screen.getByLabelText("Assign seat 1 manually"),
      "Washerwoman",
    );

    const seat1 = screen.getByLabelText("Seat 1 name").closest("li")!;
    expect(
      within(seat1).queryByText(/actually the Drunk/i),
    ).not.toBeInTheDocument();
  });
});

describe("the first visible grimoire (issue #12)", () => {
  it("keeps showing the setup view while any seat is unassigned", () => {
    render(<GrimoireSetup game={makeGame({ playerCount: 2 })} />);

    expect(
      screen.queryByRole("region", { name: "Grimoire circle" }),
    ).not.toBeInTheDocument();
  });

  it("renders every seat as a token in a circle, labelled with the player's name, once setup completes", async () => {
    const user = userEvent.setup();
    render(<GrimoireSetup game={makeGame({ playerCount: 2 })} />);

    await user.selectOptions(
      screen.getByLabelText("Assign seat 1 manually"),
      "Washerwoman",
    );
    await user.selectOptions(
      screen.getByLabelText("Assign seat 2 manually"),
      "Imp",
    );

    const circle = screen.getByRole("region", { name: "Grimoire circle" });
    expect(within(circle).getByText("Player 1")).toBeInTheDocument();
    expect(within(circle).getByText("Player 2")).toBeInTheDocument();
    expect(within(circle).getByText("Washerwoman")).toBeInTheDocument();
    expect(within(circle).getByText("Imp")).toBeInTheDocument();
    // The setup controls (draw/manual-assign) are gone — there's nothing
    // left to assign.
    expect(
      screen.queryByRole("button", { name: "Start bag draw" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Assign seat 1 manually"),
    ).not.toBeInTheDocument();
  });

  it("still lets the storyteller rename a seat from the completed circle", async () => {
    const user = userEvent.setup();
    render(<GrimoireSetup game={makeGame({ playerCount: 2 })} />);

    await user.selectOptions(
      screen.getByLabelText("Assign seat 1 manually"),
      "Washerwoman",
    );
    await user.selectOptions(
      screen.getByLabelText("Assign seat 2 manually"),
      "Imp",
    );

    const circle = screen.getByRole("region", { name: "Grimoire circle" });
    // Renaming from the completed grimoire now happens from the token's
    // menu (issue #13's living board), not an always-visible input.
    const seat1Token = within(circle).getByText("Player 1").closest("div")!;
    await user.click(within(circle).getByText("Player 1"));
    const seat1Name = within(seat1Token).getByLabelText(/player name/i);
    await user.clear(seat1Name);
    await user.type(seat1Name, "Alice");

    expect(loadGame()!.players[0].name).toBe("Alice");
  });
});

describe("autosave (issue #12)", () => {
  it("persists a name change to the game document on every keystroke", async () => {
    const user = userEvent.setup();
    const game = makeGame({ playerCount: 5 });
    render(<GrimoireSetup game={game} />);

    const seat1Name = screen.getByLabelText("Seat 1 name");
    await user.clear(seat1Name);
    await user.type(seat1Name, "Alice");

    const reloaded = loadGame() as GameDocument;
    expect(reloaded.players[0].name).toBe("Alice");
  });

  it("leaves every other seat untouched when one is renamed", async () => {
    const user = userEvent.setup();
    const game = makeGame({ playerCount: 3 });
    render(<GrimoireSetup game={game} />);

    await user.clear(screen.getByLabelText("Seat 2 name"));
    await user.type(screen.getByLabelText("Seat 2 name"), "Bob");

    const reloaded = loadGame() as GameDocument;
    expect(reloaded.players.map((p) => p.name)).toEqual([
      "Player 1",
      "Bob",
      "Player 3",
    ]);
  });
});

describe("end game and export (issue #21)", () => {
  it("keeps export reachable while a game is still in progress", () => {
    render(<GrimoireSetup game={makeGame({ playerCount: 5 })} />);

    expect(
      screen.getByRole("button", { name: /export game/i }),
    ).toBeInTheDocument();
  });

  it("persists a declared winner to the game document", async () => {
    const user = userEvent.setup();
    render(<GrimoireSetup game={makeGame({ playerCount: 5 })} />);

    await user.click(screen.getByRole("button", { name: /evil wins/i }));

    const reloaded = loadGame() as GameDocument;
    expect(reloaded.winner).toBe("evil");
    expect(reloaded.endedAt).toBeTruthy();
  });
});

describe("reminder tokens (issue #14)", () => {
  async function completedBoard(user: ReturnType<typeof userEvent.setup>) {
    render(<GrimoireSetup game={makeGame({ playerCount: 2 })} />);
    await user.selectOptions(
      screen.getByLabelText("Assign seat 1 manually"),
      "Washerwoman",
    );
    await user.selectOptions(
      screen.getByLabelText("Assign seat 2 manually"),
      "Imp",
    );
    return screen.getByRole("region", { name: "Grimoire circle" });
  }

  it("adds a reminder from the pad and persists it to the game document", async () => {
    const user = userEvent.setup();
    const circle = await completedBoard(user);

    const padControls = circle.querySelector("[data-controls]") as HTMLElement;
    await user.click(within(padControls).getByRole("button", { name: "Add reminder" }));
    const dialog = within(circle).getByRole("dialog", { name: "Add reminder" });
    const group = within(dialog).getByRole("group", { name: "Washerwoman" });
    await user.click(within(group).getByRole("button", { name: "Townsfolk" }));

    const reloaded = loadGame() as GameDocument;
    expect(reloaded.reminders).toHaveLength(1);
    expect(reloaded.reminders[0]).toMatchObject({
      characterId: "washerwoman",
      label: "Townsfolk",
    });
  });

  it("removes a reminder and persists the removal; undo restores it", async () => {
    const user = userEvent.setup();
    const circle = await completedBoard(user);

    const padControls = circle.querySelector("[data-controls]") as HTMLElement;
    await user.click(within(padControls).getByRole("button", { name: "Add reminder" }));
    const dialog = within(circle).getByRole("dialog", { name: "Add reminder" });
    const group = within(dialog).getByRole("group", { name: "Washerwoman" });
    await user.click(within(group).getByRole("button", { name: "Townsfolk" }));

    await user.click(within(circle).getByText("Townsfolk"));
    await user.click(within(circle).getByRole("button", { name: "Remove reminder" }));
    expect((loadGame() as GameDocument).reminders).toHaveLength(0);

    await user.click(within(circle).getByRole("button", { name: /undo/i }));
    expect((loadGame() as GameDocument).reminders).toHaveLength(1);
  });
});

describe("post-draw setup walkthrough (issue #26)", () => {
  async function completedFortuneTellerBoard(user: ReturnType<typeof userEvent.setup>) {
    const game = makeGame({
      playerCount: 3,
      selectedCharacters: [
        getCharacter("fortuneteller")!,
        getCharacter("imp")!,
        getCharacter("chef")!,
      ],
    });
    render(<GrimoireSetup game={game} />);
    await user.selectOptions(
      screen.getByLabelText("Assign seat 1 manually"),
      "Fortune Teller",
    );
    await user.selectOptions(
      screen.getByLabelText("Assign seat 2 manually"),
      "Imp",
    );
    await user.selectOptions(
      screen.getByLabelText("Assign seat 3 manually"),
      "Chef",
    );
  }

  it("offers the walkthrough automatically once a decision is needed", async () => {
    const user = userEvent.setup();
    await completedFortuneTellerBoard(user);

    expect(
      screen.getByRole("region", { name: "Setup walkthrough offer" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Grimoire circle" }),
    ).toBeInTheDocument();
  });

  it("never offers the walkthrough when no in-play character needs one", async () => {
    const user = userEvent.setup();
    const game = makeGame({
      playerCount: 2,
      selectedCharacters: [getCharacter("imp")!, getCharacter("chef")!],
    });
    render(<GrimoireSetup game={game} />);
    await user.selectOptions(
      screen.getByLabelText("Assign seat 1 manually"),
      "Imp",
    );
    await user.selectOptions(
      screen.getByLabelText("Assign seat 2 manually"),
      "Chef",
    );

    expect(
      screen.queryByRole("region", { name: "Setup walkthrough offer" }),
    ).not.toBeInTheDocument();
  });

  it("declining the offer is one tap and doesn't show it again", async () => {
    const user = userEvent.setup();
    await completedFortuneTellerBoard(user);

    await user.click(screen.getByRole("button", { name: /skip/i }));

    expect(
      screen.queryByRole("region", { name: "Setup walkthrough offer" }),
    ).not.toBeInTheDocument();
    expect((loadGame() as GameDocument).setupWalkthroughOffered).toBe(true);
  });

  it("starting the walkthrough replaces the grimoire view with it", async () => {
    const user = userEvent.setup();
    await completedFortuneTellerBoard(user);

    await user.click(screen.getByRole("button", { name: /start walkthrough/i }));

    expect(
      screen.getByRole("dialog", { name: "Setup walkthrough" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Grimoire circle" }),
    ).not.toBeInTheDocument();
  });

  it("resolving the Fortune Teller step places the red herring reminder and persists progress", async () => {
    const user = userEvent.setup();
    await completedFortuneTellerBoard(user);
    await user.click(screen.getByRole("button", { name: /start walkthrough/i }));

    const dialog = screen.getByRole("dialog", { name: "Setup walkthrough" });
    const step = within(dialog).getByRole("group", {
      name: /fortune teller/i,
    });
    await user.selectOptions(within(step).getByLabelText("Player"), "Player 3");
    await user.click(within(step).getByRole("button", { name: /confirm/i }));

    const reloaded = loadGame() as GameDocument;
    expect(reloaded.reminders).toContainEqual(
      expect.objectContaining({ characterId: "fortuneteller", label: "Red herring" }),
    );
    const fortuneTellerPlayer = reloaded.players.find(
      (p) => p.characterId === "fortuneteller",
    )!;
    expect(reloaded.setupWalkthroughSteps[fortuneTellerPlayer.id]).toBe("answered");
  });

  it("reopens from the grimoire board, still showing a resolved step", async () => {
    const user = userEvent.setup();
    await completedFortuneTellerBoard(user);
    await user.click(screen.getByRole("button", { name: /start walkthrough/i }));

    const dialog = screen.getByRole("dialog", { name: "Setup walkthrough" });
    const step = within(dialog).getByRole("group", { name: /fortune teller/i });
    await user.selectOptions(within(step).getByLabelText("Player"), "Player 3");
    await user.click(within(step).getByRole("button", { name: /confirm/i }));
    await user.click(within(dialog).getByRole("button", { name: /close/i }));

    expect(
      screen.queryByRole("dialog", { name: "Setup walkthrough" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /setup walkthrough/i }),
    );

    const reopened = screen.getByRole("dialog", { name: "Setup walkthrough" });
    const reopenedStep = within(reopened).getByRole("group", {
      name: /fortune teller/i,
    });
    expect(within(reopenedStep).getByText(/answered/i)).toBeInTheDocument();
  });

  it("persists both reminders from a characterAndTwoPlayers step in one Confirm (code review: stale-closure clobber)", async () => {
    const user = userEvent.setup();
    const game = makeGame({
      playerCount: 3,
      selectedCharacters: [
        getCharacter("washerwoman")!,
        getCharacter("imp")!,
        getCharacter("chef")!,
      ],
    });
    render(<GrimoireSetup game={game} />);
    await user.selectOptions(
      screen.getByLabelText("Assign seat 1 manually"),
      "Washerwoman",
    );
    await user.selectOptions(
      screen.getByLabelText("Assign seat 2 manually"),
      "Imp",
    );
    await user.selectOptions(
      screen.getByLabelText("Assign seat 3 manually"),
      "Chef",
    );
    await user.click(screen.getByRole("button", { name: /start walkthrough/i }));

    const dialog = screen.getByRole("dialog", { name: "Setup walkthrough" });
    const step = within(dialog).getByRole("group", { name: /washerwoman/i });
    await user.selectOptions(within(step).getByLabelText("Character"), "Chef");
    await user.selectOptions(
      within(step).getByLabelText(/shown as townsfolk/i),
      "Player 2",
    );
    await user.selectOptions(
      within(step).getByLabelText(/shown as wrong/i),
      "Player 3",
    );
    await user.click(within(step).getByRole("button", { name: /confirm/i }));

    const reloaded = loadGame() as GameDocument;
    expect(reloaded.reminders).toHaveLength(2);
    expect(reloaded.reminders).toContainEqual(
      expect.objectContaining({ characterId: "washerwoman", label: "Townsfolk (Chef)" }),
    );
    expect(reloaded.reminders).toContainEqual(
      expect.objectContaining({ characterId: "washerwoman", label: "Wrong (Chef)" }),
    );
    const washerwomanPlayer = reloaded.players.find(
      (p) => p.characterId === "washerwoman",
    )!;
    expect(reloaded.setupWalkthroughSteps[washerwomanPlayer.id]).toBe("answered");
  });

  it("Redo replaces the previous answer's reminder instead of leaving a stale duplicate (code review finding)", async () => {
    const user = userEvent.setup();
    await completedFortuneTellerBoard(user);
    await user.click(screen.getByRole("button", { name: /start walkthrough/i }));

    const dialog = screen.getByRole("dialog", { name: "Setup walkthrough" });
    const step = within(dialog).getByRole("group", { name: /fortune teller/i });
    await user.selectOptions(within(step).getByLabelText("Player"), "Player 3");
    await user.click(within(step).getByRole("button", { name: /confirm/i }));
    const firstPosition = (loadGame() as GameDocument).reminders.find(
      (r) => r.label === "Red herring",
    )!.position;

    await user.click(within(step).getByRole("button", { name: /redo/i }));
    await user.selectOptions(within(step).getByLabelText("Player"), "Player 2");
    await user.click(within(step).getByRole("button", { name: /confirm/i }));

    const reloaded = loadGame() as GameDocument;
    const redHerrings = reloaded.reminders.filter((r) => r.label === "Red herring");
    expect(redHerrings).toHaveLength(1);
    // Re-answering for a different player actually moved the token, proving
    // the second Confirm didn't just add another copy at the same spot.
    expect(redHerrings[0].position).not.toEqual(firstPosition);
  });

  it("keeps the privacy 'Hide grimoire' toggle across opening and closing the walkthrough (code review finding)", async () => {
    const user = userEvent.setup();
    await completedFortuneTellerBoard(user);

    const circle = screen.getByRole("region", { name: "Grimoire circle" });
    await user.click(within(circle).getByRole("button", { name: /hide grimoire/i }));
    expect(within(circle).getByRole("button", { name: /show grimoire/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /start walkthrough/i }));
    await user.click(screen.getByRole("button", { name: /close/i }));

    const circleAfter = screen.getByRole("region", { name: "Grimoire circle" });
    expect(
      within(circleAfter).getByRole("button", { name: /show grimoire/i }),
    ).toBeInTheDocument();
  });

  it("keeps an in-flight 'undo remove reminder' window across opening and closing the walkthrough (code review finding)", async () => {
    const user = userEvent.setup();
    await completedFortuneTellerBoard(user);
    await user.click(screen.getByRole("button", { name: /start walkthrough/i }));

    const dialog = screen.getByRole("dialog", { name: "Setup walkthrough" });
    const step = within(dialog).getByRole("group", { name: /fortune teller/i });
    await user.selectOptions(within(step).getByLabelText("Player"), "Player 3");
    await user.click(within(step).getByRole("button", { name: /confirm/i }));
    await user.click(screen.getByRole("button", { name: /close/i }));

    const circle = screen.getByRole("region", { name: "Grimoire circle" });
    await user.click(within(circle).getByText("Red herring"));
    await user.click(within(circle).getByRole("button", { name: "Remove reminder" }));
    expect((loadGame() as GameDocument).reminders).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: /setup walkthrough/i }));
    await user.click(screen.getByRole("button", { name: /close/i }));

    const circleAfter = screen.getByRole("region", { name: "Grimoire circle" });
    await user.click(within(circleAfter).getByRole("button", { name: /undo/i }));
    expect((loadGame() as GameDocument).reminders).toHaveLength(1);
  });
});
