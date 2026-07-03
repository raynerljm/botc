# Next.js, used as a client-only app (for now)

We're building the grimoire on Next.js, but running it as a purely client-side app: all game state lives in localStorage, the app must work offline (in-person games happen in venues with bad wifi), and no API routes or database exist yet. We chose Next.js over a plain Vite SPA so that when persistence arrives (game history, player stats), endpoints can be fleshed out in-place without a migration. Until then, nothing may depend on a server at runtime.

## Consequences

- Game state must be a single serializable JSON document per game, with a `schemaVersion` field, so a finished game can be exported as a file today and bulk-imported into a database later.
- The app ships an "export game" feature well before any backend exists — exported files are the interim database.
- Features must not assume server-side rendering of game data; the grimoire renders entirely from client state.
