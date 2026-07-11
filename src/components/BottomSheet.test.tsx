import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BottomSheet } from "./BottomSheet";

// jsdom has no real PointerEvent constructor, so a plain MouseEvent stands in
// with pointerId grafted on — same convention as GrimoireBoard.test.tsx's and
// NightList.test.tsx's own pointer-drag tests.
function pointerEvent(
  type: string,
  init: { pointerId: number; clientY: number },
) {
  const event = new MouseEvent(type, { bubbles: true, clientY: init.clientY });
  Object.defineProperty(event, "pointerId", { value: init.pointerId });
  return event;
}

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

  it("marks the section with data-bottom-sheet so only one sheet is ever mounted at a time (issue #195)", () => {
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

describe("BottomSheet: fixed-height overlay (issue #212, ADR 0004)", () => {
  it("marks itself expanded when not collapsed, and not expanded while peeking", () => {
    const { container, rerender } = render(
      <BottomSheet
        ariaLabel="Night list"
        title="Night list"
        collapsed={false}
        onToggleCollapsed={() => {}}
      >
        <p>Body</p>
      </BottomSheet>,
    );
    const panel = container.querySelector("[data-bottom-sheet]") as HTMLElement;
    expect(panel).toHaveAttribute("data-expanded");

    rerender(
      <BottomSheet
        ariaLabel="Night list"
        title="Night list"
        collapsed
        onToggleCollapsed={() => {}}
      >
        <p>Body</p>
      </BottomSheet>,
    );
    expect(panel).not.toHaveAttribute("data-expanded");
  });

  it("live-tracks the handle drag as an inline height, growing while dragging up from peek", () => {
    const { container } = render(
      <BottomSheet
        ariaLabel="Night list"
        title="Night list"
        collapsed
        onToggleCollapsed={() => {}}
      >
        <p>Body</p>
      </BottomSheet>,
    );
    const panel = container.querySelector("[data-bottom-sheet]") as HTMLElement;
    const handle = container.querySelector("[data-handle]") as HTMLElement;

    fireEvent(
      handle,
      pointerEvent("pointerdown", { pointerId: 1, clientY: 500 }),
    );
    expect(panel).not.toHaveAttribute("data-dragging");

    fireEvent(
      handle,
      pointerEvent("pointermove", { pointerId: 1, clientY: 400 }),
    );
    expect(panel).toHaveAttribute("data-dragging");
    const heightAfterFirstMove = parseFloat(panel.style.height);
    expect(heightAfterFirstMove).toBeGreaterThan(0);

    // Dragging further up grows the live height further still — a real,
    // continuously-tracking follow, not a single jump straight to expanded.
    fireEvent(
      handle,
      pointerEvent("pointermove", { pointerId: 1, clientY: 300 }),
    );
    const heightAfterSecondMove = parseFloat(panel.style.height);
    expect(heightAfterSecondMove).toBeGreaterThan(heightAfterFirstMove);

    fireEvent(
      handle,
      pointerEvent("pointerup", { pointerId: 1, clientY: 300 }),
    );
    // The inline override is cleared on release, handing height back to the
    // CSS rule (which is what actually animates the settle to peek/expanded).
    expect(panel.style.height).toBe("");
    expect(panel).not.toHaveAttribute("data-dragging");
  });

  it("clamps the live drag height so it can never be dragged past the expanded ceiling", () => {
    const { container } = render(
      <BottomSheet
        ariaLabel="Night list"
        title="Night list"
        collapsed
        onToggleCollapsed={() => {}}
      >
        <p>Body</p>
      </BottomSheet>,
    );
    const panel = container.querySelector("[data-bottom-sheet]") as HTMLElement;
    const handle = container.querySelector("[data-handle]") as HTMLElement;

    fireEvent(
      handle,
      pointerEvent("pointerdown", { pointerId: 1, clientY: 1000 }),
    );
    // A wildly oversized upward swipe — far more than peek-to-expanded ever
    // spans on any real viewport.
    fireEvent(
      handle,
      pointerEvent("pointermove", { pointerId: 1, clientY: -5000 }),
    );

    const clampedHeightPx = parseFloat(panel.style.height);
    // window.innerHeight defaults to 768 in jsdom — 45% of that is the
    // expanded ceiling the drag must never exceed.
    expect(clampedHeightPx).toBeLessThanOrEqual(window.innerHeight * 0.45);
  });

  it("clamps the live drag height so it can never be dragged below the peek floor", () => {
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
    const panel = container.querySelector("[data-bottom-sheet]") as HTMLElement;
    const handle = container.querySelector("[data-handle]") as HTMLElement;

    fireEvent(
      handle,
      pointerEvent("pointerdown", { pointerId: 1, clientY: -1000 }),
    );
    // A wildly oversized downward swipe.
    fireEvent(
      handle,
      pointerEvent("pointermove", { pointerId: 1, clientY: 5000 }),
    );

    const clampedHeightPx = parseFloat(panel.style.height);
    // Mirrors BottomSheet.tsx's own peek-floor conversion (4.5rem at the
    // *actual* root font size, not a hardcoded 16px-per-rem assumption —
    // Copilot review finding) so this test stays correct even if the test
    // environment's root font size ever differs from the browser default.
    const rootFontSizePx =
      parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    expect(clampedHeightPx).toBeGreaterThanOrEqual(4.5 * rootFontSizePx);
  });

  it("clears the live drag height on pointer cancel without toggling collapsed", () => {
    const onToggleCollapsed = vi.fn();
    const { container } = render(
      <BottomSheet
        ariaLabel="Night list"
        title="Night list"
        collapsed
        onToggleCollapsed={onToggleCollapsed}
      >
        <p>Body</p>
      </BottomSheet>,
    );
    const panel = container.querySelector("[data-bottom-sheet]") as HTMLElement;
    const handle = container.querySelector("[data-handle]") as HTMLElement;

    fireEvent(
      handle,
      pointerEvent("pointerdown", { pointerId: 1, clientY: 500 }),
    );
    fireEvent(
      handle,
      pointerEvent("pointermove", { pointerId: 1, clientY: 400 }),
    );
    expect(panel).toHaveAttribute("data-dragging");

    fireEvent(handle, pointerEvent("pointercancel", { pointerId: 1, clientY: 400 }));

    expect(panel.style.height).toBe("");
    expect(panel).not.toHaveAttribute("data-dragging");
    expect(onToggleCollapsed).not.toHaveBeenCalled();
  });

  it("ignores a second pointer landing on the handle while a drag is already in progress (code review finding)", () => {
    const { container } = render(
      <BottomSheet
        ariaLabel="Night list"
        title="Night list"
        collapsed
        onToggleCollapsed={() => {}}
      >
        <p>Body</p>
      </BottomSheet>,
    );
    const panel = container.querySelector("[data-bottom-sheet]") as HTMLElement;
    const handle = container.querySelector("[data-handle]") as HTMLElement;

    fireEvent(
      handle,
      pointerEvent("pointerdown", { pointerId: 1, clientY: 500 }),
    );
    fireEvent(
      handle,
      pointerEvent("pointermove", { pointerId: 1, clientY: 400 }),
    );
    const heightFromFirstPointer = panel.style.height;

    // A second finger touches the same handle mid-drag — must not hijack the
    // gesture out from under the first pointer.
    fireEvent(
      handle,
      pointerEvent("pointerdown", { pointerId: 2, clientY: 450 }),
    );
    fireEvent(
      handle,
      pointerEvent("pointermove", { pointerId: 2, clientY: 460 }),
    );
    expect(panel.style.height).toBe(heightFromFirstPointer);

    // The first pointer's own release still resolves the drag normally.
    fireEvent(
      handle,
      pointerEvent("pointerup", { pointerId: 1, clientY: 400 }),
    );
    expect(panel.style.height).toBe("");
    expect(panel).not.toHaveAttribute("data-dragging");
  });
});
