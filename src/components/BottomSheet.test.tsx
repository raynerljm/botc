import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BottomSheet } from "./BottomSheet";

describe("BottomSheet: above/below slots", () => {
  it("keeps `above` visible regardless of collapsed state", () => {
    const { rerender } = render(
      <BottomSheet
        ariaLabel="Day phase"
        title="Day 1"
        collapsed={false}
        onToggleCollapsed={() => {}}
        above={<p>Timer</p>}
      >
        <p>Body</p>
      </BottomSheet>,
    );
    expect(screen.getByText("Timer")).toBeInTheDocument();

    rerender(
      <BottomSheet
        ariaLabel="Day phase"
        title="Day 1"
        collapsed
        onToggleCollapsed={() => {}}
        above={<p>Timer</p>}
      >
        <p>Body</p>
      </BottomSheet>,
    );
    expect(screen.getByText("Timer")).toBeInTheDocument();
    expect(screen.queryByText("Body")).not.toBeInTheDocument();
  });

  it("keeps `below` visible regardless of collapsed state", () => {
    const { rerender } = render(
      <BottomSheet
        ariaLabel="Night list"
        title="Night 1"
        collapsed={false}
        onToggleCollapsed={() => {}}
        below={<p>0/3 done</p>}
      >
        <p>Body</p>
      </BottomSheet>,
    );
    expect(screen.getByText("0/3 done")).toBeInTheDocument();

    rerender(
      <BottomSheet
        ariaLabel="Night list"
        title="Night 1"
        collapsed
        onToggleCollapsed={() => {}}
        below={<p>0/3 done</p>}
      >
        <p>Body</p>
      </BottomSheet>,
    );
    expect(screen.getByText("0/3 done")).toBeInTheDocument();
    expect(screen.queryByText("Body")).not.toBeInTheDocument();
  });

  it("hides `children` while collapsed, but keeps the heading reachable", () => {
    render(
      <BottomSheet
        ariaLabel="Night list"
        title="Night list"
        collapsed
        onToggleCollapsed={() => {}}
      >
        <p>Body</p>
      </BottomSheet>,
    );

    expect(screen.queryByText("Body")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Night list" }),
    ).toBeInTheDocument();
  });

  it("toggles collapsed via the heading", async () => {
    const user = userEvent.setup();
    const onToggleCollapsed = vi.fn();
    render(
      <BottomSheet
        ariaLabel="Night list"
        title="Night list"
        collapsed={false}
        onToggleCollapsed={onToggleCollapsed}
      >
        <p>Body</p>
      </BottomSheet>,
    );

    await user.click(screen.getByRole("button", { name: "Night list" }));

    expect(onToggleCollapsed).toHaveBeenCalledWith(true);
  });

  it("marks the section with data-bottom-sheet so GrimoireBoard can measure it", () => {
    const { container } = render(
      <BottomSheet
        ariaLabel="Night list"
        title="Night list"
        collapsed={false}
        onToggleCollapsed={() => {}}
      >
        <p>Body</p>
      </BottomSheet>,
    );

    expect(container.querySelector("[data-bottom-sheet]")).toBeInTheDocument();
  });
});
