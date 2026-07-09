import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Checkbox } from "./Checkbox";

describe("Checkbox", () => {
  it("renders as an accessible checkbox reflecting the checked state", () => {
    render(<Checkbox checked aria-label="Show all" onChange={vi.fn()} />);

    const checkbox = screen.getByRole("checkbox", { name: "Show all" });
    expect(checkbox).toBeChecked();
  });

  it("calls onChange with the toggled state on click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox checked={false} aria-label="Show all" onChange={onChange} />);

    await user.click(screen.getByRole("checkbox", { name: "Show all" }));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("is keyboard-operable via space", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox checked={false} aria-label="Show all" onChange={onChange} />);

    await user.tab();
    expect(screen.getByRole("checkbox", { name: "Show all" })).toHaveFocus();
    await user.keyboard(" ");

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("renders no visible native chrome — box is drawn by a sibling element, not the input itself", () => {
    render(<Checkbox checked aria-label="Show all" onChange={vi.fn()} />);

    const checkbox = screen.getByRole("checkbox", { name: "Show all" });
    expect(checkbox.nextElementSibling).toHaveAttribute("aria-hidden", "true");
  });

  it("does not toggle when disabled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Checkbox checked={false} disabled aria-label="Show all" onChange={onChange} />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Show all" }));

    expect(onChange).not.toHaveBeenCalled();
  });
});
