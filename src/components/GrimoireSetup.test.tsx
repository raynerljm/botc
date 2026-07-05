import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCharacter } from "@/lib/characters";
import { createGame, type GameDocument } from "@/lib/gameDocument";
import { clearGames, loadGame } from "@/lib/gameStorage";

import { GrimoireSetup } from "./GrimoireSetup";

const routerBack = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: routerBack }),
}));

// jsdom has no real PointerEvent constructor, so a plain MouseEvent stands in
// with pointerId grafted on (same helper as GrimoireBoard.test.tsx's own).
function pointerEvent(
  type: string,
  init: { pointerId: number; clientX: number; clientY: number },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX: init.clientX,
    clientY: init.clientY,
  });
  Object.defineProperty(event, "pointerId", { value: init.pointerId });
  return event;
}

beforeEach(() => {
  routerBack.mockClear();
});

// Setup-walkthrough player options now carry "Name — Role" (issue #56); select
// by the name prefix so tests don't hardcode the exact role suffix. The \b
// boundary (rather than plain startsWith) is what keeps "Player 1" from
// also matching "Player 10" — escaping first is what keeps a name with
// regex-special characters from building a broken pattern (code review
// finding).
function selectPlayerNamed(select: HTMLElement, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return within(select).getByRole("option", {
    name: new RegExp(`^${escaped}\\b`),
  });
}

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

// Reaches setupComplete by manually assigning every seat — shared by any
// test that needs the mid-game (post-setup) side of GrimoireSetup.
async function completeSetup(
  playerCount = 2,
  selectedCharacters = [getCharacter("washerwoman")!, getCharacter("imp")!],
) {
  const user = userEvent.setup();
  const game = makeGame({ playerCount, selectedCharacters });
  render(<GrimoireSetup game={game} />);

  for (let seat = 1; seat <= playerCount; seat++) {
    const remainingOption = within(
      screen.getByLabelText(`Assign seat ${seat} manually`),
    )
      .getAllByRole("option")
      .find((option) => option.textContent !== "Choose a character…")!;
    await user.selectOptions(
      screen.getByLabelText(`Assign seat ${seat} manually`),
      remainingOption.textContent!,
    );
  }

  const circle = screen.getByRole("region", { name: "Grimoire circle" });
  return { user, circle };
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

describe("bag draw: shuffle, immediate reveal, hide & pass", () => {
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

  it("walks a full draw: tap, immediate private reveal, hide & pass, next seat", async () => {
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

    // No intermediate "keep this token?" step — tapping goes straight to a
    // full-screen private reveal: character name + ability.
    expect(screen.queryByText("Keep this token?")).not.toBeInTheDocument();
    const firstDrawnName = [washerwoman.name, imp.name].find((name) =>
      screen.queryByRole("heading", { name }),
    );
    expect(firstDrawnName).toBeDefined();
    const firstDrawn = firstDrawnName === washerwoman.name ? washerwoman : imp;
    const secondDrawn = firstDrawn === washerwoman ? imp : washerwoman;
    expect(screen.getByText(firstDrawn.ability)).toBeInTheDocument();
    expect(loadGame()!.players[0].characterId).toBe(firstDrawn.id);
    expect(loadGame()!.bag).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Hide & pass" }));

    // Privacy guard: the reveal is gone until the next player confirms.
    expect(screen.queryByText(firstDrawn.ability)).not.toBeInTheDocument();
    expect(screen.getByText(/Pass the device to Player 2/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ready to draw" }));

    // Seat 2's turn: exactly one face-down token remains.
    expect(screen.getByText(/Player 2.*tap a token/i)).toBeInTheDocument();
    faceDownTokens = screen.getAllByRole("button", {
      name: /Face-down token/,
    });
    expect(faceDownTokens).toHaveLength(1);

    await user.click(faceDownTokens[0]);

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

  it("obscures the whole setup screen — not just the draw region — while the character reveal is showing", async () => {
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

    // The reveal itself is full-screen: nothing else on the setup screen —
    // seat names, manual-assign dropdowns (which would list the remaining
    // bag characters by name), or the traveller control — should render
    // alongside it, exactly like the privacy guard after Hide & pass.
    expect(screen.queryByLabelText(/Seat \d name/)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Assign seat \d manually/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add traveller" }),
    ).not.toBeInTheDocument();

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

  it("ignores a tap on a token that's since been manually assigned to another seat", async () => {
    const user = userEvent.setup();
    // A single official token so seat 2's manual-assign dropdown and seat
    // 1's face-down token are racing over the exact same token.
    const game = makeGame({
      playerCount: 2,
      selectedCharacters: [getCharacter("washerwoman")!],
    });
    render(<GrimoireSetup game={game} />);

    await user.click(screen.getByRole("button", { name: "Start bag draw" }));
    const faceDownToken = screen.getAllByRole("button", {
      name: /Face-down token/,
    })[0];

    // Before tapping, the storyteller manually grabs the same (only) token
    // for the other seat instead — the face-down button on screen is now
    // stale.
    await user.selectOptions(
      screen.getByLabelText("Assign seat 2 manually"),
      "Washerwoman",
    );

    // Tapping the now-stale token must not double-assign it or crash —
    // it's simply ignored, and the grid resyncs to what's actually left
    // (zero tokens) instead of leaving the stale button on screen forever.
    await user.click(faceDownToken);

    expect(screen.queryByRole("heading", { name: "Washerwoman" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Face-down token/ }),
    ).not.toBeInTheDocument();

    const reloaded = loadGame()!;
    expect(reloaded.players[0].characterId).toBeNull();
    expect(reloaded.players[1].characterId).toBe("washerwoman");
    expect(reloaded.bag).toHaveLength(0);
  });

  it("keeps the grimoire board and end-game controls hidden behind the reveal when the very last seat is drawn", async () => {
    const user = userEvent.setup();
    render(<GrimoireSetup game={twoSeatTwoCharacterGame()} />);

    // Seat 1 first, out of the way.
    await user.click(screen.getByRole("button", { name: "Start bag draw" }));
    await user.click(
      screen.getAllByRole("button", { name: /Face-down token/ })[0],
    );
    await user.click(screen.getByRole("button", { name: "Hide & pass" }));
    await user.click(screen.getByRole("button", { name: "Ready to draw" }));

    // Seat 2 is the last unassigned seat — drawing it flips setupComplete
    // true in the same tick the reveal appears, so the grimoire board must
    // stay hidden behind the reveal rather than mounting alongside it.
    await user.click(
      screen.getAllByRole("button", { name: /Face-down token/ })[0],
    );

    expect(
      screen.queryByRole("region", { name: "Grimoire circle" }),
    ).not.toBeInTheDocument();
    // Export/end-game stay reachable even here (issue #21 AC) — only the
    // board/bluffs/claims (which would show every player's identity) hide.
    expect(
      screen.getByRole("button", { name: "Export game" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide & pass" }));

    // Draw session is over — the board is back.
    expect(
      screen.getByRole("region", { name: "Grimoire circle" }),
    ).toBeInTheDocument();
  });

  it("keeps export and end-game controls reachable through a private reveal (issue #21 AC), hiding them only during the pass-around itself", async () => {
    const user = userEvent.setup();
    render(<GrimoireSetup game={twoSeatTwoCharacterGame()} />);

    await user.click(screen.getByRole("button", { name: "Start bag draw" }));
    await user.click(
      screen.getAllByRole("button", { name: /Face-down token/ })[0],
    );

    // Reveal is up, but this isn't the last seat — export/end-game stay
    // reachable through it.
    expect(
      screen.getByRole("button", { name: "Export game" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide & pass" }));

    // Mid pass-around: now they're hidden, same as before this change.
    expect(
      screen.queryByRole("button", { name: "Export game" }),
    ).not.toBeInTheDocument();
  });
});

describe("naming the drawn seat's player (issue #54)", () => {
  it("saves a name picked from the regular players list as the drawn seat's player name", async () => {
    const user = userEvent.setup();
    const game = makeGame({ playerCount: 2 });
    render(<GrimoireSetup game={game} />);

    await user.click(screen.getByRole("button", { name: "Start bag draw" }));
    await user.click(screen.getAllByRole("button", { name: /Face-down token/ })[0]);

    await user.click(screen.getByRole("button", { name: "Bailey" }));

    expect(loadGame()!.players[0].name).toBe("Bailey");
  });

  it("saves a typed custom name as the drawn seat's player name when they aren't in the list", async () => {
    const user = userEvent.setup();
    const game = makeGame({ playerCount: 2 });
    render(<GrimoireSetup game={game} />);

    await user.click(screen.getByRole("button", { name: "Start bag draw" }));
    await user.click(screen.getAllByRole("button", { name: /Face-down token/ })[0]);

    await user.type(screen.getByLabelText(/custom player name/i), "Substitute Sam");
    await user.click(screen.getByRole("button", { name: /use this name/i }));

    expect(loadGame()!.players[0].name).toBe("Substitute Sam");
  });

  it("offers the name picker only once a token has been revealed, not while still choosing", async () => {
    const user = userEvent.setup();
    const game = makeGame({ playerCount: 2 });
    render(<GrimoireSetup game={game} />);

    await user.click(screen.getByRole("button", { name: "Start bag draw" }));

    expect(screen.queryByRole("button", { name: /use this name/i })).not.toBeInTheDocument();
  });

  it("hides the drawn seat's plain name field while its reveal is on-screen, so only the picker edits it (code review finding)", async () => {
    const user = userEvent.setup();
    const game = makeGame({ playerCount: 2 });
    render(<GrimoireSetup game={game} />);

    await user.click(screen.getByRole("button", { name: "Start bag draw" }));
    await user.click(screen.getAllByRole("button", { name: /Face-down token/ })[0]);

    expect(screen.queryByLabelText("Seat 1 name")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide & pass" }));
    await user.click(screen.getByRole("button", { name: "Ready to draw" }));

    // Once the reveal is dismissed, the plain field is back for later edits.
    expect(screen.getByLabelText("Seat 1 name")).toHaveValue("Player 1");
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

  it("joins the circle at a chosen seat position rather than always the end", async () => {
    const user = userEvent.setup();
    render(<GrimoireSetup game={gameWithTraveller()} />);

    await user.click(screen.getByRole("button", { name: "Add traveller" }));
    await user.selectOptions(
      screen.getByLabelText("Traveller character"),
      "Scapegoat",
    );
    await user.selectOptions(
      screen.getByLabelText("Seat position"),
      "Before Player 1",
    );
    await user.click(screen.getByRole("button", { name: "Add to the circle" }));

    const reloaded = loadGame()!;
    const traveller = reloaded.players.find((p) => p.isTraveller)!;
    expect(traveller.seat).toBe(1);
    // Both official seats shifted later to make room.
    expect(reloaded.players.filter((p) => !p.isTraveller).map((p) => p.seat).sort()).toEqual([2, 3]);
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
    const summary = circle.querySelector("details > summary") as HTMLElement;
    expect(within(summary).getByText("Washerwoman")).toBeInTheDocument();
    expect(within(summary).getByText(/actually the Drunk/i)).toBeInTheDocument();

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

describe("reassigning the Drunk's stand-in from the setup walkthrough (issue #52)", () => {
  async function drunkBoard(user: ReturnType<typeof userEvent.setup>) {
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 2,
      selectedCharacters: [
        getCharacter("drunk")!,
        getCharacter("chef")!,
        getCharacter("grandmother")!,
      ],
      standIn: getCharacter("washerwoman")!,
      extraCopies: {},
    });
    render(<GrimoireSetup game={game} />);

    await user.selectOptions(
      screen.getByLabelText("Assign seat 1 manually"),
      "Washerwoman",
    );
    await user.selectOptions(
      screen.getByLabelText("Assign seat 2 manually"),
      "Chef",
    );
    await user.click(screen.getByRole("button", { name: /start walkthrough/i }));

    const dialog = screen.getByRole("dialog", { name: "Setup walkthrough" });
    const step = within(dialog).getByRole("group", {
      name: /drunk — review the stand-in/i,
    });
    return { dialog, step };
  }

  it("changes what the grimoire records without ending the disguise", async () => {
    const user = userEvent.setup();
    const { step } = await drunkBoard(user);

    await user.selectOptions(
      within(step).getByLabelText(/new stand-in/i),
      "Grandmother",
    );
    await user.click(
      within(step).getByRole("button", { name: /change stand-in/i }),
    );

    const reloaded = loadGame() as GameDocument;
    const drunkPlayer = reloaded.players.find((p) => p.isDrunk)!;
    expect(drunkPlayer.characterId).toBe("grandmother");
    expect(drunkPlayer.isDrunk).toBe(true);
    expect(drunkPlayer.startingCharacterId).toBe("washerwoman");
  });

  it("updates what the Drunk's player is told they are on the board", async () => {
    const user = userEvent.setup();
    const { step } = await drunkBoard(user);

    await user.selectOptions(
      within(step).getByLabelText(/new stand-in/i),
      "Grandmother",
    );
    await user.click(
      within(step).getByRole("button", { name: /change stand-in/i }),
    );
    await user.click(screen.getByRole("button", { name: /close/i }));

    const circle = screen.getByRole("region", { name: "Grimoire circle" });
    const wrap = circle.querySelectorAll("[data-player-id]")[0] as HTMLElement;
    const summary = wrap.querySelector("details > summary") as HTMLElement;
    expect(within(summary).getByText("Grandmother")).toBeInTheDocument();
    expect(within(summary).getByText(/actually the Drunk/i)).toBeInTheDocument();
  });

  it("excludes a Townsfolk already held by another player from the picker", async () => {
    const user = userEvent.setup();
    const { step } = await drunkBoard(user);

    const options = Array.from(
      within(step).getByLabelText(/new stand-in/i).querySelectorAll("option"),
    ).map((o) => o.textContent);

    expect(options).not.toContain("Chef");
    expect(options).toContain("Grandmother");
  });
});

describe("bag-draw setup page polish (issue #49)", () => {
  it("does not offer to add a new character before every seat is assigned", () => {
    const game = makeGame({ playerCount: 2 });
    render(<GrimoireSetup game={game} />);

    expect(
      screen.queryByRole("button", { name: "Add character" }),
    ).not.toBeInTheDocument();
  });

  it("still offers to add a traveller before every seat is assigned", () => {
    const game = makeGame({
      playerCount: 2,
      selectedCharacters: [
        getCharacter("washerwoman")!,
        getCharacter("imp")!,
        getCharacter("scapegoat")!,
      ],
    });
    render(<GrimoireSetup game={game} />);

    expect(
      screen.getByRole("button", { name: "Add traveller" }),
    ).toBeInTheDocument();
  });

  it("offers a back button out of the bag-draw setup page, navigating to the previous step", async () => {
    const user = userEvent.setup();
    const game = makeGame({ playerCount: 2 });
    render(<GrimoireSetup game={game} />);

    await user.click(
      screen.getByRole("button", { name: `← ${game.scriptName}` }),
    );

    expect(routerBack).toHaveBeenCalledTimes(1);
  });

  it("hides the back button once a bag draw is in progress, so a mid-draw tap can't discard it", async () => {
    const user = userEvent.setup();
    const game = makeGame({ playerCount: 2 });
    render(<GrimoireSetup game={game} />);

    await user.click(screen.getByRole("button", { name: "Start bag draw" }));

    expect(
      screen.queryByRole("button", { name: `← ${game.scriptName}` }),
    ).not.toBeInTheDocument();
  });

  it("hides the back button once every seat is assigned", async () => {
    await completeSetup();

    expect(
      screen.queryByRole("button", { name: /^← / }),
    ).not.toBeInTheDocument();
  });

  it("doesn't reopen the 'Add character' form on its own if the roster empties out and refills while it was left open", async () => {
    const { user, circle } = await completeSetup(2, [
      getCharacter("washerwoman")!,
      getCharacter("imp")!,
      getCharacter("scapegoat")!,
    ]);

    await user.click(screen.getByRole("button", { name: "Add character" }));
    expect(screen.getByLabelText("Character")).toBeInTheDocument();

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    for (const name of ["Player 1", "Player 2"]) {
      const wrap = within(circle)
        .getByText(name)
        .closest("[data-player-id]") as HTMLElement;
      await user.click(within(wrap).getByText(name));
      await user.click(
        within(wrap).getByRole("button", { name: /remove player/i }),
      );
    }
    confirmSpy.mockRestore();

    // Roster is empty — setupComplete is false, so the token form is
    // gone (not just visually swapped for the button).
    expect(screen.queryByLabelText("Character")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add character" }),
    ).not.toBeInTheDocument();

    // Refill via "Add traveller" (unaffected by the setupComplete gating,
    // so still reachable with an empty roster) — this flips setupComplete
    // back to true, which is the actual regression scenario: the stale
    // open form must not reappear on its own.
    await user.click(screen.getByRole("button", { name: "Add traveller" }));
    await user.click(
      screen.getByRole("button", { name: "Add to the circle" }),
    );

    expect(screen.queryByLabelText("Character")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add character" }),
    ).toBeInTheDocument();
  });
});

describe("mid-game token management (issue #15)", () => {
  it("swapping a player's character preserves their starting character for export", async () => {
    const { user, circle } = await completeSetup();

    const seat1Wrap = circle.querySelectorAll("[data-player-id]")[0] as HTMLElement;
    await user.click(within(seat1Wrap).getByText("Player 1"));
    await user.selectOptions(
      within(seat1Wrap).getByLabelText(/swap character/i),
      "imp",
    );

    const reloaded = loadGame()!;
    expect(reloaded.players[0].characterId).toBe("imp");
    expect(reloaded.players[0].startingCharacterId).toBe("washerwoman");
  });

  it("adds a swapped-in off-script character to the character pool so it stays resolvable", async () => {
    const { user, circle } = await completeSetup();

    const seat1Wrap = circle.querySelectorAll("[data-player-id]")[0] as HTMLElement;
    await user.click(within(seat1Wrap).getByText("Player 1"));
    await user.selectOptions(
      within(seat1Wrap).getByLabelText(/swap character/i),
      "baron",
    );

    const reloaded = loadGame()!;
    expect(reloaded.characterPool.map((c) => c.id)).toContain("baron");
  });

  it("removes a player after confirmation", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user, circle } = await completeSetup();

    const seat1Wrap = circle.querySelectorAll("[data-player-id]")[0] as HTMLElement;
    await user.click(within(seat1Wrap).getByText("Player 1"));
    await user.click(
      within(seat1Wrap).getByRole("button", { name: /remove player/i }),
    );

    expect(confirmSpy).toHaveBeenCalled();
    const reloaded = loadGame()!;
    expect(reloaded.players).toHaveLength(1);
    expect(reloaded.players.map((p) => p.name)).toEqual(["Player 2"]);
    confirmSpy.mockRestore();
  });

  it("keeps every player when the storyteller declines the removal confirmation", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { user, circle } = await completeSetup();

    const seat1Wrap = circle.querySelectorAll("[data-player-id]")[0] as HTMLElement;
    await user.click(within(seat1Wrap).getByText("Player 1"));
    await user.click(
      within(seat1Wrap).getByRole("button", { name: /remove player/i }),
    );

    expect(loadGame()!.players).toHaveLength(2);
    confirmSpy.mockRestore();
  });

  it("scrubs a removed player's votes from every nomination, so they stop counting toward the tally (issue #20)", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    const game = makeGame({
      playerCount: 2,
      selectedCharacters: [getCharacter("washerwoman")!, getCharacter("imp")!],
    });
    const withNomination = {
      ...game,
      nominations: [
        {
          id: "n1",
          nominatorId: game.players[1].id,
          nomineeId: game.players[1].id,
          votes: [game.players[0].id, game.players[1].id],
        },
      ],
    };
    render(<GrimoireSetup game={withNomination} />);

    for (let seat = 1; seat <= 2; seat++) {
      const remainingOption = within(
        screen.getByLabelText(`Assign seat ${seat} manually`),
      )
        .getAllByRole("option")
        .find((option) => option.textContent !== "Choose a character…")!;
      await user.selectOptions(
        screen.getByLabelText(`Assign seat ${seat} manually`),
        remainingOption.textContent!,
      );
    }

    const circle = screen.getByRole("region", { name: "Grimoire circle" });
    const seat1Wrap = circle.querySelectorAll("[data-player-id]")[0] as HTMLElement;
    await user.click(within(seat1Wrap).getByText("Player 1"));
    await user.click(
      within(seat1Wrap).getByRole("button", { name: /remove player/i }),
    );

    expect(loadGame()!.nominations[0].votes).toEqual([game.players[1].id]);
    confirmSpy.mockRestore();
  });

  it("reveals the Drunk, showing the real character openly from then on", async () => {
    const washerwoman = getCharacter("washerwoman")!;
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 1,
      selectedCharacters: [getCharacter("drunk")!],
      standIn: washerwoman,
      extraCopies: {},
    });
    const user = userEvent.setup();
    render(<GrimoireSetup game={game} />);
    await user.selectOptions(
      screen.getByLabelText("Assign seat 1 manually"),
      "Washerwoman",
    );

    const circle = screen.getByRole("region", { name: "Grimoire circle" });
    const wrap = circle.querySelector("[data-player-id]") as HTMLElement;
    await user.click(within(wrap).getByText("Player 1"));
    await user.click(
      within(wrap).getByRole("button", { name: /reveal drunk/i }),
    );

    expect(loadGame()!.players[0].characterId).toBe("drunk");
    expect(
      within(wrap).queryByRole("button", { name: /reveal drunk/i }),
    ).not.toBeInTheDocument();
  });

  it("clears the Drunk stand-in note once a generic swap moves the seat to a different character", async () => {
    const washerwoman = getCharacter("washerwoman")!;
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 1,
      selectedCharacters: [getCharacter("drunk")!, getCharacter("imp")!],
      standIn: washerwoman,
      extraCopies: {},
    });
    const user = userEvent.setup();
    render(<GrimoireSetup game={game} />);
    await user.selectOptions(
      screen.getByLabelText("Assign seat 1 manually"),
      "Washerwoman",
    );

    const circle = screen.getByRole("region", { name: "Grimoire circle" });
    const wrap = circle.querySelector("[data-player-id]") as HTMLElement;
    await user.click(within(wrap).getByText("Player 1"));
    await user.selectOptions(within(wrap).getByLabelText(/swap character/i), "imp");

    expect(loadGame()!.players[0].isDrunk).toBe(false);
    expect(within(wrap).queryByText(/actually the Drunk/i)).not.toBeInTheDocument();
    expect(
      within(wrap).queryByRole("button", { name: /reveal drunk/i }),
    ).not.toBeInTheDocument();
  });

  it("removes an active Fabled, displayed outside the circle, with no way to add one", async () => {
    const user = userEvent.setup();
    const playerCount = 2;
    const game = {
      ...makeGame({
        playerCount,
        selectedCharacters: [getCharacter("washerwoman")!, getCharacter("imp")!],
      }),
      activeFabled: ["angel"],
    };
    render(<GrimoireSetup game={game} />);

    for (let seat = 1; seat <= playerCount; seat++) {
      const remainingOption = within(
        screen.getByLabelText(`Assign seat ${seat} manually`),
      )
        .getAllByRole("option")
        .find((option) => option.textContent !== "Choose a character…")!;
      await user.selectOptions(
        screen.getByLabelText(`Assign seat ${seat} manually`),
        remainingOption.textContent!,
      );
    }

    const circle = screen.getByRole("region", { name: "Grimoire circle" });
    const fabledRow = within(circle).getByRole("region", { name: "Fabled" });
    expect(within(fabledRow).getByText("Angel")).toBeInTheDocument();
    expect(
      within(fabledRow).queryByLabelText(/add fabled/i),
    ).not.toBeInTheDocument();

    await user.click(
      within(fabledRow).getByRole("button", { name: /remove angel/i }),
    );

    expect(loadGame()!.activeFabled).toEqual([]);
  });

  it("adds a non-traveller character token mid-game at a chosen seat position", async () => {
    const { user } = await completeSetup();

    await user.click(screen.getByRole("button", { name: "Add character" }));
    await user.selectOptions(screen.getByLabelText("Character"), "baron");
    await user.selectOptions(
      screen.getByLabelText("Seat position"),
      "Before Player 1",
    );
    await user.click(
      screen.getByRole("button", { name: "Add to the grimoire" }),
    );

    const reloaded = loadGame()!;
    expect(reloaded.players).toHaveLength(3);
    const added = reloaded.players.find((p) => p.characterId === "baron")!;
    expect(added.seat).toBe(1);
    expect(added.startingCharacterId).toBe("baron");
    expect(
      reloaded.players.filter((p) => p.characterId !== "baron").map((p) => p.seat).sort(),
    ).toEqual([2, 3]);
    expect(reloaded.characterPool.map((c) => c.id)).toContain("baron");
  });

  it("computes 'At the end' from the highest seat number, not the player count, once a removal has left a gap", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user, circle } = await completeSetup(3, [
      getCharacter("washerwoman")!,
      getCharacter("imp")!,
      getCharacter("empath")!,
    ]);

    // Remove the middle seat, leaving seats {1, 3} — only 2 players, but the
    // highest seat number in play is still 3.
    const seat2Wrap = circle.querySelectorAll("[data-player-id]")[1] as HTMLElement;
    await user.click(within(seat2Wrap).getByText("Player 2"));
    await user.click(
      within(seat2Wrap).getByRole("button", { name: /remove player/i }),
    );
    confirmSpy.mockRestore();

    await user.click(screen.getByRole("button", { name: "Add character" }));
    await user.selectOptions(screen.getByLabelText("Character"), "baron");
    await user.selectOptions(
      screen.getByLabelText("Seat position"),
      "At the end",
    );
    await user.click(
      screen.getByRole("button", { name: "Add to the grimoire" }),
    );

    const reloaded = loadGame()!;
    const added = reloaded.players.find((p) => p.characterId === "baron")!;
    // The true end is seat 4 (after the existing seat-3 player), not seat 3
    // (which would collide with — and displace — the existing seat-3 player).
    expect(added.seat).toBe(4);
    expect(reloaded.players.find((p) => p.name === "Player 1")!.seat).toBe(1);
    expect(reloaded.players.find((p) => p.name === "Player 3")!.seat).toBe(3);
  });

  async function removeMiddleSeat(extraCharacters: NonNullable<ReturnType<typeof getCharacter>>[] = []) {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user, circle } = await completeSetup(3, [
      getCharacter("washerwoman")!,
      getCharacter("imp")!,
      getCharacter("empath")!,
      ...extraCharacters,
    ]);

    const seat2Wrap = circle.querySelectorAll("[data-player-id]")[1] as HTMLElement;
    await user.click(within(seat2Wrap).getByText("Player 2"));
    await user.click(
      within(seat2Wrap).getByRole("button", { name: /remove player/i }),
    );
    confirmSpy.mockRestore();
    return user;
  }

  it("defaults the 'Add character' seat position to the true end, not the player count, after a removal left a gap", async () => {
    const user = await removeMiddleSeat();

    // The select is never touched — its default value on open must already
    // be the true end (seat 4), not players.length + 1 (seat 3, which would
    // collide with the existing seat-3 player).
    await user.click(screen.getByRole("button", { name: "Add character" }));

    expect(screen.getByLabelText("Seat position")).toHaveValue("4");
  });

  it("defaults the 'Add traveller' seat position to the true end, not the player count, after a removal left a gap", async () => {
    const user = await removeMiddleSeat([getCharacter("scapegoat")!]);

    await user.click(screen.getByRole("button", { name: "Add traveller" }));

    expect(screen.getByLabelText("Seat position")).toHaveValue("4");
  });
});

describe("acts-as (issue #17)", () => {
  it("resolves an acts-as target that isn't currently in play, adding it to the character pool so the night list can find it", async () => {
    const user = userEvent.setup();
    const washerwoman = getCharacter("washerwoman")!;
    const imp = getCharacter("imp")!;
    const empath = getCharacter("empath")!;
    // Empath is on the script but nobody drew it — the "Acts as" picker
    // offers the script's full pool (any not-in-play character is a
    // legitimate target, e.g. a Philosopher choosing an unheld ability),
    // which is a different, wider universe than characterPool.
    const game = makeGame({
      playerCount: 2,
      selectedCharacters: [washerwoman, imp],
      scriptCharacters: [washerwoman, imp, empath],
    });
    const seated: GameDocument = {
      ...game,
      players: game.players.map((p, i) => ({
        ...p,
        characterId: [washerwoman.id, imp.id][i],
        startingCharacterId: [washerwoman.id, imp.id][i],
      })),
    };
    render(<GrimoireSetup game={seated} />);

    const circle = screen.getByRole("region", { name: "Grimoire circle" });
    const seat1Wrap = circle.querySelectorAll("[data-player-id]")[0] as HTMLElement;
    await user.click(within(seat1Wrap).getByText("Player 1"));
    await user.selectOptions(within(seat1Wrap).getByLabelText(/acts as/i), "empath");

    const reloaded = loadGame()!;
    expect(reloaded.players[0].actsAs).toBe("empath");
    expect(reloaded.characterPool.map((c) => c.id)).toContain("empath");

    // The real regression: before adding the target to characterPool, the
    // night list's characterById (built from characterPool) couldn't
    // resolve it, so the acts-as entry silently never appeared.
    await user.click(screen.getByRole("button", { name: "Start First night" }));
    expect(
      screen.getByText(`Player 1 — ${washerwoman.name} as ${empath.name}`),
    ).toBeInTheDocument();
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
    // Each token's own menu also offers every script character as both a
    // swap-character and a claim option (including whichever character is
    // already on-token), so text matches must skip <option> text to stay
    // unambiguous.
    const named = (text: string) =>
      within(circle).getByText(text, { ignore: "option" });
    expect(named("Player 1")).toBeInTheDocument();
    expect(named("Player 2")).toBeInTheDocument();
    expect(named("Washerwoman")).toBeInTheDocument();
    expect(named("Imp")).toBeInTheDocument();
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

describe("share the script via QR from the grimoire (issue #22)", () => {
  it("offers to share the game's script", () => {
    render(<GrimoireSetup game={makeGame({ playerCount: 5 })} />);

    expect(
      screen.getByRole("button", { name: /share via qr/i }),
    ).toBeInTheDocument();
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

  it("detaches a restored reminder whose anchor seat was removed during the undo window (code review finding)", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const circle = await completedBoard(user);

    const wrap = circle.querySelectorAll("[data-player-id]")[0] as HTMLElement;
    await user.click(within(wrap).getByRole("button", { name: "Add reminder" }));
    const dialog = within(circle).getByRole("dialog", { name: "Add reminder" });
    const group = within(dialog).getByRole("group", { name: "Washerwoman" });
    await user.click(within(group).getByRole("button", { name: "Townsfolk" }));
    expect((loadGame() as GameDocument).reminders[0].anchorPlayerId).not.toBeNull();

    // Remove the reminder (parked in the undo buffer, still carrying its
    // original anchorPlayerId), then separately remove the seat it was
    // anchored to — that seat is gone from game.reminders/players by the
    // time Undo runs, so restoring the raw snapshot would bring back a
    // dangling reference were it not for the fix.
    await user.click(within(circle).getByText("Townsfolk"));
    await user.click(within(circle).getByRole("button", { name: "Remove reminder" }));
    expect((loadGame() as GameDocument).reminders).toHaveLength(0);

    await user.click(within(wrap).getByText("Player 1"));
    await user.click(within(wrap).getByRole("button", { name: /remove player/i }));
    expect((loadGame() as GameDocument).players).toHaveLength(1);

    await user.click(within(circle).getByRole("button", { name: /undo/i }));

    const reloaded = loadGame() as GameDocument;
    expect(reloaded.reminders).toHaveLength(1);
    expect(reloaded.reminders[0].anchorPlayerId).toBeNull();
    confirmSpy.mockRestore();
  });

  it("persists a reminder added from a seat's own menu as anchored to that seat (issue #71)", async () => {
    const user = userEvent.setup();
    const circle = await completedBoard(user);

    const wrap = circle.querySelectorAll("[data-player-id]")[0] as HTMLElement;
    const seatPlayerId = wrap.dataset.playerId!;
    await user.click(within(wrap).getByRole("button", { name: "Add reminder" }));
    const dialog = within(circle).getByRole("dialog", { name: "Add reminder" });
    const group = within(dialog).getByRole("group", { name: "Washerwoman" });
    await user.click(within(group).getByRole("button", { name: "Townsfolk" }));

    const reloaded = loadGame() as GameDocument;
    expect(reloaded.reminders).toHaveLength(1);
    expect(reloaded.reminders[0].anchorPlayerId).toBe(seatPlayerId);
  });

  it("attaches a pad-added reminder to a seat by tapping it, without dragging (issue #71)", async () => {
    const user = userEvent.setup();
    const circle = await completedBoard(user);

    const padControls = circle.querySelector("[data-controls]") as HTMLElement;
    await user.click(within(padControls).getByRole("button", { name: "Add reminder" }));
    const dialog = within(circle).getByRole("dialog", { name: "Add reminder" });
    const group = within(dialog).getByRole("group", { name: "Washerwoman" });
    await user.click(within(group).getByRole("button", { name: "Townsfolk" }));
    expect((loadGame() as GameDocument).reminders[0].anchorPlayerId).toBeNull();

    await user.click(within(circle).getByText("Townsfolk"));
    await user.click(within(circle).getByRole("button", { name: "Attach to seat" }));

    const wrap = circle.querySelectorAll("[data-player-id]")[0] as HTMLElement;
    const seatPlayerId = wrap.dataset.playerId!;
    fireEvent.click(wrap.querySelector("summary")!);

    const reloaded = loadGame() as GameDocument;
    expect(reloaded.reminders[0].anchorPlayerId).toBe(seatPlayerId);
  });

  it("detaches a reminder from its anchor seat once it's dragged to a free-standing spot (issue #71)", async () => {
    const user = userEvent.setup();
    const circle = await completedBoard(user);

    const wrap = circle.querySelectorAll("[data-player-id]")[0] as HTMLElement;
    await user.click(within(wrap).getByRole("button", { name: "Add reminder" }));
    const dialog = within(circle).getByRole("dialog", { name: "Add reminder" });
    const group = within(dialog).getByRole("group", { name: "Washerwoman" });
    await user.click(within(group).getByRole("button", { name: "Townsfolk" }));
    expect((loadGame() as GameDocument).reminders[0].anchorPlayerId).not.toBeNull();

    const board = circle.querySelector("[data-board]") as HTMLElement;
    vi.spyOn(board, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400, x: 0, y: 0,
      toJSON() {},
    });
    const reminderSummary = circle.querySelector(
      "[data-reminder-id] summary",
    ) as HTMLElement;
    fireEvent(reminderSummary, pointerEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }));
    fireEvent(reminderSummary, pointerEvent("pointermove", { pointerId: 1, clientX: 140, clientY: 180 }));
    fireEvent(reminderSummary, pointerEvent("pointerup", { pointerId: 1, clientX: 140, clientY: 180 }));

    const reloaded = loadGame() as GameDocument;
    expect(reloaded.reminders[0].anchorPlayerId).toBeNull();
  });

  it("detaches a reminder whose anchor seat is removed, instead of leaving it pointing at a player id that no longer exists (code review finding)", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const circle = await completedBoard(user);

    const wrap = circle.querySelectorAll("[data-player-id]")[0] as HTMLElement;
    const anchorPlayerId = wrap.dataset.playerId!;
    await user.click(within(wrap).getByRole("button", { name: "Add reminder" }));
    const dialog = within(circle).getByRole("dialog", { name: "Add reminder" });
    const group = within(dialog).getByRole("group", { name: "Washerwoman" });
    await user.click(within(group).getByRole("button", { name: "Townsfolk" }));
    expect((loadGame() as GameDocument).reminders[0].anchorPlayerId).toBe(anchorPlayerId);

    await user.click(within(wrap).getByText("Player 1"));
    await user.click(within(wrap).getByRole("button", { name: /remove player/i }));

    const reloaded = loadGame() as GameDocument;
    expect(reloaded.players.some((p) => p.id === anchorPlayerId)).toBe(false);
    expect(reloaded.reminders[0].anchorPlayerId).toBeNull();
    // Detaching resolves to the seat's actual last-seen position rather
    // than silently keeping whatever stale position the reminder happened
    // to store while anchored (which never updated as the seat moved).
    expect(reloaded.reminders[0].position).toBeDefined();
    confirmSpy.mockRestore();
  });
});

describe("board layout order (issue #58)", () => {
  it("keeps the grimoire circle before the night list in DOM/tab order, even though CSS visually reorders them on mobile", async () => {
    const { circle } = await completeSetup();

    const nightListHeading = screen.getByRole("heading", { name: /night list|first night/i });
    // Node.DOCUMENT_POSITION_FOLLOWING means `circle` comes *before*
    // nightListHeading in the document — CSS grid areas move the visual
    // position per breakpoint, but the actual DOM/tab order this asserts
    // never changes.
    expect(
      circle.compareDocumentPosition(nightListHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("post-draw setup walkthrough (issue #26)", () => {
  // Imp (seat 2) is evil, so it's never a valid Fortune Teller red-herring
  // candidate — Chef (seat 3) and Empath (seat 4) are the two good players
  // tests can pick between (e.g. to prove Redo actually changed the target).
  async function completedFortuneTellerBoard(user: ReturnType<typeof userEvent.setup>) {
    const game = makeGame({
      playerCount: 4,
      selectedCharacters: [
        getCharacter("fortuneteller")!,
        getCharacter("imp")!,
        getCharacter("chef")!,
        getCharacter("empath")!,
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
    await user.selectOptions(
      screen.getByLabelText("Assign seat 4 manually"),
      "Empath",
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
    const playerSelect = within(step).getByLabelText("Player");
    await user.selectOptions(playerSelect, selectPlayerNamed(playerSelect, "Player 3"));
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
    const playerSelect = within(step).getByLabelText("Player");
    await user.selectOptions(playerSelect, selectPlayerNamed(playerSelect, "Player 3"));
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
    const trueSelect = within(step).getByLabelText(/shown as townsfolk/i);
    await user.selectOptions(trueSelect, selectPlayerNamed(trueSelect, "Player 2"));
    const falseSelect = within(step).getByLabelText(/shown as wrong/i);
    await user.selectOptions(falseSelect, selectPlayerNamed(falseSelect, "Player 3"));
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
    const playerSelect = within(step).getByLabelText("Player");
    await user.selectOptions(playerSelect, selectPlayerNamed(playerSelect, "Player 3"));
    await user.click(within(step).getByRole("button", { name: /confirm/i }));
    const firstPosition = (loadGame() as GameDocument).reminders.find(
      (r) => r.label === "Red herring",
    )!.position;

    await user.click(within(step).getByRole("button", { name: /redo/i }));
    const playerSelectAgain = within(step).getByLabelText("Player");
    await user.selectOptions(playerSelectAgain, selectPlayerNamed(playerSelectAgain, "Player 4"));
    await user.click(within(step).getByRole("button", { name: /confirm/i }));

    const reloaded = loadGame() as GameDocument;
    const redHerrings = reloaded.reminders.filter((r) => r.label === "Red herring");
    expect(redHerrings).toHaveLength(1);
    // Re-answering for a different player actually moved the token, proving
    // the second Confirm didn't just add another copy at the same spot.
    expect(redHerrings[0].position).not.toEqual(firstPosition);
  });

  it("Redo stays duplicate-free even across a remount (e.g. a page reload) — deterministic ids, not session state (code review finding)", async () => {
    const user = userEvent.setup();
    const game = makeGame({
      playerCount: 4,
      selectedCharacters: [
        getCharacter("fortuneteller")!,
        getCharacter("imp")!,
        getCharacter("chef")!,
        getCharacter("empath")!,
      ],
    });
    const { unmount } = render(<GrimoireSetup game={game} />);
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
    await user.selectOptions(
      screen.getByLabelText("Assign seat 4 manually"),
      "Empath",
    );
    await user.click(screen.getByRole("button", { name: /start walkthrough/i }));
    const dialog = screen.getByRole("dialog", { name: "Setup walkthrough" });
    const step = within(dialog).getByRole("group", { name: /fortune teller/i });
    const playerSelect = within(step).getByLabelText("Player");
    await user.selectOptions(playerSelect, selectPlayerNamed(playerSelect, "Player 3"));
    await user.click(within(step).getByRole("button", { name: /confirm/i }));

    // Simulate a page reload: tear down this component instance entirely
    // (discarding any in-memory refs) and remount fresh from the persisted
    // document, the same way GamePage does on a real navigation.
    unmount();
    render(<GrimoireSetup game={loadGame() as GameDocument} />);

    await user.click(screen.getByRole("button", { name: /setup walkthrough/i }));
    const dialog2 = screen.getByRole("dialog", { name: "Setup walkthrough" });
    const step2 = within(dialog2).getByRole("group", { name: /fortune teller/i });
    await user.click(within(step2).getByRole("button", { name: /redo/i }));
    const playerSelect2 = within(step2).getByLabelText("Player");
    await user.selectOptions(playerSelect2, selectPlayerNamed(playerSelect2, "Player 4"));
    await user.click(within(step2).getByRole("button", { name: /confirm/i }));

    const final = loadGame() as GameDocument;
    expect(
      final.reminders.filter((r) => r.label === "Red herring"),
    ).toHaveLength(1);
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
    const playerSelect = within(step).getByLabelText("Player");
    await user.selectOptions(playerSelect, selectPlayerNamed(playerSelect, "Player 3"));
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
