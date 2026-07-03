# BotC Grimoire

A storyteller-facing digital grimoire for running in-person Blood on the Clocktower games (in the spirit of Pocket Grimoire), built as a client-only Next.js app.

## Language

**Script**:
The list of characters available for a given game, expressed in the official script-tool JSON format (bare character IDs and/or full homebrew character objects, with an optional `_meta` entry). The three base editions are just built-in scripts.
_Avoid_: set, edition (except for the three official ones)

**Script library**:
The curated collection of scripts bundled with the app and versioned in the repo, shown in the script picker. Distinct from scripts uploaded at runtime on one device.

**Game document**:
The single serializable JSON object holding one game's entire state, identified by a `schemaVersion`. It is the unit of persistence (localStorage) and of export.
_Avoid_: save file, session

**Starting character**:
The character a player drew or was assigned during setup.

**Final character**:
The character a player holds when the game ends, which may differ from their starting character (star-pass, Pit-Hag, Snake Charmer, etc.).

**Alignment**:
Good or evil. Tracked at start and end separately, since abilities can change it mid-game.
