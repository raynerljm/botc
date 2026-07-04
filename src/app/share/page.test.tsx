import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { encodeScriptForShare } from "@/lib/scriptShare";
import { resolveCharacterId } from "@/lib/scriptParser";

async function renderSharePage(hash: string) {
  window.location.hash = hash;
  const { default: SharedScriptPage } = await import("./page");
  render(<SharedScriptPage />);
}

describe("shared script page", () => {
  it("renders the encoded script's sheet read-only, grouped by team", async () => {
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
    // Read-only: no interactive controls to change the script.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a friendly error for a broken share link", async () => {
    await renderSharePage("not-a-valid-encoded-script");

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("shows a friendly message when the link has no script", async () => {
    await renderSharePage("");

    expect(await screen.findByText(/no script/i)).toBeInTheDocument();
  });
});
