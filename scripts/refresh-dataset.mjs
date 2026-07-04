// Refreshes the vendored official character dataset and token art.
// Usage: npm run refresh-dataset
// See docs/dataset.md for sources and update policy.

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CHARACTERS_URL =
  "https://raw.githubusercontent.com/Skateside/pocket-grimoire/main/assets/data/characters.json";
const JINXES_URL =
  "https://raw.githubusercontent.com/Skateside/pocket-grimoire/main/assets/data/jinx.json";
const ICON_URL = (id) =>
  `https://raw.githubusercontent.com/bra1n/townsquare/main/src/assets/icons/${id}.png`;

// Pocket Grimoire bundles two homebrew script collections alongside the
// official characters; everything else in its dataset is official.
const HOMEBREW_EDITIONS = new Set(["hdcs", "syyl"]);
const BASE_EDITIONS = new Set(["tb", "bmr", "snv"]);

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

// Source icons are ~539px / ~108KB; tokens render far smaller, and the app
// must stay light for bad venue wifi (ADR 0001), so vendor 128px webp.
async function fetchIcon(id) {
  const res = await fetch(ICON_URL(id));
  if (!res.ok) return null;
  const original = Buffer.from(await res.arrayBuffer());
  return sharp(original).resize(128, 128).webp({ quality: 80 }).toBuffer();
}

async function main() {
  const [rawCharacters, rawJinxes] = await Promise.all([
    fetchJson(CHARACTERS_URL),
    fetchJson(JINXES_URL),
  ]);

  const official = rawCharacters.filter(
    (c) => !HOMEBREW_EDITIONS.has(c.edition),
  );

  const jinxesByCharacter = new Map(
    rawJinxes.map((entry) => [entry.id, entry.jinx]),
  );

  const iconsDir = path.join(ROOT, "public", "icons");
  await rm(iconsDir, { recursive: true, force: true });
  await mkdir(iconsDir, { recursive: true });

  const characters = [];
  for (const c of official) {
    const icon = await fetchIcon(c.id);
    if (icon) await writeFile(path.join(iconsDir, `${c.id}.webp`), icon);
    characters.push({
      id: c.id,
      name: c.name,
      edition: BASE_EDITIONS.has(c.edition) ? c.edition : null,
      team: c.team,
      ability: c.ability,
      firstNight: c.firstNight ?? 0,
      firstNightReminder: c.firstNightReminder ?? "",
      otherNight: c.otherNight ?? 0,
      otherNightReminder: c.otherNightReminder ?? "",
      reminders: c.reminders ?? [],
      remindersGlobal: c.remindersGlobal ?? [],
      setup: c.setup ?? false,
      jinxes: (jinxesByCharacter.get(c.id) ?? []).map((j) => ({
        id: j.id,
        reason: j.reason,
      })),
      image: icon ? `/icons/${c.id}.webp` : null,
    });
  }

  characters.sort((a, b) => a.id.localeCompare(b.id));

  const outFile = path.join(ROOT, "src", "data", "characters.json");
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(characters, null, 2) + "\n");

  const withArt = characters.filter((c) => c.image).length;
  console.log(
    `Wrote ${characters.length} characters (${withArt} with token art) to ${path.relative(ROOT, outFile)}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
