import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { getCharacter } from "@/lib/characters";

import { InfoTokenShowMode } from "./InfoTokenShowMode";

describe("InfoTokenShowMode", () => {
  it("shows the card's text full-screen, readable across a table", () => {
    render(
      <InfoTokenShowMode
        text="This is the Demon"
        characters={[]}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "This is the Demon" }),
    ).toBeInTheDocument();
    expect(screen.getByText("This is the Demon")).toBeInTheDocument();
  });

  it("calls onClose when the storyteller is done showing the card", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <InfoTokenShowMode text="You are" characters={[]} onClose={onClose} />,
    );

    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the attached character token(s), e.g. THIS IS THE DEMON plus the Imp", () => {
    const imp = getCharacter("imp")!;
    render(
      <InfoTokenShowMode
        text="This is the Demon"
        characters={[imp]}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Imp")).toBeInTheDocument();
  });
});
