import {
  baseEditions,
  getEditionCharacters,
  type BaseEditionId,
  type Character,
} from "./characters";
import { listLibraryScripts } from "./scriptLibrary";
import {
  computeActiveJinxes,
  type ActiveJinx,
  type ScriptMeta,
} from "./scriptParser";

export interface ScriptDetail {
  id: string;
  name: string;
  meta: ScriptMeta;
  characters: Character[];
  jinxes: ActiveJinx[];
}

export interface ScriptSummary {
  id: string;
  name: string;
  author?: string;
  source: "base" | "library";
  characterCount: number;
  travellerCount: number;
}

function toSummary(
  script: ScriptDetail,
  source: ScriptSummary["source"],
): ScriptSummary {
  const travellerCount = script.characters.filter(
    (c) => c.team === "traveller",
  ).length;
  return {
    id: script.id,
    name: script.name,
    author: script.meta.author,
    source,
    characterCount: script.characters.length - travellerCount,
    travellerCount,
  };
}

function baseEditionScript(id: BaseEditionId, name: string): ScriptDetail {
  const characters = getEditionCharacters(id);
  return {
    id,
    name,
    // meta.name mirrors the top-level name so consumers that only see the
    // meta (e.g. sharing a script) don't lose the display name for base
    // editions, which have no script-tool _meta entry of their own.
    meta: { name },
    characters,
    jinxes: computeActiveJinxes(characters),
  };
}

const baseEditionIds = new Set<string>(baseEditions.map((e) => e.id));

// Computed once: this reads and parses every script-library file, and both
// listScriptSummaries and getScriptById need the result on every call.
let libraryScriptsCache: ScriptDetail[] | null = null;

// Successfully parsed scripts from the repo's script-library folder, minus
// any whose filename collides with a base edition id (that id always
// resolves to the built-in edition, so a same-named library script would be
// permanently unreachable); malformed or colliding ones are dropped rather
// than surfaced — they're a repo bug to fix, not something a storyteller can
// act on.
export function listValidLibraryScripts(dir?: string): ScriptDetail[] {
  if (!dir && libraryScriptsCache) return libraryScriptsCache;

  const scripts: ScriptDetail[] = [];
  for (const entry of listLibraryScripts(dir)) {
    if (!entry.result.ok) continue;
    if (baseEditionIds.has(entry.id)) continue;
    const { meta, characters, jinxes } = entry.result.script;
    const name = meta.name ?? entry.id;
    scripts.push({
      id: entry.id,
      name,
      // meta.name mirrors the resolved name (see baseEditionScript above)
      // so consumers that only read meta — e.g. sharing a script — don't
      // lose the display name when the library JSON has no _meta.name.
      meta: { ...meta, name },
      characters,
      jinxes,
    });
  }
  if (!dir) libraryScriptsCache = scripts;
  return scripts;
}

export function listScriptSummaries(): ScriptSummary[] {
  const base = baseEditions.map((edition) =>
    toSummary(baseEditionScript(edition.id, edition.name), "base"),
  );
  const library = listValidLibraryScripts().map((script) =>
    toSummary(script, "library"),
  );
  return [...base, ...library];
}

export function getScriptById(id: string): ScriptDetail | undefined {
  const edition = baseEditions.find((e) => e.id === id);
  if (edition) return baseEditionScript(edition.id, edition.name);
  return listValidLibraryScripts().find((script) => script.id === id);
}
