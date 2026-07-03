# BotC Grimoire

A storyteller-facing digital grimoire for running in-person Blood on the Clocktower games (in the spirit of Pocket Grimoire), built as a client-only Next.js app.

## Language

**Game document**:
The single serializable JSON object holding one game's entire state, identified by a `schemaVersion`. It is the unit of persistence (localStorage) and of export.
_Avoid_: save file, session

**Starting character**:
The character a player drew or was assigned during setup.

**Final character**:
The character a player holds when the game ends, which may differ from their starting character (star-pass, Pit-Hag, Snake Charmer, etc.).

**Alignment**:
Good or evil. Tracked at start and end separately, since abilities can change it mid-game.
