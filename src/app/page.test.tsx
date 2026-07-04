import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("script picker", () => {
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
});
