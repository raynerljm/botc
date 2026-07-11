import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./Button";

describe("Button", () => {
  it("renders children as a native button with type=button by default", () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole("button", { name: "Click me" });
    expect(button).toHaveAttribute("type", "button");
  });

  it("defaults to the secondary tier", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("data-variant", "secondary");
  });

  it.each(["primary", "secondary", "ghost", "destructive", "icon"] as const)(
    "applies the %s tier",
    (variant) => {
      render(<Button variant={variant}>Action</Button>);
      expect(screen.getByRole("button")).toHaveAttribute("data-variant", variant);
    },
  );

  it("forwards a caller-supplied className alongside the tier class", () => {
    render(
      <Button variant="primary" className="good">
        Good wins
      </Button>,
    );
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("data-variant", "primary");
    expect(button).toHaveClass("good");
  });

  it("honors an explicit type override, e.g. submit", () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });

  it("forwards onClick, disabled, and other native button props", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} aria-label="Add reminder">
        +
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Add reminder" });
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Disabled
      </Button>,
    );
    await user.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("forwards a ref to the underlying button element", () => {
    let ref: HTMLButtonElement | null = null;
    render(
      <Button
        ref={(el) => {
          ref = el;
        }}
      >
        Ref me
      </Button>,
    );
    expect(ref).toBeInstanceOf(HTMLButtonElement);
  });
});
