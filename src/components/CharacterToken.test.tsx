import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { getCharacter } from "@/lib/characters";

import { CharacterToken } from "./CharacterToken";

describe("token art", () => {
  it("renders the vendored art when the character has some", () => {
    const { container } = render(
      <CharacterToken character={getCharacter("imp")!} />,
    );
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("/icons/imp.webp"),
    );
  });

  it("falls back to an initials disc when art is missing", () => {
    // Big Wig has no vendored art in the current dataset.
    const bigWig = getCharacter("bigwig")!;
    expect(bigWig.image).toBeNull();

    const { container } = render(<CharacterToken character={bigWig} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("BW")).toBeInTheDocument();
  });
});
