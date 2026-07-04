# BotC Grimoire — Copilot instructions

A storyteller-facing digital grimoire for running in-person Blood on the Clocktower
games. Client-only Next.js app.

**Source of truth:** read [`CONTEXT.md`](../CONTEXT.md) (domain vocabulary — use its
terms) and [`docs/adr/`](../docs/adr/) (binding architectural decisions) before
reviewing or suggesting code. Those files are authoritative; this file only says what
to prioritize.

## Invariants to flag (see `docs/adr/` for the full rationale)

- **Client-only, offline-first** ([ADR 0001](../docs/adr/0001-nextjs-client-only.md)):
  no runtime server dependency — no API calls, DB, network fetches, or SSR of game
  state. State is one serializable JSON **game document** with a `schemaVersion`.
- **Snapshot export, not an event log**
  ([ADR 0002](../docs/adr/0002-snapshot-export-not-event-log.md)): don't add
  event-sourcing / per-night history.
- **Advisory validation, never blocking**
  ([ADR 0003](../docs/adr/0003-advisory-validation.md)): setup/bag warnings are always
  overridable; "start game" is always available. Never make count validation a hard gate.
- **Vocabulary** (`CONTEXT.md`): flag drift — e.g. *script* not set/edition, *claim*
  vs. the three *demon bluffs*, *game document* not save file/session.

## Review priorities

Correctness of game rules and state transitions; integrity and serializability of the
game document (and `schemaVersion` handling when its shape changes); anything that
breaks offline use; vocabulary drift. Prefer fewer, high-confidence comments over
stylistic nits.
