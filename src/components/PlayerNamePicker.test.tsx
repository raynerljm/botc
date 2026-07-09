import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { REGULAR_PLAYERS } from "@/lib/players";

import { PlayerNamePicker } from "./PlayerNamePicker";

describe("a single merged input for searching and naming (issue #157)", () => {
  it("renders exactly one text input, with no separate custom-name form", () => {
    render(<PlayerNamePicker onSelect={vi.fn()} />);

    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });

  it("lists every regular player before any text is entered", () => {
    render(<PlayerNamePicker onSelect={vi.fn()} />);

    for (const name of REGULAR_PLAYERS) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("narrows the list to names matching the typed text, case-insensitively", async () => {
    const user = userEvent.setup();
    render(<PlayerNamePicker onSelect={vi.fn()} />);

    await user.type(screen.getByRole("textbox"), "jor");

    expect(screen.getByRole("button", { name: "Jordan" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Alex" })).not.toBeInTheDocument();
  });

  it("selects the tapped player's name", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PlayerNamePicker onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: "Bailey" }));

    expect(onSelect).toHaveBeenCalledWith("Bailey");
  });

  it("clears the input after a selection, so the full list is available again", async () => {
    const user = userEvent.setup();
    render(<PlayerNamePicker onSelect={vi.fn()} />);

    const input = screen.getByRole("textbox");
    await user.type(input, "jor");
    await user.click(screen.getByRole("button", { name: "Jordan" }));

    expect(input).toHaveValue("");
    expect(screen.getByRole("button", { name: "Alex" })).toBeInTheDocument();
  });
});

describe("naming yourself from the same input when there's no matching player (issue #157)", () => {
  it("offers a 'name yourself' action once the typed text matches no regular player", async () => {
    const user = userEvent.setup();
    render(<PlayerNamePicker onSelect={vi.fn()} />);

    await user.type(screen.getByRole("textbox"), "Substitute Sam");

    expect(
      screen.getByRole("button", { name: /name yourself.*substitute sam/i }),
    ).toBeInTheDocument();
  });

  it("does not offer the 'name yourself' action while the text still matches a regular player", async () => {
    const user = userEvent.setup();
    render(<PlayerNamePicker onSelect={vi.fn()} />);

    await user.type(screen.getByRole("textbox"), "Jordan");

    expect(
      screen.queryByRole("button", { name: /name yourself/i }),
    ).not.toBeInTheDocument();
  });

  it("selects the typed custom name when the 'name yourself' action is used", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PlayerNamePicker onSelect={onSelect} />);

    await user.type(screen.getByRole("textbox"), "Substitute Sam");
    await user.click(screen.getByRole("button", { name: /name yourself/i }));

    expect(onSelect).toHaveBeenCalledWith("Substitute Sam");
  });

  it("trims the committed custom name", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PlayerNamePicker onSelect={onSelect} />);

    await user.type(screen.getByRole("textbox"), "  Substitute Sam  ");
    await user.click(screen.getByRole("button", { name: /name yourself/i }));

    expect(onSelect).toHaveBeenCalledWith("Substitute Sam");
  });

  it("does not offer a 'name yourself' action for whitespace-only input", async () => {
    const user = userEvent.setup();
    render(<PlayerNamePicker onSelect={vi.fn()} />);

    await user.type(screen.getByRole("textbox"), "   ");

    expect(
      screen.queryByRole("button", { name: /name yourself/i }),
    ).not.toBeInTheDocument();
  });

  it("offers 'name yourself' for text that is only a substring of a regular player's name, not an exact match (code review finding)", async () => {
    const user = userEvent.setup();
    render(<PlayerNamePicker onSelect={vi.fn()} />);

    // "an" narrows the regular-players list to Dana and Jordan (both
    // contain it), but nobody is named exactly "an" — naming yourself
    // should still be offered rather than being blocked by that filter.
    await user.type(screen.getByRole("textbox"), "an");

    expect(screen.getByRole("button", { name: "Dana" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Jordan" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /name yourself.*"an"/i }),
    ).toBeInTheDocument();
  });

  it("selects the typed custom name when Enter is pressed (code review finding)", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PlayerNamePicker onSelect={onSelect} />);

    await user.type(screen.getByRole("textbox"), "Substitute Sam{Enter}");

    expect(onSelect).toHaveBeenCalledWith("Substitute Sam");
  });

  it("does not commit anything on Enter while the text still matches a regular player (code review finding)", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PlayerNamePicker onSelect={onSelect} />);

    await user.type(screen.getByRole("textbox"), "Jordan{Enter}");

    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("excluding names already assigned to an earlier seat (issue #185)", () => {
  it("does not offer an excluded name in the 'Regular players' quick-pick", () => {
    render(<PlayerNamePicker onSelect={vi.fn()} excludeNames={["Jordan"]} />);

    expect(screen.queryByRole("button", { name: "Jordan" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alex" })).toBeInTheDocument();
  });

  it("excludes case-insensitively", () => {
    render(<PlayerNamePicker onSelect={vi.fn()} excludeNames={["jordan"]} />);

    expect(screen.queryByRole("button", { name: "Jordan" })).not.toBeInTheDocument();
  });

  it("still offers every regular player when nothing is excluded", () => {
    render(<PlayerNamePicker onSelect={vi.fn()} />);

    for (const name of REGULAR_PLAYERS) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });
});
