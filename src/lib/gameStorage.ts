import { GAME_SCHEMA_VERSION, type GameDocument } from "./gameDocument";
import { coerceNotes } from "./gameNotes";

// One store key holds every saved game plus a pointer to the active one — the
// game the /game screen is currently showing. Each game is still an
// independently serializable document (ADR 0001); the wrapper just lets more
// than one coexist on a device (issue #21: the games list).
const STORAGE_KEY = "botc:games";
// Pre-#21 key: a single game document, with none of `id`/`winner`/`endedAt`/
// `notes` (all added by this slice). Migrated into the new store below so an
// in-progress game from before the games list doesn't silently vanish.
const LEGACY_STORAGE_KEY = "botc:game";
const CHANGE_EVENT = "botc:game-changed";

interface GamesStore {
  activeId: string | null;
  games: GameDocument[];
}

const EMPTY_STORE: GamesStore = { activeId: null, games: [] };

function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function isStoredGame(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

// The exact shape this migration upgrades a v20 document *to* — a fixed
// literal, not a live read of GAME_SCHEMA_VERSION (Copilot review finding).
// If a later, unrelated bump moves GAME_SCHEMA_VERSION past 21, this
// migration must keep producing v21 documents (missing whatever fields that
// later bump adds) so the version filter below still drops them, rather than
// stamping a v20 document straight up to the *current* version and letting
// it slip past the filter without those newer required fields.
const NOTES_SECTIONS_SCHEMA_VERSION = 21;

// Issue #193 changed `notes` from a single string to sectioned notes and
// added the required `notesCollapsed` field, bumping GAME_SCHEMA_VERSION
// from 20 to 21. Unlike every other bump, this one carries data storytellers
// may already have written, so a v20 game is upgraded in place here rather
// than being silently dropped by the version filter below (AC: "without
// data loss") — every other outdated version still gets dropped as before.
function upgradeV20Notes(game: unknown): unknown {
  if (!isStoredGame(game) || game.schemaVersion !== 20) return game;
  return {
    ...game,
    schemaVersion: NOTES_SECTIONS_SCHEMA_VERSION,
    notes: coerceNotes(game.notes),
    // A real v20 document never had this field at all (it's new in v21) —
    // backfill the same default `createGame` uses, or every migrated game
    // would carry an `undefined` where its type says `boolean` (code review
    // finding).
    notesCollapsed:
      typeof game.notesCollapsed === "boolean" ? game.notesCollapsed : false,
  };
}

function parseStore(raw: string | null): GamesStore {
  if (!raw) return EMPTY_STORE;
  try {
    const parsed = JSON.parse(raw) as { activeId: string | null; games: unknown[] };
    if (!parsed || !Array.isArray(parsed.games)) return EMPTY_STORE;
    // Drop any game written by a different schema version rather than handing
    // back something the app can't render.
    const games = parsed.games.map(upgradeV20Notes).filter(
      (game): game is GameDocument =>
        isStoredGame(game) && game.schemaVersion === GAME_SCHEMA_VERSION,
    );
    const activeId = games.some((game) => game.id === parsed.activeId)
      ? parsed.activeId
      : null;
    return { activeId, games };
  } catch {
    return EMPTY_STORE;
  }
}

// Runs once per device: if the new store has never been written but a
// pre-#21 single-game document exists, promote it into the new shape (as the
// sole, active game) and remove the old key. A no-op on every later read.
function migrateLegacyGame(): void {
  if (window.localStorage.getItem(STORAGE_KEY) !== null) return;
  const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!legacyRaw) return;
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);

  try {
    const legacy = JSON.parse(legacyRaw) as Partial<GameDocument> | null;
    if (!legacy || legacy.schemaVersion !== GAME_SCHEMA_VERSION) return;

    const game: GameDocument = {
      ...legacy,
      id: legacy.id ?? crypto.randomUUID(),
      winner: legacy.winner ?? null,
      endedAt: legacy.endedAt ?? null,
      notes: coerceNotes(legacy.notes),
    } as GameDocument;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ activeId: game.id, games: [game] }),
    );
  } catch {
    // Malformed legacy data — nothing usable to migrate.
  }
}

function readStore(): GamesStore {
  if (!hasStorage()) return EMPTY_STORE;
  migrateLegacyGame();
  return parseStore(window.localStorage.getItem(STORAGE_KEY));
}

function writeStore(store: GamesStore): void {
  if (!hasStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// Upsert by id and make the saved game active. GrimoireSetup calls this on
// every edit, so an existing game is replaced in place, never duplicated.
export function saveGame(game: GameDocument): void {
  const store = readStore();
  const exists = store.games.some((g) => g.id === game.id);
  const games = exists
    ? store.games.map((g) => (g.id === game.id ? game : g))
    : [...store.games, game];
  writeStore({ activeId: game.id, games });
}

export function loadGame(): GameDocument | null {
  const store = readStore();
  return store.games.find((game) => game.id === store.activeId) ?? null;
}

export function listGames(): GameDocument[] {
  return readStore().games;
}

export function setActiveGame(id: string): void {
  const store = readStore();
  if (!store.games.some((game) => game.id === id)) return;
  writeStore({ ...store, activeId: id });
}

export function deleteGame(id: string): void {
  const store = readStore();
  const games = store.games.filter((game) => game.id !== id);
  const activeId = store.activeId === id ? null : store.activeId;
  writeStore({ activeId, games });
}

// Wipes every saved game — used for a full reset (and by tests). Deleting a
// single game from the list is `deleteGame`.
export function clearGames(): void {
  if (!hasStorage()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// For useSyncExternalStore: a cached parse (stable by reference until the
// underlying storage actually changes) plus a subscription to both same-tab
// writes (CHANGE_EVENT) and cross-tab writes (the native "storage" event).
let cachedRaw: string | null | undefined;
let cachedStore: GamesStore = EMPTY_STORE;

function currentStore(): GamesStore {
  if (!hasStorage()) return cachedStore;
  migrateLegacyGame();
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedStore;
  cachedRaw = raw;
  cachedStore = parseStore(raw);
  return cachedStore;
}

export function getGameSnapshot(): GameDocument | null {
  const store = currentStore();
  return store.games.find((game) => game.id === store.activeId) ?? null;
}

export function getGamesSnapshot(): GameDocument[] {
  return currentStore().games;
}

function subscribe(onChange: () => void): () => void {
  if (!hasStorage()) return () => {};
  function handleStorage(event: StorageEvent): void {
    if (event.key === null || event.key === STORAGE_KEY) onChange();
  }
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", handleStorage);
  };
}

export const subscribeGame = subscribe;
export const subscribeGames = subscribe;
