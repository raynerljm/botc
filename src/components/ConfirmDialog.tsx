"use client";

import { useEffect, useRef, type ReactNode } from "react";

import styles from "./ConfirmDialog.module.css";

export interface ConfirmDialogProps {
  title: string;
  // A plain-text body. For a richer body (e.g. a list), pass `children`
  // instead — the two can be combined, with `children` rendered after.
  message?: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  // Visually marks the confirming action as destructive (e.g. red). Omit
  // for confirmations that aren't destructive (e.g. "start a new game").
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Shared themed replacement for window.confirm() (issue #73): alertdialog
// semantics, a backdrop, Escape/backdrop-tap to cancel, and a focus trap so
// keyboard focus can't reach controls hidden behind the backdrop.
export function ConfirmDialog({
  title,
  message,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cancelButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable =
        dialogRef.current?.querySelectorAll<HTMLElement>("button") ?? [];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // The trigger can be gone by the time this runs — e.g. confirming
      // "Delete game" or "Remove player" removes the very row/token that
      // hosted it in the same commit that unmounts this dialog. Focusing a
      // detached node is a silent no-op, so only do it when there's
      // somewhere real to return to.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
    // Runs once per mount — this component is only ever mounted while the
    // confirmation it represents is open, so there's nothing to re-sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={styles.overlay}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <h2 className={styles.title}>{title}</h2>
        {message && <p className={styles.message}>{message}</p>}
        {children}
        <div className={styles.actions}>
          <button
            type="button"
            ref={cancelButtonRef}
            className={styles.cancel}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={destructive ? styles.destructive : styles.confirm}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
