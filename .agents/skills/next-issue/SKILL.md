---
name: next-issue
description: Pick up and deliver the next unblocked issue from the backlog, end to end — select, claim, implement test-first, verify, PR. Use when asked to work on, pick, or grab the next issue.
---

# Next Issue

Deliver one vertical slice from the backlog: select the frontier issue, claim it, build it test-first, demo it, and watch the PR until it lands. The backlog is this repo's GitHub issues; each is a tracer-bullet slice authored by `/to-issues`, carrying acceptance criteria and a `## Blocked by` section.

Before touching code, read `CONTEXT.md` (use its vocabulary in code, tests, and the PR) and `docs/adr/` — ADRs are binding.

## 1. Select — the frontier query

From open issues labeled `ready-for-agent`, drop any that:

- has an open blocker — its `## Blocked by` section references an issue that is still open;
- is assigned, labeled `claimed`, or referenced by an open PR.

Of the remainder, take the lowest-numbered issue whose title does not start with `[Stretch]`. Pick a `[Stretch]` issue only when no core issue remains — stretch always yields to core, regardless of number.

Done when exactly one issue is chosen, or the frontier is empty — then report why (all blocked, all claimed, or backlog empty) and stop.

## 2. Claim

Add the `claimed` label and comment that you're taking it, naming your session and branch. Then branch from up-to-date `main` as `claude/issue-<n>-<slug>` (a branch your session already designates overrides the name, never the base).

If you stop without finishing — any reason — undo the claim: remove the label and comment exactly what state you left behind. An abandoned claim blocks the frontier for every other agent.

## 3. Decide

Read the issue body and every comment; the acceptance criteria are the spec. Where the spec is ambiguous, decide storyteller-first: choose what plays best at a real table — glanceable in the dark, tap-sized, advisory never blocking (ADR 0003) — and record each decision for the PR description. Only when a decision would contradict an ADR or reshape the domain model, stop and hand it to the user, suggesting a `/grill-with-docs` session — those decisions belong to them.

## 4. Build — /tdd

Implement with the `/tdd` skill, one acceptance criterion at a time. Derive the seams from the acceptance criteria — each names an observable behavior — and record them in the PR rather than pausing to confirm them when no user is present. Typecheck and run the touched test file continuously; full suite once at the end.

## 5. Demo

Tests passing is not done. Done means build, lint, typecheck, and the full test suite are green, **and** you drove the running app end-to-end through the flow the issue describes. Check each acceptance criterion off on the issue only when something you actually ran backs it; leaving this step requires every criterion checked.

## 6. Ship and watch

Run `/code-review` against `main` with the issue as the spec; act on the findings. Push and open a PR against `main` with `Closes #<n>`, describing what you built, the decisions from step 3, and how you verified.

The slice isn't delivered while the PR is open: subscribe to PR activity if your harness supports it, fix CI failures, and answer review comments until the PR is merged or closed. Do not start a second issue in the same session unless asked.
