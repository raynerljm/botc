import { GAME_SCHEMA_VERSION, type GameDocument } from "./gameDocument";

const STORAGE_KEY = "botc:game";
const CHANGE_EVENT = "botc:game-changed";

function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function parseGame(raw: string | null): GameDocument | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GameDocument;
    if (parsed.schemaVersion !== GAME_SCHEMA_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

// One active game document for now (ADR 0001) — a games list arrives later.
export function saveGame(game: GameDocument): void {
  if (!hasStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function loadGame(): GameDocument | null {
  if (!hasStorage()) return null;
  return parseGame(window.localStorage.getItem(STORAGE_KEY));
}

export function clearGame(): void {
  if (!hasStorage()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// For useSyncExternalStore: a cached snapshot (stable by reference until the
// underlying storage actually changes) plus a subscription to both same-tab
// writes (CHANGE_EVENT) and cross-tab writes (the native "storage" event) —
// mirrors customScripts.ts's snapshot/subscribe pair.
let cachedRaw: string | null = null;
let cachedGame: GameDocument | null = null;

export function getGameSnapshot(): GameDocument | null {
  if (!hasStorage()) return cachedGame;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedGame;
  cachedRaw = raw;
  cachedGame = parseGame(raw);
  return cachedGame;
}

export function subscribeGame(onChange: () => void): () => void {
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
