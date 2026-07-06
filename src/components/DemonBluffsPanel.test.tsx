import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { getCharacter, getEditionCharacters } from "@/lib/characters";
import { createGame, type GameDocument } from "@/lib/gameDocument";

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

  it("defaults each slot's options to good characters not in play", () => {
    renderPanel();

    const slot = screen.getByLabelText("Bluff slot 1") as HTMLSelectElement;
    const optionValues = Array.from(slot.options).map((o) => o.value);

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

    const slot = screen.getByLabelText("Bluff slot 1") as HTMLSelectElement;
    const optionValues = Array.from(slot.options).map((o) => o.value);
    expect(optionValues).toContain("imp");
    expect(optionValues).toContain("baron");
  });

  it("keeps an already-chosen character selectable after 'show all' is turned back off", async () => {
    const user = userEvent.setup();
    // Imp is in play (evil), so it's only offered while "show all" is
    // checked — a legitimate Marionette/Lunatic bluff pick per the panel's
    // own rule.
    renderPanel({ demonBluffs: ["imp", null, null] });
    const slot = screen.getByLabelText("Bluff slot 1") as HTMLSelectElement;
    const showAll = screen.getByLabelText(/show all characters/i);

    await user.click(showAll);
    expect(slot.value).toBe("imp");

    await user.click(showAll);

    // Without this fix, "imp" drops out of the option list once "show all"
    // is off (Imp is evil and in play), silently resetting the visible
    // selection to "Not set" even though game.demonBluffs[0] is still "imp".
    expect(Array.from(slot.options).map((o) => o.value)).toContain("imp");
    expect(slot.value).toBe("imp");
  });

  it("sets a slot's bluff and preserves the other slots", async () => {
    const user = userEvent.setup();
    const { onChange, game } = renderPanel({
      demonBluffs: [null, "librarian", null],
    });

    await user.selectOptions(screen.getByLabelText("Bluff slot 1"), "washerwoman");

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

    await user.selectOptions(screen.getByLabelText("Bluff slot 1"), "");

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
