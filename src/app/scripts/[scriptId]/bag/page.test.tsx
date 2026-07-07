import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import BagBuilderPage, { generateStaticParams } from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

async function renderBagPage(scriptId: string) {
  render(await BagBuilderPage({ params: Promise.resolve({ scriptId }) }));
}

describe("bag builder page", () => {
  it("is pre-rendered for the three base editions and every library script", async () => {
    const params = await generateStaticParams();
    expect(params).toEqual(
      expect.arrayContaining([
        { scriptId: "tb" },
        { scriptId: "bmr" },
        { scriptId: "snv" },
        { scriptId: "sample-homebrew" },
      ]),
    );
  });

  it("renders the bag builder with the script's characters", async () => {
    await renderBagPage("tb");

    expect(
      screen.getByRole("heading", { name: "Trouble Brewing" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Washerwoman")).toBeInTheDocument();
    expect(screen.getByLabelText("Player count")).toBeInTheDocument();
  });

  it("404s for an unknown script id", async () => {
    await expect(renderBagPage("does-not-exist")).rejects.toThrow();
  });

  it("renders the Teensyville designation for a Teensyville script, not for a regular one (issue #120)", async () => {
    await renderBagPage("no-greater-joy");
    expect(
      screen.getByRole("heading", { name: /No Greater Joy/ }),
    ).toHaveTextContent(/teensyville/i);

    cleanup();
    await renderBagPage("tb");
    expect(
      screen.getByRole("heading", { name: "Trouble Brewing" }),
    ).not.toHaveTextContent(/teensyville/i);
  });
});
