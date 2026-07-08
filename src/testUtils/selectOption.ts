import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

type User = ReturnType<typeof userEvent.setup>;

function findListbox(trigger: HTMLElement): HTMLElement {
  const listboxId = trigger.getAttribute("aria-controls");
  return listboxId
    ? (document.getElementById(listboxId) ?? screen.getByRole("listbox"))
    : screen.getByRole("listbox");
}

// Opens the custom Select's popup and returns the listbox element, for
// tests that want to run their own Testing Library queries against its
// structure (e.g. asserting on a specific optgroup's options) rather than
// just reading/picking a value.
export async function openListbox(
  user: User,
  trigger: HTMLElement,
): Promise<HTMLElement> {
  await user.click(trigger);
  return findListbox(trigger);
}

// Drop-in replacement for userEvent.selectOptions() against the custom
// Select component (issue #156) — a real <select> exposes every <option> in
// the DOM regardless of open state, so the old tests could pick an option
// without opening the dropdown first. The custom Select only renders its
// listbox while open, so this opens it, then resolves the target option by
// its visible label (matching the old text-based selectOptions calls) or,
// failing that, by its underlying value (matching the old value-based
// calls), before clicking it closed.
export async function selectOption(
  user: User,
  trigger: HTMLElement,
  match: string | RegExp,
) {
  await user.click(trigger);
  const listbox = findListbox(trigger);

  let option: HTMLElement | undefined;
  try {
    option = within(listbox).getByRole("option", { name: match });
  } catch {
    option = within(listbox)
      .getAllByRole("option")
      .find((el) =>
        match instanceof RegExp
          ? match.test(el.dataset.value ?? "")
          : el.dataset.value === match,
      );
  }
  if (!option) {
    throw new Error(`selectOption: no option matching ${String(match)}`);
  }
  await user.click(option);
}

// Replacement for reading a native <select>'s .options collection, which
// (unlike the custom Select) exists in the DOM regardless of open state.
// Opens the popup to read every option's value/label, then closes it again
// so the trigger is left the way selectOption() expects to find it.
export async function getSelectOptions(
  user: User,
  trigger: HTMLElement,
): Promise<{ value: string; label: string }[]> {
  await user.click(trigger);
  const listbox = findListbox(trigger);
  const options = within(listbox)
    .getAllByRole("option")
    .map((el) => ({ value: el.dataset.value ?? "", label: el.textContent ?? "" }));
  await user.keyboard("{Escape}");
  return options;
}
