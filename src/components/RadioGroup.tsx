import styles from "./RadioGroup.module.css";

export interface RadioOption<T extends string> {
  value: T;
  label: string;
}

export interface RadioGroupProps<T extends string> {
  name: string;
  legend: string;
  value: T;
  onChange: (value: T) => void;
  options: RadioOption<T>[];
}

// Custom-styled replacement for a native <input type="radio"> group (issue
// #156) — same visually-hidden-input-plus-drawn-indicator technique as
// Checkbox, so keyboard nav, labelling, and roving selection all stay
// native for free.
export function RadioGroup<T extends string>({
  name,
  legend,
  value,
  onChange,
  options,
}: RadioGroupProps<T>) {
  return (
    <fieldset className={styles.group}>
      <legend>{legend}</legend>
      {options.map((option) => (
        <label key={option.value} className={styles.option}>
          <span className={styles.wrapper}>
            <input
              type="radio"
              className={styles.input}
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span className={styles.dot} aria-hidden="true" />
          </span>
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}
