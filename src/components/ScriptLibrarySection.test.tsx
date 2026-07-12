import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { ScriptSummary } from "@/lib/scripts";

import { ScriptLibrarySection } from "./ScriptLibrarySection";

const regularScript: ScriptSummary = {
  id: "regular-script",
  name: "A Regular Script",
  author: "Some Author",
  source: "library",
  characterCount: 22,
  travellerCount: 3,
  isTeensyville: false,
};

const teensyScript: ScriptSummary = {
  id: "teensy-script",
  name: "A Teensy Script",
  source: "library",
  characterCount: 12,
  travellerCount: 0,
  isTeensyville: true,
};

describe("ScriptLibrarySection", () => {
  it("renders each script's name, author, and character/traveller counts", () => {
    render(<ScriptLibrarySection scripts={[regularScript]} />);

    const link = screen.getByRole("link", { name: /A Regular Script/i });
    expect(link).toHaveAttribute("href", "/scripts/regular-script");
    expect(link).toHaveTextContent(/By Some Author/i);
    expect(link).toHaveTextContent(/22 characters/);
    expect(link).toHaveTextContent(/3 travellers/);
  });

  it("shows a Teensyville badge only for flagged scripts", () => {
    render(<ScriptLibrarySection scripts={[regularScript, teensyScript]} />);

    expect(
      screen.getByRole("link", { name: /A Teensy Script/i }),
    ).toHaveTextContent(/teensyville/i);
    expect(
      screen.getByRole("link", { name: /A Regular Script/i }),
    ).not.toHaveTextContent(/teensyville/i);
  });

  it("filters to Teensyville scripts when toggled, and restores the full list when cleared", async () => {
    const user = userEvent.setup();
    render(<ScriptLibrarySection scripts={[regularScript, teensyScript]} />);

    expect(
      screen.getByRole("link", { name: /A Regular Script/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /A Teensy Script/i }),
    ).toBeInTheDocument();

    const toggle = screen.getByRole("checkbox", { name: /teensyville only/i });
    await user.click(toggle);

    expect(
      screen.queryByRole("link", { name: /A Regular Script/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /A Teensy Script/i }),
    ).toBeInTheDocument();

    await user.click(toggle);

    expect(
      screen.getByRole("link", { name: /A Regular Script/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /A Teensy Script/i }),
    ).toBeInTheDocument();
  });

  it("renders nothing when there are no library scripts", () => {
    const { container } = render(<ScriptLibrarySection scripts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a message when the Teensyville filter excludes every script", async () => {
    const user = userEvent.setup();
    render(<ScriptLibrarySection scripts={[regularScript]} />);

    await user.click(screen.getByRole("checkbox", { name: /teensyville only/i }));

    expect(
      screen.getByText(/no teensyville scripts/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /A Regular Script/i }),
    ).not.toBeInTheDocument();
  });
});
