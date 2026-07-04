import fs from "node:fs";
import path from "node:path";

import { parseScript, type ScriptParseResult } from "./scriptParser";

export interface LibraryScript {
  id: string;
  result: ScriptParseResult;
}

const DEFAULT_LIBRARY_DIR = path.join(process.cwd(), "script-library");

// Every JSON file dropped in the library folder becomes a script — no code
// change needed. Runs at build time only (Server Components / generateStaticParams).
export function listLibraryScripts(
  dir: string = DEFAULT_LIBRARY_DIR,
): LibraryScript[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => ({
      id: file.replace(/\.json$/, ""),
      result: parseScript(fs.readFileSync(path.join(dir, file), "utf-8")),
    }));
}
