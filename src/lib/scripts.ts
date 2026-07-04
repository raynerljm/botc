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
  return {
    id: script.id,
    name: script.name,
    author: script.meta.author,
    source,
    characterCount: script.characters.filter((c) => c.team !== "traveller")
      .length,
    travellerCount: script.characters.filter((c) => c.team === "traveller")
      .length,
  };
}

function baseEditionScript(id: BaseEditionId, name: string): ScriptDetail {
  const characters = getEditionCharacters(id);
  return {
    id,
    name,
    meta: {},
    characters,
    jinxes: computeActiveJinxes(characters),
  };
}

// Successfully parsed scripts from the repo's script-library folder;
// malformed ones are dropped rather than surfaced (they're a repo bug to fix,
// not something a storyteller can act on).
export function listValidLibraryScripts(): ScriptDetail[] {
  const scripts: ScriptDetail[] = [];
  for (const entry of listLibraryScripts()) {
    if (!entry.result.ok) continue;
    const { meta, characters, jinxes } = entry.result.script;
    scripts.push({ id: entry.id, name: meta.name ?? entry.id, meta, characters, jinxes });
  }
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
