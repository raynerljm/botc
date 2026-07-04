import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { saveCustomScript } from "@/lib/customScripts";

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
});
