import type { vi } from "vitest";

// Replaces navigator.clipboard with a stub whose writeText is the given
// mock. Must be called after userEvent.setup() — setup() installs its own
// navigator.clipboard stub, which would otherwise clobber this mock.
// Shared by every test that needs to capture a copied link (ShareScriptButton,
// GrimoireSetup's in-game share).
export function mockClipboard(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
}
