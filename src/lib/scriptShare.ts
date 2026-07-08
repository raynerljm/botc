import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";

import type { Character } from "./characters";
import {
  META_ENTRY_ID,
  parseScript,
  resolveCharacterId,
  type ScriptMeta,
  type ScriptParseResult,
} from "./scriptParser";

function metaToRaw(meta: ScriptMeta): Record<string, unknown> | null {
  const raw: Record<string, unknown> = {};
  if (meta.name) raw.name = meta.name;
  if (meta.author) raw.author = meta.author;
  if (meta.logo) raw.logo = meta.logo;
  if (meta.almanac) raw.almanac = meta.almanac;
  if (meta.bootlegger) raw.bootlegger = meta.bootlegger;
  if (meta.firstNight) raw.firstNight = meta.firstNight;
  if (meta.otherNight) raw.otherNight = meta.otherNight;
  if (meta.teensyville) raw.teensyville = true;
  if (Object.keys(raw).length === 0) return null;
  return { id: META_ENTRY_ID, ...raw };
}

function arraysEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

// A script can reskin an official id with its own name/ability (parsed as a
// distinct object by scriptParser), so a character only round-trips as a
// bare id when its data exactly matches the vendored dataset entry — not
// merely when it's the same object reference, since a character arriving as
// a prop from a Server Component is a structurally-cloned copy, not the
// original reference, even when nothing about it was changed.
function isUnmodifiedOfficial(character: Character): boolean {
  const official = resolveCharacterId(character.id);
  if (!official) return false;
  return (
    official.name === character.name &&
    official.team === character.team &&
    official.ability === character.ability &&
    official.firstNight === character.firstNight &&
    official.firstNightReminder === character.firstNightReminder &&
    official.otherNight === character.otherNight &&
    official.otherNightReminder === character.otherNightReminder &&
    official.setup === character.setup &&
    official.image === character.image &&
    arraysEqual(official.reminders, character.reminders) &&
    arraysEqual(official.remindersGlobal, character.remindersGlobal) &&
    arraysEqual(
      official.jinxes.map((j) => `${j.id}:${j.reason}`),
      character.jinxes.map((j) => `${j.id}:${j.reason}`),
    )
  );
}

function characterToRaw(character: Character): unknown {
  if (isUnmodifiedOfficial(character)) return character.id;

  const raw: Record<string, unknown> = {
    id: character.id,
    name: character.name,
    team: character.team,
    ability: character.ability,
  };
  if (character.firstNight) raw.firstNight = character.firstNight;
  if (character.firstNightReminder) {
    raw.firstNightReminder = character.firstNightReminder;
  }
  if (character.otherNight) raw.otherNight = character.otherNight;
  if (character.otherNightReminder) {
    raw.otherNightReminder = character.otherNightReminder;
  }
  if (character.reminders.length) raw.reminders = character.reminders;
  if (character.remindersGlobal.length) {
    raw.remindersGlobal = character.remindersGlobal;
  }
  if (character.setup) raw.setup = true;
  if (character.jinxes.length) raw.jinxes = character.jinxes;
  if (character.image) raw.image = character.image;
  return raw;
}

function scriptEntries(
  meta: ScriptMeta,
  characters: Character[],
): unknown[] {
  const metaRaw = metaToRaw(meta);
  return [
    ...(metaRaw ? [metaRaw] : []),
    ...characters.map(characterToRaw),
  ];
}

// Takes only the script's own data — never a GameDocument — so a shared
// script structurally cannot leak grimoire/game state.
export function encodeScriptForShare(
  meta: ScriptMeta,
  characters: Character[],
): string {
  return compressToEncodedURIComponent(
    JSON.stringify(scriptEntries(meta, characters)),
  );
}

// The same script-tool JSON shape encodeScriptForShare compresses into a
// URL fragment, but uncompressed — for saving a received share link's
// script as a custom script, whose rawText is stored (and re-parsed) as
// plain script-tool JSON, not the share encoding.
export function scriptToRawJson(
  meta: ScriptMeta,
  characters: Character[],
): string {
  return JSON.stringify(scriptEntries(meta, characters));
}

export function decodeScriptForShare(encoded: string): ScriptParseResult {
  const json = decompressFromEncodedURIComponent(encoded);
  if (!json) return { ok: false, errors: [{ type: "invalid-json" }] };
  return parseScript(json);
}

// Both thresholds below must be checked against the full share URL (as
// built by buildShareUrl), not just the encoded script — that's what the QR
// encoder actually receives, and it's always a little longer.

// A QR code can technically hold several KB, but that capacity assumes a
// clean scan; a large script tends to render at a density phone cameras
// struggle with in a dim game room. This is advisory-only — it never blocks
// showing the code (ADR 0003's spirit), just adds a warning.
const RELIABLE_QR_LENGTH = 1500;

export function isTooLargeForReliableQr(url: string): boolean {
  return url.length > RELIABLE_QR_LENGTH;
}

// Past this, the underlying QR encoder (qrcode.react's qrcodegen, version
// 40 / ECC level L) throws RangeError("Data too long") instead of
// rendering — a hard capacity, not an advisory one. This must be checked
// *before* rendering QRCodeSVG so a large script degrades to a copy-only
// link instead of crashing.
const MAX_QR_CAPACITY = 2900;

export function exceedsQrCapacity(url: string): boolean {
  return url.length > MAX_QR_CAPACITY;
}

// basePath must be threaded through explicitly (not read from env here) so
// this stays a pure, easily testable function — callers pass
// NEXT_PUBLIC_BASE_PATH, the same variable next.config.ts uses, since a raw
// string URL (unlike next/link) isn't auto-prefixed with it.
//
// The trailing slash before the fragment matters: next.config.ts sets
// trailingSlash: true, so the static export's real file is
// share/index.html — every other link in this app gets that slash for
// free via next/link, but this hand-built string doesn't, and GitHub
// Pages (where this app deploys) doesn't reliably resolve the
// slash-less directory path.
export function buildShareUrl(
  origin: string,
  basePath: string,
  encoded: string,
): string {
  return `${origin}${basePath}/share/#${encoded}`;
}
