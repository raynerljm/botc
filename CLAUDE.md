# BotC Grimoire

A storyteller-facing digital grimoire for in-person Blood on the Clocktower games. Client-only Next.js app — read `CONTEXT.md` (domain glossary; use its vocabulary) and `docs/adr/` (binding decisions: 0001 client-only/offline/single game document, 0002 snapshot export not event log, 0003 advisory never-blocking validation) before writing code.

## Picking the next issue ("work on the next issue")

The backlog lives in GitHub issues, each a vertical slice with a `## Blocked by` section in its body. To find the next issue:

1. List open issues labeled `ready-for-agent`.
2. Discard any whose `## Blocked by` section references an issue that is still open.
3. Discard any that is assigned, has a `claimed` label, or has an open PR referencing it.
4. Take the lowest-numbered issue that remains.

Before starting work, **claim it**: add the `claimed` label and comment that you're taking it (include your session/branch name). If you stop without finishing, remove the label and comment what state you left things in.

## Working an issue

- Branch from `main`; branch name `claude/issue-<n>-<slug>`.
- Implement every acceptance criterion in the issue body; check them off in the issue as you verify each.
- Verify for real before pushing: build, lint, typecheck, tests, and actually run the app end-to-end for the flow the issue describes.
- Push the branch and open a PR against `main` that references the issue (`Closes #<n>`), describing what you built and how you verified it.
- Do not start a second issue in the same session unless asked.
