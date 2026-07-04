import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import CharacterSheetPage, { generateStaticParams } from "./page";

async function renderSheet(editionId: string) {
  render(
    await CharacterSheetPage({ params: Promise.resolve({ editionId }) }),
  );
}

describe("character sheet", () => {
  it("is pre-rendered for exactly the three base editions", async () => {
    expect(await generateStaticParams()).toEqual([
      { editionId: "tb" },
      { editionId: "bmr" },
      { editionId: "snv" },
    ]);
  });

  it("groups the script's characters by team in sheet order", async () => {
    await renderSheet("tb");

    expect(
      screen.getByRole("heading", { name: "Trouble Brewing" }),
    ).toBeInTheDocument();

    const teamHeadings = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(teamHeadings).toEqual([
      "Townsfolk",
      "Outsiders",
      "Minions",
      "Demons",
      "Travellers",
    ]);

    expect(screen.getByText("Washerwoman")).toBeInTheDocument();
    expect(screen.getByText("Imp")).toBeInTheDocument();
  });

  it("reveals ability text and the official wiki link when a character is tapped", async () => {
    await renderSheet("tb");
    const user = userEvent.setup();

    await user.click(
      screen.getByText("Fortune Teller", { selector: "summary *" }),
    );

    const detail = screen.getByText(
      /Each night, choose 2 players: you learn if either is a Demon/,
    );
    expect(detail).toBeVisible();

    const wikiLink = screen.getByRole("link", {
      name: /Fortune Teller on the wiki/i,
    });
    expect(wikiLink).toHaveAttribute(
      "href",
      "https://wiki.bloodontheclocktower.com/Fortune_Teller",
    );
  });

  it("shows token art for every Trouble Brewing character", async () => {
    await renderSheet("tb");

    const washerwoman = screen.getByText("Washerwoman").closest("details")!;
    // Token art is decorative (alt=""), so it carries no img role.
    const art = washerwoman.querySelector("img");
    expect(art).toHaveAttribute(
      "src",
      expect.stringContaining("/icons/washerwoman.webp"),
    );
  });
});
