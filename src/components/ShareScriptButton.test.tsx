import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Character } from "@/lib/characters";
import { resolveCharacterId } from "@/lib/scriptParser";

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

  it("shows the shareable link and copies it to the clipboard", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<ShareScriptButton meta={{}} characters={[washerwoman]} />);

    await user.click(screen.getByRole("button", { name: /share via qr/i }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(/\/share\/#/);

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
    // The link itself is still the fallback — always reachable.
    expect(screen.getByRole("dialog")).toHaveTextContent(/\/share\/#/);
  });

  it("shows a friendly message if copying to the clipboard fails", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<ShareScriptButton meta={{}} characters={[washerwoman]} />);

    await user.click(screen.getByRole("button", { name: /share via qr/i }));
    await user.click(screen.getByRole("button", { name: /copy link/i }));

    expect(
      await screen.findByText(/couldn't copy/i),
    ).toBeInTheDocument();
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
