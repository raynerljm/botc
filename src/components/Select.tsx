"use client";

import { useEffect, useId, useRef, useState } from "react";

import styles from "./Select.module.css";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectOptionGroup {
  label: string;
  options: SelectOption[];
}

export type SelectEntry = SelectOption | SelectOptionGroup;

function isGroup(entry: SelectEntry): entry is SelectOptionGroup {
  return "options" in entry;
}

function flattenOptions(entries: SelectEntry[]): SelectOption[] {
  return entries.flatMap((entry) => (isGroup(entry) ? entry.options : [entry]));
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  entries: SelectEntry[];
  id?: string;
  className?: string;
  "aria-label"?: string;
}

// Custom-styled replacement for a native <select> (issue #156): a listbox
// popup positioned under a trigger button. Keyboard focus never leaves the
// trigger — aria-activedescendant tracks the highlighted option, the same
// pattern a native <select> uses internally — which keeps the whole widget
// a single Tab stop, exactly like the native control it replaces.
export function Select({
  value,
  onChange,
  entries,
  id,
  className,
  "aria-label": ariaLabel,
}: SelectProps) {
  const generatedId = useId();
  const baseId = id ?? generatedId;
  const [open, setOpen] = useState(false);
  const [activeValue, setActiveValue] = useState(value);
  const rootRef = useRef<HTMLDivElement>(null);

  const flat = flattenOptions(entries);
  const indexOf = new Map(flat.map((option, index) => [option, index] as const));
  const selected = flat.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  function openList() {
    setActiveValue(value || (flat[0]?.value ?? ""));
    setOpen(true);
  }

  function commit(next: string) {
    onChange(next);
    setOpen(false);
  }

  function moveActive(delta: number) {
    const currentIndex = flat.findIndex((option) => option.value === activeValue);
    const nextIndex = Math.min(
      Math.max(currentIndex + delta, 0),
      flat.length - 1,
    );
    const next = flat[nextIndex];
    if (next) setActiveValue(next.value);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openList();
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveActive(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveActive(-1);
        break;
      case "Home":
        event.preventDefault();
        if (flat[0]) setActiveValue(flat[0].value);
        break;
      case "End":
        event.preventDefault();
        if (flat[flat.length - 1]) setActiveValue(flat[flat.length - 1].value);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        commit(activeValue);
        break;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  function renderOption(option: SelectOption) {
    const index = indexOf.get(option);
    return (
      <div
        key={option.value}
        id={`${baseId}-option-${index}`}
        role="option"
        aria-selected={option.value === value}
        data-active={option.value === activeValue || undefined}
        data-value={option.value}
        className={styles.option}
        onMouseEnter={() => setActiveValue(option.value)}
        onClick={() => commit(option.value)}
      >
        {option.label}
      </div>
    );
  }

  return (
    <div
      className={[styles.root, className].filter(Boolean).join(" ")}
      ref={rootRef}
    >
      <button
        type="button"
        id={id}
        role="combobox"
        className={styles.trigger}
        data-value={value}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${baseId}-listbox` : undefined}
        aria-label={ariaLabel}
        aria-activedescendant={
          open && activeValue
            ? `${baseId}-option-${indexOf.get(
                flat.find((option) => option.value === activeValue) ?? flat[0],
              )}`
            : undefined
        }
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={handleKeyDown}
      >
        <span className={styles.value}>{selected?.label ?? ""}</span>
        <span className={styles.arrow} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={`${baseId}-listbox`}
          className={styles.listbox}
          role="listbox"
          aria-label={ariaLabel}
        >
          {entries.map((entry, entryIndex) =>
            isGroup(entry) ? (
              <div
                key={`group-${entryIndex}`}
                role="group"
                aria-labelledby={`${baseId}-group-${entryIndex}`}
              >
                <div
                  className={styles.groupLabel}
                  id={`${baseId}-group-${entryIndex}`}
                >
                  {entry.label}
                </div>
                {entry.options.map(renderOption)}
              </div>
            ) : (
              renderOption(entry)
            ),
          )}
        </div>
      )}
    </div>
  );
}
