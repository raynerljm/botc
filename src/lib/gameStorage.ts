import { GAME_SCHEMA_VERSION, type GameDocument } from "./gameDocument";

// One store key holds every saved game plus a pointer to the active one — the
// game the /game screen is currently showing. Each game is still an
// independently serializable document (ADR 0001); the wrapper just lets more
// than one coexist on a device (issue #21: the games list).
const STORAGE_KEY = "botc:games";
const CHANGE_EVENT = "botc:game-changed";

interface GamesStore {
  activeId: string | null;
  games: GameDocument[];
}

const EMPTY_STORE: GamesStore = { activeId: null, games: [] };

function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function parseStore(raw: string | null): GamesStore {
  if (!raw) return EMPTY_STORE;
  try {
    const parsed = JSON.parse(raw) as GamesStore;
    if (!parsed || !Array.isArray(parsed.games)) return EMPTY_STORE;
    // Drop any game written by a different schema version rather than handing
    // back something the app can't render.
    const games = parsed.games.filter(
      (game) => game && game.schemaVersion === GAME_SCHEMA_VERSION,
    );
    const activeId = games.some((game) => game.id === parsed.activeId)
      ? parsed.activeId
      : null;
    return { activeId, games };
  } catch {
    return EMPTY_STORE;
  }
}

function readStore(): GamesStore {
  if (!hasStorage()) return EMPTY_STORE;
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
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// For useSyncExternalStore: a cached parse (stable by reference until the
// underlying storage actually changes) plus a subscription to both same-tab
// writes (CHANGE_EVENT) and cross-tab writes (the native "storage" event).
let cachedRaw: string | null | undefined;
let cachedStore: GamesStore = EMPTY_STORE;

function currentStore(): GamesStore {
  if (!hasStorage()) return cachedStore;
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
