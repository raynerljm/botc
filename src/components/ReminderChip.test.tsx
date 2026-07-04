import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { getCharacter } from "@/lib/characters";

import { ReminderChip } from "./ReminderChip";

describe("reminder token visual", () => {
  it("renders the source character's art alongside the reminder label", () => {
    const { container } = render(
      <ReminderChip character={getCharacter("washerwoman")!} label="Townsfolk" />,
    );

    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("/icons/washerwoman.webp"),
    );
    expect(screen.getByText("Townsfolk")).toBeInTheDocument();
  });

  it("renders a generic marker with just the label for a custom reminder", () => {
    const { container } = render(<ReminderChip label="Custom note" />);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Custom note")).toBeInTheDocument();
  });
});
