"use client";

import type { ReactNode } from "react";

import styles from "./DialogOverlay.module.css";

export interface DialogOverlayProps {
  onCancel: () => void;
  children: ReactNode;
}

// Shared full-viewport backdrop for dialog-shaped overlays that aren't
// alertdialog-style confirmations (ReminderPicker, InfoTokenLibrary): tapping
// the backdrop itself (not a child) cancels, same convention as
// ConfirmDialog/ShareScriptButton's own backdrops.
export function DialogOverlay({ onCancel, children }: DialogOverlayProps) {
  return (
    <div
      className={styles.overlay}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      {children}
    </div>
  );
}
