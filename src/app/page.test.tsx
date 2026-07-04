import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Home from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("script picker", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("lists the three base editions, each linking to its character sheet", () => {
    render(<Home />);

    const expected = [
      { name: "Trouble Brewing", href: "/scripts/tb" },
      { name: "Bad Moon Rising", href: "/scripts/bmr" },
      { name: "Sects & Violets", href: "/scripts/snv" },
    ];
    for (const { name, href } of expected) {
      const link = screen.getByRole("link", { name: new RegExp(name, "i") });
      expect(link).toHaveAttribute("href", href);
    }
  });

  it("lists library scripts, linking to their sheet", () => {
    render(<Home />);

    const link = screen.getByRole("link", {
      name: /Sample Homebrew Script/i,
    });
    expect(link).toHaveAttribute("href", "/scripts/sample-homebrew");
    expect(link).toHaveTextContent("BotC Grimoire");
  });

  it("offers a way to add a custom script from the picker", () => {
    render(<Home />);

    expect(screen.getByText("Your scripts")).toBeInTheDocument();
    expect(screen.getByText("Add a script")).toBeInTheDocument();
  });
});
