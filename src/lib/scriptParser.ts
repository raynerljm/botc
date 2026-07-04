import { allCharacters, type Character, type Team } from "./characters";

const KNOWN_TEAMS: Team[] = [
  "townsfolk",
  "outsider",
  "minion",
  "demon",
  "traveller",
  "fabled",
  "loric",
];

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

function parseMeta(raw: Record<string, unknown>): ScriptMeta {
  const meta: ScriptMeta = {};
  if (typeof raw.name === "string") meta.name = raw.name;
  if (typeof raw.author === "string") meta.author = raw.author;
  if (typeof raw.logo === "string") meta.logo = raw.logo;
  if (typeof raw.almanac === "string") meta.almanac = raw.almanac;
  if (typeof raw.bootlegger === "string") {
    meta.bootlegger = raw.bootlegger;
  } else if (Array.isArray(raw.bootlegger)) {
    const lines = raw.bootlegger.filter(
      (line): line is string => typeof line === "string",
    );
    if (lines.length > 0) meta.bootlegger = lines.join("\n\n");
  }
  if (Array.isArray(raw.firstNight)) {
    meta.firstNight = raw.firstNight.filter(
      (id): id is string => typeof id === "string",
    );
  }
  if (Array.isArray(raw.otherNight)) {
    meta.otherNight = raw.otherNight.filter(
      (id): id is string => typeof id === "string",
    );
  }
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
    typeof raw.team === "string" &&
    KNOWN_TEAMS.includes(raw.team as Team)
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
    reminders: Array.isArray(raw.reminders)
      ? raw.reminders.filter((r): r is string => typeof r === "string")
      : [],
    remindersGlobal: Array.isArray(raw.remindersGlobal)
      ? raw.remindersGlobal.filter((r): r is string => typeof r === "string")
      : [],
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

  let meta: ScriptMeta = {};
  const errors: ScriptParseError[] = [];
  const characters: Character[] = [];

  data.forEach((entry, index) => {
    if (typeof entry === "string") {
      const character = resolveCharacterId(entry);
      if (character) characters.push(character);
      else errors.push({ type: "unknown-character", raw: entry });
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

    if (raw.id === "_meta") {
      meta = parseMeta(raw);
      return;
    }

    if (!("name" in raw) && "id" in raw) {
      const id = String(raw.id);
      const character = resolveCharacterId(id);
      if (character) characters.push(character);
      else errors.push({ type: "unknown-character", raw: id });
      return;
    }

    const result = parseHomebrewCharacter(raw, index);
    if ("error" in result) errors.push(result.error);
    else characters.push(result.character);
  });

  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, script: { meta, characters, jinxes: computeActiveJinxes(characters) } };
}
