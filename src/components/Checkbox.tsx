import styles from "./Checkbox.module.css";

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
}

// Custom-styled replacement for a native <input type="checkbox"> (issue
// #156): the native input stays in the DOM (full keyboard/label/form
// semantics, screen-reader role) but is visually hidden, with a sibling
// span drawing the themed box so no browser chrome ever renders.
export function Checkbox({
  checked,
  onChange,
  disabled,
  id,
  className,
  "aria-label": ariaLabel,
}: CheckboxProps) {
  return (
    <span className={[styles.wrapper, className].filter(Boolean).join(" ")}>
      <input
        type="checkbox"
        id={id}
        className={styles.input}
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={styles.box} aria-hidden="true" />
    </span>
  );
}
