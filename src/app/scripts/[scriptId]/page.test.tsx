import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { decodeScriptForShare } from "@/lib/scriptShare";

import ScriptSheetPage, { generateStaticParams } from "./page";

async function renderSheet(scriptId: string) {
  render(await ScriptSheetPage({ params: Promise.resolve({ scriptId }) }));
}

describe("script sheet", () => {
  it("is pre-rendered for the three base editions and every library script, with no duplicate ids", async () => {
    const params = await generateStaticParams();
    expect(params).toEqual(
      expect.arrayContaining([
        { scriptId: "tb" },
        { scriptId: "bmr" },
        { scriptId: "snv" },
        { scriptId: "sample-homebrew" },
      ]),
    );
    const ids = params.map((p) => p.scriptId);
    expect(new Set(ids).size).toBe(ids.length);
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

    expect(
      screen.getByRole("link", { name: /Build the bag/ }),
    ).toHaveAttribute("href", "/scripts/tb/bag");
  });

  it("offers to share the script via QR", async () => {
    await renderSheet("tb");

    expect(
      screen.getByRole("button", { name: /share via qr/i }),
    ).toBeInTheDocument();
  });

  it("shares the base edition's real name, even though base editions carry no _meta.name of their own", async () => {
    await renderSheet("tb");
    const user = userEvent.setup();

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    await user.click(screen.getByRole("button", { name: /share via qr/i }));
    await user.click(screen.getByRole("button", { name: /copy link/i }));
    const shareUrl = writeText.mock.calls[0][0] as string;
    const encoded = shareUrl.split("#")[1];

    const result = decodeScriptForShare(encoded);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.script.meta.name).toBe("Trouble Brewing");
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

  it("renders a library script's meta, homebrew character, and active jinxes", async () => {
    await renderSheet("sample-homebrew");

    expect(
      screen.getByRole("heading", { name: "Sample Homebrew Script" }),
    ).toBeInTheDocument();
    expect(screen.getByText("By BotC Grimoire")).toBeInTheDocument();
    expect(
      screen.getByText(/Demonstrates the script library/),
    ).toBeInTheDocument();

    expect(screen.getByText("Custom Seer")).toBeInTheDocument();
    // Homebrew characters have no official wiki page.
    await userEvent
      .setup()
      .click(screen.getByText("Custom Seer", { selector: "summary *" }));
    expect(
      screen.queryByRole("link", { name: /Custom Seer on the wiki/i }),
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole("heading", { name: "Jinxes" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Alchemist & Wraith")).toBeInTheDocument();
  });

  it("404s for an unknown script id", async () => {
    await expect(renderSheet("does-not-exist")).rejects.toThrow();
  });

  it("renders the Teensyville designation for a Teensyville script, not for a regular one (issue #120)", async () => {
    await renderSheet("no-greater-joy");
    expect(
      screen.getByRole("heading", { name: /No Greater Joy/ }),
    ).toHaveTextContent(/teensyville/i);

    cleanup();
    await renderSheet("tb");
    expect(
      screen.getByRole("heading", { name: "Trouble Brewing" }),
    ).not.toHaveTextContent(/teensyville/i);
  });
});
