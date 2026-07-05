# BotC Grimoire

A storyteller-facing digital grimoire for running in-person Blood on the Clocktower games (in the spirit of Pocket Grimoire), built as a client-only Next.js app.

## Language

**Script**:
The list of characters available for a given game, expressed in the official script-tool JSON format (bare character IDs and/or full homebrew character objects, with an optional `_meta` entry). The three base editions are just built-in scripts.
_Avoid_: set, edition (except for the three official ones)

**Script library**:
The curated collection of scripts bundled with the app and versioned in the repo, shown in the script picker. Distinct from scripts uploaded at runtime on one device.

**Bag**:
The set of character tokens players draw from during setup — one token per player, assembled from the script's characters.

**Target counts**:
The per-team token counts the bag should contain for the chosen player count, after applying setup modifiers. Advisory, never enforced.

**Setup modifier**:
A character ability (flagged `setup: true`) that changes the bag's composition before play, e.g. Baron `[+2 Outsiders]`.

**Stand-in**:
The Townsfolk token placed in the bag to represent the Drunk. The player who draws it believes they are that Townsfolk; the grimoire records them as the Drunk.

**Seat**:
A player's position in the circle. Seat order defines token layout and matters mechanically (neighbour-reading abilities like Empath).

**Bag draw**:
The pass-the-device ritual: shuffled face-down tokens on screen, each player taps one, privately reveals, hides, and passes on. The digital equivalent of drawing from the cloth bag.

**Night list**:
The ordered todo list of ability entries for the current night (first night and other nights differ), derived from official night-order numbers, filtered to in-play characters, with check-off state persisted in the game document.

**Acts as**:
A marker on a player's token that they resolve another character's ability (Philosopher, Alchemist, Boffin). Inserts a night-list entry at the target character's position, attributed to that player; a first-night-only target on a later night is inserted for that night only.

**Demon bluffs**:
The three not-in-play good characters the storyteller shows the Demon on the first night. Exactly three slots, script-wide, not per-player.

**Claim**:
The character a player is currently presenting themselves as, good or evil. One current claim per player; no claim history.
_Avoid_: bluff (reserved for Demon bluffs)

**Ghost vote**:
The single vote a dead player retains for the rest of the game. Spent when used; the app tracks spent/unspent per dead player.

**Nomination**:
A living player proposing another player for execution. One made per living player per day; each player may be nominated once per day. Tracked for the current day only — no history.

**On the block**:
The player currently due for execution today: their nomination tally met the execution threshold (`ceil(living players / 2)`) and strictly beat the previous block-holder's tally. An exact tie clears the block.

**Exile**:
The Traveller equivalent of an execution. Threshold is `ceil(all players / 2)` (dead included) and ghost votes are not spent on it. An exiled Traveller dies like an executed player and, once dead, retains a ghost vote as usual.

**Game document**:
The single serializable JSON object holding one game's entire state, identified by a `schemaVersion`. It is the unit of persistence (localStorage) and of export.
_Avoid_: save file, session

**Starting character**:
The character a player drew or was assigned during setup.

**Final character**:
The character a player holds when the game ends, which may differ from their starting character (star-pass, Pit-Hag, Snake Charmer, etc.).

**Alignment**:
Good or evil. Tracked at start and end separately, since abilities can change it mid-game.
