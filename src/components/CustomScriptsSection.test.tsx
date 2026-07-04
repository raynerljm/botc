import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { saveCustomScript } from "@/lib/customScripts";

import { CustomScriptsSection } from "./CustomScriptsSection";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("CustomScriptsSection", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows nothing until scripts are loaded, then lists them by name and author", async () => {
    saveCustomScript({
      rawText: '["washerwoman"]',
      name: "My Script",
      author: "Me",
    });

    render(<CustomScriptsSection />);

    const link = await screen.findByRole("link", { name: /My Script/ });
    expect(link).toHaveTextContent("by Me");
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("/scripts/custom?id="),
    );
  });

  it("removes a script from the list", async () => {
    const saved = saveCustomScript({ rawText: "[]", name: "Removable" });
    render(<CustomScriptsSection />);
    const user = userEvent.setup();

    await screen.findByRole("link", { name: /Removable/ });
    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("link", { name: /Removable/ }),
      ).not.toBeInTheDocument(),
    );
    expect(
      JSON.parse(window.localStorage.getItem("botc:custom-scripts")!),
    ).not.toContainEqual(expect.objectContaining({ id: saved.id }));
  });

  it("adding a script through the dialog updates the list", async () => {
    render(<CustomScriptsSection />);
    const user = userEvent.setup();

    await user.click(screen.getByText("Add a script"));
    fireEvent.change(screen.getByLabelText(/paste script-tool JSON/i), {
      target: { value: '["imp"]' },
    });
    await user.click(screen.getByRole("button", { name: "Add script" }));

    expect(
      await screen.findByRole("link", { name: /Untitled script/ }),
    ).toBeInTheDocument();
  });
});
