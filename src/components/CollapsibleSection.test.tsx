import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CollapsibleSection } from "./CollapsibleSection";

describe("CollapsibleSection", () => {
  it("shows its children when expanded", () => {
    render(
      <CollapsibleSection title="Claims" collapsed={false} onToggleCollapsed={vi.fn()}>
        <p>Body content</p>
      </CollapsibleSection>,
    );

    expect(screen.getByText("Body content")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Claims" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("hides its children when collapsed", () => {
    render(
      <CollapsibleSection title="Claims" collapsed={true} onToggleCollapsed={vi.fn()}>
        <p>Body content</p>
      </CollapsibleSection>,
    );

    expect(screen.queryByText("Body content")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Claims" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("wraps the toggle button in a heading, not the other way around (code review finding)", () => {
    render(
      <CollapsibleSection title="Claims" collapsed={false} onToggleCollapsed={vi.fn()}>
        <p>Body content</p>
      </CollapsibleSection>,
    );

    const heading = screen.getByRole("heading", { level: 2, name: "Claims" });
    expect(
      heading.querySelector('button[aria-expanded]'),
    ).toBe(screen.getByRole("button", { name: "Claims" }));
  });

  it("toggles collapsed state on click", async () => {
    const user = userEvent.setup();
    const onToggleCollapsed = vi.fn();
    render(
      <CollapsibleSection title="Claims" collapsed={false} onToggleCollapsed={onToggleCollapsed}>
        <p>Body content</p>
      </CollapsibleSection>,
    );

    await user.click(screen.getByRole("button", { name: "Claims" }));

    expect(onToggleCollapsed).toHaveBeenCalledWith(true);
  });
});
