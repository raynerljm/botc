# BotC Grimoire — Bugbot review guidance

A storyteller-facing digital grimoire for running in-person Blood on the Clocktower
games. Client-only Next.js app. `CONTEXT.md` (domain glossary) and `docs/adr/`
(binding architectural decisions) are authoritative — read them before flagging.

## Architecture invariants — flag any violation as a bug

- **Client-only, offline-first** (ADR 0001): nothing may depend on a server at
  runtime. Flag API-route calls, database access, or network fetches in the game
  flow, and SSR/server components that render game state. Games run in venues with
  bad wifi; persistence is `localStorage`.
- **Single game document** (ADR 0001/0002): one game's entire state is a single
  serializable JSON object with a `schemaVersion`. Flag game state living outside it,
  non-serializable values inside it (functions, class instances, `Map`/`Set`,
  `Date` objects stored raw), and shape changes that ignore `schemaVersion`.
- **Snapshot export, not event log** (ADR 0002): export is one versioned snapshot.
  Flag any event-sourcing / night-by-night event log added to support a feature.
- **Advisory validation, never blocking** (ADR 0003): setup and bag warnings are
  always overridable; "start game" is always available. Flag any code that turns
  count validation into a hard gate. Legion, Riot, Atheist, and Summoner break the
  distribution table by design — code must tolerate deviation, not enforce the table.

## Game-rule correctness — high-value bugs to catch

- Execution threshold is `ceil(living players / 2)`. A new player goes "on the block"
  only by **strictly** beating the previous tally; an exact tie **clears** the block.
- Exile threshold is `ceil(all players / 2)` including the dead; ghost votes are
  **not** spent on an exile.
- A ghost vote is a single vote, spent when used and unavailable afterward.
- Seat order is mechanically significant (neighbour abilities like Empath); watch for
  off-by-one and wrap-around errors around the seating circle.
- Setup modifiers (e.g. Baron `[+2 Outsiders]`) adjust target counts before play;
  the stand-in (Drunk) is a Townsfolk token in the bag while the grimoire records the
  Drunk.

## Vocabulary

Flag drift from `CONTEXT.md`: prefer **script** (not set/edition), **claim** (reserve
**bluff** for the three demon bluffs), and **game document** (not save file/session).

## Style

Prefer fewer, high-confidence findings. Correctness, state integrity, and the
invariants above matter far more than stylistic nits.
