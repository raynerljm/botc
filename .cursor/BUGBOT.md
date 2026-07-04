# BotC Grimoire — Bugbot review guidance

A storyteller-facing digital grimoire for running in-person Blood on the Clocktower
games. Client-only Next.js app.

**Source of truth:** [`CONTEXT.md`](../CONTEXT.md) (domain vocabulary) and
[`docs/adr/`](../docs/adr/) (binding architectural decisions) are authoritative — read
them before flagging. This file only says what to prioritize in a review.

## Invariants to flag as bugs (see `docs/adr/` for the full rationale)

- **Client-only, offline-first** ([ADR 0001](../docs/adr/0001-nextjs-client-only.md)):
  no runtime server dependency — flag API calls, DB access, network fetches, or SSR of
  game state. All game state is one serializable JSON **game document** with a
  `schemaVersion`; flag state kept outside it, non-serializable values inside it, or
  shape changes that ignore `schemaVersion`.
- **Snapshot export, not an event log**
  ([ADR 0002](../docs/adr/0002-snapshot-export-not-event-log.md)): flag event-sourcing
  or per-night event logs added to support a feature.
- **Advisory validation, never blocking**
  ([ADR 0003](../docs/adr/0003-advisory-validation.md)): flag any code that turns count
  validation into a hard gate. Legion, Riot, Atheist, and Summoner break the
  distribution table by design.
- **Vocabulary** (`CONTEXT.md`): flag drift — *script* not set/edition, *claim* vs. the
  three *demon bluffs*, *game document* not save file/session.

## Game-rule correctness — high-value bugs to catch

- Execution threshold `ceil(living players / 2)`; a new player goes on the block only by
  **strictly** beating the previous tally; an exact tie **clears** the block.
- Exile threshold `ceil(all players / 2)` (dead included); ghost votes are **not** spent
  on an exile. A ghost vote is a single vote, spent when used.
- Seat order is mechanically significant (neighbour abilities like Empath) — watch for
  off-by-one and wrap-around errors.

Prefer fewer, high-confidence findings; correctness and state integrity over nits.
