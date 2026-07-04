import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { getCharacter } from "@/lib/characters";
import { createGame, type GameDocument } from "@/lib/gameDocument";
import { clearGame, loadGame } from "@/lib/gameStorage";

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
  clearGame();
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
    expect(within(circle).getByDisplayValue("Player 1")).toBeInTheDocument();
    expect(within(circle).getByDisplayValue("Player 2")).toBeInTheDocument();
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
    const seat1Name = within(circle).getByDisplayValue("Player 1");
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
