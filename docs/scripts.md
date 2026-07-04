# Scripts: format, library, and custom uploads

A **script** is the list of characters available for a game, in the official
[script-tool](https://script.bloodontheclocktower.com/) JSON format: an array
whose entries are bare official character ids, `{ "id": "..." }` references,
or full homebrew character objects, plus an optional `_meta` entry. The three
base editions are just built-in scripts; everything below applies to them too.

## Entry shapes

- **Bare id** — `"washerwoman"`. Resolved against the vendored dataset with
  normalization: case, hyphens, and underscores are all treated as equivalent
  (`"Al-Hadikhia"`, `"al_hadikhia"`, and `"alhadikhia"` all resolve to the same
  character).
- **Id reference** — `{ "id": "washerwoman" }`. Same resolution as a bare id.
- **Homebrew character** — a plain object with `name` (as opposed to just
  `id`). Required fields: `id`, `name`, `team`, `ability`. Everything else
  (`firstNight`, `firstNightReminder`, `otherNight`, `otherNightReminder`,
  `reminders`, `remindersGlobal`, `setup`, `jinxes`, `image`) is optional and
  defaults the same way an official character with no data there would.
  Homebrew characters work everywhere official ones do (sheet, ability text,
  night positions, reminders, setup flag) — the two are the same `Character`
  shape once parsed.
- **`_meta`** — `{ "id": "_meta", "name": "...", "author": "...", "logo":
  "...", "almanac": "...", "bootlegger": "...", "firstNight": [...],
  "otherNight": [...] }`. All fields optional. `firstNight`/`otherNight` are
  stored as given (an ordered list of ids) for the night list to consume in a
  later slice.

Malformed input produces a specific, in-UI error rather than a stack trace:
invalid JSON, a non-array top level, an unresolvable bare id, or a homebrew
object missing required fields (naming exactly which ones).

**Active jinxes** — computed from the dataset's one-directional jinx pairs
(e.g. Alchemist lists Wraith, not the reverse): a jinx is active only when
_both_ characters are in the script, and is shown with its rule text.

The parsing/validation logic lives in `src/lib/scriptParser.ts` and is shared
by every source below.

## Script library (`script-library/`)

Drop a script-tool JSON file in the repo's `script-library/` folder and it
appears in the picker after the next build — no code change. The filename
(minus `.json`) becomes its route id (`script-library/my-script.json` →
`/scripts/my-script`). Discovery happens at build time
(`src/lib/scriptLibrary.ts`, via Node's `fs`, called only from Server
Components / `generateStaticParams`), so it costs nothing at runtime and keeps
the app fully offline (ADR 0001). A script that fails to parse is dropped from
the picker rather than breaking the build — fix it and it reappears.

`script-library/sample-homebrew.json` is a working example: a handful of
official characters, one homebrew character, an active jinx pair (Alchemist +
Wraith), and `_meta` (name, author, bootlegger text).

## Runtime upload and paste

From the script picker's "Your scripts" section, "Add a script" accepts either
a `.json` file upload or pasted script-tool JSON. On success the script is
remembered on this device (`localStorage`, `src/lib/customScripts.ts`) and
opens at `/scripts/custom?id=<generated-id>` — a fully client-rendered route,
since the id doesn't exist at build time. Custom scripts are per-device: they
don't sync, and opening that URL on a different device shows a friendly
"not on this device" message instead of an error.
