"use client";

import { useEffect, useRef, type ReactNode } from "react";

import styles from "./ConfirmDialog.module.css";
import { useDialogDismiss } from "./useDialogDismiss";

// A double-tap on the button that opens this dialog can land its second tap
// on the just-mounted backdrop — the trigger's screen position is now
// covered by the overlay, so click 2 fires a backdrop-tap-cancel before the
// storyteller ever sees Confirm/Cancel (issue #125). Ignoring backdrop taps
// for a brief window after mount survives a double-tap; a deliberate
// tap-outside just lands a moment later.
const BACKDROP_GRACE_MS = 500;

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
  // A quick double tap/click can fire two activation events before the
  // parent's state change unmounts this dialog — since confirming isn't
  // always idempotent (e.g. starting a new game creates a fresh id each
  // call), only the first response after open is allowed through.
  const respondedRef = useRef(false);
  // Set in an effect, not read eagerly during render (impure — React's
  // purity rule flags a direct `useRef(performance.now())`). performance.now()
  // rather than Date.now(): monotonic, so a backward system-clock adjustment
  // mid-game can't strand this dialog with a permanently-unresponsive
  // backdrop.
  const mountedAtRef = useRef<number | null>(null);

  function respond(action: () => void) {
    if (respondedRef.current) return;
    respondedRef.current = true;
    action();
  }

  useDialogDismiss(dialogRef, cancelButtonRef, () => respond(onCancel));

  useEffect(() => {
    mountedAtRef.current = performance.now();
  }, []);

  return (
    <div
      className={styles.overlay}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const elapsed =
          mountedAtRef.current === null
            ? 0
            : performance.now() - mountedAtRef.current;
        if (elapsed < BACKDROP_GRACE_MS) return;
        respond(onCancel);
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
            onClick={() => respond(onCancel)}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={destructive ? styles.destructive : styles.confirm}
            onClick={() => respond(onConfirm)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
