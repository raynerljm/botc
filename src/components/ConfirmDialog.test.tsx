import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "./ConfirmDialog";

function ToggleHarness({ destructive = false }: { destructive?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Trigger
      </button>
      {open && (
        <ConfirmDialog
          title="Delete this?"
          message="This can't be undone."
          confirmLabel="Delete"
          destructive={destructive}
          onConfirm={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      )}
    </div>
  );
}

describe("ConfirmDialog", () => {
  it("renders as an alertdialog with the given title and message", () => {
    render(
      <ConfirmDialog
        title="Delete this?"
        message="This can't be undone."
        confirmLabel="Delete"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("alertdialog", { name: "Delete this?" });
    expect(dialog).toHaveTextContent("This can't be undone.");
  });

  it("calls onConfirm when the confirm button is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        title="Delete this?"
        message="This can't be undone."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Cancel is clicked and on Escape, but not on a tap inside the dialog", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        title="Delete this?"
        message="This can't be undone."
        confirmLabel="Delete"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("alertdialog"));
    expect(onCancel).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);

    onCancel.mockClear();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel on a backdrop tap outside the dialog", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const { container } = render(
      <ConfirmDialog
        title="Delete this?"
        message="This can't be undone."
        confirmLabel="Delete"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(container.firstChild as Element);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("moves focus into the dialog on open, traps Tab within it, and restores focus to the trigger on close", async () => {
    const user = userEvent.setup();
    render(<ToggleHarness />);

    const trigger = screen.getByRole("button", { name: "Trigger" });
    await user.click(trigger);

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    const deleteButton = screen.getByRole("button", { name: "Delete" });
    // Opening moves focus inside the dialog rather than leaving it on the
    // trigger, so a keyboard user starts able to act on the confirmation.
    expect(document.activeElement).toBe(cancelButton);

    // Tab cycles only between the dialog's own controls — it never escapes
    // to a covered background element while the dialog is open.
    await user.tab();
    expect(document.activeElement).toBe(deleteButton);
    await user.tab();
    expect(document.activeElement).toBe(cancelButton);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(deleteButton);

    await user.click(cancelButton);

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("gives the confirm button a different class when destructive, for the distinct-styling AC", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ToggleHarness destructive={false} />);
    await user.click(screen.getByRole("button", { name: "Trigger" }));
    const nonDestructiveClass = screen.getByRole("button", {
      name: "Delete",
    }).className;

    rerender(<ToggleHarness destructive />);
    await user.click(screen.getByRole("button", { name: "Trigger" }));
    expect(
      screen.getByRole("button", { name: "Delete" }).className,
    ).not.toBe(nonDestructiveClass);
  });
});
