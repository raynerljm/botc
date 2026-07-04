# BotC Grimoire — Copilot instructions

A storyteller-facing digital grimoire for running in-person Blood on the Clocktower
games. Client-only Next.js app. Before reviewing or suggesting code, treat
`CONTEXT.md` (domain glossary) and `docs/adr/` (binding decisions) as authoritative.

## Architecture invariants (flag any violation)

These come from the ADRs and are non-negotiable:

- **Client-only, offline-first** (ADR 0001). No runtime dependency on a server:
  no API-route calls, no database, no network fetches in the game flow. Games are
  played in venues with bad wifi. Do not add SSR/server components that render game
  data — the grimoire renders entirely from client state. Persistence is
  `localStorage`.
- **Single game document** (ADR 0001/0002). All of one game's state is a single
  serializable JSON object with a `schemaVersion` field. It is the unit of
  persistence and of export. Flag any game state kept outside this document
  (module-level mutable singletons, refs that outlive a render and aren't
  serialized, etc.), and any change to its shape that doesn't consider
  `schemaVersion`.
- **Snapshot export, not an event log** (ADR 0002). Export is a single versioned
  snapshot. Do **not** introduce event-sourcing or a night-by-night event log to
  support a feature. Per-night history is intentionally not captured.
- **Advisory validation, never blocking** (ADR 0003). Setup/bag warnings are always
  overridable and "start game" is always available. Never turn count validation into
  a hard gate. Characters like Legion, Riot, Atheist, and Summoner break the
  distribution table by design — code must tolerate that, not "correct" it.

## Domain vocabulary

Use the exact terms from `CONTEXT.md` in identifiers, comments, and UI copy, and
flag drift in PRs:

- Prefer **script** over "set"/"edition" (except the three official base editions).
- Prefer **claim** for what a player presents as; reserve **bluff** for the three
  **demon bluffs** shown to the Demon.
- Prefer **game document** over "save file"/"session".
- Other load-bearing terms: bag, target counts, setup modifier, stand-in, seat,
  bag draw, night list, acts as, ghost vote, nomination, on the block, exile,
  starting/final character, alignment.

Getting mechanics right matters. Watch for:
- Execution threshold `ceil(living players / 2)`; a new block requires strictly
  beating the previous tally; an exact tie clears the block.
- Exile threshold `ceil(all players / 2)` (dead included) and ghost votes are **not**
  spent on exile.
- A ghost vote is a single vote spent when used.
- Seat order is mechanically significant (neighbour abilities like Empath).

## Review priorities

Focus on: correctness of game rules and state transitions; accidental loss or
non-serializability of the game document; anything that breaks offline use;
`schemaVersion` handling when the document shape changes; and vocabulary drift.
Prefer fewer, high-confidence comments over stylistic nits.
