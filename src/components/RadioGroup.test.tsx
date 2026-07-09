import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RadioGroup } from "./RadioGroup";

describe("RadioGroup", () => {
  it("renders a labelled radiogroup with the given options, marking the current value checked", () => {
    render(
      <RadioGroup
        name="alignment"
        legend="Alignment"
        value="good"
        onChange={vi.fn()}
        options={[
          { value: "good", label: "Good" },
          { value: "evil", label: "Evil" },
        ]}
      />,
    );

    expect(screen.getByRole("radio", { name: "Good" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Evil" })).not.toBeChecked();
  });

  it("calls onChange with the clicked option's value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <RadioGroup
        name="alignment"
        legend="Alignment"
        value="good"
        onChange={onChange}
        options={[
          { value: "good", label: "Good" },
          { value: "evil", label: "Evil" },
        ]}
      />,
    );

    await user.click(screen.getByRole("radio", { name: "Evil" }));

    expect(onChange).toHaveBeenCalledWith("evil");
  });

  it("keeps both options in the same native radio group so arrow keys roam between them", () => {
    render(
      <RadioGroup
        name="alignment"
        legend="Alignment"
        value="good"
        onChange={vi.fn()}
        options={[
          { value: "good", label: "Good" },
          { value: "evil", label: "Evil" },
        ]}
      />,
    );

    const good = screen.getByRole("radio", { name: "Good" }) as HTMLInputElement;
    const evil = screen.getByRole("radio", { name: "Evil" }) as HTMLInputElement;
    expect(good.name).toBe(evil.name);
  });
});
