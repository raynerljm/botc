import { allCharacters, teamOrder, type Character, type Team } from "./characters";

export function normalizeCharacterId(id: string): string {
  return id.toLowerCase().replace(/[-_\s]/g, "");
}

const normalizedIndex = new Map(
  allCharacters.map((c) => [normalizeCharacterId(c.id), c]),
);

export function resolveCharacterId(id: string): Character | undefined {
  return normalizedIndex.get(normalizeCharacterId(id));
}

export interface ScriptMeta {
  name?: string;
  author?: string;
  logo?: string;
  almanac?: string;
  bootlegger?: string;
  firstNight?: string[];
  otherNight?: string[];
}

export interface ActiveJinx {
  characterId: string;
  targetId: string;
  reason: string;
}

export interface ParsedScript {
  meta: ScriptMeta;
  characters: Character[];
  jinxes: ActiveJinx[];
}

export type ScriptParseError =
  | { type: "invalid-json" }
  | { type: "not-array" }
  | { type: "unknown-character"; raw: string }
  | { type: "invalid-homebrew"; index: number; missingFields: string[] };

export type ScriptParseResult =
  | { ok: true; script: ParsedScript }
  | { ok: false; errors: ScriptParseError[] };

export function describeScriptParseError(error: ScriptParseError): string {
  switch (error.type) {
    case "invalid-json":
      return "That doesn't look like valid JSON.";
    case "not-array":
      return "A script must be a JSON array of characters.";
    case "unknown-character":
      return `Unknown character id: "${error.raw}".`;
    case "invalid-homebrew":
      return `Entry ${error.index + 1} is missing required fields: ${error.missingFields.join(", ")}.`;
  }
}

export function computeActiveJinxes(characters: Character[]): ActiveJinx[] {
  const idsInScript = new Set(
    characters.map((c) => normalizeCharacterId(c.id)),
  );
  const active: ActiveJinx[] = [];
  for (const character of characters) {
    for (const jinx of character.jinxes) {
      if (idsInScript.has(normalizeCharacterId(jinx.id))) {
        active.push({
          characterId: character.id,
          targetId: jinx.id,
          reason: jinx.reason,
        });
      }
    }
  }
  return active;
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string");
}

function parseMeta(raw: Record<string, unknown>): ScriptMeta {
  const meta: ScriptMeta = {};
  if (typeof raw.name === "string") meta.name = raw.name;
  if (typeof raw.author === "string") meta.author = raw.author;
  if (typeof raw.logo === "string") meta.logo = raw.logo;
  if (typeof raw.almanac === "string") meta.almanac = raw.almanac;
  if (typeof raw.bootlegger === "string") {
    meta.bootlegger = raw.bootlegger;
  } else {
    const lines = toStringArray(raw.bootlegger);
    if (lines && lines.length > 0) meta.bootlegger = lines.join("\n\n");
  }
  const firstNight = toStringArray(raw.firstNight);
  if (firstNight) meta.firstNight = firstNight;
  const otherNight = toStringArray(raw.otherNight);
  if (otherNight) meta.otherNight = otherNight;
  return meta;
}

const HOMEBREW_REQUIRED_FIELDS = ["id", "name", "team", "ability"] as const;

function parseHomebrewCharacter(
  raw: Record<string, unknown>,
  index: number,
): { character: Character } | { error: ScriptParseError } {
  const id =
    typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : undefined;
  const name =
    typeof raw.name === "string" && raw.name.trim()
      ? raw.name.trim()
      : undefined;
  const team =
    typeof raw.team === "string" && teamOrder.includes(raw.team as Team)
      ? (raw.team as Team)
      : undefined;
  const ability =
    typeof raw.ability === "string" && raw.ability.trim()
      ? raw.ability.trim()
      : undefined;

  const values: Record<(typeof HOMEBREW_REQUIRED_FIELDS)[number], unknown> = {
    id,
    name,
    team,
    ability,
  };
  const missingFields = HOMEBREW_REQUIRED_FIELDS.filter(
    (field) => values[field] === undefined,
  );
  if (missingFields.length > 0) {
    return { error: { type: "invalid-homebrew", index, missingFields } };
  }

  const character: Character = {
    id: id!,
    name: name!,
    edition: null,
    team: team!,
    ability: ability!,
    firstNight: typeof raw.firstNight === "number" ? raw.firstNight : 0,
    firstNightReminder:
      typeof raw.firstNightReminder === "string" ? raw.firstNightReminder : "",
    otherNight: typeof raw.otherNight === "number" ? raw.otherNight : 0,
    otherNightReminder:
      typeof raw.otherNightReminder === "string" ? raw.otherNightReminder : "",
    reminders: toStringArray(raw.reminders) ?? [],
    remindersGlobal: toStringArray(raw.remindersGlobal) ?? [],
    setup: raw.setup === true,
    jinxes: Array.isArray(raw.jinxes)
      ? raw.jinxes.filter(
          (j): j is Character["jinxes"][number] =>
            typeof j === "object" &&
            j !== null &&
            typeof (j as Record<string, unknown>).id === "string" &&
            typeof (j as Record<string, unknown>).reason === "string",
        )
      : [],
    image: typeof raw.image === "string" ? raw.image : null,
  };
  return { character };
}

function resolveOrError(
  id: string,
  characters: Character[],
  errors: ScriptParseError[],
): void {
  const character = resolveCharacterId(id);
  if (character) characters.push(character);
  else errors.push({ type: "unknown-character", raw: id });
}

function isMetaEntry(entry: unknown): entry is Record<string, unknown> {
  return (
    typeof entry === "object" && entry !== null && (entry as Record<string, unknown>).id === "_meta"
  );
}

export function parseScript(jsonText: string): ScriptParseResult {
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return { ok: false, errors: [{ type: "invalid-json" }] };
  }

  if (!Array.isArray(data)) {
    return { ok: false, errors: [{ type: "not-array" }] };
  }

  // _meta is recognized as its own preprocessing pass, independent of how the
  // remaining entries are classified below (reference vs. homebrew) — that
  // classification order must not affect whether _meta is found.
  const metaRaw = data.find(isMetaEntry);
  const meta = metaRaw ? parseMeta(metaRaw) : {};
  const entries = data.filter((entry) => !isMetaEntry(entry));

  const errors: ScriptParseError[] = [];
  const characters: Character[] = [];

  entries.forEach((entry, index) => {
    if (typeof entry === "string") {
      resolveOrError(entry, characters, errors);
      return;
    }

    if (typeof entry !== "object" || entry === null) {
      errors.push({
        type: "invalid-homebrew",
        index,
        missingFields: [...HOMEBREW_REQUIRED_FIELDS],
      });
      return;
    }

    const raw = entry as Record<string, unknown>;

    if (!("name" in raw) && "id" in raw) {
      resolveOrError(String(raw.id), characters, errors);
      return;
    }

    const result = parseHomebrewCharacter(raw, index);
    if ("error" in result) errors.push(result.error);
    else characters.push(result.character);
  });

  if (errors.length > 0) return { ok: false, errors };

  // A script naming the same character twice (bare id and/or reference) is
  // deduplicated rather than rendered/keyed twice — keep the first occurrence.
  const characterIds = new Set<string>();
  const deduped = characters.filter((character) => {
    if (characterIds.has(character.id)) return false;
    characterIds.add(character.id);
    return true;
  });

  return {
    ok: true,
    script: { meta, characters: deduped, jinxes: computeActiveJinxes(deduped) },
  };
}
