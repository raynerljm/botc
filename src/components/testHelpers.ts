// Replaces navigator.clipboard with a stub whose writeText is the given
// mock. Must be called after userEvent.setup() — setup() installs its own
// navigator.clipboard stub, which would otherwise clobber this mock.
// Shared by every test that needs to capture a copied link (ShareScriptButton,
// GrimoireSetup's in-game share). Typed against the Clipboard API shape, not
// the test runner's mock type, so this file never couples src/ to vitest.
export function mockClipboard(writeText: (text: string) => Promise<unknown>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
}
