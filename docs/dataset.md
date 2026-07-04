# Vendored character dataset

The app ships with a vendored dataset of all official Blood on the Clocktower
characters (base editions, experimental, travellers, fabled) in
`src/data/characters.json`, plus downscaled token art in `public/icons/`.
Vendoring keeps the app fully offline-capable (ADR 0001) and build-deterministic.

## Refreshing

```sh
npm run refresh-dataset
```

The script (`scripts/refresh-dataset.mjs`) rebuilds both the JSON and the
icons from community-maintained sources, then you review the diff and commit.

## Sources

- **Characters** (id, name, team, ability, night positions and reminder texts,
  reminder-token labels, setup flag):
  [Skateside/pocket-grimoire](https://github.com/Skateside/pocket-grimoire)
  `assets/data/characters.json`, filtered to official characters by dropping
  the two homebrew script collections Pocket Grimoire bundles (`hdcs`, `syyl`
  editions).
- **Jinxes**: the same repo's `assets/data/jinx.json`, merged onto each
  character as `{ id, reason }` pairs.
- **Token art**: [bra1n/townsquare](https://github.com/bra1n/townsquare)
  `src/assets/icons/<id>.png`, downscaled to 128px webp. Not every character
  has art there (all base-edition characters do); characters without art get
  `image: null` and the UI renders a fallback token.

## Shape

One array of characters, sorted by `id`:

```jsonc
{
  "id": "washerwoman",
  "name": "Washerwoman",
  "edition": "tb",            // "tb" | "bmr" | "snv" | null (not in a base edition)
  "team": "townsfolk",        // townsfolk | outsider | minion | demon | traveller | fabled | loric
  "ability": "You start knowing that 1 of 2 players is a particular Townsfolk.",
  "firstNight": 32,           // 0 = does not act that night
  "firstNightReminder": "Show the character token of a Townsfolk in play. ...",
  "otherNight": 0,
  "otherNightReminder": "",
  "reminders": ["Townsfolk", "Wrong"],
  "remindersGlobal": [],
  "setup": false,
  "jinxes": [],               // [{ "id": "...", "reason": "..." }]
  "image": "/icons/washerwoman.webp" // null when no art is vendored
}
```

Night positions are Pocket Grimoire's numbering; they are consistent within
the dataset, which is all the night list needs (relative order).

## Licensing

Blood on the Clocktower is the intellectual property of Steven Medway and The
Pandemonium Institute. This is an unofficial fan project; character data and
art are used non-commercially under their community guidelines.
