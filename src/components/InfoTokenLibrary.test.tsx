import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getCharacter, type Character } from "@/lib/characters";

import { InfoTokenLibrary } from "./InfoTokenLibrary";

function characterById(characters: Character[]) {
  return new Map(characters.map((c) => [c.id, c]));
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("InfoTokenLibrary", () => {
  it("lists the standard cards to browse", () => {
    render(
      <InfoTokenLibrary
        characterById={characterById([])}
        onShow={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Info tokens" });
    expect(
      within(dialog).getByRole("button", { name: "This is the Demon" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "These are your minions" }),
    ).toBeInTheDocument();
  });

  it("calls onCancel while browsing", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <InfoTokenLibrary
        characterById={characterById([])}
        onShow={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("picking a standard card moves to the attach step, then shows it with no tokens attached", async () => {
    const user = userEvent.setup();
    const onShow = vi.fn();
    render(
      <InfoTokenLibrary
        characterById={characterById([])}
        onShow={onShow}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "This is the Demon" }));

    expect(screen.getByText("This is the Demon")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show" }));

    expect(onShow).toHaveBeenCalledWith({
      text: "This is the Demon",
      characterIds: [],
    });
  });

  it("lets the storyteller pick the token(s) before showing a 'You are' style card", async () => {
    const user = userEvent.setup();
    const onShow = vi.fn();
    const imp = getCharacter("imp")!;
    render(
      <InfoTokenLibrary
        characterById={characterById([imp])}
        onShow={onShow}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "This is the Demon" }));
    const group = within(screen.getByRole("group", { name: "Demons" }));
    await user.click(group.getByRole("button", { name: "Imp" }));
    await user.click(screen.getByRole("button", { name: "Show" }));

    expect(onShow).toHaveBeenCalledWith({
      text: "This is the Demon",
      characterIds: [imp.id],
    });
  });

  it("lets the storyteller go back to the library from the attach step", async () => {
    const user = userEvent.setup();
    render(
      <InfoTokenLibrary
        characterById={characterById([])}
        onShow={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "This is the Demon" }));
    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(
      screen.getByRole("button", { name: "These are your minions" }),
    ).toBeInTheDocument();
  });

  it("supports a custom free-text info token for the unscripted moments", async () => {
    const user = userEvent.setup();
    const onShow = vi.fn();
    render(
      <InfoTokenLibrary
        characterById={characterById([])}
        onShow={onShow}
        onCancel={vi.fn()}
      />,
    );

    await user.type(
      screen.getByLabelText("Custom info token text"),
      "The Grandmother is in play",
    );
    await user.click(screen.getByRole("button", { name: "Use this text" }));
    await user.click(screen.getByRole("button", { name: "Show" }));

    expect(onShow).toHaveBeenCalledWith({
      text: "The Grandmother is in play",
      characterIds: [],
    });
  });
});
