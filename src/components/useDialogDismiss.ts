import { useEffect, type RefObject } from "react";

// A dialog's body can carry more than plain text (e.g. ConfirmDialog's
// `children`, issue #73 follow-up: BagBuilder's count-mismatch list), so the
// Tab trap must catch every tabbable element inside, not just a fixed set of
// known buttons.
const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// Every mounted dialog's own token, most-recently-opened last — so Escape
// only ever dismisses the topmost one. Needed since issue #155: the setup
// walkthrough's Demon bluffs step can open "Show to Demon" as a second
// dialog nested inside the walkthrough's own, and both mount this hook —
// without this, a single Escape press reached both document-level
// listeners and closed the walkthrough right along with the reveal.
const openDialogs: symbol[] = [];

// Shared accessible-dialog behavior for every overlay in the app
// (ConfirmDialog, the Share-via-QR modal): focus moves into the dialog on
// open, Tab is trapped within `containerRef` so it can never reach content
// hidden behind the backdrop, Escape calls `onDismiss`, and focus returns to
// whatever was focused before the dialog opened once it closes.
export function useDialogDismiss(
  containerRef: RefObject<HTMLElement | null>,
  initialFocusRef: RefObject<HTMLElement | null>,
  onDismiss: () => void,
) {
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    initialFocusRef.current?.focus();
    const token = Symbol("dialog");
    openDialogs.push(token);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        // Only the topmost dialog dismisses — an outer dialog's own listener
        // would otherwise also fire on the same keypress and close both.
        if (openDialogs[openDialogs.length - 1] !== token) return;
        event.preventDefault();
        onDismiss();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable =
        containerRef.current?.querySelectorAll<HTMLElement>(
          FOCUSABLE_SELECTOR,
        ) ?? [];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    // A dialog can resolve an internal step/screen (SetupWalkthrough
    // confirming a step, InfoTokenLibrary choosing a card) by unmounting the
    // very control that was focused, in the same commit that mounts its
    // replacement — the browser drops focus to <body> when that happens.
    // The Tab trap above only ever intercepts Tab at the container's
    // first/last focusable, so once activeElement is <body> it stops
    // engaging for the rest of this mount. A MutationObserver (rather than a
    // focusout listener, which doesn't fire for this case) catches every
    // such removal and pulls focus back onto the dialog's stable anchor; a
    // no-op once the whole dialog (not just an inner screen) has itself
    // unmounted, since containerRef.current is null by then too.
    const container = containerRef.current;
    const focusRecovery = new MutationObserver(() => {
      if (container && !container.contains(document.activeElement)) {
        initialFocusRef.current?.focus();
      }
    });
    if (container) {
      focusRecovery.observe(container, { childList: true, subtree: true });
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      openDialogs.splice(openDialogs.indexOf(token), 1);
      focusRecovery.disconnect();
      // The trigger can be gone by the time this runs — e.g. confirming
      // "Delete game" or "Remove player" removes the very row/token that
      // hosted it in the same commit that unmounts this dialog. Focusing a
      // detached node is a silent no-op, so only do it when there's
      // somewhere real to return to.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
    // Runs once per mount — every caller only ever mounts this while its
    // dialog is open, so there's nothing to re-sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
