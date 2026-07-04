import styles from "./PickerGroup.module.css";

export interface PickerGroupItem {
  label: string;
  selected?: boolean;
  onClick: () => void;
}

export interface PickerGroupProps {
  legend: string;
  items: PickerGroupItem[];
}

// Shared by every picker dialog's fieldsets (ReminderPicker's per-character
// and global groups, InfoTokenLibrary's per-team attach groups). Items are
// keyed by position, not label — reminder text can repeat within one
// character (e.g. the Knight's two "Know" reminders), so keying by label
// would crash React with duplicate keys.
export function PickerGroup({ legend, items }: PickerGroupProps) {
  if (items.length === 0) return null;
  return (
    <fieldset className={styles.group}>
      <legend>{legend}</legend>
      <div className={styles.items}>
        {items.map((item, index) => (
          <button
            key={index}
            type="button"
            aria-pressed={item.selected}
            onClick={item.onClick}
          >
            {item.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
