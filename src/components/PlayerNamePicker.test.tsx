import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { REGULAR_PLAYERS } from "@/lib/players";

import { PlayerNamePicker } from "./PlayerNamePicker";

describe("searching and selecting from the regular players list (issue #54)", () => {
  it("lists every regular player before any search text is entered", () => {
    render(<PlayerNamePicker onSelect={vi.fn()} />);

    for (const name of REGULAR_PLAYERS) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("narrows the list to names matching the search text, case-insensitively", async () => {
    const user = userEvent.setup();
    render(<PlayerNamePicker onSelect={vi.fn()} />);

    await user.type(screen.getByRole("textbox", { name: /search players/i }), "jor");

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
});

describe("custom name entry when a player isn't in the regular list (issue #54)", () => {
  it("selects a typed custom name, without it needing to match the regular list", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PlayerNamePicker onSelect={onSelect} />);

    await user.type(screen.getByLabelText(/custom player name/i), "Substitute Sam");
    await user.click(screen.getByRole("button", { name: /use this name/i }));

    expect(onSelect).toHaveBeenCalledWith("Substitute Sam");
  });
});
