import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { baseEditions, getEditionCharacters, type BaseEditionId, type Character } from "@/lib/characters";
import { resolveCharacterId } from "@/lib/scriptParser";
import { buildShareUrl, encodeScriptForShare, isTooLargeForReliableQr } from "@/lib/scriptShare";

import { ShareScriptButton } from "./ShareScriptButton";

const washerwoman = resolveCharacterId("washerwoman")!;
const imp = resolveCharacterId("imp")!;

function manyHomebrewCharacters(count: number): Character[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `custom-${i}`,
    name: `Custom Character ${i}`,
    edition: null,
    team: "townsfolk",
    ability:
      "A reasonably long ability description that adds bulk to the script for testing purposes here.",
    firstNight: 0,
    firstNightReminder: "",
    otherNight: 0,
    otherNightReminder: "",
    reminders: [],
    remindersGlobal: [],
    setup: false,
    jinxes: [],
    image: null,
  }));
}

describe("ShareScriptButton", () => {
  it("opens a modal showing a QR code for the encoded script when clicked", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ShareScriptButton meta={{ name: "My Script" }} characters={[washerwoman, imp]} />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /share via qr/i }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("copies the shareable link to the clipboard without ever displaying it as raw text", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<ShareScriptButton meta={{}} characters={[washerwoman]} />);

    await user.click(screen.getByRole("button", { name: /share via qr/i }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).not.toHaveTextContent(/\/share\/#/);

    await user.click(screen.getByRole("button", { name: /copy link/i }));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("/share/#"),
    );
    expect(await screen.findByRole("button", { name: /copied/i })).toBeInTheDocument();
  });

  it("closes when the close button is clicked", async () => {
    const user = userEvent.setup();
    render(<ShareScriptButton meta={{}} characters={[washerwoman]} />);

    await user.click(screen.getByRole("button", { name: /share via qr/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<ShareScriptButton meta={{}} characters={[washerwoman]} />);

    await user.click(screen.getByRole("button", { name: /share via qr/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on a backdrop tap, without swallowing the tap that follows", async () => {
    const user = userEvent.setup();
    const onBehindClick = vi.fn();
    render(
      <>
        <button onClick={onBehindClick}>Export game</button>
        <ShareScriptButton meta={{}} characters={[washerwoman]} />
      </>,
    );

    await user.click(screen.getByRole("button", { name: /share via qr/i }));
    const dialog = screen.getByRole("dialog");

    // The overlay is the dialog's positioned parent; clicking it directly
    // (not the dialog itself) simulates a tap on the backdrop.
    await user.click(dialog.parentElement!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /export game/i }));
    expect(onBehindClick).toHaveBeenCalledOnce();
  });

  it("warns when the script is too large to scan reliably, but still renders the QR code", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ShareScriptButton meta={{}} characters={manyHomebrewCharacters(25)} />,
    );

    await user.click(screen.getByRole("button", { name: /share via qr/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/may not scan reliably/i);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("does not warn when the script comfortably fits a QR code", async () => {
    const user = userEvent.setup();
    render(<ShareScriptButton meta={{}} characters={[washerwoman]} />);

    await user.click(screen.getByRole("button", { name: /share via qr/i }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("skips rendering the QR code entirely once the script exceeds the encoder's hard capacity, instead of crashing", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ShareScriptButton meta={{}} characters={manyHomebrewCharacters(55)} />,
    );

    await user.click(screen.getByRole("button", { name: /share via qr/i }));

    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /too large to (encode|share) as a qr code/i,
    );
    // The link itself is still the fallback — always reachable via Copy link,
    // never printed as raw text.
    expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
  });

  it("never warns for a full base-edition script — the reliable-QR threshold is calibrated for oversized homebrew, not official scripts", () => {
    for (const edition of baseEditions) {
      const characters = getEditionCharacters(edition.id as BaseEditionId);
      const encoded = encodeScriptForShare({ name: edition.name }, characters);
      const url = buildShareUrl("https://example.com", "", encoded);
      expect(isTooLargeForReliableQr(url)).toBe(false);
    }
  });

  it("shows a friendly message if copying to the clipboard fails, and reveals the link as a manual fallback", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<ShareScriptButton meta={{}} characters={[washerwoman]} />);

    await user.click(screen.getByRole("button", { name: /share via qr/i }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).not.toHaveTextContent(/\/share\/#/);

    await user.click(screen.getByRole("button", { name: /copy link/i }));

    expect(
      await screen.findByText(/couldn't copy/i),
    ).toBeInTheDocument();
    // With no automatic copy and no visible link, the storyteller would have
    // no way at all to get the URL — reveal it now as the last-resort path.
    expect(dialog).toHaveTextContent(/\/share\/#/);
  });

  it("clears the 'Copied!' state if a later copy attempt fails, so the button and warning never disagree", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<ShareScriptButton meta={{}} characters={[washerwoman]} />);

    await user.click(screen.getByRole("button", { name: /share via qr/i }));
    await user.click(screen.getByRole("button", { name: /copy link/i }));
    expect(await screen.findByRole("button", { name: /copied/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /copied/i }));
    expect(await screen.findByText(/couldn't copy/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^copied!$/i }),
    ).not.toBeInTheDocument();
  });
});
