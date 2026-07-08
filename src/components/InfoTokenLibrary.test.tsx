import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
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

describe("dialog dismiss behavior (issue #122)", () => {
  it("keeps focus inside the library after the browsing→attach transition, so the Tab trap doesn't fall through to <body> (code review)", async () => {
    const user = userEvent.setup();
    render(
      <InfoTokenLibrary
        characterById={characterById([])}
        onShow={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // The clicked card unmounts as part of this transition (chosenText flips
    // from null to a string) — if focus falls through to <body>, the shared
    // hook's Tab trap (which only intercepts Tab at the container's
    // first/last focusable) never engages again for the rest of this mount.
    await user.click(screen.getByRole("button", { name: "This is the Demon" }));

    const dialog = screen.getByRole("dialog", { name: "Info tokens" });
    expect(document.activeElement).not.toBe(document.body);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("keeps focus inside the library after going Back to the browsing step (code review)", async () => {
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

    const dialog = screen.getByRole("dialog", { name: "Info tokens" });
    expect(document.activeElement).not.toBe(document.body);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });


  it("moves focus into the library on open, traps Tab within it, and restores focus to the trigger on close", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            Info tokens
          </button>
          {open && (
            <InfoTokenLibrary
              characterById={characterById([])}
              onShow={vi.fn()}
              onCancel={() => setOpen(false)}
            />
          )}
        </div>
      );
    }
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "Info tokens" });
    await user.click(trigger);

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    expect(document.activeElement).toBe(cancelButton);

    await user.click(cancelButton);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("calls onCancel on Escape", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <InfoTokenLibrary
        characterById={characterById([])}
        onShow={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel on a backdrop tap outside the library", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const { container } = render(
      <InfoTokenLibrary
        characterById={characterById([])}
        onShow={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(container.firstChild as Element);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("doesn't call onCancel from a tap inside the library", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <InfoTokenLibrary
        characterById={characterById([])}
        onShow={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("dialog"));

    expect(onCancel).not.toHaveBeenCalled();
  });
});
