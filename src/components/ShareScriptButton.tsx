"use client";

import { useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import type { Character } from "@/lib/characters";
import {
  buildShareUrl,
  encodeScriptForShare,
  exceedsQrCapacity,
  isTooLargeForReliableQr,
} from "@/lib/scriptShare";
import type { ScriptMeta } from "@/lib/scriptParser";

import { Button } from "./Button";
import styles from "./ShareScriptButton.module.css";
import { useDialogDismiss } from "./useDialogDismiss";

export interface ShareScriptButtonProps {
  meta: ScriptMeta;
  characters: Character[];
}

export function ShareScriptButton({ meta, characters }: ShareScriptButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Share via QR</Button>
      {open && (
        <ShareScriptModal
          meta={meta}
          characters={characters}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ShareScriptModal({
  meta,
  characters,
  onClose,
}: ShareScriptButtonProps & { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const url = useMemo(() => {
    const encoded = encodeScriptForShare(meta, characters);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    return buildShareUrl(origin, basePath, encoded);
  }, [meta, characters]);

  // The QR encoder has a hard capacity it throws past (no error boundary
  // exists to catch that) — this must be checked before ever rendering
  // QRCodeSVG, not just used to decide whether to show a warning.
  const tooLargeForQr = exceedsQrCapacity(url);
  const tooLargeToScanReliably = !tooLargeForQr && isTooLargeForReliableQr(url);

  // Same shared dialog semantics as ConfirmDialog: focus moves in on open,
  // Tab is trapped within the dialog so it can't reach GrimoireSetup's other
  // controls (EndGamePanel, player rows) hidden behind the backdrop, Escape
  // closes, and focus returns to the trigger so the next tap/keypress lands
  // on its intended target instead of a lingering overlay.
  useDialogDismiss(dialogRef, closeButtonRef, onClose);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <dialog
        ref={dialogRef}
        open
        aria-label="Share script via QR code"
        className={styles.dialog}
        onClick={(event) => event.stopPropagation()}
      >
        <Button
          variant="icon"
          ref={closeButtonRef}
          className={styles.close}
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </Button>
        {tooLargeForQr ? (
          <p role="alert" className={styles.warning}>
            This script is too large to encode as a QR code. Use Copy link
            instead.
          </p>
        ) : (
          <QRCodeSVG value={url} size={220} />
        )}
        {tooLargeToScanReliably && (
          <p role="alert" className={styles.warning}>
            This script is large — the QR code may not scan reliably. Use
            Copy link if scanning fails.
          </p>
        )}
        <Button variant="primary" onClick={copyUrl}>
          {copied ? "Copied!" : "Copy link"}
        </Button>
        {copyFailed && (
          <>
            <p className={styles.warning}>
              Couldn&apos;t copy automatically — select and copy the link
              below instead.
            </p>
            <p className={styles.url}>{url}</p>
          </>
        )}
      </dialog>
    </div>
  );
}
