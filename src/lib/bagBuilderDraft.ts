// In-progress bag-builder work (player count, traveller count, every
// toggle) — kept separate from gameStorage.ts's GamesStore because a draft
// isn't a GameDocument yet (no id, no schemaVersion, half the fields are
// React-only concepts like "which setup-choice option is picked"). One key
// per script (ADR 0001: offline-first localStorage) so a reload or a
// browser-back from `/game/` mid-build restores exactly what was there
// instead of snapping back to blank defaults (issue #118).
const STORAGE_PREFIX = "botc:bagBuilderDraft:";

export interface BagBuilderDraft {
  playerCount: number | "";
  travellerCount: number | "";
  selectedIds: string[];
  modifierChoices: Record<string, number>;
  extraCopies: Record<string, number>;
  standInId: string | null;
}

function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function draftKey(scriptId: string): string {
  return `${STORAGE_PREFIX}${scriptId}`;
}

function isCount(value: unknown): value is number | "" {
  return value === "" || typeof value === "number";
}

function isStringRecord(value: unknown): value is Record<string, number> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === "number")
  );
}

// Defensive the same way gameStorage.ts's parseStore is: a hand-edited or
// otherwise malformed draft must fall back to "no draft" rather than crash
// the bag builder on mount.
function isDraft(value: unknown): value is BagBuilderDraft {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    isCount(candidate.playerCount) &&
    isCount(candidate.travellerCount) &&
    Array.isArray(candidate.selectedIds) &&
    candidate.selectedIds.every((id) => typeof id === "string") &&
    isStringRecord(candidate.modifierChoices) &&
    isStringRecord(candidate.extraCopies) &&
    (candidate.standInId === null || typeof candidate.standInId === "string")
  );
}

export function loadBagBuilderDraft(scriptId: string): BagBuilderDraft | null {
  if (!hasStorage()) return null;
  const raw = window.localStorage.getItem(draftKey(scriptId));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveBagBuilderDraft(scriptId: string, draft: BagBuilderDraft): void {
  if (!hasStorage()) return;
  window.localStorage.setItem(draftKey(scriptId), JSON.stringify(draft));
}

export function clearBagBuilderDraft(scriptId: string): void {
  if (!hasStorage()) return;
  window.localStorage.removeItem(draftKey(scriptId));
}
