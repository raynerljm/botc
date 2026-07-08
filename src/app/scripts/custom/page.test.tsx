import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { saveCustomScript } from "@/lib/customScripts";
import { decodeScriptForShare } from "@/lib/scriptShare";

let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

async function renderCustomScriptPage(id?: string) {
  searchParams = new URLSearchParams(id ? { id } : {});
  const { default: CustomScriptPage } = await import("./page");
  render(<CustomScriptPage />);
}

describe("custom script page", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it("renders a stored custom script's sheet", async () => {
    const saved = saveCustomScript({
      rawText: JSON.stringify([
        { id: "_meta", name: "My Script", author: "Me" },
        "washerwoman",
        "imp",
      ]),
      name: "My Script",
      author: "Me",
    });

    await renderCustomScriptPage(saved.id);

    expect(
      screen.getByRole("heading", { name: "My Script" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Washerwoman")).toBeInTheDocument();
    expect(screen.getByText("Imp")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /share via qr/i }),
    ).toBeInTheDocument();
  });

  it("offers a Build the bag link to a valid stored custom script", async () => {
    const saved = saveCustomScript({
      rawText: JSON.stringify([
        { id: "_meta", name: "My Script" },
        "washerwoman",
        "imp",
      ]),
      name: "My Script",
    });

    await renderCustomScriptPage(saved.id);

    expect(
      screen.getByRole("link", { name: /build the bag/i }),
    ).toHaveAttribute("href", `/scripts/custom/bag?id=${saved.id}`);
  });

  it("offers no Build the bag link when the script isn't on this device", async () => {
    await renderCustomScriptPage("unknown-id");

    expect(
      screen.queryByRole("link", { name: /build the bag/i }),
    ).not.toBeInTheDocument();
  });

  it("shares the storyteller's locally-assigned name when the script's own JSON has no _meta.name", async () => {
    const saved = saveCustomScript({
      rawText: JSON.stringify(["washerwoman", "imp"]),
      name: "My Locally Named Script",
    });

    await renderCustomScriptPage(saved.id);
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
    expect(result.script.meta.name).toBe("My Locally Named Script");
  });

  it("shows a friendly message when the script isn't on this device", async () => {
    await renderCustomScriptPage("unknown-id");

    expect(
      screen.getByText(/isn't on this device/i),
    ).toBeInTheDocument();
  });

  it("shows a friendly message when no id is given", async () => {
    await renderCustomScriptPage();

    expect(
      screen.getByText(/isn't on this device/i),
    ).toBeInTheDocument();
  });

  it("marks a Teensyville custom script's designation", async () => {
    const saved = saveCustomScript({
      rawText: JSON.stringify([
        { id: "_meta", name: "My Tiny Script", teensyville: true },
        "washerwoman",
        "imp",
      ]),
      name: "My Tiny Script",
    });

    await renderCustomScriptPage(saved.id);

    expect(screen.getByText("Teensyville")).toBeInTheDocument();
  });
});
