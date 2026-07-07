import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { saveCustomScript } from "@/lib/customScripts";
import { clearGames, loadGame } from "@/lib/gameStorage";

const push = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
  useRouter: () => ({ push }),
}));

async function renderCustomBagPage(id?: string) {
  searchParams = new URLSearchParams(id ? { id } : {});
  const { default: CustomBagPage } = await import("./page");
  render(<CustomBagPage />);
}

describe("custom script bag page", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
    clearGames();
    push.mockClear();
  });

  it("renders the bag builder with a stored custom script's characters", async () => {
    const saved = saveCustomScript({
      rawText: JSON.stringify([
        { id: "_meta", name: "My Script" },
        "washerwoman",
        "imp",
      ]),
      name: "My Script",
    });

    await renderCustomBagPage(saved.id);

    expect(
      screen.getByRole("heading", { name: "My Script" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Washerwoman")).toBeInTheDocument();
    expect(screen.getByLabelText("Player count")).toBeInTheDocument();
  });

  it("shows a friendly message when the script isn't on this device", async () => {
    await renderCustomBagPage("unknown-id");

    expect(screen.getByText(/isn't on this device/i)).toBeInTheDocument();
  });

  it("shows a friendly message when no id is given", async () => {
    await renderCustomBagPage();

    expect(screen.getByText(/isn't on this device/i)).toBeInTheDocument();
  });

  it("shows parse errors for an invalid stored script", async () => {
    const saved = saveCustomScript({
      rawText: "not json",
      name: "Broken Script",
    });

    await renderCustomBagPage(saved.id);

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("still shows the stored script's name in the heading when it fails to parse", async () => {
    const saved = saveCustomScript({
      rawText: "not json",
      name: "Broken Script",
    });

    await renderCustomBagPage(saved.id);

    expect(
      screen.getByRole("heading", { name: "Broken Script" }),
    ).toBeInTheDocument();
  });

  it("titles the bag the same as the script's own sheet page, even when the script JSON's _meta.name differs from the locally-assigned name", async () => {
    const saved = saveCustomScript({
      rawText: JSON.stringify([
        { id: "_meta", name: "Trouble Brewing" },
        "washerwoman",
        "imp",
      ]),
      name: "My Renamed Copy",
    });

    await renderCustomBagPage(saved.id);

    expect(
      screen.getByRole("heading", { name: "My Renamed Copy" }),
    ).toBeInTheDocument();
  });

  it("applies the uploaded script's night-order overrides to the created game", async () => {
    const saved = saveCustomScript({
      rawText: JSON.stringify([
        {
          id: "_meta",
          name: "My Script",
          firstNight: ["dusk", "washerwoman", "dawn"],
          otherNight: ["dusk", "imp", "dawn"],
        },
        "washerwoman",
        "imp",
      ]),
      name: "My Script",
    });
    const user = userEvent.setup();

    await renderCustomBagPage(saved.id);

    await user.click(screen.getByRole("button", { name: /^Washerwoman/ }));
    await user.click(screen.getByRole("button", { name: /^Imp/ }));
    await user.click(
      screen.getByRole("button", { name: /Continue to seating/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /Continue anyway/i }),
    );

    const game = loadGame();
    expect(game).not.toBeNull();
    expect(game!.scriptName).toBe("My Script");
    expect(game!.firstNightOrder).toEqual(["dusk", "washerwoman", "dawn"]);
    expect(game!.otherNightOrder).toEqual(["dusk", "imp", "dawn"]);
    expect(push).toHaveBeenCalledWith("/game");
  });
});
