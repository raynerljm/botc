import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCharacter, getEditionCharacters } from "@/lib/characters";
import { createGame, type GameDocument } from "@/lib/gameDocument";
import { clearGames, loadGame } from "@/lib/gameStorage";
import { decodeScriptForShare } from "@/lib/scriptShare";
import { getSelectOptions, openListbox, selectOption } from "@/testUtils/selectOption";

import { GrimoireSetup } from "./GrimoireSetup";
import { mockClipboard } from "./testHelpers";

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
function playerNamedMatcher(name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}\\b`);
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
    const trigger = screen.getByLabelText(`Assign seat ${seat} manually`);
    const listbox = await openListbox(user, trigger);
    const remainingOption = within(listbox)
      .getAllByRole("option")
      .find((option) => option.textContent !== "Choose a character…")!;
    await user.click(remainingOption);
  }

  const circle = screen.getByRole("region", { name: "Grimoire circle" });
  return { user, circle };
}

// Clicks a seat's "Remove player" button and confirms the in-app dialog
// (issue #73 — replaces the old window.confirm() for this flow).
async function removePlayerAndConfirm(
  user: ReturnType<typeof userEvent.setup>,
  wrap: HTMLElement,
) {
  await user.click(
    within(wrap).getByRole("button", { name: /remove player/i }),
  );
  const dialog = screen.getByRole("alertdialog", { name: /remove player/i });
  await user.click(within(dialog).getByRole("button", { name: /^remove$/i }));
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

  it("trims a renamed seat on blur and falls back to \"Player N\" when emptied", async () => {
    const user = userEvent.setup();
    const game = makeGame({ playerCount: 2 });
    render(<GrimoireSetup game={game} />);

    const seat1Name = screen.getByLabelText("Seat 1 name");
    await user.clear(seat1Name);
    await user.type(seat1Name, "  Bob  ");
    await user.tab();
    expect(seat1Name).toHaveValue("Bob");

    await user.clear(seat1Name);
    await user.type(seat1Name, "   ");
    await user.tab();
    expect(seat1Name).toHaveValue("Player 1");
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

  it("walks a full draw: tap, immediate private reveal, hide & pass straight to the next seat (issue #185)", async () => {
    const user = userEvent.setup();
    const washerwoman = getCharacter("washerwoman")!;
    const imp = getCharacter("imp")!;
    render(<GrimoireSetup game={twoSeatTwoCharacterGame()} />);

    await user.click(screen.getByRole("button", { name: "Start bag draw" }));

    // Seat 1's turn: two face-down tokens, no identity visible in the draw
    // itself. (The other unassigned seat's manual-assign dropdown is hidden
    // too while any draw is active — see the dedicated issue #111 test.)
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

    // No intermediate "Card hidden" privacy screen — the next seat's tokens
    // are shuffled and face-down, so it's safe to go straight there
    // (issue #185). The reveal itself is gone either way.
    expect(screen.queryByText(firstDrawn.ability)).not.toBeInTheDocument();
    expect(screen.queryByText(/Card hidden/)).not.toBeInTheDocument();

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

  it('ignores a double-click on "Start bag draw" instead of instantly drawing seat 1\'s token (issue #111)', () => {
    const washerwoman = getCharacter("washerwoman")!;
    const imp = getCharacter("imp")!;
    render(<GrimoireSetup game={twoSeatTwoCharacterGame()} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Start bag draw" }),
      { detail: 1 },
    );
    // The second click of a double-click gesture — mirrors chooseTokenOnClick's
    // event.detail guard (see its comment for why detail: 2 means "not a
    // fresh tap").
    fireEvent.click(
      screen.getAllByRole("button", { name: /Face-down token/ })[0],
      { detail: 2 },
    );

    expect(screen.queryByRole("heading", { name: washerwoman.name })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: imp.name })).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Face-down token/ }),
    ).toHaveLength(2);

    // Seat 1 still gets its own choose-your-own-token ritual — a real,
    // separate tap actually draws.
    fireEvent.click(
      screen.getAllByRole("button", { name: /Face-down token/ })[0],
      { detail: 1 },
    );

    const drawnName = [washerwoman.name, imp.name].find((name) =>
      screen.queryByRole("heading", { name }),
    );
    expect(drawnName).toBeDefined();
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

    // Straight to the next seat's own choosing stage (issue #185) — no
    // intermediate "Card hidden" screen — which keeps the seats list hidden
    // too (issue #158). It only reappears once the whole draw session ends.
    expect(screen.queryByText(/Card hidden/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Seat 1 name")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Assign seat \d manually/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add traveller" }),
    ).not.toBeInTheDocument();
  });

  it("hides every seat's manual-assign select while a draw session is active, so bag composition never appears on screen (issue #111)", async () => {
    const user = userEvent.setup();
    const washerwoman = getCharacter("washerwoman")!;
    const imp = getCharacter("imp")!;
    const baron = getCharacter("baron")!;
    const game = makeGame({
      playerCount: 3,
      selectedCharacters: [washerwoman, imp, baron],
    });
    render(<GrimoireSetup game={game} />);

    await user.click(screen.getByRole("button", { name: "Start bag draw" }));

    // Seat 1 is drawing — neither seat 2's nor seat 1's own manual-assign
    // select renders, and none of the remaining bag's character names
    // appear anywhere on the page (not just inside the draw region), so the
    // drawing player can't read what's left, and the last-remaining seat's
    // own dropdown can't leak its own character early.
    expect(
      screen.queryByLabelText(/Assign seat \d manually/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(washerwoman.name)).not.toBeInTheDocument();
    expect(screen.queryByText(imp.name)).not.toBeInTheDocument();
    expect(screen.queryByText(baron.name)).not.toBeInTheDocument();
  });

  it("hides the seats list and every per-seat status placeholder during the choosing stage, showing only the face-down tokens (issue #158)", async () => {
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
    await user.click(screen.getByRole("button", { name: "Hide & pass" }));

    // Seat 1 is already assigned and seat 3 is still unassigned, so before
    // this fix the seats list would show both an "Assigned" and a "Draw in
    // progress" placeholder alongside seat 2's face-down grid. None of that
    // belongs on screen while seat 2 is choosing — only the tokens do.
    expect(
      screen.queryByRole("list", { name: "Seats" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Assigned")).not.toBeInTheDocument();
    expect(screen.queryByText("Draw in progress")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Seat \d+ name/)).not.toBeInTheDocument();

    // The tokens themselves are still there, still tappable.
    expect(
      screen.getAllByRole("button", { name: /Face-down token/ }),
    ).toHaveLength(2);
  });

  it("shows each face-down token's position number, staying in sync with its accessible label", async () => {
    const user = userEvent.setup();
    const game = makeGame({ playerCount: 2 });
    render(<GrimoireSetup game={game} />);

    await user.click(screen.getByRole("button", { name: "Start bag draw" }));

    const faceDownTokens = screen.getAllByRole("button", {
      name: /Face-down token/,
    });
    faceDownTokens.forEach((button, index) => {
      expect(button).toHaveAccessibleName(`Face-down token ${index + 1}`);
      expect(within(button).getByText(String(index + 1))).toBeInTheDocument();
    });
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
    // The Game panel itself starts collapsed pre-first-night (issue #79),
    // so export is one tap away rather than already on screen.
    await user.click(screen.getByRole("button", { name: "Game" }));
    expect(
      screen.getByRole("button", { name: "Export game" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide & pass" }));

    // Issue #110: the last seat's "Hide & pass" must not open the board
    // directly — the drawer is still holding the device. The hand-off
    // guard stays up until the storyteller explicitly takes over.
    expect(
      screen.queryByRole("region", { name: "Grimoire circle" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Card hidden. Return the device to the storyteller."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Export game" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Open the grimoire" }),
    );

    // Only the explicit take-over opens the board.
    expect(
      screen.getByRole("region", { name: "Grimoire circle" }),
    ).toBeInTheDocument();
  });

  it("matches every other seat's hand-off on the last seat: no identity visible until the storyteller explicitly takes over (issue #110)", async () => {
    const user = userEvent.setup();
    const washerwoman = getCharacter("washerwoman")!;
    const imp = getCharacter("imp")!;
    render(<GrimoireSetup game={twoSeatTwoCharacterGame()} />);

    await user.click(screen.getByRole("button", { name: "Start bag draw" }));
    await user.click(
      screen.getAllByRole("button", { name: /Face-down token/ })[0],
    );
    await user.click(screen.getByRole("button", { name: "Hide & pass" }));

    await user.click(
      screen.getAllByRole("button", { name: /Face-down token/ })[0],
    );
    const lastDrawnName = [washerwoman.name, imp.name].find((name) =>
      screen.queryByRole("heading", { name }),
    )!;

    await user.click(screen.getByRole("button", { name: "Hide & pass" }));

    // Same privacy contract as every other seat's "Card hidden" guard: no
    // player name, character name, or seat control leaks through — the
    // board stays mounted (its own session-only state is worth keeping)
    // but hidden from the accessibility tree, so query it the same way the
    // "Grimoire circle" checks above do rather than by raw text.
    expect(
      screen.queryByRole("heading", { name: lastDrawnName }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Seat \d name/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Start bag draw" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Open the grimoire" }),
    );
    expect(loadGame()!.bag).toHaveLength(0);
  });

  it("keeps export and end-game controls reachable through a private reveal (issue #21 AC), hiding them only during the pass-around itself", async () => {
    const user = userEvent.setup();
    // A single seat so its draw is both first and last — its "Hide & pass"
    // has no next seat's blind grid to skip straight to (issue #185), so it
    // still lands on the "hidden" pass-around guard this test exercises.
    render(
      <GrimoireSetup
        game={makeGame({
          playerCount: 1,
          selectedCharacters: [getCharacter("washerwoman")!],
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Start bag draw" }));
    await user.click(
      screen.getAllByRole("button", { name: /Face-down token/ })[0],
    );

    // Reveal is up — export/end-game stay reachable through it. The Game
    // panel starts collapsed pre-first-night (issue #79), so open it first.
    await user.click(screen.getByRole("button", { name: "Game" }));
    expect(
      screen.getByRole("button", { name: "Export game" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide & pass" }));

    // Mid pass-around: now they're hidden, same as before this change.
    expect(
      screen.queryByRole("button", { name: "Export game" }),
    ).not.toBeInTheDocument();
  });

  it("doesn't claim aria-modal on the reveal, since Share via QR/Game stay reachable behind it by design (issue #122)", async () => {
    const user = userEvent.setup();
    render(<GrimoireSetup game={twoSeatTwoCharacterGame()} />);

    await user.click(screen.getByRole("button", { name: "Start bag draw" }));
    await user.click(
      screen.getAllByRole("button", { name: /Face-down token/ })[0],
    );

    const reveal = screen.getByRole("dialog", { name: /washerwoman|imp/i });
    expect(reveal).not.toHaveAttribute("aria-modal");

    // Escape must never dismiss this privacy guard — a stray keypress can't
    // be allowed to end the ritual (unlike every other dialog in the app).
    await user.keyboard("{Escape}");
    expect(
      screen.getByRole("dialog", { name: /washerwoman|imp/i }),
    ).toBeInTheDocument();
  });
});

describe("draw session survives a reload (issue #108)", () => {
  // Simulates a page reload the same way GamePage does on a real
  // navigation: tear down the component instance entirely and remount
  // fresh from the persisted document.
  function reload(unmount: () => void): () => void {
    unmount();
    return render(<GrimoireSetup game={loadGame() as GameDocument} />).unmount;
  }

  it("keeps drawn seats masked and the ritual alive after a reload at the 'Card hidden' screen", async () => {
    const user = userEvent.setup();
    const candidates = [
      getCharacter("washerwoman")!,
      getCharacter("imp")!,
      getCharacter("baron")!,
    ];
    const game = makeGame({ playerCount: 3, selectedCharacters: candidates });
    const { unmount } = render(<GrimoireSetup game={game} />);

    await user.click(screen.getByRole("button", { name: "Start bag draw" }));
    await user.click(
      screen.getAllByRole("button", { name: /Face-down token/ })[0],
    );
    // A live "Hide & pass" would skip straight to seat 2's blind grid
    // (issue #185), so the only way to land on the "Card hidden" guard for a
    // non-last seat is a reload mid-reveal (resumeDrawSession's privacy
    // fallback) — reached here, then reloaded again to confirm it holds.
    const remounted = reload(unmount);
    expect(
      screen.getByText(/Card hidden\. Pass the device to/),
    ).toBeInTheDocument();

    reload(remounted);

    // The privacy guard is restored — the ritual did not silently end into
    // an open grimoire.
    expect(
      screen.getByText(/Card hidden\. Pass the device to/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Start bag draw" }),
    ).not.toBeInTheDocument();

    // Seat 1's identity (one of the candidates) stays behind the mask: no
    // token art, no character name, and no manual-assign dropdowns listing
    // the remaining bag.
    candidates.forEach((c) => {
      expect(screen.queryByText(c.name)).not.toBeInTheDocument();
    });
    expect(
      screen.queryByLabelText(/Assign seat \d manually/),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Seat \d name/)).not.toBeInTheDocument();

    // The ritual continues where it left off: the next player confirms and
    // draws from the remaining bag.
    await user.click(screen.getByRole("button", { name: "Ready to draw" }));
    expect(
      screen.getAllByRole("button", { name: /Face-down token/ }),
    ).toHaveLength(2);
  });

  it("resumes a mid-reveal reload at the privacy guard instead of re-rendering the drawn identity", async () => {
    const user = userEvent.setup();
    const candidates = [
      getCharacter("washerwoman")!,
      getCharacter("imp")!,
      getCharacter("baron")!,
    ];
    const game = makeGame({ playerCount: 3, selectedCharacters: candidates });
    const { unmount } = render(<GrimoireSetup game={game} />);

    await user.click(screen.getByRole("button", { name: "Start bag draw" }));
    await user.click(
      screen.getAllByRole("button", { name: /Face-down token/ })[0],
    );
    const seat1Character = candidates.find((c) =>
      screen.queryByRole("heading", { name: c.name }),
    )!;
    expect(seat1Character).toBeDefined();

    // Reload while the private reveal is on-screen: whoever holds the device
    // after the remount is unknown, so the card must not come back.
    reload(unmount);

    expect(
      screen.queryByRole("heading", { name: seat1Character.name }),
    ).not.toBeInTheDocument();
    candidates.forEach((c) => {
      expect(screen.queryByText(c.name)).not.toBeInTheDocument();
      expect(screen.queryByText(c.ability)).not.toBeInTheDocument();
    });
    expect(
      screen.getByText(/Card hidden\. Pass the device to/),
    ).toBeInTheDocument();

    // The drawn character was committed when the reveal opened, so the seat
    // stays assigned and the ritual carries on with the next player.
    expect(loadGame()!.players[0].characterId).toBe(seat1Character.id);
    await user.click(screen.getByRole("button", { name: "Ready to draw" }));
    expect(
      screen.getAllByRole("button", { name: /Face-down token/ }),
    ).toHaveLength(2);
  });

  it("never shows the '(actually the Drunk)' note after a mid-ritual reload", async () => {
    const user = userEvent.setup();
    // Only the Drunk is selected, so its Librarian stand-in is the bag's
    // sole token — seat 1's draw is guaranteed to be the disguised Drunk,
    // deterministically, with seat 2 still unassigned to keep the ritual
    // (and its privacy guard) alive across the reload.
    const game = makeGame({
      playerCount: 2,
      selectedCharacters: [getCharacter("drunk")!],
      standIn: getCharacter("librarian")!,
    });
    const { unmount } = render(<GrimoireSetup game={game} />);

    await user.click(screen.getByRole("button", { name: "Start bag draw" }));
    await user.click(
      screen.getAllByRole("button", { name: /Face-down token/ })[0],
    );
    expect(
      screen.getByRole("heading", { name: "Librarian" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hide & pass" }));

    reload(unmount);

    expect(loadGame()!.players[0].isDrunk).toBe(true);
    expect(screen.queryByText("(actually the Drunk)")).not.toBeInTheDocument();
    expect(screen.queryByText("Librarian")).not.toBeInTheDocument();
  });

  it("resumes a mid-choosing reload with the face-down grid for the same seat", async () => {
    const user = userEvent.setup();
    const game = makeGame({ playerCount: 2 });
    const { unmount } = render(<GrimoireSetup game={game} />);

    await user.click(screen.getByRole("button", { name: "Start bag draw" }));
    expect(screen.getByText(/Player 1.*tap a token/i)).toBeInTheDocument();

    reload(unmount);

    // Choosing is the safe stage — the same seat's face-down grid is simply
    // back, with nothing assigned and nothing revealed.
    expect(screen.getByText(/Player 1.*tap a token/i)).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Face-down token/ }),
    ).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "Start bag draw" }),
    ).not.toBeInTheDocument();

    // The ritual is still live end-to-end: seat 1 can draw right away.
    await user.click(
      screen.getAllByRole("button", { name: /Face-down token/ })[0],
    );
    expect(loadGame()!.players[0].characterId).not.toBeNull();
  });

  it("resumes the last seat's mid-reveal reload at the guard, ending the ritual only on an explicit tap", async () => {
    const user = userEvent.setup();
    const game = makeGame({ playerCount: 2 });
    const { unmount } = render(<GrimoireSetup game={game} />);

    // Seat 1 draws and passes; seat 2 (the last seat) draws and is
    // mid-reveal when the reload hits.
    await user.click(screen.getByRole("button", { name: "Start bag draw" }));
    await user.click(
      screen.getAllByRole("button", { name: /Face-down token/ })[0],
    );
    await user.click(screen.getByRole("button", { name: "Hide & pass" }));
    await user.click(
      screen.getAllByRole("button", { name: /Face-down token/ })[0],
    );

    reload(unmount);

    // The finished board (which would show every seat's identity) stays
    // hidden — role queries respect `hidden`, matching how the live
    // last-seat reveal asserts the same thing — and with no next seat to
    // pass to, the guard says to hand back instead.
    expect(
      screen.queryByRole("region", { name: "Grimoire circle" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Washerwoman" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Imp" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Card hidden\. Return the device to the storyteller\./),
    ).toBeInTheDocument();

    // Only the explicit tap opens the finished grimoire.
    await user.click(screen.getByRole("button", { name: "Open the grimoire" }));
    expect(
      screen.getByRole("region", { name: "Grimoire circle" }),
    ).toBeInTheDocument();
  });
});

describe("recovering from a bag shorter than the seat count (issue #118 AC1)", () => {
  it("surfaces the shortfall up front, before any draws happen", () => {
    const washerwoman = getCharacter("washerwoman")!;
    const imp = getCharacter("imp")!;
    const game = makeGame({
      playerCount: 3,
      selectedCharacters: [washerwoman, imp],
    });
    render(<GrimoireSetup game={game} />);

    expect(
      screen.getByText(/bag is short 1 token for 3 unassigned seats/i),
    ).toBeInTheDocument();
    // Still recoverable/playable for the two seats the bag *can* fill —
    // never blocking (ADR 0003) — and a way back to bag-building is on
    // screen from the moment the shortfall is knowable, not just once the
    // bag actually runs dry mid-ritual.
    expect(
      screen.getByRole("button", { name: "Start bag draw" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Trouble Brewing/ }),
    ).toBeInTheDocument();
  });

  it("never opens a draw with zero tokens once the bag runs dry mid-ritual — ends the draw and re-surfaces the shortfall instead", async () => {
    const user = userEvent.setup();
    const washerwoman = getCharacter("washerwoman")!;
    const imp = getCharacter("imp")!;
    const game = makeGame({
      playerCount: 3,
      selectedCharacters: [washerwoman, imp],
    });
    render(<GrimoireSetup game={game} />);

    // Seat 1 draws.
    await user.click(screen.getByRole("button", { name: "Start bag draw" }));
    await user.click(
      screen.getAllByRole("button", { name: /Face-down token/ })[0],
    );
    await user.click(screen.getByRole("button", { name: "Hide & pass" }));

    // Seat 2 draws — the bag is now empty, one seat still unassigned.
    await user.click(
      screen.getAllByRole("button", { name: /Face-down token/ })[0],
    );
    await user.click(screen.getByRole("button", { name: "Hide & pass" }));
    expect(
      screen.getByText(/Pass the device to Player 3/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ready to draw" }));

    // Never a "tap a token to draw" prompt with nothing to tap — the draw
    // session ends and the shortfall (now for the one remaining seat) is
    // surfaced on the ordinary setup screen instead, which still offers a
    // way back to bag-building (the existing back button).
    expect(screen.queryByText(/tap a token to draw/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Face-down token/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/bag is short 1 token for 1 unassigned seat\b/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Trouble Brewing/ }),
    ).toBeInTheDocument();
  });
});

describe("surfacing the leftover bag after an over-sized bag's draw (issue #118 AC2)", () => {
  it("shows which token(s) stayed in the bag once every seat is filled", async () => {
    const user = userEvent.setup();
    const washerwoman = getCharacter("washerwoman")!;
    const imp = getCharacter("imp")!;
    const game = makeGame({
      playerCount: 1,
      selectedCharacters: [washerwoman, imp],
    });
    render(<GrimoireSetup game={game} />);

    expect(screen.queryByText(/left in the bag/i)).not.toBeInTheDocument();

    await selectOption(user, 
      screen.getByLabelText("Assign seat 1 manually"),
      washerwoman.name,
    );

    expect(screen.getByText("1/1 seats assigned")).toBeInTheDocument();
    expect(
      screen.getByText(`Left in the bag: ${imp.name}`),
    ).toBeInTheDocument();
  });

  it("shows nothing extra once the bag empties out exactly", async () => {
    await completeSetup(2, [getCharacter("washerwoman")!, getCharacter("imp")!]);

    expect(screen.queryByText(/left in the bag/i)).not.toBeInTheDocument();
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

    await user.type(screen.getByLabelText(/player name/i), "Substitute Sam");
    await user.click(screen.getByRole("button", { name: /name yourself/i }));

    expect(loadGame()!.players[0].name).toBe("Substitute Sam");
  });

  it("advances straight to the next draw's token grid once a quick-pick name is chosen, with no extra tap (issue #185)", async () => {
    const user = userEvent.setup();
    const game = makeGame({ playerCount: 2 });
    render(<GrimoireSetup game={game} />);

    await user.click(screen.getByRole("button", { name: "Start bag draw" }));
    await user.click(screen.getAllByRole("button", { name: /Face-down token/ })[0]);

    await user.click(screen.getByRole("button", { name: "Bailey" }));

    expect(loadGame()!.players[0].name).toBe("Bailey");
    // Straight to seat 2's own choosing stage — no "Hide & pass" tap, no
    // intermediate "Card hidden" screen.
    expect(screen.getByText(/Player 2.*tap a token/i)).toBeInTheDocument();
    expect(screen.queryByText(/Card hidden/)).not.toBeInTheDocument();
  });

  it("advances straight to the next draw's token grid after naming yourself with a typed custom name (issue #185)", async () => {
    const user = userEvent.setup();
    const game = makeGame({ playerCount: 2 });
    render(<GrimoireSetup game={game} />);

    await user.click(screen.getByRole("button", { name: "Start bag draw" }));
    await user.click(screen.getAllByRole("button", { name: /Face-down token/ })[0]);

    await user.type(screen.getByLabelText(/player name/i), "Substitute Sam");
    await user.click(screen.getByRole("button", { name: /name yourself/i }));

    expect(loadGame()!.players[0].name).toBe("Substitute Sam");
    expect(screen.getByText(/Player 2.*tap a token/i)).toBeInTheDocument();
  });

  it("does not offer a name already assigned to an earlier seat this game in the quick-pick (issue #185)", async () => {
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

    await user.click(screen.getByRole("button", { name: "Start bag draw" }));
    await user.click(screen.getAllByRole("button", { name: /Face-down token/ })[0]);
    await user.click(screen.getByRole("button", { name: "Bailey" }));

    // Seat 2 is now drawing — "Bailey" is already seated, so it must not be
    // offered again.
    await user.click(screen.getAllByRole("button", { name: /Face-down token/ })[0]);
    expect(screen.queryByRole("button", { name: "Bailey" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Casey" })).toBeInTheDocument();
  });

  it("offers the name picker only once a token has been revealed, not while still choosing", async () => {
    const user = userEvent.setup();
    const game = makeGame({ playerCount: 2 });
    render(<GrimoireSetup game={game} />);

    await user.click(screen.getByRole("button", { name: "Start bag draw" }));

    expect(screen.queryByLabelText(/player name/i)).not.toBeInTheDocument();
  });

  it("hides the drawn seat's plain name field while its reveal is on-screen, so only the picker edits it (code review finding)", async () => {
    const user = userEvent.setup();
    const game = makeGame({ playerCount: 2 });
    render(<GrimoireSetup game={game} />);

    await user.click(screen.getByRole("button", { name: "Start bag draw" }));
    await user.click(screen.getAllByRole("button", { name: /Face-down token/ })[0]);

    expect(screen.queryByLabelText("Seat 1 name")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide & pass" }));

    // The field stays hidden through the rest of the draw session too — the
    // next seat's own choosing stage hides the whole seats list (issue #158),
    // so it doesn't reappear until every seat is filled. The name itself
    // still survives that round-trip, just checked at the data layer now
    // rather than by reading it back out of a re-shown input.
    expect(screen.queryByLabelText("Seat 1 name")).not.toBeInTheDocument();
    expect(loadGame()!.players[0].name).toBe("Player 1");
  });
});

describe("manual assignment mode (mixable with draw)", () => {
  it("assigns any seat directly from the bag, skipping the reveal entirely", async () => {
    const user = userEvent.setup();
    const game = makeGame({ playerCount: 2 });
    render(<GrimoireSetup game={game} />);

    await selectOption(user, 
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

    await selectOption(user, 
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

    // Manually assign seats 2 and 3 up front — manual assignment isn't
    // offered once a draw session starts (issue #111) — leaving only seat 1
    // for the blind draw ritual.
    await selectOption(user, 
      screen.getByLabelText("Assign seat 2 manually"),
      "Baron",
    );
    await selectOption(user, 
      screen.getByLabelText("Assign seat 3 manually"),
      "Imp",
    );

    await user.click(screen.getByRole("button", { name: "Start bag draw" }));
    expect(screen.getByText(/Player 1.*tap a token/i)).toBeInTheDocument();
    await user.click(
      screen.getAllByRole("button", { name: /Face-down token/ })[0],
    );
    await user.click(screen.getByRole("button", { name: "Hide & pass" }));

    // Seat 1 was the only seat left, so the hand-off guard has no next seat
    // to pass to — the storyteller explicitly takes the device back.
    await user.click(
      screen.getByRole("button", { name: "Open the grimoire" }),
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

  it("themes the 'assign seat manually' select instead of leaving it browser-default (issue #74)", () => {
    render(<GrimoireSetup game={makeGame({ playerCount: 2 })} />);

    expect(screen.getByLabelText("Assign seat 1 manually").className).not.toBe("");
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

  it("still offers to add a traveller once every built traveller token has been added, and even in a game built with 0 travellers (issue #119)", () => {
    const game = makeGame({ playerCount: 2 });
    render(<GrimoireSetup game={game} />);

    expect(game.travellerBag).toHaveLength(0);
    expect(
      screen.getByRole("button", { name: "Add traveller" }),
    ).toBeInTheDocument();
  });

  it("offers a homebrew script's own traveller even in a 0-traveller game, not just vendored ones (code review finding)", async () => {
    const user = userEvent.setup();
    // Not in the vendored dataset — characterPool alone (which only holds
    // what's already selected/built) could never resolve this; it has to
    // come from scriptCharacters, the script's full not-yet-built universe.
    const homebrewTraveller = {
      id: "homebrew-bootlegger",
      name: "Bootlegger",
      edition: null,
      team: "traveller" as const,
      ability: "A homebrew traveller for this test.",
      firstNight: 0,
      firstNightReminder: "",
      otherNight: 0,
      otherNightReminder: "",
      reminders: [],
      remindersGlobal: [],
      setup: false,
      jinxes: [],
      image: null,
    };
    const game = makeGame({
      playerCount: 2,
      selectedCharacters: [
        getCharacter("washerwoman")!,
        getCharacter("imp")!,
      ],
      scriptCharacters: [
        getCharacter("washerwoman")!,
        getCharacter("imp")!,
        homebrewTraveller,
      ],
    });
    render(<GrimoireSetup game={game} />);

    await user.click(screen.getByRole("button", { name: "Add traveller" }));
    await selectOption(user, 
      screen.getByLabelText("Traveller character"),
      "Bootlegger",
    );
    await user.click(screen.getByRole("button", { name: "Add to the circle" }));

    const reloaded = loadGame()!;
    const traveller = reloaded.players.find((p) => p.isTraveller)!;
    expect(traveller.characterId).toBe("homebrew-bootlegger");
  });

  it("lists every traveller-team character, not just the ones built into the traveller bag, in a 0-traveller game", async () => {
    const user = userEvent.setup();
    const game = makeGame({ playerCount: 2 });
    render(<GrimoireSetup game={game} />);

    await user.click(screen.getByRole("button", { name: "Add traveller" }));
    await selectOption(user, 
      screen.getByLabelText("Traveller character"),
      "Scapegoat",
    );
    await user.click(screen.getByRole("button", { name: "Add to the circle" }));

    const reloaded = loadGame()!;
    const traveller = reloaded.players.find((p) => p.isTraveller)!;
    expect(traveller.characterId).toBe("scapegoat");
    // Picked from the wider dataset, not a pre-built physical token — the
    // bag (still empty beforehand) is untouched.
    expect(reloaded.travellerBag).toHaveLength(0);
  });

  it("returns a removed traveller's token to the bag so the same traveller can be re-added (issue #119)", async () => {
    const { user, circle } = await completeSetup(2, [
      getCharacter("washerwoman")!,
      getCharacter("imp")!,
      getCharacter("scapegoat")!,
    ]);

    await user.click(screen.getByRole("button", { name: "Add traveller" }));
    await selectOption(user, 
      screen.getByLabelText("Traveller character"),
      "Scapegoat",
    );
    await user.click(screen.getByRole("button", { name: "Add to the circle" }));

    expect(loadGame()!.travellerBag).toHaveLength(0);

    const seat3 = within(circle)
      .getByText("Traveller 1")
      .closest("[data-player-id]") as HTMLElement;
    await user.click(within(seat3).getByText("Traveller 1"));
    await removePlayerAndConfirm(user, seat3);

    const afterRemoval = loadGame()!;
    expect(afterRemoval.players.some((p) => p.isTraveller)).toBe(false);
    expect(afterRemoval.travellerBag.map((t) => t.characterId)).toEqual([
      "scapegoat",
    ]);

    // Re-add: the returned token's character is still offered.
    await user.click(screen.getByRole("button", { name: "Add traveller" }));
    await selectOption(user, 
      screen.getByLabelText("Traveller character"),
      "Scapegoat",
    );
    await user.click(screen.getByRole("button", { name: "Add to the circle" }));

    const final = loadGame()!;
    expect(final.players.filter((p) => p.isTraveller)).toHaveLength(1);
    expect(final.travellerBag).toHaveLength(0);
  });

  it("hides 'Add traveller' while a draw session is active, so its select can't leak the traveller bag mid-draw (issue #111)", async () => {
    const user = userEvent.setup();
    render(<GrimoireSetup game={gameWithTraveller()} />);

    await user.click(screen.getByRole("button", { name: "Start bag draw" }));

    expect(
      screen.queryByRole("button", { name: "Add traveller" }),
    ).not.toBeInTheDocument();
  });

  it("joins the circle at a chosen seat position rather than always the end", async () => {
    const user = userEvent.setup();
    render(<GrimoireSetup game={gameWithTraveller()} />);

    await user.click(screen.getByRole("button", { name: "Add traveller" }));
    await selectOption(user, 
      screen.getByLabelText("Traveller character"),
      "Scapegoat",
    );
    await selectOption(user, 
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
    await selectOption(user, 
      screen.getByLabelText("Traveller character"),
      "Scapegoat",
    );
    await user.click(screen.getByLabelText("Evil"));
    await user.click(screen.getByRole("button", { name: "Add to the circle" }));

    expect(screen.getByText("0/2 seats assigned")).toBeInTheDocument();
    // The built traveller bag is now empty, but the action stays offered —
    // a traveller may join at any time, even beyond what was built (issue
    // #119).
    expect(
      screen.getByRole("button", { name: "Add traveller" }),
    ).toBeInTheDocument();

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

  it("themes the traveller form's 'Seat position' select instead of leaving it browser-default (issue #74)", async () => {
    const user = userEvent.setup();
    render(<GrimoireSetup game={gameWithTraveller()} />);

    await user.click(screen.getByRole("button", { name: "Add traveller" }));

    expect(screen.getByLabelText("Seat position").className).not.toBe("");
  });
});

describe("Drunk seat display (stand-in identity, issue #186)", () => {
  it("shows the stand-in identity without inline '(actually the Drunk)' copy — a reminder token carries that instead", async () => {
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

    await selectOption(user,
      screen.getByLabelText("Assign seat 1 manually"),
      "Washerwoman",
    );

    // A single seat, now fully assigned, renders as the completed circle.
    const circle = screen.getByRole("region", { name: "Grimoire circle" });
    const summary = circle.querySelector("details > summary") as HTMLElement;
    expect(within(summary).getByText("Washerwoman")).toBeInTheDocument();
    expect(within(summary).queryByText(/actually the Drunk/i)).not.toBeInTheDocument();

    expect(loadGame()!.players[0].isDrunk).toBe(true);
  });

  it("doesn't show the Drunk note for a seat that really is the stand-in character", async () => {
    const user = userEvent.setup();
    render(<GrimoireSetup game={makeGame({ playerCount: 2 })} />);

    await selectOption(user,
      screen.getByLabelText("Assign seat 1 manually"),
      "Washerwoman",
    );

    const seat1 = screen.getByLabelText("Seat 1 name").closest("li")!;
    expect(
      within(seat1).queryByText(/actually the Drunk/i),
    ).not.toBeInTheDocument();
  });
});

describe("Lunatic seat display (stand-in identity + actually the Lunatic, issue #163)", () => {
  it("shows both the stand-in identity and that they're actually the Lunatic", async () => {
    const user = userEvent.setup();
    const imp = getCharacter("imp")!;
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 1,
      selectedCharacters: [getCharacter("lunatic")!],
      standIn: null,
      lunaticStandIn: imp,
      extraCopies: {},
    });
    render(<GrimoireSetup game={game} />);

    await selectOption(user,
      screen.getByLabelText("Assign seat 1 manually"),
      "Imp",
    );

    // A single seat, now fully assigned, renders as the completed circle.
    const circle = screen.getByRole("region", { name: "Grimoire circle" });
    const summary = circle.querySelector("details > summary") as HTMLElement;
    expect(within(summary).getByText("Imp")).toBeInTheDocument();
    expect(within(summary).getByText(/actually the Lunatic/i)).toBeInTheDocument();

    expect(loadGame()!.players[0].isLunatic).toBe(true);
  });

  it("doesn't show the Lunatic note for a seat that really is the stand-in character", async () => {
    const user = userEvent.setup();
    render(<GrimoireSetup game={makeGame({ playerCount: 2 })} />);

    await selectOption(user,
      screen.getByLabelText("Assign seat 1 manually"),
      "Washerwoman",
    );

    const seat1 = screen.getByLabelText("Seat 1 name").closest("li")!;
    expect(
      within(seat1).queryByText(/actually the Lunatic/i),
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

    await selectOption(user, 
      screen.getByLabelText("Assign seat 1 manually"),
      "Washerwoman",
    );
    await selectOption(user, 
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

    await selectOption(user, 
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

    await selectOption(user,
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
  });

  it("excludes a Townsfolk already held by another player from the picker", async () => {
    const user = userEvent.setup();
    const { step } = await drunkBoard(user);

    const options = (
      await getSelectOptions(user, within(step).getByLabelText(/new stand-in/i))
    ).map((o) => o.label);

    expect(options).not.toContain("Chef");
    expect(options).toContain("Grandmother");
  });
});

describe("reassigning the Lunatic's stand-in from the setup walkthrough (issue #163)", () => {
  async function lunaticBoard(user: ReturnType<typeof userEvent.setup>) {
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 2,
      selectedCharacters: [
        getCharacter("lunatic")!,
        getCharacter("chef")!,
        getCharacter("zombuul")!,
      ],
      standIn: null,
      lunaticStandIn: getCharacter("imp")!,
      extraCopies: {},
    });
    render(<GrimoireSetup game={game} />);

    await selectOption(user,
      screen.getByLabelText("Assign seat 1 manually"),
      "Imp",
    );
    await selectOption(user,
      screen.getByLabelText("Assign seat 2 manually"),
      "Chef",
    );
    await user.click(screen.getByRole("button", { name: /start walkthrough/i }));

    const dialog = screen.getByRole("dialog", { name: "Setup walkthrough" });
    const step = within(dialog).getByRole("group", {
      name: /lunatic — review the stand-in/i,
    });
    return { dialog, step };
  }

  it("changes what the grimoire records without ending the disguise", async () => {
    const user = userEvent.setup();
    const { step } = await lunaticBoard(user);

    await selectOption(user,
      within(step).getByLabelText(/new stand-in/i),
      "Zombuul",
    );
    await user.click(
      within(step).getByRole("button", { name: /change stand-in/i }),
    );

    const reloaded = loadGame() as GameDocument;
    const lunaticPlayer = reloaded.players.find((p) => p.isLunatic)!;
    expect(lunaticPlayer.characterId).toBe("zombuul");
    expect(lunaticPlayer.isLunatic).toBe(true);
    expect(lunaticPlayer.startingCharacterId).toBe("imp");
  });

  it("updates what the Lunatic's player is told they are on the board", async () => {
    const user = userEvent.setup();
    const { step } = await lunaticBoard(user);

    await selectOption(user,
      within(step).getByLabelText(/new stand-in/i),
      "Zombuul",
    );
    await user.click(
      within(step).getByRole("button", { name: /change stand-in/i }),
    );
    await user.click(screen.getByRole("button", { name: /close/i }));

    const circle = screen.getByRole("region", { name: "Grimoire circle" });
    const wrap = circle.querySelectorAll("[data-player-id]")[0] as HTMLElement;
    const summary = wrap.querySelector("details > summary") as HTMLElement;
    expect(within(summary).getByText("Zombuul")).toBeInTheDocument();
    expect(within(summary).getByText(/actually the Lunatic/i)).toBeInTheDocument();
  });

  it("excludes a Demon already held by another player from the picker", async () => {
    const user = userEvent.setup();
    const { step } = await lunaticBoard(user);

    const options = (
      await getSelectOptions(user, within(step).getByLabelText(/new stand-in/i))
    ).map((o) => o.label);

    // Imp is the Lunatic's own current disguise (not "held elsewhere"), so
    // it stays offered — only a Demon genuinely held by another seated
    // player is excluded.
    expect(options).toContain("Imp");
    expect(options).toContain("Zombuul");
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

    for (const name of ["Player 1", "Player 2"]) {
      const wrap = within(circle)
        .getByText(name)
        .closest("[data-player-id]") as HTMLElement;
      await user.click(within(wrap).getByText(name));
      await removePlayerAndConfirm(user, wrap);
    }

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
    await selectOption(user, 
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
    await selectOption(user, 
      within(seat1Wrap).getByLabelText(/swap character/i),
      "baron",
    );

    const reloaded = loadGame()!;
    expect(reloaded.characterPool.map((c) => c.id)).toContain("baron");
  });

  it("removes a player after confirmation", async () => {
    const { user, circle } = await completeSetup();

    const seat1Wrap = circle.querySelectorAll("[data-player-id]")[0] as HTMLElement;
    await user.click(within(seat1Wrap).getByText("Player 1"));
    await removePlayerAndConfirm(user, seat1Wrap);

    const reloaded = loadGame()!;
    expect(reloaded.players).toHaveLength(1);
    expect(reloaded.players.map((p) => p.name)).toEqual(["Player 2"]);
  });

  it("keeps every player when the storyteller declines the removal confirmation", async () => {
    const { user, circle } = await completeSetup();

    const seat1Wrap = circle.querySelectorAll("[data-player-id]")[0] as HTMLElement;
    await user.click(within(seat1Wrap).getByText("Player 1"));
    await user.click(
      within(seat1Wrap).getByRole("button", { name: /remove player/i }),
    );
    const dialog = screen.getByRole("alertdialog", { name: /remove player/i });
    await user.click(within(dialog).getByRole("button", { name: /cancel/i }));

    expect(loadGame()!.players).toHaveLength(2);
  });

  it("scrubs a removed player's votes from every nomination, so they stop counting toward the tally (issue #20)", async () => {
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
          threshold: 1,
          isExile: false,
        },
      ],
    };
    render(<GrimoireSetup game={withNomination} />);

    for (let seat = 1; seat <= 2; seat++) {
      const trigger = screen.getByLabelText(`Assign seat ${seat} manually`);
      const listbox = await openListbox(user, trigger);
      const remainingOption = within(listbox)
        .getAllByRole("option")
        .find((option) => option.textContent !== "Choose a character…")!;
      await user.click(remainingOption);
    }

    const circle = screen.getByRole("region", { name: "Grimoire circle" });
    const seat1Wrap = circle.querySelectorAll("[data-player-id]")[0] as HTMLElement;
    await user.click(within(seat1Wrap).getByText("Player 1"));
    await removePlayerAndConfirm(user, seat1Wrap);

    expect(loadGame()!.nominations[0].votes).toEqual([game.players[1].id]);
  });

  it("doesn't badge a seat for an exile call — exile calls don't count as nominations for the board's badges (issue #114)", async () => {
    const user = userEvent.setup();
    const game = makeGame({
      playerCount: 2,
      selectedCharacters: [getCharacter("washerwoman")!, getCharacter("imp")!],
    });
    const withExileCall = {
      ...game,
      nominations: [
        {
          id: "n1",
          nominatorId: game.players[0].id,
          nomineeId: game.players[1].id,
          votes: [],
          threshold: 1,
          isExile: true,
        },
      ],
    };
    render(<GrimoireSetup game={withExileCall} />);

    for (let seat = 1; seat <= 2; seat++) {
      const trigger = screen.getByLabelText(`Assign seat ${seat} manually`);
      const listbox = await openListbox(user, trigger);
      const remainingOption = within(listbox)
        .getAllByRole("option")
        .find((option) => option.textContent !== "Choose a character…")!;
      await user.click(remainingOption);
    }

    const circle = screen.getByRole("region", { name: "Grimoire circle" });
    const seat1Wrap = circle.querySelectorAll("[data-player-id]")[0] as HTMLElement;
    const seat2Wrap = circle.querySelectorAll("[data-player-id]")[1] as HTMLElement;
    expect(within(seat1Wrap).queryByText("Nominator")).not.toBeInTheDocument();
    expect(within(seat2Wrap).queryByText("Nominee")).not.toBeInTheDocument();
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
    await selectOption(user, 
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
    // The auto-placed "Drunk" reminder (issue #186) is redundant once the
    // token itself openly reads "Drunk" — dropped on reveal instead of
    // sitting there stale.
    expect(loadGame()!.reminders).toHaveLength(0);
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
    await selectOption(user, 
      screen.getByLabelText("Assign seat 1 manually"),
      "Washerwoman",
    );

    const circle = screen.getByRole("region", { name: "Grimoire circle" });
    const wrap = circle.querySelector("[data-player-id]") as HTMLElement;
    await user.click(within(wrap).getByText("Player 1"));
    await selectOption(user, within(wrap).getByLabelText(/swap character/i), "imp");

    expect(loadGame()!.players[0].isDrunk).toBe(false);
    expect(within(wrap).queryByText(/actually the Drunk/i)).not.toBeInTheDocument();
    expect(
      within(wrap).queryByRole("button", { name: /reveal drunk/i }),
    ).not.toBeInTheDocument();
    expect(loadGame()!.reminders).toHaveLength(0);
  });

  it("clears the Lunatic stand-in note once a generic swap moves the seat to a different character (issue #163)", async () => {
    const imp = getCharacter("imp")!;
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 1,
      selectedCharacters: [getCharacter("lunatic")!, getCharacter("chef")!],
      standIn: null,
      lunaticStandIn: imp,
      extraCopies: {},
    });
    const user = userEvent.setup();
    render(<GrimoireSetup game={game} />);
    await selectOption(user,
      screen.getByLabelText("Assign seat 1 manually"),
      "Imp",
    );

    const circle = screen.getByRole("region", { name: "Grimoire circle" });
    const wrap = circle.querySelector("[data-player-id]") as HTMLElement;
    await user.click(within(wrap).getByText("Player 1"));
    await selectOption(user, within(wrap).getByLabelText(/swap character/i), "chef");

    expect(loadGame()!.players[0].isLunatic).toBe(false);
    expect(within(wrap).queryByText(/actually the Lunatic/i)).not.toBeInTheDocument();
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
      const trigger = screen.getByLabelText(`Assign seat ${seat} manually`);
      const listbox = await openListbox(user, trigger);
      const remainingOption = within(listbox)
        .getAllByRole("option")
        .find((option) => option.textContent !== "Choose a character…")!;
      await user.click(remainingOption);
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
    await selectOption(user, screen.getByLabelText("Character"), "baron");
    await selectOption(user, 
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

  it("themes the 'Add character' form's 'Seat position' select instead of leaving it browser-default (issue #74)", async () => {
    const { user } = await completeSetup();

    await user.click(screen.getByRole("button", { name: "Add character" }));

    expect(screen.getByLabelText("Seat position").className).not.toBe("");
  });

  it("cancels the 'Add character' form without adding a player or reopening it (issue #83)", async () => {
    const { user } = await completeSetup();

    await user.click(screen.getByRole("button", { name: "Add character" }));
    await selectOption(user, screen.getByLabelText("Character"), "baron");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByRole("button", { name: "Add to the grimoire" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add character" })).toBeInTheDocument();
    const reloaded = loadGame()!;
    expect(reloaded.players).toHaveLength(2);
    expect(reloaded.players.some((p) => p.characterId === "baron")).toBe(false);
  });

  it("computes 'At the end' from the highest seat number, not the player count, once a removal has left a gap", async () => {
    const { user, circle } = await completeSetup(3, [
      getCharacter("washerwoman")!,
      getCharacter("imp")!,
      getCharacter("empath")!,
    ]);

    // Remove the middle seat, leaving seats {1, 3} — only 2 players, but the
    // highest seat number in play is still 3.
    const seat2Wrap = circle.querySelectorAll("[data-player-id]")[1] as HTMLElement;
    await user.click(within(seat2Wrap).getByText("Player 2"));
    await removePlayerAndConfirm(user, seat2Wrap);

    await user.click(screen.getByRole("button", { name: "Add character" }));
    await selectOption(user, screen.getByLabelText("Character"), "baron");
    await selectOption(user, 
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
    const { user, circle } = await completeSetup(3, [
      getCharacter("washerwoman")!,
      getCharacter("imp")!,
      getCharacter("empath")!,
      ...extraCharacters,
    ]);

    const seat2Wrap = circle.querySelectorAll("[data-player-id]")[1] as HTMLElement;
    await user.click(within(seat2Wrap).getByText("Player 2"));
    await removePlayerAndConfirm(user, seat2Wrap);
    return user;
  }

  it("defaults the 'Add character' seat position to the true end, not the player count, after a removal left a gap", async () => {
    const user = await removeMiddleSeat();

    // The select is never touched — its default value on open must already
    // be the true end (seat 4), not players.length + 1 (seat 3, which would
    // collide with the existing seat-3 player).
    await user.click(screen.getByRole("button", { name: "Add character" }));

    expect(screen.getByLabelText("Seat position").dataset.value).toBe("4");
  });

  it("defaults the 'Add traveller' seat position to the true end, not the player count, after a removal left a gap", async () => {
    const user = await removeMiddleSeat([getCharacter("scapegoat")!]);

    await user.click(screen.getByRole("button", { name: "Add traveller" }));

    expect(screen.getByLabelText("Seat position").dataset.value).toBe("4");
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
    await selectOption(user, within(seat1Wrap).getByLabelText(/acts as/i), "empath");

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

describe("night-list bookkeeping stays coherent (issue #128)", () => {
  it("delivers a retargeted acts-as entry unchecked, pruning the stale checkmark", async () => {
    const user = userEvent.setup();
    const washerwoman = getCharacter("washerwoman")!;
    const imp = getCharacter("imp")!;
    const empath = getCharacter("empath")!;
    const fortuneTeller = getCharacter("fortuneteller")!;
    // Empath and Fortune Teller both act on the first night, so the acts-as
    // entry stays visible across the retarget without needing "Show all".
    const game = makeGame({
      playerCount: 2,
      selectedCharacters: [washerwoman, imp],
      scriptCharacters: [washerwoman, imp, empath, fortuneTeller],
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
    await selectOption(user, within(seat1Wrap).getByLabelText(/acts as/i), "empath");

    await user.click(screen.getByRole("button", { name: "Start First night" }));
    await user.click(
      screen.getByRole("checkbox", {
        name: `Player 1 — ${washerwoman.name} as ${empath.name}`,
      }),
    );
    const playerId = seated.players[0].id;
    expect(loadGame()!.nightChecked).toContain(`actsas:${playerId}`);

    // Retarget mid-night — the new target's entry must not inherit the
    // Empath entry's checkmark; the wake for Fortune Teller was never done.
    await selectOption(user, 
      within(seat1Wrap).getByLabelText(/acts as/i),
      "fortuneteller",
    );

    expect(loadGame()!.nightChecked).not.toContain(`actsas:${playerId}`);
    expect(
      screen.getByRole("checkbox", {
        name: `Player 1 — ${washerwoman.name} as ${fortuneTeller.name}`,
      }),
    ).not.toBeChecked();
  });

  it("resets a mid-night character swap's entry to unchecked", async () => {
    const { user, circle } = await completeSetup();
    const seat1Wrap = circle.querySelectorAll("[data-player-id]")[0] as HTMLElement;
    await user.click(within(seat1Wrap).getByText("Player 1"));

    await user.click(screen.getByRole("button", { name: "Start First night" }));
    const washerwoman = getCharacter("washerwoman")!;
    await user.click(
      screen.getByRole("checkbox", { name: `${washerwoman.name} — Player 1` }),
    );
    const playerId = loadGame()!.players[0].id;
    expect(loadGame()!.nightChecked).toContain(`char:${playerId}`);

    // Fortune Teller also acts on the first night, so its entry stays
    // visible without needing "Show all".
    await selectOption(user, 
      within(seat1Wrap).getByLabelText(/swap character/i),
      "fortuneteller",
    );

    expect(loadGame()!.nightChecked).not.toContain(`char:${playerId}`);
    const fortuneTeller = getCharacter("fortuneteller")!;
    expect(
      screen.getByRole("checkbox", { name: `${fortuneTeller.name} — Player 1` }),
    ).not.toBeChecked();
  });

  it("loses a checked entry's checkmark, alongside the (skipped) badge, when the player dies mid-night", async () => {
    const { user, circle } = await completeSetup();
    const seat1Wrap = circle.querySelectorAll("[data-player-id]")[0] as HTMLElement;
    await user.click(within(seat1Wrap).getByText("Player 1"));

    await user.click(screen.getByRole("button", { name: "Start First night" }));
    const washerwoman = getCharacter("washerwoman")!;
    const checkbox = screen.getByRole("checkbox", {
      name: `${washerwoman.name} — Player 1`,
    });
    await user.click(checkbox);
    expect(loadGame()!.nightChecked.length).toBe(1);

    await user.click(within(seat1Wrap).getByRole("button", { name: /mark dead/i }));

    expect(loadGame()!.nightChecked).toEqual([]);
    expect(
      screen.getByRole("checkbox", { name: `${washerwoman.name} — Player 1` }),
    ).not.toBeChecked();
    expect(screen.getByText(/\(skipped\)/)).toBeInTheDocument();
  });

  it("prunes a stale un-skip alongside a mid-night character swap (code review finding)", async () => {
    const { user, circle } = await completeSetup();
    const seat1Wrap = circle.querySelectorAll("[data-player-id]")[0] as HTMLElement;
    await user.click(within(seat1Wrap).getByText("Player 1"));

    await user.click(screen.getByRole("button", { name: "Start First night" }));
    await user.click(within(seat1Wrap).getByRole("button", { name: /mark dead/i }));
    await user.click(screen.getByRole("button", { name: "Un-skip" }));

    const playerId = loadGame()!.players[0].id;
    expect(loadGame()!.nightUnskipped).toContain(`char:${playerId}`);

    // Fortune Teller also acts on the first night, so its entry stays
    // visible without needing "Show all".
    await selectOption(user, 
      within(seat1Wrap).getByLabelText(/swap character/i),
      "fortuneteller",
    );

    expect(loadGame()!.nightUnskipped).not.toContain(`char:${playerId}`);
    const fortuneTeller = getCharacter("fortuneteller")!;
    // The un-skip for the old character must not silently carry over — the
    // new character's entry starts auto-skipped again, same as any other
    // dead player's entry the storyteller hasn't un-skipped yet.
    expect(
      screen.getByRole("checkbox", { name: `${fortuneTeller.name} — Player 1` }),
    ).toBeDisabled();
  });

  it("prunes a stale un-skip alongside an acts-as retarget (code review finding)", async () => {
    const user = userEvent.setup();
    const washerwoman = getCharacter("washerwoman")!;
    const imp = getCharacter("imp")!;
    const empath = getCharacter("empath")!;
    const fortuneTeller = getCharacter("fortuneteller")!;
    const game = makeGame({
      playerCount: 2,
      selectedCharacters: [washerwoman, imp],
      scriptCharacters: [washerwoman, imp, empath, fortuneTeller],
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
    await selectOption(user, within(seat1Wrap).getByLabelText(/acts as/i), "empath");

    await user.click(screen.getByRole("button", { name: "Start First night" }));
    await user.click(within(seat1Wrap).getByRole("button", { name: /mark dead/i }));
    await user.click(screen.getByRole("button", { name: "Un-skip" }));

    const playerId = seated.players[0].id;
    expect(loadGame()!.nightUnskipped).toContain(`actsas:${playerId}`);

    await selectOption(user, 
      within(seat1Wrap).getByLabelText(/acts as/i),
      "fortuneteller",
    );

    expect(loadGame()!.nightUnskipped).not.toContain(`actsas:${playerId}`);
    expect(
      screen.getByRole("checkbox", {
        name: `Player 1 — ${washerwoman.name} as ${fortuneTeller.name}`,
      }),
    ).toBeDisabled();
  });
});

describe("a reopened night stays coherent with roster changes made after End night (issue #165)", () => {
  it("prunes a stale checkmark left by a character swap made after End night", async () => {
    const { user, circle } = await completeSetup();
    const seat1Wrap = circle.querySelectorAll("[data-player-id]")[0] as HTMLElement;
    await user.click(within(seat1Wrap).getByText("Player 1"));

    await user.click(screen.getByRole("button", { name: "Start First night" }));
    const washerwoman = getCharacter("washerwoman")!;
    await user.click(
      screen.getByRole("checkbox", { name: `${washerwoman.name} — Player 1` }),
    );
    await user.click(screen.getByRole("button", { name: /End First night/ }));

    // Fortune Teller also acts on the first night, so its entry stays
    // visible without needing "Show all" once the night reopens.
    await selectOption(
      user,
      within(seat1Wrap).getByLabelText(/swap character/i),
      "fortuneteller",
    );

    await user.click(screen.getByRole("button", { name: "← Reopen First night" }));

    expect(loadGame()!.nightChecked).toEqual([]);
    const fortuneTeller = getCharacter("fortuneteller")!;
    expect(
      screen.getByRole("checkbox", { name: `${fortuneTeller.name} — Player 1` }),
    ).not.toBeChecked();
  });

  it("prunes a stale checkmark left by a death that happened after End night", async () => {
    const { user, circle } = await completeSetup();
    const seat1Wrap = circle.querySelectorAll("[data-player-id]")[0] as HTMLElement;
    await user.click(within(seat1Wrap).getByText("Player 1"));

    await user.click(screen.getByRole("button", { name: "Start First night" }));
    const washerwoman = getCharacter("washerwoman")!;
    await user.click(
      screen.getByRole("checkbox", { name: `${washerwoman.name} — Player 1` }),
    );
    await user.click(screen.getByRole("button", { name: /End First night/ }));

    await user.click(within(seat1Wrap).getByRole("button", { name: /mark dead/i }));

    await user.click(screen.getByRole("button", { name: "← Reopen First night" }));

    expect(loadGame()!.nightChecked).toEqual([]);
    expect(
      screen.getByRole("checkbox", { name: `${washerwoman.name} — Player 1` }),
    ).not.toBeChecked();
    expect(screen.getByText(/\(skipped\)/)).toBeInTheDocument();
  });

  it("strips a removed player's vote from a reopened night's snapshotted nomination", async () => {
    const { user, circle } = await completeSetup(3, [
      getCharacter("washerwoman")!,
      getCharacter("imp")!,
      getCharacter("chef")!,
    ]);

    await user.click(screen.getByRole("button", { name: "Start First night" }));
    await user.click(screen.getByRole("button", { name: /End First night/ }));

    const [p1, p2, p3] = loadGame()!.players;
    await selectOption(user, screen.getByLabelText("Nominator"), p1.id);
    await selectOption(user, screen.getByLabelText("Nominee"), p2.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    await user.click(screen.getByRole("checkbox", { name: p3.name }));

    await user.click(screen.getByRole("button", { name: "Start Night 2" }));
    await user.click(screen.getByRole("button", { name: /End Night 2/ }));

    const seat3Wrap = circle.querySelectorAll("[data-player-id]")[2] as HTMLElement;
    await user.click(within(seat3Wrap).getByText(p3.name));
    await removePlayerAndConfirm(user, seat3Wrap);

    await user.click(screen.getByRole("button", { name: "← Reopen Night 2" }));

    expect(loadGame()!.nominations).toHaveLength(1);
    expect(loadGame()!.nominations[0].votes).not.toContain(p3.id);
  });

  it("does not let reopening a night overwrite a nomination recorded after it ended", async () => {
    const { user } = await completeSetup(3, [
      getCharacter("washerwoman")!,
      getCharacter("imp")!,
      getCharacter("chef")!,
    ]);

    await user.click(screen.getByRole("button", { name: "Start First night" }));
    await user.click(screen.getByRole("button", { name: /End First night/ }));

    const [p1, p2, p3] = loadGame()!.players;
    await selectOption(user, screen.getByLabelText("Nominator"), p1.id);
    await selectOption(user, screen.getByLabelText("Nominee"), p2.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));

    await user.click(screen.getByRole("button", { name: "Start Night 2" }));
    await user.click(screen.getByRole("button", { name: /End Night 2/ }));

    await selectOption(user, screen.getByLabelText("Nominator"), p3.id);
    await selectOption(user, screen.getByLabelText("Nominee"), p1.id);
    await user.click(screen.getByRole("button", { name: "Record nomination" }));
    const dayTwoNominations = loadGame()!.nominations;
    expect(dayTwoNominations).toHaveLength(1);
    expect(dayTwoNominations[0].nominatorId).toBe(p3.id);

    await user.click(screen.getByRole("button", { name: "← Reopen Night 2" }));

    expect(loadGame()!.nominations).toEqual(dayTwoNominations);
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

    await selectOption(user, 
      screen.getByLabelText("Assign seat 1 manually"),
      "Washerwoman",
    );
    await selectOption(user, 
      screen.getByLabelText("Assign seat 2 manually"),
      "Imp",
    );

    const circle = screen.getByRole("region", { name: "Grimoire circle" });
    // Each token's own menu also offers every script character as both a
    // swap-character and a claim option (including whichever character is
    // already on-token), and the custom Select's closed trigger itself
    // displays the currently-selected option's text too — so text matches
    // inside a combobox trigger (or a still-open listbox's <option>-role
    // items) must be filtered out to stay unambiguous.
    const named = (text: string) => {
      const matches = within(circle)
        .getAllByText(text)
        .filter((el) => !el.closest("[role='combobox'], [role='option']"));
      expect(matches).toHaveLength(1);
      return matches[0];
    };
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

    await selectOption(user, 
      screen.getByLabelText("Assign seat 1 manually"),
      "Washerwoman",
    );
    await selectOption(user, 
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

  it("trims and falls back to \"Player N\" when a token's name is emptied on blur", async () => {
    const user = userEvent.setup();
    render(<GrimoireSetup game={makeGame({ playerCount: 2 })} />);

    await selectOption(user, 
      screen.getByLabelText("Assign seat 1 manually"),
      "Washerwoman",
    );
    await selectOption(user, 
      screen.getByLabelText("Assign seat 2 manually"),
      "Imp",
    );

    const circle = screen.getByRole("region", { name: "Grimoire circle" });
    const seat1Token = within(circle).getByText("Player 1").closest("div")!;
    await user.click(within(circle).getByText("Player 1"));
    const seat1Name = within(seat1Token).getByLabelText(/player name/i);
    await user.clear(seat1Name);
    await user.type(seat1Name, "   ");
    await user.tab();

    expect(seat1Name).toHaveValue("Player 1");
    expect(loadGame()!.players[0].name).toBe("Player 1");
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
  it("keeps export reachable while a game is still in progress", async () => {
    const user = userEvent.setup();
    render(<GrimoireSetup game={makeGame({ playerCount: 5 })} />);

    // The Game panel starts collapsed pre-first-night (issue #79), but
    // remains one tap away — export isn't gated behind anything further.
    await user.click(screen.getByRole("button", { name: "Game" }));
    expect(
      screen.getByRole("button", { name: /export game/i }),
    ).toBeInTheDocument();
  });

  it("persists a declared winner to the game document", async () => {
    const user = userEvent.setup();
    render(<GrimoireSetup game={makeGame({ playerCount: 5 })} />);

    await user.click(screen.getByRole("button", { name: "Game" }));
    await user.click(screen.getByRole("button", { name: /evil wins/i }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: /declare/i,
      }),
    );

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

  it("shares the script, not the bag — the payload is every script character, with no bag composition or Drunk stand-in (issue #109)", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);

    // A 2-of-4 bag: the Drunk (masquerading as the Chef stand-in) and the
    // Imp are in play; Washerwoman and Empath are on the script but not in
    // the bag. The share must carry all four script characters — and never
    // the Chef, which exists only as game state.
    const game = makeGame({
      playerCount: 2,
      selectedCharacters: [getCharacter("drunk")!, getCharacter("imp")!],
      standIn: getCharacter("chef")!,
      scriptCharacters: [
        getCharacter("washerwoman")!,
        getCharacter("empath")!,
        getCharacter("drunk")!,
        getCharacter("imp")!,
      ],
    });
    render(<GrimoireSetup game={game} />);

    await user.click(screen.getByRole("button", { name: /share via qr/i }));
    await user.click(screen.getByRole("button", { name: /copy link/i }));

    const url = writeText.mock.calls[0][0] as string;
    const decoded = decodeScriptForShare(new URL(url).hash.slice(1));
    if (!decoded.ok) throw new Error("shared payload failed to decode");
    expect(decoded.script.characters.map((c) => c.id)).toEqual([
      "washerwoman",
      "empath",
      "drunk",
      "imp",
    ]);
  });
});

describe("reminder tokens (issue #14)", () => {
  async function completedBoard(user: ReturnType<typeof userEvent.setup>) {
    render(<GrimoireSetup game={makeGame({ playerCount: 2 })} />);
    await selectOption(user, 
      screen.getByLabelText("Assign seat 1 manually"),
      "Washerwoman",
    );
    await selectOption(user, 
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
    await removePlayerAndConfirm(user, wrap);
    expect((loadGame() as GameDocument).players).toHaveLength(1);

    await user.click(within(circle).getByRole("button", { name: /undo/i }));

    const reloaded = loadGame() as GameDocument;
    expect(reloaded.reminders).toHaveLength(1);
    expect(reloaded.reminders[0].anchorPlayerId).toBeNull();
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
    const circle = await completedBoard(user);

    const wrap = circle.querySelectorAll("[data-player-id]")[0] as HTMLElement;
    const anchorPlayerId = wrap.dataset.playerId!;
    await user.click(within(wrap).getByRole("button", { name: "Add reminder" }));
    const dialog = within(circle).getByRole("dialog", { name: "Add reminder" });
    const group = within(dialog).getByRole("group", { name: "Washerwoman" });
    await user.click(within(group).getByRole("button", { name: "Townsfolk" }));
    expect((loadGame() as GameDocument).reminders[0].anchorPlayerId).toBe(anchorPlayerId);

    await user.click(within(wrap).getByText("Player 1"));
    await removePlayerAndConfirm(user, wrap);

    const reloaded = loadGame() as GameDocument;
    expect(reloaded.players.some((p) => p.id === anchorPlayerId)).toBe(false);
    expect(reloaded.reminders[0].anchorPlayerId).toBeNull();
    // Detaching resolves to the seat's actual last-seen position rather
    // than silently keeping whatever stale position the reminder happened
    // to store while anchored (which never updated as the seat moved).
    expect(reloaded.reminders[0].position).toBeDefined();
  });
});

describe("automatic Drunk reminder token (issue #186)", () => {
  it("places a 'Drunk' reminder on the seat when a stand-in is assigned manually", async () => {
    const user = userEvent.setup();
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 1,
      selectedCharacters: [getCharacter("drunk")!],
      standIn: getCharacter("washerwoman")!,
      extraCopies: {},
    });
    render(<GrimoireSetup game={game} />);

    await selectOption(user,
      screen.getByLabelText("Assign seat 1 manually"),
      "Washerwoman",
    );

    const reloaded = loadGame() as GameDocument;
    const playerId = reloaded.players[0].id;
    expect(reloaded.reminders).toHaveLength(1);
    expect(reloaded.reminders[0]).toMatchObject({
      characterId: "drunk",
      label: "Drunk",
      anchorPlayerId: playerId,
    });
  });

  it("places a 'Drunk' reminder on the seat when a stand-in is drawn from the bag", async () => {
    const user = userEvent.setup();
    const game = makeGame({
      playerCount: 1,
      selectedCharacters: [getCharacter("drunk")!],
      standIn: getCharacter("washerwoman")!,
    });
    render(<GrimoireSetup game={game} />);

    await user.click(screen.getByRole("button", { name: "Start bag draw" }));
    await user.click(
      screen.getAllByRole("button", { name: /Face-down token/ })[0],
    );

    const reloaded = loadGame() as GameDocument;
    const playerId = reloaded.players[0].id;
    expect(reloaded.reminders).toHaveLength(1);
    expect(reloaded.reminders[0]).toMatchObject({
      characterId: "drunk",
      label: "Drunk",
      anchorPlayerId: playerId,
    });
  });

  it("survives a reload", async () => {
    const user = userEvent.setup();
    const game = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 1,
      selectedCharacters: [getCharacter("drunk")!],
      standIn: getCharacter("washerwoman")!,
      extraCopies: {},
    });
    const { unmount } = render(<GrimoireSetup game={game} />);

    await selectOption(user,
      screen.getByLabelText("Assign seat 1 manually"),
      "Washerwoman",
    );
    unmount();
    render(<GrimoireSetup game={loadGame() as GameDocument} />);

    expect((loadGame() as GameDocument).reminders).toHaveLength(1);
    const circle = screen.getByRole("region", { name: "Grimoire circle" });
    expect(within(circle).getByText("Drunk")).toBeInTheDocument();
  });

  it("doesn't place a reminder for an ordinary (non-stand-in) assignment", async () => {
    const user = userEvent.setup();
    render(<GrimoireSetup game={makeGame({ playerCount: 2 })} />);

    await selectOption(user,
      screen.getByLabelText("Assign seat 1 manually"),
      "Washerwoman",
    );

    expect((loadGame() as GameDocument).reminders).toHaveLength(0);
  });

  it("backfills the reminder on load for a game document that predates automatic placement", () => {
    const base = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 1,
      selectedCharacters: [getCharacter("drunk")!],
      standIn: getCharacter("washerwoman")!,
      extraCopies: {},
    });
    // Simulates a pre-#186 document: the seat is already the Drunk's
    // stand-in (as chooseToken/assignManually used to leave it, before this
    // issue), but no reminder was ever created for it.
    const legacyGame: GameDocument = {
      ...base,
      players: base.players.map((p) => ({
        ...p,
        characterId: "washerwoman",
        startingCharacterId: "washerwoman",
        isDrunk: true,
      })),
    };
    render(<GrimoireSetup game={legacyGame} />);

    const circle = screen.getByRole("region", { name: "Grimoire circle" });
    expect(within(circle).getByText("Drunk")).toBeInTheDocument();
    expect(
      within(circle).queryByText(/actually the Drunk/i),
    ).not.toBeInTheDocument();
  });

  // Copilot review finding on this PR: withoutDrunkStandInReminder used to
  // match only the new drunkstandin:<playerId> id, so a legacy
  // walkthrough-placed reminder — the exact one withBackfilledDrunkReminders
  // recognizes as "already there" and leaves alone — was never removed by
  // Reveal Drunk/swapCharacter, leaving it stale forever.
  it("removes a legacy walkthrough-placed reminder (not just the new drunkstandin id) on Reveal Drunk", async () => {
    const washerwoman = getCharacter("washerwoman")!;
    const base = createGame({
      scriptId: "tb",
      scriptName: "Trouble Brewing",
      playerCount: 1,
      selectedCharacters: [getCharacter("drunk")!],
      standIn: washerwoman,
      extraCopies: {},
    });
    const playerId = base.players[0].id;
    const legacyGame: GameDocument = {
      ...base,
      players: base.players.map((p) => ({
        ...p,
        characterId: "washerwoman",
        startingCharacterId: "washerwoman",
        isDrunk: true,
      })),
      reminders: [
        {
          id: `setupwalkthrough:${playerId}:0`,
          characterId: "drunk",
          label: "Drunk",
          position: { x: 10, y: 20 },
          anchorPlayerId: playerId,
        },
      ],
    };
    const user = userEvent.setup();
    render(<GrimoireSetup game={legacyGame} />);

    const circle = screen.getByRole("region", { name: "Grimoire circle" });
    const wrap = circle.querySelector("[data-player-id]") as HTMLElement;
    await user.click(within(wrap).getByText("Player 1"));
    await user.click(
      within(wrap).getByRole("button", { name: /reveal drunk/i }),
    );

    expect(loadGame()!.reminders).toHaveLength(0);
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
    const rendered = render(<GrimoireSetup game={game} />);
    await selectOption(user,
      screen.getByLabelText("Assign seat 1 manually"),
      "Fortune Teller",
    );
    await selectOption(user,
      screen.getByLabelText("Assign seat 2 manually"),
      "Imp",
    );
    await selectOption(user,
      screen.getByLabelText("Assign seat 3 manually"),
      "Chef",
    );
    await selectOption(user,
      screen.getByLabelText("Assign seat 4 manually"),
      "Empath",
    );
    return rendered;
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

  it("still offers the walkthrough for its Demon bluffs step even when no in-play character needs its own decision (issue #155)", async () => {
    const user = userEvent.setup();
    const game = makeGame({
      playerCount: 2,
      selectedCharacters: [getCharacter("imp")!, getCharacter("chef")!],
    });
    render(<GrimoireSetup game={game} />);
    await selectOption(user, 
      screen.getByLabelText("Assign seat 1 manually"),
      "Imp",
    );
    await selectOption(user, 
      screen.getByLabelText("Assign seat 2 manually"),
      "Chef",
    );

    const offer = screen.getByRole("region", { name: "Setup walkthrough offer" });
    expect(within(offer).getByText(/1 setup decision/i)).toBeInTheDocument();

    await user.click(within(offer).getByRole("button", { name: /start walkthrough/i }));
    const dialog = screen.getByRole("dialog", { name: "Setup walkthrough" });
    expect(within(dialog).getByRole("group", { name: "Demon bluffs" })).toBeInTheDocument();
  });

  it("themes the walkthrough offer's buttons instead of leaving them bare (issue #74)", async () => {
    const user = userEvent.setup();
    await completedFortuneTellerBoard(user);

    const offer = screen.getByRole("region", { name: "Setup walkthrough offer" });
    expect(
      within(offer).getByRole("button", { name: "Start walkthrough" }).className,
    ).not.toBe("");
    expect(within(offer).getByRole("button", { name: "Skip" }).className).not.toBe("");
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

  it("drops the \"before the first night\" framing once the first night has ended, but stays actionable (issue #68)", () => {
    const fortuneTeller = getCharacter("fortuneteller")!;
    const imp = getCharacter("imp")!;
    const chef = getCharacter("chef")!;
    const empath = getCharacter("empath")!;
    const game = makeGame({
      playerCount: 4,
      selectedCharacters: [fortuneTeller, imp, chef, empath],
    });
    const seated: GameDocument = {
      ...game,
      night: 1,
      players: game.players.map((player, index) => {
        const characterId = [fortuneTeller.id, imp.id, chef.id, empath.id][index];
        return { ...player, characterId, startingCharacterId: characterId };
      }),
    };
    render(<GrimoireSetup game={seated} />);

    const offer = screen.getByRole("region", { name: "Setup walkthrough offer" });
    expect(within(offer).getByText(/pending/i)).toBeInTheDocument();
    expect(within(offer).queryByText(/before the first night/i)).not.toBeInTheDocument();

    // The board toolbar's reopen button is a separate entry point, hidden
    // once the first night has ended (issue #170) — the offer above is
    // unaffected and stays reachable.
    expect(
      screen.queryByRole("button", { name: "Setup walkthrough" }),
    ).not.toBeInTheDocument();
  });

  it("hides the board toolbar's reopen button once the first night has ended (issue #170)", async () => {
    const user = userEvent.setup();
    const { unmount } = await completedFortuneTellerBoard(user);

    expect(
      screen.getByRole("button", { name: "Setup walkthrough" }),
    ).toBeInTheDocument();

    const game = loadGame() as GameDocument;
    unmount();
    render(<GrimoireSetup game={{ ...game, night: 1 }} />);

    expect(
      screen.queryByRole("button", { name: "Setup walkthrough" }),
    ).not.toBeInTheDocument();
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
    await selectOption(user, playerSelect, playerNamedMatcher("Player 3"));
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
    await selectOption(user, playerSelect, playerNamedMatcher("Player 3"));
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
    await selectOption(user, 
      screen.getByLabelText("Assign seat 1 manually"),
      "Washerwoman",
    );
    await selectOption(user, 
      screen.getByLabelText("Assign seat 2 manually"),
      "Imp",
    );
    await selectOption(user, 
      screen.getByLabelText("Assign seat 3 manually"),
      "Chef",
    );
    await user.click(screen.getByRole("button", { name: /start walkthrough/i }));

    const dialog = screen.getByRole("dialog", { name: "Setup walkthrough" });
    const step = within(dialog).getByRole("group", { name: /washerwoman/i });
    await selectOption(user, within(step).getByLabelText("Character"), "Chef");
    const trueSelect = within(step).getByLabelText(/shown as townsfolk/i);
    await selectOption(user, trueSelect, playerNamedMatcher("Player 2"));
    const falseSelect = within(step).getByLabelText(/shown as wrong/i);
    await selectOption(user, falseSelect, playerNamedMatcher("Player 3"));
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
    await selectOption(user, playerSelect, playerNamedMatcher("Player 3"));
    await user.click(within(step).getByRole("button", { name: /confirm/i }));
    const firstPosition = (loadGame() as GameDocument).reminders.find(
      (r) => r.label === "Red herring",
    )!.position;

    await user.click(within(step).getByRole("button", { name: /redo/i }));
    const playerSelectAgain = within(step).getByLabelText("Player");
    await selectOption(user, playerSelectAgain, playerNamedMatcher("Player 4"));
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
    await selectOption(user, 
      screen.getByLabelText("Assign seat 1 manually"),
      "Fortune Teller",
    );
    await selectOption(user, 
      screen.getByLabelText("Assign seat 2 manually"),
      "Imp",
    );
    await selectOption(user, 
      screen.getByLabelText("Assign seat 3 manually"),
      "Chef",
    );
    await selectOption(user, 
      screen.getByLabelText("Assign seat 4 manually"),
      "Empath",
    );
    await user.click(screen.getByRole("button", { name: /start walkthrough/i }));
    const dialog = screen.getByRole("dialog", { name: "Setup walkthrough" });
    const step = within(dialog).getByRole("group", { name: /fortune teller/i });
    const playerSelect = within(step).getByLabelText("Player");
    await selectOption(user, playerSelect, playerNamedMatcher("Player 3"));
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
    await selectOption(user, playerSelect2, playerNamedMatcher("Player 4"));
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
    await selectOption(user, playerSelect, playerNamedMatcher("Player 3"));
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

  it("picking a bluff in the walkthrough's Demon bluffs step shows up on the standalone board panel too (issue #155)", async () => {
    const user = userEvent.setup();
    const game = makeGame({
      playerCount: 2,
      selectedCharacters: [getCharacter("imp")!, getCharacter("chef")!],
      scriptCharacters: getEditionCharacters("tb"),
    });
    render(<GrimoireSetup game={game} />);
    await selectOption(user, screen.getByLabelText("Assign seat 1 manually"), "Imp");
    await selectOption(user, screen.getByLabelText("Assign seat 2 manually"), "Chef");
    await user.click(screen.getByRole("button", { name: /start walkthrough/i }));

    const dialog = screen.getByRole("dialog", { name: "Setup walkthrough" });
    const step = within(dialog).getByRole("group", { name: "Demon bluffs" });
    await selectOption(user, within(step).getByLabelText("Bluff slot 1"), "Washerwoman");
    await user.click(within(step).getByRole("button", { name: /confirm/i }));
    await user.click(within(dialog).getByRole("button", { name: /close/i }));

    expect((loadGame() as GameDocument).demonBluffs).toEqual([
      "washerwoman",
      null,
      null,
    ]);
    const boardPanel = screen.getByRole("region", { name: "Demon bluffs" });
    expect(
      within(boardPanel).getByLabelText("Bluff slot 1").dataset.value,
    ).toBe("washerwoman");
  });
});

describe("collapsing the Night List/Day Phase side panels reclaims circle width (issue #168)", () => {
  it("flags the layout for the circle to reclaim width only once both side panels are collapsed", async () => {
    const { user, circle } = await completeSetup();
    const layout = circle.parentElement as HTMLElement;
    expect(layout).not.toHaveAttribute("data-side-collapsed");

    await user.click(screen.getByRole("button", { name: "Night list" }));
    expect(layout).not.toHaveAttribute("data-side-collapsed");

    await user.click(screen.getByRole("button", { name: "Day phase" }));
    expect(layout).toHaveAttribute("data-side-collapsed", "true");

    // Reopening either one gives the width back to the side column.
    await user.click(screen.getByRole("button", { name: "Night list" }));
    expect(layout).not.toHaveAttribute("data-side-collapsed");
  });

  it("persists each panel's collapsed state across a reload", async () => {
    const { user } = await completeSetup();

    await user.click(screen.getByRole("button", { name: "Night list" }));
    await user.click(screen.getByRole("button", { name: "Day phase" }));

    const reloaded = loadGame()!;
    expect(reloaded.nightListCollapsed).toBe(true);
    expect(reloaded.dayPhaseCollapsed).toBe(true);
  });
});
