import styles from "./NumberStepper.module.css";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface NumberStepperProps {
  value: number | "";
  onChange: (value: number | "") => void;
  onBlur?: () => void;
  min: number;
  max: number;
  id?: string;
  className?: string;
  "aria-label": string;
}

// Custom-styled replacement for a native <input type="number"> (issue
// #156): keeps type="number" (native numeric keyboard, min/max semantics,
// numeric .value coercion) but hides the native spin-arrow chrome via CSS
// (NumberStepper.module.css), pairing it with themed −/+ buttons that do
// the stepping instead. Callers still own blur-time clamping via onBlur,
// matching the previous native <input>'s deferred-clamp convention.
export function NumberStepper({
  value,
  onChange,
  onBlur,
  min,
  max,
  id,
  className,
  "aria-label": ariaLabel,
}: NumberStepperProps) {
  const numeric = value === "" ? null : value;

  function step(delta: number) {
    const next = clamp((numeric ?? min) + delta, min, max);
    onChange(next);
  }

  return (
    <span className={[styles.stepper, className].filter(Boolean).join(" ")}>
      <button
        type="button"
        aria-label={`Decrease ${ariaLabel}`}
        disabled={numeric !== null && numeric <= min}
        onClick={() => step(-1)}
      >
        −
      </button>
      <input
        id={id}
        className={styles.input}
        type="number"
        min={min}
        max={max}
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => {
          const raw = event.target.value;
          onChange(raw === "" ? "" : Number(raw));
        }}
        onBlur={onBlur}
      />
      <button
        type="button"
        aria-label={`Increase ${ariaLabel}`}
        disabled={numeric !== null && numeric >= max}
        onClick={() => step(1)}
      >
        +
      </button>
    </span>
  );
}
