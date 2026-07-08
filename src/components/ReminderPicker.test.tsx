import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { getCharacter, type Character } from "@/lib/characters";

import { ReminderPicker } from "./ReminderPicker";

const washerwoman = getCharacter("washerwoman")!; // reminders: Townsfolk, Wrong
const imp = getCharacter("imp")!; // reminders: Dead
const drunk = getCharacter("drunk")!; // no per-character reminders, remindersGlobal: Drunk

const homebrewOracle: Character = {
  id: "custom-oracle",
  name: "Custom Oracle",
  edition: null,
  team: "townsfolk",
  ability: "A homebrew ability.",
  firstNight: 0,
  firstNightReminder: "",
  otherNight: 0,
  otherNightReminder: "",
  reminders: ["Foretold"],
  remindersGlobal: [],
  setup: false,
  jinxes: [],
  image: null,
};

const characterById = new Map(
  [washerwoman, imp, drunk, homebrewOracle].map((c) => [c.id, c] as const),
);

function renderPicker(
  overrides: Partial<{
    inPlayCharacterIds: Set<string>;
    onAdd: ReturnType<typeof vi.fn>;
    onCancel: ReturnType<typeof vi.fn>;
  }> = {},
) {
  const onAdd = overrides.onAdd ?? vi.fn();
  const onCancel = overrides.onCancel ?? vi.fn();
  const view = render(
    <ReminderPicker
      characterById={characterById}
      inPlayCharacterIds={overrides.inPlayCharacterIds ?? new Set(["washerwoman"])}
      onAdd={onAdd}
      onCancel={onCancel}
    />,
  );
  return { onAdd, onCancel, ...view };
}

describe("grouping: in-play first, show-all expansion", () => {
  it("lists only in-play characters' reminders by default", () => {
    renderPicker({ inPlayCharacterIds: new Set(["washerwoman"]) });

    expect(screen.getByRole("group", { name: "Washerwoman" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Imp" })).not.toBeInTheDocument();
  });

  it("reveals not-in-play characters once 'show all' is toggled", async () => {
    const user = userEvent.setup();
    renderPicker({ inPlayCharacterIds: new Set(["washerwoman"]) });

    expect(screen.queryByRole("group", { name: "Imp" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /show all/i }));
    expect(screen.getByRole("group", { name: "Imp" })).toBeInTheDocument();
  });

  it("always offers global reminders, regardless of who's in play", () => {
    renderPicker({ inPlayCharacterIds: new Set(["washerwoman"]) });

    const globalGroup = screen.getByRole("group", { name: "Global reminders" });
    expect(within(globalGroup).getByRole("button", { name: "Drunk" })).toBeInTheDocument();
  });
});

describe("picking a reminder", () => {
  it("adds the chosen character's reminder, attributed to that character", async () => {
    const user = userEvent.setup();
    const { onAdd } = renderPicker({ inPlayCharacterIds: new Set(["washerwoman"]) });

    const group = screen.getByRole("group", { name: "Washerwoman" });
    await user.click(within(group).getByRole("button", { name: "Townsfolk" }));

    expect(onAdd).toHaveBeenCalledWith({ characterId: "washerwoman", label: "Townsfolk" });
  });

  it("treats a homebrew character's reminders exactly like an official one's", async () => {
    const user = userEvent.setup();
    const { onAdd } = renderPicker({ inPlayCharacterIds: new Set(["custom-oracle"]) });

    const group = screen.getByRole("group", { name: "Custom Oracle" });
    await user.click(within(group).getByRole("button", { name: "Foretold" }));

    expect(onAdd).toHaveBeenCalledWith({ characterId: "custom-oracle", label: "Foretold" });
  });
});

describe("custom free-text reminder", () => {
  it("adds a reminder with no source character for anything the data doesn't cover", async () => {
    const user = userEvent.setup();
    const { onAdd } = renderPicker();

    await user.type(screen.getByLabelText(/custom reminder text/i), "Poisoned by me");
    await user.click(screen.getByRole("button", { name: /add custom reminder/i }));

    expect(onAdd).toHaveBeenCalledWith({ characterId: null, label: "Poisoned by me" });
  });
});

describe("dialog dismiss behavior (issue #122)", () => {
  it("moves focus into the picker on open, traps Tab within it, and restores focus to the trigger on close", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            Add reminder
          </button>
          {open && (
            <ReminderPicker
              characterById={characterById}
              inPlayCharacterIds={new Set()}
              onAdd={vi.fn()}
              onCancel={() => setOpen(false)}
            />
          )}
        </div>
      );
    }
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "Add reminder" });
    await user.click(trigger);

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    expect(document.activeElement).toBe(cancelButton);

    await user.click(cancelButton);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("calls onCancel on Escape", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderPicker();

    await user.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel on a backdrop tap outside the picker", async () => {
    const user = userEvent.setup();
    const { onCancel, container } = renderPicker();

    await user.click(container.firstChild as Element);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("doesn't call onCancel from a tap inside the picker", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderPicker();

    await user.click(screen.getByRole("dialog"));

    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe("characters with repeated reminder text (issue #14 code review)", () => {
  const knight: Character = {
    ...homebrewOracle,
    id: "knight",
    name: "Knight",
    reminders: ["Know", "Know"],
  };

  it("renders every repeated reminder without a duplicate-key console warning", async () => {
    const user = userEvent.setup();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onAdd = vi.fn();
    render(
      <ReminderPicker
        characterById={new Map([["knight", knight]])}
        inPlayCharacterIds={new Set(["knight"])}
        onAdd={onAdd}
        onCancel={vi.fn()}
      />,
    );

    const group = screen.getByRole("group", { name: "Knight" });
    const knowButtons = within(group).getAllByRole("button", { name: "Know" });
    expect(knowButtons).toHaveLength(2);

    await user.click(knowButtons[0]);
    expect(onAdd).toHaveBeenCalledWith({ characterId: "knight", label: "Know" });
    expect(
      errorSpy.mock.calls.some((call) =>
        String(call[0]).includes("same key"),
      ),
    ).toBe(false);
    errorSpy.mockRestore();
  });
});
