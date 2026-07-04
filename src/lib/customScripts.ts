const STORAGE_KEY = "botc:custom-scripts";
const CHANGE_EVENT = "botc:custom-scripts-changed";

export interface StoredCustomScript {
  id: string;
  name: string;
  author?: string;
  rawText: string;
  addedAt: string;
}

function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function readAll(): StoredCustomScript[] {
  if (!hasStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredCustomScript[]) : [];
  } catch {
    return [];
  }
}

function writeAll(scripts: StoredCustomScript[]): void {
  if (!hasStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scripts));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function listCustomScripts(): StoredCustomScript[] {
  return readAll();
}

export function getCustomScript(id: string): StoredCustomScript | undefined {
  return readAll().find((script) => script.id === id);
}

export function saveCustomScript(input: {
  rawText: string;
  name: string;
  author?: string;
}): StoredCustomScript {
  const script: StoredCustomScript = {
    id: crypto.randomUUID(),
    name: input.name,
    author: input.author,
    rawText: input.rawText,
    addedAt: new Date().toISOString(),
  };
  writeAll([...readAll(), script]);
  return script;
}

export function deleteCustomScript(id: string): void {
  writeAll(readAll().filter((script) => script.id !== id));
}

// For useSyncExternalStore: a cached snapshot (stable by reference until the
// underlying storage actually changes) plus a subscription to both same-tab
// writes (CHANGE_EVENT) and cross-tab writes (the native "storage" event).
let cachedRaw: string | null = null;
let cachedScripts: StoredCustomScript[] = [];

export function getCustomScriptsSnapshot(): StoredCustomScript[] {
  if (!hasStorage()) return cachedScripts;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedScripts;
  cachedRaw = raw;
  cachedScripts = readAll();
  return cachedScripts;
}

export function subscribeCustomScripts(onChange: () => void): () => void {
  if (!hasStorage()) return () => {};
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
