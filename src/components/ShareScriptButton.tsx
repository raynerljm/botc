"use client";

import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import type { Character } from "@/lib/characters";
import {
  buildShareUrl,
  encodeScriptForShare,
  exceedsQrCapacity,
  isTooLargeForReliableQr,
} from "@/lib/scriptShare";
import type { ScriptMeta } from "@/lib/scriptParser";

import styles from "./ShareScriptButton.module.css";

export interface ShareScriptButtonProps {
  meta: ScriptMeta;
  characters: Character[];
}

export function ShareScriptButton({ meta, characters }: ShareScriptButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(true)}
      >
        Share via QR
      </button>
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
        open
        aria-label="Share script via QR code"
        className={styles.dialog}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        {tooLargeForQr ? (
          <p role="alert" className={styles.warning}>
            This script is too large to encode as a QR code. Share the link
            below instead.
          </p>
        ) : (
          <QRCodeSVG value={url} size={220} />
        )}
        {tooLargeToScanReliably && (
          <p role="alert" className={styles.warning}>
            This script is large — the QR code may not scan reliably. Share
            the link below instead if scanning fails.
          </p>
        )}
        <p className={styles.url}>{url}</p>
        <button type="button" className={styles.copy} onClick={copyUrl}>
          {copied ? "Copied!" : "Copy link"}
        </button>
        {copyFailed && (
          <p className={styles.warning}>
            Couldn&apos;t copy automatically — select and copy the link above
            instead.
          </p>
        )}
      </dialog>
    </div>
  );
}
