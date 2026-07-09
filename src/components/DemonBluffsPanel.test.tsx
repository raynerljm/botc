import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { getCharacter, getEditionCharacters } from "@/lib/characters";
import { createGame, type GameDocument } from "@/lib/gameDocument";
import { getSelectOptions, selectOption } from "@/testUtils/selectOption";

import { DemonBluffsPanel } from "./DemonBluffsPanel";

const tb = getEditionCharacters("tb");

function makeGame(overrides: Partial<GameDocument> = {}): GameDocument {
  const base = createGame({
    scriptId: "tb",
    scriptName: "Trouble Brewing",
    playerCount: 5,
    // Only the Imp and two Minions are in play, so every Townsfolk/Outsider
    // on the script is a candidate not-in-play bluff.
    selectedCharacters: [
      getCharacter("imp")!,
      getCharacter("baron")!,
      getCharacter("poisoner")!,
    ],
    standIn: null,
    extraCopies: {},
    scriptCharacters: tb,
  });
  return { ...base, ...overrides };
}

function renderPanel(overrides: Partial<GameDocument> = {}) {
  const onChange = vi.fn();
  const game = makeGame(overrides);
  const view = render(<DemonBluffsPanel game={game} onChange={onChange} />);
  return { ...view, onChange, game };
}

describe("DemonBluffsPanel", () => {
  it("renders exactly three bluff slots", () => {
    renderPanel();

    expect(screen.getByLabelText("Bluff slot 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Bluff slot 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Bluff slot 3")).toBeInTheDocument();
  });

  it("defaults each slot's options to good characters not in play", async () => {
    const user = userEvent.setup();
    renderPanel();

    const slot = screen.getByLabelText("Bluff slot 1");
    const optionValues = (await getSelectOptions(user, slot)).map((o) => o.value);

    // Washerwoman (Townsfolk) is on the script but not in play.
    expect(optionValues).toContain("washerwoman");
    // Imp (Demon, in play) and Baron (Minion, in play) must not appear.
    expect(optionValues).not.toContain("imp");
    expect(optionValues).not.toContain("baron");
  });

  it("expands to every script character, any team or status, once 'show all' is on", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByLabelText(/show all characters/i));

    const slot = screen.getByLabelText("Bluff slot 1");
    const optionValues = (await getSelectOptions(user, slot)).map((o) => o.value);
    expect(optionValues).toContain("imp");
    expect(optionValues).toContain("baron");
  });

  it("keeps an already-chosen character selectable after 'show all' is turned back off", async () => {
    const user = userEvent.setup();
    // Imp is in play (evil), so it's only offered while "show all" is
    // checked — a legitimate Marionette/Lunatic bluff pick per the panel's
    // own rule.
    renderPanel({ demonBluffs: ["imp", null, null] });
    const slot = screen.getByLabelText("Bluff slot 1");
    const showAll = screen.getByLabelText(/show all characters/i);

    await user.click(showAll);
    expect(slot.dataset.value).toBe("imp");

    await user.click(showAll);

    // Without this fix, "imp" drops out of the option list once "show all"
    // is off (Imp is evil and in play), silently resetting the visible
    // selection to "Not set" even though game.demonBluffs[0] is still "imp".
    expect((await getSelectOptions(user, slot)).map((o) => o.value)).toContain(
      "imp",
    );
    expect(slot.dataset.value).toBe("imp");
  });

  it("flags an in-play character as '(in play)' once 'show all' surfaces it as a bluff option (issue #128)", async () => {
    const user = userEvent.setup();
    const game = makeGame();
    // "In play" for the annotation means held by a seated player right now
    // (not merely part of the game's roster) — Imp is on the roster and
    // seated here; Baron is on the roster but nobody's holding it yet.
    const seated: GameDocument = {
      ...game,
      players: game.players.map((p, i) => (i === 0 ? { ...p, characterId: "imp" } : p)),
    };
    render(<DemonBluffsPanel game={seated} onChange={vi.fn()} />);

    await user.click(screen.getByLabelText(/show all characters/i));

    const slot = screen.getByLabelText("Bluff slot 1");
    const options = await getSelectOptions(user, slot);
    expect(options.find((o) => o.value === "imp")?.label).toBe("Imp (in play)");

    // On the roster but not currently held by anyone — stays unannotated.
    expect(options.find((o) => o.value === "baron")?.label).not.toContain(
      "(in play)",
    );

    // Off the roster entirely — also unannotated.
    expect(
      options.find((o) => o.value === "washerwoman")?.label,
    ).not.toContain("(in play)");
  });

  it("stops flagging a character as '(in play)' once nobody holds it anymore, unlike the ever-growing character pool (issue #128)", async () => {
    const user = userEvent.setup();
    const game = makeGame();
    // Imp was swapped out mid-game (still lingering in characterPool, which
    // only ever grows) but no player currently holds it.
    const swappedAway: GameDocument = {
      ...game,
      players: game.players.map((p, i) => (i === 0 ? { ...p, characterId: "recluse" } : p)),
    };
    render(<DemonBluffsPanel game={swappedAway} onChange={vi.fn()} />);

    await user.click(screen.getByLabelText(/show all characters/i));

    const slot = screen.getByLabelText("Bluff slot 1");
    const options = await getSelectOptions(user, slot);
    expect(options.find((o) => o.value === "imp")?.label).not.toContain(
      "(in play)",
    );
  });

  it("selecting an in-play bluff is never blocked — only annotated (issue #128, ADR 0003)", async () => {
    const user = userEvent.setup();
    const { onChange, game } = renderPanel();

    await user.click(screen.getByLabelText(/show all characters/i));
    await selectOption(user, screen.getByLabelText("Bluff slot 1"), "imp");

    expect(onChange).toHaveBeenCalledWith({
      ...game,
      demonBluffs: ["imp", null, null],
    });
  });

  it("sets a slot's bluff and preserves the other slots", async () => {
    const user = userEvent.setup();
    const { onChange, game } = renderPanel({
      demonBluffs: [null, "librarian", null],
    });

    await selectOption(user, screen.getByLabelText("Bluff slot 1"), "washerwoman");

    expect(onChange).toHaveBeenCalledWith({
      ...game,
      demonBluffs: ["washerwoman", "librarian", null],
    });
  });

  it("clearing a slot sets it back to not set", async () => {
    const user = userEvent.setup();
    const { onChange, game } = renderPanel({
      demonBluffs: ["washerwoman", null, null],
    });

    await selectOption(user, screen.getByLabelText("Bluff slot 1"), "Not set");

    expect(onChange).toHaveBeenCalledWith({
      ...game,
      demonBluffs: [null, null, null],
    });
  });

  it("disables 'Show to Demon' until at least one bluff is set", () => {
    renderPanel();

    expect(screen.getByRole("button", { name: /show to demon/i })).toBeDisabled();
  });

  it("shows the three bluff tokens full-screen and closes deliberately", async () => {
    const user = userEvent.setup();
    renderPanel({ demonBluffs: ["washerwoman", "librarian", null] });

    await user.click(screen.getByRole("button", { name: /show to demon/i }));

    const dialog = screen.getByRole("dialog", { name: /demon bluffs/i });
    expect(within(dialog).getByText("Washerwoman")).toBeInTheDocument();
    expect(within(dialog).getByText("Librarian")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows each set bluff's ability text on the Show to Demon overlay (issue #164)", async () => {
    const user = userEvent.setup();
    renderPanel({ demonBluffs: ["washerwoman", "librarian", null] });

    await user.click(screen.getByRole("button", { name: /show to demon/i }));

    const dialog = screen.getByRole("dialog", { name: /demon bluffs/i });
    expect(
      within(dialog).getByText(getCharacter("washerwoman")!.ability),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(getCharacter("librarian")!.ability),
    ).toBeInTheDocument();
  });

  it("shows each set bluff's team (Townsfolk / Outsiders) on the Show to Demon overlay (issue #164)", async () => {
    const user = userEvent.setup();
    // Washerwoman is Townsfolk, Butler is an Outsider on the TB script.
    renderPanel({ demonBluffs: ["washerwoman", "butler", null] });

    await user.click(screen.getByRole("button", { name: /show to demon/i }));

    const dialog = screen.getByRole("dialog", { name: /demon bluffs/i });
    const slots = within(dialog).getAllByRole("listitem");
    expect(within(slots[0]).getByText("Townsfolk")).toBeInTheDocument();
    expect(within(slots[1]).getByText("Outsiders")).toBeInTheDocument();
  });

  it("shows a bluff's actual team on the overlay when 'show all' picked an off-rule (evil) character (issue #164)", async () => {
    const user = userEvent.setup();
    // Imp is a Demon, only pickable as a bluff via the 'show all' escape
    // hatch (Lunatic/Marionette games, ADR 0003) — the overlay should show
    // its real team, not force it into Townsfolk/Outsider.
    renderPanel({ demonBluffs: ["imp", null, null] });

    await user.click(screen.getByRole("button", { name: /show to demon/i }));

    const dialog = screen.getByRole("dialog", { name: /demon bluffs/i });
    expect(within(dialog).getByText("Demons")).toBeInTheDocument();
  });

  it("still renders empty bluff slots as 'Not set' on the overlay, with no ability or team shown (issue #164)", async () => {
    const user = userEvent.setup();
    renderPanel({ demonBluffs: ["washerwoman", null, null] });

    await user.click(screen.getByRole("button", { name: /show to demon/i }));

    const dialog = screen.getByRole("dialog", { name: /demon bluffs/i });
    const slots = within(dialog).getAllByRole("listitem");
    expect(within(slots[1]).getByText("Not set")).toBeInTheDocument();
    expect(within(slots[1]).queryByText(/townsfolk|outsiders|minions|demons/i)).not.toBeInTheDocument();
  });

  it("moves focus into the overlay on open, traps Tab within it, calls onClose on Escape, and restores focus to the trigger on close (issue #122)", async () => {
    const user = userEvent.setup();
    renderPanel({ demonBluffs: ["washerwoman", "librarian", null] });

    const trigger = screen.getByRole("button", { name: /show to demon/i });
    await user.click(trigger);

    const closeButton = screen.getByRole("button", { name: /close/i });
    expect(document.activeElement).toBe(closeButton);

    // The overlay's only focusable control is Close — Tab must cycle back
    // to it rather than escaping to the rest of the panel (the show-all
    // checkbox, the bluff slot selects) hidden behind the opaque backdrop.
    await user.tab();
    expect(document.activeElement).toBe(closeButton);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("themes the full-screen reveal's Close button instead of leaving it plain grey (issue #74)", async () => {
    const user = userEvent.setup();
    renderPanel({ demonBluffs: ["washerwoman", "librarian", null] });

    await user.click(screen.getByRole("button", { name: /show to demon/i }));

    expect(screen.getByRole("button", { name: /close/i }).className).not.toBe("");
  });

  it("hides the body while collapsed, but keeps the heading reachable (issue #79)", () => {
    renderPanel({ demonBluffsCollapsed: true });

    expect(screen.queryByLabelText("Bluff slot 1")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Demon bluffs" }),
    ).toBeInTheDocument();
  });

  it("toggles the persisted collapsed state via the heading", async () => {
    const user = userEvent.setup();
    const { onChange, game } = renderPanel();

    await user.click(screen.getByRole("button", { name: "Demon bluffs" }));

    expect(onChange).toHaveBeenCalledWith({ ...game, demonBluffsCollapsed: true });
  });

  it("doesn't reopen 'Show to Demon' on its own after collapsing and re-expanding the section (Copilot review finding)", async () => {
    const user = userEvent.setup();
    function Wrapper() {
      const [game, setGame] = useState(() =>
        makeGame({ demonBluffs: ["washerwoman", "librarian", null] }),
      );
      return <DemonBluffsPanel game={game} onChange={setGame} />;
    }
    render(<Wrapper />);

    await user.click(screen.getByRole("button", { name: /show to demon/i }));
    expect(screen.getByRole("dialog", { name: /demon bluffs/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Demon bluffs" })); // collapse
    await user.click(screen.getByRole("button", { name: "Demon bluffs" })); // expand

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
