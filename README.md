# BotC Grimoire

A storyteller-facing digital grimoire for in-person Blood on the Clocktower
games. Client-only Next.js app: all state lives on the device, works offline
(see `docs/adr/0001-nextjs-client-only.md`).

## Develop

```sh
npm install
npm run dev        # local dev server
npm test           # Vitest
npm run lint
npm run typecheck
npm run build      # static export to out/
```

CI runs lint, typecheck, tests, and the build on every PR. Pushes to `main`
deploy the static export to GitHub Pages (enable Pages with source "GitHub
Actions" in repo settings).

## Character data

The official character dataset and token art are vendored; see
`docs/dataset.md` for sources and `npm run refresh-dataset` to update.

## Vocabulary and decisions

Domain vocabulary lives in `CONTEXT.md`; binding architecture decisions in
`docs/adr/`.

---

An unofficial fan project. Blood on the Clocktower is the intellectual
property of Steven Medway and The Pandemonium Institute.
