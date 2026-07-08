import { useState, type ChangeEvent } from "react";

import styles from "./FilePickerButton.module.css";

export interface FilePickerButtonProps {
  buttonLabel: string;
  accept?: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  id?: string;
  className?: string;
}

// Custom-styled replacement for a native <input type="file"> (issue #156):
// the native input is visually hidden (not display:none, so it stays
// focusable/labelled) and nested inside a <label> whose visible content is
// a themed button — clicking or activating either opens the native file
// picker, same as a bare native input would.
export function FilePickerButton({
  buttonLabel,
  accept,
  onChange,
  id,
  className,
}: FilePickerButtonProps) {
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <span className={[styles.wrapper, className].filter(Boolean).join(" ")}>
      {/* fileName stays outside the label: rendering it as label content
          would change the input's accessible name from buttonLabel to
          "buttonLabel fileName" the moment a file is picked (Copilot
          review finding). */}
      <label>
        <input
          id={id}
          className={styles.input}
          type="file"
          accept={accept}
          onChange={(event) => {
            setFileName(event.target.files?.[0]?.name ?? null);
            onChange(event);
          }}
        />
        <span className={styles.button}>{buttonLabel}</span>
      </label>
      {fileName && <span className={styles.fileName}>{fileName}</span>}
    </span>
  );
}
