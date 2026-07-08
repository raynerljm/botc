import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { NumberStepper } from "./NumberStepper";

function Harness({ min = 1, max = 15 }: { min?: number; max?: number }) {
  const [value, setValue] = useState<number | "">(5);
  return (
    <NumberStepper
      aria-label="Player count"
      value={value}
      min={min}
      max={max}
      onChange={setValue}
    />
  );
}

describe("NumberStepper", () => {
  it("renders the current value in a labelled numeric field with no native spin chrome", () => {
    render(<Harness />);

    const field = screen.getByRole("spinbutton", { name: "Player count" });
    expect(field).toHaveValue(5);
    expect(field).toHaveAttribute("type", "number");
  });

  it("increments on the + button", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Increase Player count" }));

    expect(screen.getByRole("spinbutton", { name: "Player count" })).toHaveValue(6);
  });

  it("decrements on the − button", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Decrease Player count" }));

    expect(screen.getByRole("spinbutton", { name: "Player count" })).toHaveValue(4);
  });

  it("clamps stepping at min and max, disabling the button at the boundary", async () => {
    const user = userEvent.setup();
    render(<Harness min={5} max={6} />);

    expect(screen.getByRole("button", { name: "Decrease Player count" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Increase Player count" }));
    expect(screen.getByRole("spinbutton", { name: "Player count" })).toHaveValue(6);
    expect(screen.getByRole("button", { name: "Increase Player count" })).toBeDisabled();
  });

  it("types digits directly into the field", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const field = screen.getByRole("spinbutton", { name: "Player count" });

    await user.clear(field);
    await user.type(field, "12");

    expect(field).toHaveValue(12);
  });

  it("allows the field to go blank mid-edit instead of forcing a clamp on every keystroke", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const field = screen.getByRole("spinbutton", { name: "Player count" });

    await user.clear(field);

    expect(field).toHaveValue(null);
  });

  it("forwards onBlur so a caller can clamp on blur", async () => {
    const user = userEvent.setup();
    const onBlur = vi.fn();
    render(
      <NumberStepper aria-label="Player count" value={5} min={1} max={15} onChange={vi.fn()} onBlur={onBlur} />,
    );

    await user.click(screen.getByRole("spinbutton", { name: "Player count" }));
    await user.tab();

    expect(onBlur).toHaveBeenCalled();
  });
});
