import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Select, type SelectEntry } from "./Select";

const FLAT_ENTRIES: SelectEntry[] = [
  { value: "", label: "No claim" },
  { value: "washerwoman", label: "Washerwoman" },
  { value: "imp", label: "Imp" },
];

const GROUPED_ENTRIES: SelectEntry[] = [
  { value: "", label: "Not set" },
  {
    label: "Townsfolk",
    options: [
      { value: "washerwoman", label: "Washerwoman" },
      { value: "librarian", label: "Librarian" },
    ],
  },
  {
    label: "Demon",
    options: [{ value: "imp", label: "Imp" }],
  },
];

function Harness({
  entries = FLAT_ENTRIES,
  initial = "",
}: {
  entries?: SelectEntry[];
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Select aria-label="Claim" value={value} onChange={setValue} entries={entries} />
  );
}

describe("Select", () => {
  it("shows the selected option's label on the closed trigger", () => {
    render(<Harness initial="washerwoman" />);

    expect(screen.getByRole("combobox", { name: "Claim" })).toHaveTextContent(
      "Washerwoman",
    );
  });

  it("opens the listbox on click and lists every option", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("combobox", { name: "Claim" }));

    const listbox = screen.getByRole("listbox", { name: "Claim" });
    expect(within(listbox).getByRole("option", { name: "Imp" })).toBeInTheDocument();
  });

  it("selects an option on click, calling onChange and closing the popup", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("combobox", { name: "Claim" }));
    await user.click(screen.getByRole("option", { name: "Imp" }));

    expect(screen.getByRole("combobox", { name: "Claim" })).toHaveTextContent("Imp");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("groups options under a labelled group, matching the native optgroup shape", async () => {
    const user = userEvent.setup();
    render(<Harness entries={GROUPED_ENTRIES} />);

    await user.click(screen.getByRole("combobox", { name: "Claim" }));

    const group = screen.getByRole("group", { name: "Townsfolk" });
    expect(within(group).getByRole("option", { name: "Librarian" })).toBeInTheDocument();
  });

  it("opens and moves the active option with the keyboard, selecting on Enter", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("combobox", { name: "Claim" });

    trigger.focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(trigger).toHaveTextContent("Washerwoman");
    expect(document.activeElement).toBe(trigger);
  });

  it("closes without changing the value on Escape", async () => {
    const user = userEvent.setup();
    render(<Harness initial="washerwoman" />);
    const trigger = screen.getByRole("combobox", { name: "Claim" });

    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveTextContent("Washerwoman");
  });

  it("closes on an outside click without changing the value", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Harness initial="washerwoman" />
        <button type="button">Outside</button>
      </div>,
    );

    await user.click(screen.getByRole("combobox", { name: "Claim" }));
    await user.click(screen.getByRole("button", { name: "Outside" }));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("calls onChange when a value not present in entries is selected via keyboard Home/End", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select aria-label="Claim" value="washerwoman" onChange={onChange} entries={FLAT_ENTRIES} />,
    );
    const trigger = screen.getByRole("combobox", { name: "Claim" });

    trigger.focus();
    await user.keyboard("{ArrowDown}{End}{Enter}");

    expect(onChange).toHaveBeenCalledWith("imp");
  });

  it("never seeds the keyboard-active option with a value that isn't actually selectable, so a stray Enter right after opening can't commit an invalid value (Copilot review finding)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select
        aria-label="Claim"
        value="not-a-real-option"
        onChange={onChange}
        entries={FLAT_ENTRIES}
      />,
    );
    const trigger = screen.getByRole("combobox", { name: "Claim" });

    trigger.focus();
    // First Enter opens the popup; a second Enter immediately after commits
    // whatever option is currently active.
    await user.keyboard("{Enter}{Enter}");

    expect(onChange).not.toHaveBeenCalledWith("not-a-real-option");
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("is a single Tab stop — focus never leaves the trigger while the popup is open", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Harness />
        <button type="button">After</button>
      </div>,
    );
    const trigger = screen.getByRole("combobox", { name: "Claim" });

    await user.click(trigger);
    expect(document.activeElement).toBe(trigger);
    await user.tab();

    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
  });

  it("applies a caller's className to the trigger itself, not a wrapping element — so callers styling it as a box (border/padding/background) don't end up with a double box", () => {
    render(<Harness />);

    render(
      <Select
        aria-label="Custom"
        className="my-custom-class"
        value=""
        onChange={vi.fn()}
        entries={FLAT_ENTRIES}
      />,
    );

    const trigger = screen.getByRole("combobox", { name: "Custom" });
    expect(trigger).toHaveClass("my-custom-class");
    expect(trigger.parentElement).not.toHaveClass("my-custom-class");
  });

  it("scrolls the keyboard-highlighted option into view as it moves, so a long list never leaves the highlight scrolled out of sight", async () => {
    const scrollIntoView = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      const user = userEvent.setup();
      render(<Harness />);
      const trigger = screen.getByRole("combobox", { name: "Claim" });

      trigger.focus();
      await user.keyboard("{ArrowDown}");

      expect(scrollIntoView).toHaveBeenCalled();
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });
});
