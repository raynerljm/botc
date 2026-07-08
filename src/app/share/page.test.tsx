import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { compressToEncodedURIComponent } from "lz-string";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listCustomScripts } from "@/lib/customScripts";
import { resolveCharacterId } from "@/lib/scriptParser";
import { encodeScriptForShare } from "@/lib/scriptShare";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

async function renderSharePage(hash: string) {
  window.location.hash = hash;
  const { default: SharedScriptPage } = await import("./page");
  render(<SharedScriptPage />);
}

describe("shared script page", () => {
  beforeEach(() => {
    window.localStorage.clear();
    push.mockClear();
  });

  it("renders the encoded script's sheet read-only, grouped by team, with a way to save it and a link home", async () => {
    const encoded = encodeScriptForShare({ name: "My Script" }, [
      resolveCharacterId("washerwoman")!,
      resolveCharacterId("imp")!,
    ]);

    await renderSharePage(encoded);

    expect(
      await screen.findByRole("heading", { name: "My Script" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Washerwoman")).toBeInTheDocument();
    expect(screen.getByText("Imp")).toBeInTheDocument();
    // The sheet itself stays read-only: no controls to edit the script in place.
    expect(
      screen.getByRole("button", { name: /add to your scripts/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /home/i })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("saves the shared script and navigates to it", async () => {
    const encoded = encodeScriptForShare({ name: "My Script", author: "Me" }, [
      resolveCharacterId("washerwoman")!,
      resolveCharacterId("imp")!,
    ]);
    await renderSharePage(encoded);
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: /add to your scripts/i }),
    );

    const stored = listCustomScripts();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ name: "My Script", author: "Me" });
    expect(push).toHaveBeenCalledWith(`/scripts/custom?id=${stored[0].id}`);
  });

  it("saves only once when the save button is double-tapped before navigation unmounts the page", async () => {
    const encoded = encodeScriptForShare({ name: "My Script" }, [
      resolveCharacterId("washerwoman")!,
    ]);
    await renderSharePage(encoded);

    const button = screen.getByRole("button", { name: /add to your scripts/i });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(listCustomScripts()).toHaveLength(1);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("shows a long unknown-character error id in full, without truncating the text content (overflow is fixed via CSS wrapping)", async () => {
    const longId = "x".repeat(200);
    await renderSharePage(compressToEncodedURIComponent(JSON.stringify([longId])));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      new RegExp(longId),
    );
  });

  it("shows a friendly error for a broken share link, with a link home", async () => {
    await renderSharePage("not-a-valid-encoded-script");

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /home/i })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("shows a friendly message when the link has no script, with a link home", async () => {
    await renderSharePage("");

    expect(await screen.findByText(/no script/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /home/i })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
