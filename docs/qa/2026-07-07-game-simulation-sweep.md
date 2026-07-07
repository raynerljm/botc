# BotC Grimoire — QA report (game-simulation sweep, 2026-07-07)

Target: `raynerljm/botc` static production build (HEAD `955d1ec`), served locally and driven via Playwright. All screenshot paths below are relative to the QA scratchpad (`qa/shots/...`). Severities are the adversarial verifier's re-grades, not the original session grades.

---

## 1. Methodology

Eleven browser sessions (one scout + ten scenario sessions) played real Blood on the Clocktower games end-to-end against the static export on persistent Chromium profiles — bag building, the pass-the-device bag draw, walkthrough, nights, days, executions, end game, export. The scout mapped the app surface and produced the playbook; the ten scenarios then covered:

- **tb-classic-7** — full 7-player Trouble Brewing game, 3 night/day cycles. Clean passes: execution threshold `ceil(living/2)` correct at 7, 5, and 3 living; night order exact vs the vendored official dataset (both first and other nights); ghost-vote spend/refund/advisory cycle all correct; day reset verified on days 2–3.
- **tb-baron-15** — 15-player TB with Baron. Clean passes: Baron `[+2 Outsiders]` retarget (9/2/3/1 → 7/4/3/1); **issue #76 regression pass** (Drunk tallies as exactly 1 Outsider); all four deliberately wrong bags warned with exact per-team deltas and never blocked (ADR 0003 respected); threshold 8 at 15 living, 7 at 14.
- **bmr-10** — Bad Moon Rising, 10 players, Godfather either/or setup modifier (±1 Outsider, clamp at 0 verified). Clean passes: first- and other-night lists **verified exact against the vendored dataset and the official sheets**, including Minion/Demon info present at ≥7 players; multi-death nights live-update skips; reminder anchor/move/undo round-trips.
- **snv-12** — 12-player Sects & Violets played to a declared Evil win over 6 nights/5 days. Clean passes: Snake Charmer demon swap and Pit-Hag transform recompute the night list live; Philosopher acts-as matrix (in-play, not-in-play, first-night-only targets) inserts at correct positions; claims regression **#75/#107 pass**; export validated field-by-field including alignment flips; state survived 4 browser restarts.
- **travellers-exile** — 8 players + 3 travellers. Clean passes: exile threshold `ceil(all players/2)` correct including dead players and a dead nominee; ghost-vote regression **#72 pass** (exile votes leave ghost votes free); traveller alignment radios and "(exile)" tagging match official rules.
- **teensy-6** — both Teensyville scripts. Clean passes: 5p targets 3/0/1/1 match the official table; Minion/Demon info correctly absent below 7 players; a complete 5-player game including a Lunatic/Lleech night-order check.
- **custom-scripts-share** — upload via paste and file, 8 garbage inputs, QR share on three surfaces. Clean passes: **#100 regression pass** (Escape, backdrop, no raw URL); share payload degradation ladder graceful ("may not scan reliably" advisory → "too large to encode" with working copy-link fallback); script-page payloads carry no player/game state.
- **export-import-persistence** — export audit vs the live game document at three points; reload at every distinct phase plus a full browser restart; **#67 reload-bounce regression pass**; home-panel and game-panel exports byte-identical; multi-game isolation byte-exact.
- **chaos-edge** — adversarial sweep: double-taps, back/forward, mid-ritual reloads, hostile player names (XSS probes inert), corrupted localStorage (all graceful, no white screens), garbage share URLs.
- **mobile-a11y** — full core loop at 390×844 and 844×390, including a keyboard-only day phase. Clean passes: zero unnamed controls anywhere; WCAG AA contrast on enabled controls (**#48 holds**); `aria-pressed/expanded/checked` semantics correct; **#58 and #69 responsive regressions hold**; every control specifically listed in #82 measures ≥44px.

Nine of ten sessions logged **zero console or page errors across every run** (the tenth logged none attributable to the app).

The sessions' 62 raw findings were deduplicated to **44 unique findings**, then each was independently re-reproduced by adversarial verifiers against the build and pinned to a root cause in source (file:line). Result: **43 confirmed, 1 refuted** — `export-drops-ghost-vote-spent`, which is working as designed under ADR 0002 (see §4). Verification re-graded seven findings downward (six major→minor, one minor→polish) and none upward; this report uses the verified severities throughout.

A twelfth **gap-filler session** then covered the coverage critic's top gaps — the `setup-modifiers-demo` bag-builder special flows (Huntsman→Damsel auto-add, Choirboy King requirement, Village Idiot extra copies, Legion relaxed validation), the Damsel `acknowledge` and Marionette `neighborCheck` walkthrough steps, and `_meta.firstNight/otherNight` night-order overrides — 71 scripted checks, zero console errors, each finding self-verified with two clean-profile reproductions. It added **3 confirmed findings** (2 minor, 1 polish), bringing the total to **46 confirmed**.

---

## 2. What's solid

Verified-correct behaviors worth knowing (all reproduced, not assumed):

- **Day-phase threshold math**: execution threshold `ceil(living/2)` correct at every tested count (3–15 living); exile threshold `ceil(all players/2)` correct including dead players; a strictly greater tally retakes the block; an exact tie clears it (the *forgotten* number-to-beat afterwards is finding T6, but the tie itself is right).
- **Night order vs the vendored dataset**: exact for TB and BMR first and other nights, SnV other nights, and both Teensyville scripts; dead players' entries auto-skip with a working Un-skip; the >=7-player rule for Minion/Demon info is honored.
- **Setup modifiers**: Baron and Godfather deltas retarget live; changing player count preserves selections; the Drunk counts as exactly one Outsider (#76 fixed and holding).
- **ADR 0003 discipline**: every illegal bag tested produced the advisory "Bag counts don't match the script" alertdialog with exact per-team deltas, and "Continue anyway" was always available — validation never blocks.
- **Ghost votes**: spend on execution vote, refund on uncheck, "already spent" advisory, never spent on exiles (#72).
- **Persistence**: the game document survived reload at every phase, multiple browser restarts, and multi-game alternation with byte-identical isolation; #67 does not reproduce.
- **Export accuracy** (apart from the Drunk marker, T19): starting/final character and alignment survive Snake Charmer swaps, Pit-Hag transforms, and a Baron→Imp change; exports from home and game panel are byte-identical.
- **Robustness**: XSS name probes inert, corrupted/truncated/future-schema localStorage handled gracefully, garbage share payloads degrade with clear messages.
- **A11y baseline**: no unnamed controls (the bag "!" badge carries `aria-label="setup modifier"`), AA contrast on enabled controls, keyboard-only nomination/vote/block flow completable.
- **Setup-modifier special flows** (gap-filler): Huntsman auto-adds the Damsel with an advisory when she's removed; Choirboy warns without a King (advisory, no auto-add, per design); Village Idiot extra-copies spinner clamps correctly, three distinct tokens deal to three players and produce three distinct correctly-ordered night entries; the Legion/Riot/Atheist/Summoner relaxed-validation banner works and never blocks; Damsel `acknowledge` and Marionette `neighborCheck` walkthrough steps behave per ADR 0003 (including wrap-around seat adjacency); the night-order override engine itself sorts correctly (Dusk/Dawn stay pinned even when an override reverses them).

---

## 3. Confirmed findings

43 findings, grouped by verified severity. "Ticket" refers to §6.

### Critical (3)

| ID | Impact | Root cause | Ticket |
|---|---|---|---|
| `mid-draw-reload-reveals-drawn-roles` | One pull-to-refresh (or back/forward) during the bag draw reveals every already-drawn seat's secret character, the Drunk note, and the remaining bag — and silently ends the draw | `src/components/GrimoireSetup.tsx:96` (unpersisted draw state; leak renders at :1080–1094) | T1 |
| `ingame-qr-share-leaks-bag-composition` | The in-game QR players scan shares the exact in-play character pool (the bag) instead of the script | `src/components/GrimoireSetup.tsx:1131` | T2 |
| `last-seat-hide-and-pass-reveals-grimoire` | The last seat's "Hide & pass" instantly renders the full grimoire — every seat's role — while that player still holds the device | `src/components/GrimoireSetup.tsx:562–568` | T3 |

### Major (10)

| ID | Impact | Root cause | Ticket |
|---|---|---|---|
| `choosing-stage-dropdowns-expose-remaining-bag` | During a live draw, "Assign seat N manually" selects list the remaining bag by name to the drawing player | `src/components/GrimoireSetup.tsx:1096–1114` (:700 excludes 'choosing' from `screenObscured`) | T4 |
| `walkthrough-hidden-attribute-defeated-by-css` | The setup walkthrough does not hide the board: `[hidden]` beaten by `.circleLayout{display:grid}`, all identities readable around/through the dialog | `src/components/GrimoireSetup.module.css:274` (re-declared :299) | T5 |
| `block-tie-number-to-beat-forgotten` | After a tie clears the block, a later **equal** tally wrongly takes it — could execute the wrong player | `src/lib/dayPhase.ts:49–53` | T6 |
| `midday-death-rewrites-nomination-thresholds` | Marking a player dead mid-day recomputes earlier nominations ("3/4 votes" becomes "3/3 — meets threshold") and can silently move the block | `src/lib/dayPhase.ts:18–24` | T6 |
| `exile-competes-with-execution-block` | A successful exile takes the block, blocks a legitimate execution, and an equal execution tally clears the block entirely | `src/lib/dayPhase.ts:36–57` (no `isTraveller` exclusion) | T7 |
| `first-night-fixed-info-steps-pinned-before-characters` | Minion/Demon info pinned before all characters — Philosopher, Thief, Bureaucrat (and Kazali, Alchemist, Poppy Grower, Snitch, Lunatic, Boffin) sort too late; bluffs shown before the Philosopher chooses | `src/lib/nightList.ts:212–216` (bucket sort :303–308) | T8 |
| `custom-scripts-cannot-run-game` | Uploaded scripts are view/share-only: no "Build the bag" link, `/scripts/custom/bag/` is 404 | `src/app/scripts/custom/page.tsx:22–36` | T9 |
| `reminder-chips-cover-seat-ui-and-intercept-taps` | Auto-anchored reminder chips paint over the token and intercept every tap; chips cover ghost-vote pills and neighbours' labels | `src/lib/gameDocument.ts:318` + `src/components/GrimoireBoard.module.css:50` | T10 |
| `token-menu-renders-under-neighbors-and-panels` | An open seat menu paints beneath adjacent tokens and the sticky Day/Night panels — "Mark dead" unreachable, taps land on the wrong player | `src/components/GrimoireBoard.module.css:44, 203` + sticky panels | T10 |
| `undersized-bag-unrecoverable-dead-end` | Continuing past the mismatch warning with fewer tokens than seats yields "Player N, tap a token to draw" over an empty bag — setup can never complete, no in-page recovery | `src/components/GrimoireSetup.tsx:571–581` | T11 |

### Minor (23)

| ID | Impact | Root cause | Ticket |
|---|---|---|---|
| `double-tap-start-draw-commits-seat1-token` | Double-tap on "Start bag draw" draws seat 1's token in the storyteller's hands, no unassign | `src/components/GrimoireSetup.tsx:731–755` | T4 |
| `leftover-bag-token-never-surfaced` | With more tokens than seats, the undrawn leftover is never shown to the storyteller | `src/components/GrimoireSetup.tsx:921` | T11 |
| `bag-builder-state-lost-on-reload-or-back` | All in-progress bag selections wiped by reload or browser-back (which also enables the empty-bag dead end) | `src/components/BagBuilder.tsx:144` (only write at :344) | T11 |
| `exile-call-counted-as-nomination` | A pure exile call marks both caller and traveller "(already nominated)" — wrong advisory on both sides | `src/lib/dayPhase.ts:91–103` | T7 |
| `vote-threshold-layout-shift-loses-votes` | The threshold-crossing vote inserts a status line that shifts every checkbox 49px — fixed-pace tapping recorded 3/7 votes | `src/components/DayPhase.tsx:108–112` | T18 |
| `winner-confirm-double-tap-self-cancels` | Double-tap on "Good wins"/"Evil wins" flashes and cancels its own confirmation dialog (~100ms) | `src/components/ConfirmDialog.tsx:55–57` + `EndGamePanel.tsx:85,93` | T18 |
| `traveller-cannot-be-added-midgame` | Once the traveller bag is empty (or built at 0), no traveller can ever join — contradicts official rules | `src/components/GrimoireSetup.tsx:806` (+ :437–478, `characters.ts:111–116`) | T12 |
| `teensyville-no-player-cap-or-advisory` | Teensyville scripts offer 5–15 players; at 10+ the 11-character pool can't meet targets and nothing names the cause | `src/lib/bagBuilder.ts:3–4` + `BagBuilder.tsx:405–406` | T13 |
| `teensyville-label-lost-past-home` | "Teensyville" appears only on home cards — absent from script-detail and bag-builder pages | badge only in `src/app/page.tsx:55–57` | T13 |
| `empty-scripts-saved-as-untitled` | `[]` and `[{"id":"_meta"}]` save silently as indistinguishable "Untitled script" rows | `src/lib/scriptParser.ts:200–268` + `AddScriptDialog.tsx:50–58` | T14 |
| `script-upload-error-overflows-layout` | 200-char-id error renders as one unwrapped 1721px line, clipped and unreachable | `AddScriptDialog.module.css:44–49` + `scriptParser.ts:67` | T14 |
| `custom-script-remove-no-confirm-or-undo` | "Remove" deletes a custom script on one tap — the app's only unconfirmed destructive action | `src/components/CustomScriptsSection.tsx:43` | T14 |
| `share-receive-page-dead-end` | Received /share page has zero save/import controls and zero navigation | `src/app/share/page.tsx` | T14 |
| `overlays-lack-modal-dismiss-behavior` | Show-to-Demon, ReminderPicker, Info tokens, Setup walkthrough skip `useDialogDismiss`: no Escape, no focus trap, background stays interactive | four components; none call `src/components/useDialogDismiss.ts` | T15 |
| `reveal-dialog-aria-modal-no-focus-trap` | Reveal dialog claims `aria-modal=true` but neither moves nor traps focus; Tab reaches buttons behind the privacy overlay | `src/components/GrimoireSetup.tsx:759–764` (deliberate reachability :701–704) | T15 |
| `unthemed-native-light-form-controls` | `color-scheme` never set: light-mode native selects/inputs across bluffs, day phase, token menu; bluff selects overflow their 6rem slots; disabled buttons ~invisible | `src/app/globals.css` + unclassed controls (DemonBluffsPanel, DayPhase, GrimoireBoard) | T16 |
| `live-game-touch-targets-below-44px` | Sibling live-game controls at 19–36px (nomination selects 19px) despite the repo's 44px decision | bare unstyled `<select>`s and buttons across the same components | T16 |
| `build-bag-cta-clipped-phone-width` | "Build the bag" CTA clipped to "Build" at 390px, 103px off-screen and unscrollable | `src/app/scripts/[scriptId]/page.module.css:7–12, 30–38` | T17 |
| `token-menu-not-viewport-clamped` | Open token menu clips off-screen left/right and extends below the fold on phones | `src/components/GrimoireBoard.module.css:203–219` | T17 |
| `setup-seat-selects-overflow-cards` | Seat-assignment selects overflow their cards and clip at the viewport edge at 390px | `src/components/GrimoireSetup.module.css:259–267` | T17 |
| `long-player-name-overflows-board` | A 200-char unbroken name renders as one line across the whole board | `src/components/GrimoireBoard.module.css:183` | T20 |
| `export-erases-drunk-identity` | The Drunk exports as their stand-in Townsfolk — `isDrunk` dropped, "drunk" appears nowhere in the snapshot | `src/lib/gameExport.ts:64–81` (SnapshotPlayer :17–26) | T19 |
| `actsas-retarget-inherits-checked-state` | Re-targeting "Acts as" mid-night carries the old entry's checkmark — "done" for a wake never performed | `src/lib/nightList.ts:261` + `GrimoireSetup.tsx:511–518` | T21 |
| `huntsman-deselect-removes-manual-damsel` | Deselecting Huntsman silently removes a Damsel the storyteller picked manually before selecting Huntsman | `src/components/BagBuilder.tsx:246–250` (no auto-add provenance, :50–59) | T22 |
| `marionette-freeform-disables-count-validation` | Marionette's `[You neighbor the Demon]` bracket relaxes ALL count validation on pies-baking — the advisory safety layer disappears for the script's signature minion | `src/lib/bagBuilder.ts:129` (freeform fallthrough) + `BagBuilder.tsx:105–110` | T23 |

### Polish (7)

| ID | Impact | Root cause | Ticket |
|---|---|---|---|
| `in-play-bluff-no-advisory` | "Show all characters" lets an in-play character be set as a Demon bluff with zero advisory cue | `src/components/DemonBluffsPanel.tsx:36, 101–107` | T21 |
| `dead-players-checked-night-entry-inconsistent` | Entry checked earlier the same night keeps its checkmark after death but vanishes from the "N/M done" count | `src/components/NightList.tsx:82–83` vs `:133` | T21 |
| `drunk-note-title-cased` | Board token note renders "(Actually The Drunk)" — `text-transform: capitalize` collateral | `src/components/GrimoireBoard.module.css:191` | T20 |
| `blank-player-names-accepted` | Empty/whitespace names stored verbatim: blank dropdown options, "Butler — " dangling labels | `src/components/GrimoireSetup.tsx:199` | T20 |
| `export-filename-date-utc-vs-sgt` | Export filename date can be a day behind the SGT date the app displays | `src/lib/gameExport.ts:115` | T19 |
| `home-player-count-excludes-travellers` | Games list says "8 players" for a 9-player (8+1 traveller) game | `src/components/GamesList.tsx:89` | T19 |
| `hide-and-pass-clipped-landscape` | "Hide & pass" bottom-clipped in landscape when ability text wraps to two lines | `src/components/GrimoireSetup.module.css:157–169` | T17 |
| `meta-night-order-overrides-unreachable` | `_meta.firstNight/otherNight` overrides parse and the night-list engine honors them correctly, but no user-reachable path ever uses them — uploaded overrides are silently dead data | `src/app/scripts/custom/page.tsx` (no bag route) + `bag/page.tsx:45–46` (meta wired for base/library only) | T9 |

(Tier counts: 3 critical, 10 major, 25 minor, 8 polish = 46 confirmed.)

---

## 4. Refuted / working as designed

- **`export-drops-ghost-vote-spent`** — the live game document tracks `ghostVoteSpent` per dead player but the export omits it. Refuted as a defect: ADR 0002 enumerates the snapshot contract (players with starting/final character and alignment, deaths, bluffs, winner, timestamps, notes) and deliberately excludes play-by-play voting detail; ghost-vote spend contributes to no win-rate stat. If wanted, it is a feature request, not a bug.

---

## 5. Coverage gaps (future QA)

From the coverage critic, condensed. Items 1–3 were subsequently closed by the gap-filler session (71 checks, 0 console errors, `qa/shots/gapfill/`) — results folded into §2, §3, and tickets T9/T22/T23. The rest are open.

1. ~~**`setup-modifiers-demo.json` bag-builder special flows**~~ — **covered by gap-filler**: Huntsman/Damsel auto-add (1 finding, T22), Choirboy King requirement (clean), Village Idiot extra copies incl. a full 3-copy game (clean), Legion relaxed validation + Randomize (clean); Marionette's freeform bracket over-relaxes validation (1 finding, T23).
2. ~~**Walkthrough step kinds `acknowledge` (Damsel) and `neighborCheck` (Marionette)**~~ — **covered by gap-filler**: both behave correctly and advisorily, including wrap-around seat adjacency. (Lunatic `believedDemon` step remains uncovered — neither target script ships a Lunatic.)
3. ~~**`_meta.firstNight/otherNight` night-order overrides**~~ — **covered by gap-filler**: the engine honors overrides correctly (verified by injection; Dusk/Dawn pinning holds), but no user-reachable path uses them — folded into T9.
4. **Info-token attach → full-screen Show mode** — a privacy-critical pass-the-device surface with zero fleet coverage (scout only).
5. **Token dragging, the 6px drag-vs-click threshold, Re-circle, Hide/Show grimoire** — core physical-grimoire interactions, untouched.
6. **Mid-game roster mutations** — actually submitting "Add character", removing a core player, and "Move seat earlier/later", plus their night-list/threshold recomputes.
7. **"Reveal Drunk" button** — three sessions had a Drunk; none clicked it.
8. **Two-tab cross-tab sync** — the `storage` listeners in `gameStorage.ts`/`customScripts.ts` are unit-tested only; concurrent tabs are a plausible state-clobbering source.
9. **Valid legacy `botc:game` migration** — only the garbage-key path was tested.
10. **Draw ritual off-TB and with travellers in the bag** — the pass-the-device ritual only ever ran on Trouble Brewing.
11. **Untouched library scripts** — `everyone-can-play`, `pies-baking`, `ride-the-cyclone` (the latter ships a Fabled and experimental characters; target math unverified).
12. **Residuals** — walkthrough per-step Skip/Redo, walkthrough at 15 players, partial demon-bluff export, acts-as set during night 1, homebrew-game export, 768–1200px tablet band, export download on mobile.
13. **Fabled row UI** — unreachable through the UI by design until issue #50 lands; flagged as blocked, not omitted.

---

## 6. Proposed tickets

23 tickets covering all 46 confirmed findings, grouped by root cause. Criticals first, then majors, then quick-win batches. Open stretch issues #23/#24/#27 are not duplicated by anything below.

---

### T1: Persist the draw session so a mid-draw reload can't reveal drawn roles

- **Severity/labels**: `bug`, `severity: critical`, `area: draw-ritual`, `privacy`

**Body:**

### What happens
During the pass-the-device bag draw, drawn assignments are persisted to localStorage on every token choice, but the draw session itself (the privacy guard) is React-only state. After seats 1–2 drew and the screen read **"Card hidden. Pass the device to Player 3."**, a single reload rendered both seats' characters openly — token art, character name, the "(actually the Drunk)" note — listed the remaining bag (Baron/Butler/Fortune Teller/Imp/Chef) in every manual-assign dropdown, and silently ended the draw ("Start bag draw" reappeared). Reload mid-reveal and browser Back-then-Forward reproduce the same leak. On a phone this is one pull-to-refresh by whichever player holds the device.

### Repro
1. Build any bag, "Start bag draw", have 2–3 seats tap a token, pick a name, "Hide & pass".
2. At the "Card hidden. Pass the device to Player N." screen (or mid-reveal), reload the page.
3. The seat-assignment grid renders every assigned seat's character openly; the draw is gone.

### Expected
The draw session (or at minimum its privacy guard) is restored on remount — already-drawn identities stay behind the "Assigned" mask until the ritual finishes. A reload mid-ritual must never reveal them (CONTEXT.md "Bag draw": each player privately reveals, hides, and passes on).

### Root cause
`src/components/GrimoireSetup.tsx:96` — the draw session is unpersisted `useState`; after remount `draw` is `null` and the `character && !draw` branch renders identities at `GrimoireSetup.tsx:1080–1094`. The "Assigned" mask is conditional only on the in-memory draw object (`:1072–1079`).

### Evidence
`qa/shots/tb-baron-15/26-middraw-reload-leak.png`, `qa/shots/export-import-persistence/04-mid-draw-after-reload.png`, `qa/shots/chaos-edge/t3-reload-mid-reveal.png`, `qa/shots/chaos-edge/t4-forward-after-back.png`, verifier proof `qa/shots/verify0/f1-after-reload-leak.png`, `qa/shots/verify0/f1b-midreveal-reload.png`

### Findings covered
`mid-draw-reload-reveals-drawn-roles`

### Related
Issues #12/#53 (pass-the-device ritual intent). Not excused by ADR 0003 — this is a privacy failure, not advisory validation.

---

### T2: Share the script, not the bag — in-game "Share via QR" leaks the in-play character pool

- **Severity/labels**: `bug`, `severity: critical`, `area: sharing`, `privacy`

**Body:**

### What happens
The in-game "Share via QR" — the surface players scan at the table — encodes `_meta` plus the **bag pool**: the receiving page renders only the in-play characters (5 of 15 on the sample homebrew; 5 of 22+5 on TB). Any player scanning it learns the exact in-play set — which Demon, which Minion, that no other Townsfolk are in play. In a Drunk game the pool contains both the Drunk and its stand-in.

### Repro
1. Open a script with more characters than seats, build a 5-character bag for 5 players, complete seating.
2. On `/game/`, click "Share via QR" → Copy link → open the URL in another browser.
3. The shared sheet shows only the 5 in-play characters; the script-page share of the same script shows all of them.

### Expected
The player-facing share shows the script — the public reference document (PR #100 describes it as "the exact same" script sheet). Bag composition is the storyteller's core secret; PR #36's commit body states the share encodes "only script data … never game/player state".

### Root cause
`src/components/GrimoireSetup.tsx:1131` passes `characters={game.characterPool}` (the bag, built from selected characters + Drunk stand-in at `gameDocument.ts:523–530`). The correct field, `game.scriptCharacters`, is captured at `src/lib/gameDocument.ts:158–163` explicitly for this consumer.

### Evidence
`qa/shots/custom-scripts-share/25-ingame-share-leak.png`; verifier pair `qa/shots/verify2/04-recv-ingame-share.png` vs `qa/shots/verify2/03-recv-script-share.png`; decoded payload via `qa/css-8-decode.mjs`

### Findings covered
`ingame-qr-share-leaks-bag-composition`

### Related
PR #36 (share scope), #100 (QR share dialog).

---

### T3: Keep the screen obscured after the last seat's "Hide & pass"

- **Severity/labels**: `bug`, `severity: critical`, `area: draw-ritual`, `privacy`

**Body:**

### What happens
On the final seat of the bag draw, tapping **"Hide & pass"** ends the draw session immediately: the full grimoire board renders ~150ms later while the device is still in the last player's hands — every seat's character and player name (at 390×844, 5–6 tokens in-viewport, the rest one scroll away). The button promises a hand-off and instead dumps every secret role into one player's lap.

### Repro
1. Run the pass-the-device draw for all seats (e.g. 7–8 player TB at 390×844).
2. On the last seat, pick a name and tap "Hide & pass".
3. The privacy guard vanishes and the full board renders.

### Expected
The screen stays obscured — e.g. a "hand the device back to the storyteller" screen — until the storyteller takes over, exactly like every previous seat's hand-off (CONTEXT.md "Bag draw": each player may only ever see their own token).

### Root cause
`src/components/GrimoireSetup.tsx:562–568` — `hideAndPass()` calls `setDraw(null)` when `nextUnassignedSeat` is undefined, and `setupComplete` flips true mid-reveal, mounting the board instantly. The code comment shows this is deliberate ("the last seat's reveal simply ends the session once hidden") but it contradicts the ritual's privacy contract.

### Evidence
`qa/shots/mobile-a11y/18-after-last-hide-and-pass.png`; verifier proof `qa/shots/verify1/f1-after-last-hide-and-pass.png`

### Findings covered
`last-seat-hide-and-pass-reveals-grimoire`

### Related
CONTEXT.md "Bag draw"; same hardening family as T1/T4 (crossref: keep criticals separate).

---

### T4: Lock down the live choosing screen — manual-assign selects expose the remaining bag, and a double-tap on "Start bag draw" draws seat 1's token

- **Severity/labels**: `bug`, `severity: major`, `area: draw-ritual`, `privacy`

**Body:**

### What happens
Two holes in the same stage of the ritual:
1. While **"Alex, tap a token to draw"** is on screen (device in that player's hands), every "Assign seat N manually" select is rendered and interactive, each listing the exact remaining bag by character name (Baron, Butler, Empath, Fortune Teller, Imp, Washerwoman, Chef) — the options are even present in the page's innerText. One tap tells the drawing player which Minion/Demon are still undrawn; the last drawer can read their own character before revealing. Seat-name inputs and the Game panel also stay live.
2. A double-tap on **"Start bag draw"** lands the second click on the face-down token grid that replaces the button in place: seat 1's token is drawn and revealed in the storyteller's hands (reveal dialog, assigned=1/bag=6), with no unassign flow. ("Hide & pass" and "Ready to draw" double-taps are safe.)

### Repro
1. Start a bag draw; after 1–2 seats have drawn, at the "Player N, tap a token to draw" screen, tap any "Assign seat N manually" dropdown below the token row.
2. Separately: build a 7-player bag, Continue to seating, double-click "Start bag draw" at one spot.

### Expected
While a draw session is active, no on-screen control reveals bag composition — a physical bag is opaque, and the app already masks assigned seats as "Assigned" in this exact state. The first click starts the draw; a second click at the same spot is ignored (debounce/pointer guard), leaving seat 1's choose-your-own-token ritual intact.

### Root cause
`src/components/GrimoireSetup.tsx:1096–1114` renders `game.bag` into the selects with no draw-stage guard; `screenObscured` deliberately treats 'choosing' as safe (`:700`). Double-tap: `GrimoireSetup.tsx:731–755` — the token grid mounts under the button's coordinates with no guard.

### Evidence
`qa/shots/tb-classic-7/03-choosing-stage-seat3.png`, `qa/shots/tb-baron-15/27-choosing-stage-dropdowns.png`, `qa/shots/mobile-a11y/14-choosing-seat2.png`, `qa/shots/verify0/f2-choosing-dropdowns-closed.png`; `qa/shots/chaos-edge/t2-startdraw-dblclick.png`

### Findings covered
`choosing-stage-dropdowns-expose-remaining-bag`, `double-tap-start-draw-commits-seat1-token`

### Related
App's own masking intent at `GrimoireSetup.tsx:1072–1079`; crossref draw-ritual hardening cluster (T1/T3 kept separate as criticals).

---

### T5: Restore `[hidden]` so the setup walkthrough actually hides the grimoire

- **Severity/labels**: `bug`, `severity: major`, `area: walkthrough`, `privacy`, `css`

**Body:**

### What happens
`GrimoireSetup` sets `hidden={showWalkthrough || screenObscured}` on the circle layout precisely so identities never show under an overlay — but the CSS-module rule `.circleLayout { display: grid }` overrides the UA's `[hidden] { display: none }`. With the walkthrough open, all tokens, the Night list, and the Day panel stay visible, and identities — "Chef / Grace / (Actually The Drunk)", "Washerwoman / Frankie", "Imp / Elliot" — are readable through the `rgb(0 0 0 / 60%)` translucent backdrop. (Verifier note: token art does *not* stack over the dialog's own controls — the panel itself is opaque; the leak is around/through the backdrop.) The same defeated-`[hidden]` pattern is latent for `screenObscured`, currently masked only by the opaque reveal overlay.

### Repro
1. Complete any bag draw and open the Setup walkthrough.
2. Look around/through the dialog: every token's character and player name is readable.

### Expected
The board is invisible while the walkthrough is open — the code comment at `GrimoireSetup.tsx:957–967` documents exactly this intent (visually and in the a11y tree).

### Root cause
`src/components/GrimoireSetup.module.css:274` (`.circleLayout { display: grid }`, re-declared at `:299` for ≥768px) overrides `[hidden]` on the div at `GrimoireSetup.tsx:970`. No `[hidden]` reset exists anywhere in the app's CSS. (A second `hidden=` on a classless div at `:1021` works correctly.)

### Evidence
`qa/shots/tb-classic-7/06-walkthrough-open.png`, `qa/shots/chaos-edge/t6-walkthrough-backdrop.png`, `qa/shots/mobile-a11y/15-walkthrough-open-portrait.png`, verifier `qa/shots/verify4/02-walkthrough-open-fullpage.png`

### Findings covered
`walkthrough-hidden-attribute-defeated-by-css`

### Related
#57 (walkthrough modal restyle — the privacy hole is new). Suggested fix: a global `[hidden] { display: none !important }` reset.

---

### T6: Remember the number to beat and snapshot vote-time thresholds in the day-phase block math

- **Severity/labels**: `bug`, `severity: major`, `area: day-phase`, `rules`

**Body:**

### What happens
Two rule-math defects in the same 40 lines of `computeBlock`/`nominationThreshold`; both can point the storyteller at the wrong execution:
1. **Ties forget the number to beat.** 7 living (threshold 4): Casey→Dana with 4 votes → "On the block: Dana" (correct); Dana→Frankie with exactly 4 → block clears (correct tie); Elliot→Gray with exactly 4 → **"On the block: Gray"** (wrong — 4 does not beat 4; a fifth vote would).
2. **Mid-day deaths rewrite history.** A nomination that failed at "3/4 votes" re-renders as **"3/3 votes — meets threshold"** after the block-holder is executed and marked dead while day 1 is still open. Because `computeBlock` re-folds with the new thresholds, a mid-day death can silently change which player holds the block.

### Repro
1. 7 living, day 1: record three nominations at exactly 4 votes each; watch the third take the block after the tie cleared it.
2. Record a 3-vote nomination (fails at 3/4), then Mark the block-holder dead via the token menu with day 1 still on screen; every tally line re-renders against threshold 3.

### Expected
Official Nominations & Voting rules: a nominee is about to die only with at least `ceil(living/2)` votes **and strictly more votes than any other nominee today**; after a 4–4 tie the number to beat is still 4. A nomination's threshold is a property of the vote as it happened — a later death must not re-qualify it or move the block.

### Root cause
`src/lib/dayPhase.ts:49–53` (tie sets `block = null` and discards the tied tally; the next threshold-meeting nomination enters the `block === null` branch) and `src/lib/dayPhase.ts:18–24` (`nominationThreshold` always evaluates against current players; `Nomination` stores no vote-time snapshot; rendered per-nomination at `DayPhase.tsx:160`). Fix shape: store the living count/threshold on each nomination when recorded, and carry the high-water tally through the fold.

### Evidence
`qa/shots/tb-classic-7/12-day1-4-after-tie.png`, `qa/shots/tb-classic-7/13-day1-after-execution.png`; verifier `qa/shots/verify3/f1-block-after-tie-then-equal.png`, `qa/shots/verify3/f2-before-death.png` / `f2-after-death.png`

### Findings covered
`block-tie-number-to-beat-forgotten`, `midday-death-rewrites-nomination-thresholds`

### Related
CONTEXT.md "On the block"; `dayPhase.test.ts` covers a single tie but never a post-tie equal tally (oversight, not design).

---

### T7: Separate exiles from executions — exile tallies corrupt the block and consume nomination rights

- **Severity/labels**: `bug`, `severity: major`, `area: day-phase`, `travellers`, `rules`

**Body:**

### What happens
One model fix, two symptoms — the day-phase fold treats exile calls as nominations:
1. **Exiles occupy and corrupt the block.** 8 players + 1 traveller: an exile call at 5/5 (all-players threshold) shows **"On the block: Tessa"**; a later legitimate execution at 4/4 (execution threshold met) cannot take the block (4 < 5); adding a 5th vote (5 = 5) **clears the block entirely** — the app tells the storyteller nobody dies today despite a legal 5-vote execution.
2. **Exile calls consume nomination rights.** After a single pure exile call, the Nominator select reads **"Alex (already nominated)"** and the Nominee select **"Tessa (already nominated)"** — a storyteller trusting the advisory would wrongly refuse Alex's real nomination and believe the traveller can't be called again.

### Repro
1. TB, 8 players + 1 traveller. Day 1: record Alex→traveller (shows "(exile)"), check 5 voters → "On the block: Tessa".
2. Record execution Dana→Harper with 4 votes → block still shows the traveller; add a 5th vote → the "On the block" line disappears.
3. Reopen the Nominator/Nominee selects after step 1 and read the suffixes.

### Expected
Official wiki "Exile": an exile resolves immediately at ≥ half of **all** players, is not an execution, never competes with the block, and **"calling for an exile does not count as a nomination"** — exiles are unlimited per day. Harper's 4/4 should take the block and his 5th vote should keep him there. Per ADR 0003 an incorrect advisory is itself a defect.

### Root cause
`src/lib/dayPhase.ts:36–57` — `computeBlock` has no `nominee.isTraveller` exclusion, so exile tallies (at exile thresholds) flow through the execution fold. `src/lib/dayPhase.ts:91–103` — `hasNominatedToday`/`wasNominatedToday` count every nomination including traveller/exile ones (rendered at `DayPhase.tsx:125–127, 142–144`).

### Evidence
`qa/shots/travellers-exile/s2-04-day1-block-after-exile.png`, `qa/shots/travellers-exile/s3-03-day2-execution-4of4.png`, `qa/shots/travellers-exile/s3-04-day2-tie-with-exile.png`; verifier `qa/shots/verify3/f3-tie-with-exile-clears-block.png`

### Findings covered
`exile-competes-with-execution-block`, `exile-call-counted-as-nomination`

### Related
CONTEXT.md "Exile" / "On the block"; ADR 0003.

---

### T8: Order first-night Minion/Demon info by official position instead of pinning them before all characters

- **Severity/labels**: `bug`, `severity: major`, `area: night-list`, `rules`

**Body:**

### What happens
`computeNightList` pins "Minion info" and "Demon info" in fixed buckets ahead of **every** character entry, so any character with an official first-night position before the info steps sorts too late. SnV with a Philosopher renders **Dusk, Minion info, Demon info, Philosopher, Witch, Clockmaker…** — the official sheet is Dusk, *Philosopher*, Minion info, Demon info, … A TB game with Thief/Bureaucrat travellers renders them after Demon info too. A storyteller following the list shows the Demon its bluffs **before the Philosopher chooses an ability**, changing which bluffs are legal. Also affected on other scripts: Alchemist, Poppy Grower, Kazali, Snitch, Lunatic, Boffin (Snitch/Lunatic officially sit *between* the two info steps). Other nights order correctly.

### Repro
1. Start the first night of an SnV game with a Philosopher in play (or TB with Bureaucrat/Thief added).
2. Read the list order vs the official first-night sheet.

### Expected
The vendored dataset already encodes the answer: on its scale Minion info ≈ 5 and Demon info ≈ 8; thief/bureaucrat/boffin = 1, philosopher/kazali = 2, alchemist = 3, poppygrower = 4 are pre-info; snitch = 6, lunatic = 7 sit between the info steps; poisoner = 17 is post-info. Give the info steps numeric positions on that scale rather than buckets.

### Root cause
`src/lib/nightList.ts:212–216` — fixed buckets 0/1/2 for Dusk/Minion info/Demon info vs `defaultBucket 3` for every acting character, applied by the bucket-first sort at `nightList.ts:303–308`.

### Evidence
`qa/shots/snv12/06-first-night.png`, `qa/shots/travellers-exile/s2-01-night1-list.png`; verifier `f1-snv-first-night-order.png` (verify batch); `src/data/characters.json`

### Findings covered
`first-night-fixed-info-steps-pinned-before-characters`

### Related
Official TB/SnV first-night sheets; vendored dataset `firstNight` numbers.

---

### T9: Let uploaded custom scripts build a bag and run a game

- **Severity/labels**: `bug`, `severity: major`, `area: custom-scripts`

**Body:**

### What happens
A script uploaded at runtime lands on `/scripts/custom/?id=<uuid>` whose header has only "← Scripts" and "Share via QR" — no "Build the bag →" link, and no `/scripts/custom/bag/` route exists in the static export (404, while `/scripts/tb/bag/` is 200). A storyteller at the table cannot run the script they just uploaded; the only workaround is committing the JSON to the repo and rebuilding, which is unavailable mid-session.

### Repro
1. Home → "Add a script" → paste `script-library/catfishing.json` → Add script.
2. On the custom script page, look for any way to start a game; compare with the library page for the same script (exactly one "Build the bag →" link).

### Expected
Custom scripts behave like library scripts. Closed issue #10 promised "the result behaves exactly like a base edition … bag building, night list, and reminders"; the bag-builder slice (#11) has since shipped for library scripts, and no open issue tracks this gap.

### Root cause
`src/app/scripts/custom/page.tsx:22–36` — header renders only back-link + `ShareScriptButton`; no bag link and no `src/app/scripts/custom/bag/` route. Note when fixing: `src/app/scripts/[scriptId]/bag/page.tsx:45–46` wires `_meta.firstNight/otherNight` into new games for base/library scripts only — the custom-script bag route must do the same, because the night-list override engine (`nightList.ts:116–129, 157–194, 288–310`) is already implemented and verified correct (gap-filler injection test: overrides reorder entries, grant night-1 entries to override-named characters, and keep Dusk/Dawn pinned) but is currently unreachable from any user path, so uploaded overrides are silently dead data.

### Evidence
`qa/shots/custom-scripts-share/02-catfishing-custom.png` vs `qa/shots/custom-scripts-share/14-share-catfishing.png`; verifier pair `f1-custom-catfishing-no-bag.png` / `f1-library-catfishing-has-bag.png`; gap-filler `qa/shots/gapfill/no-b1-custom-page.png`, `no-c1-override-night1.png`, `no-c2-override-night2.png`

### Findings covered
`custom-scripts-cannot-run-game`, `meta-night-order-overrides-unreachable`

### Related
Closed #10 (acceptance criteria), #11 (bag builder). Distinct from stretch issue #23 (URL fetch) — this is about scripts already uploaded.

---

### T10: Fix board stacking so reminder chips and open token menus never block seat interactions

- **Severity/labels**: `bug`, `severity: major`, `area: board`, `css`

**Body:**

### What happens
Two stacking-context defects on the grimoire board, both blocking core in-play actions:
1. **Reminder chips intercept the seat.** For bottom-of-circle seats the auto-anchor offset clamps onto the token, and the chip wrapper paints on top of the token summary and intercepts every pointer event — Playwright failed 60+ retries ("subtree intercepts pointer events"); a real tap opens the **chip** menu instead of the seat menu, so the storyteller can't reach Mark dead/rename/swap. Chips also fully cover dead seats' "Ghost vote" pills and neighbouring token labels (worst at compressed landscape sizes). The only workaround — dragging the chip away — is undiscoverable, and the chip was auto-placed there.
2. **Open token menus paint underneath.** At 1280×1000, an open seat menu renders beneath adjacent tokens and the sticky Day/Night panels: `elementFromPoint` at "Mark dead" returns the neighbour's summary or `SECTION[Day phase]`, and a real tap toggles the **wrong player's** token. This blocked marking a Po victim dead during actual night play.

### Repro
1. BMR 10p: add an anchored reminder (e.g. Sailor "Drunk") to a bottom-of-circle seat; tap the seat's token summary — the chip menu opens instead. Inspect a dead seat with a chip: the "Ghost vote" pill is unreachable.
2. 10p at 1280×1000: open a seat menu that extends toward a neighbour or the Day panel; try to click "Mark dead".

### Expected
An anchored chip sits beside the token, never over it; an open seat menu stacks above all neighbouring tokens and panels.

### Root cause
Chips: `src/lib/gameDocument.ts:318` (`ANCHOR_OFFSET_Y = 12` clamped by `clampPct` at `:232` to y ≤ 96 parks the chip on the token) + `src/components/GrimoireBoard.module.css:50` (`.reminderWrap z-index: 1` paints above z-auto `.tokenWrap`; the ghost pill's `z-index: 6` at `:287` is trapped inside `.tokenWrap`'s transform stacking context). Menus: `GrimoireBoard.module.css:44` (`.tokenWrap transform: translate(-50%,-50%)` creates a stacking context trapping `.menuBody`'s `z-index: 5` at `:203`; sibling tokenWraps paint in DOM order) + `DayPhase.module.css:14` / `NightList.module.css:16` (`position: sticky` panels later in DOM paint above the menu).

### Evidence
`qa/shots/bmr-10/18-intercept-summary-Finley.png`, `qa/shots/bmr-10/18-intercept-Dana.png`, `qa/shots/bmr-10/21-chip-dragged-away.png`, `qa/shots/tb-classic-7/13-day1-after-execution.png`, `qa/shots/mobile-a11y/30-board-landscape.png`; verifier `qa/shots/verify6/02`, `qa/shots/verify6/05`, `qa/shots/verify6/08`

### Findings covered
`reminder-chips-cover-seat-ui-and-intercept-taps`, `token-menu-renders-under-neighbors-and-panels`

### Related
#71 ("Reminder tokens pile up at the board center, collide with name labels, and block taps") — this looks like a regression/incomplete fix. #70 ("token menus stack open and render detached") — same area.

---

### T11: Make warned-through bag/seat mismatches survivable — short bags dead-end, leftover tokens vanish, builder state is lost on reload

- **Severity/labels**: `bug`, `severity: major`, `area: bag-builder`, `draw-ritual`

**Body:**

### What happens
Three related failures around bag size vs seats:
1. **Short/empty bag = unplayable game.** Continue past the "Bag counts don't match the script" advisory with 4 tokens for 5 players: after 4 draws the app says "Card hidden. Pass the device to Player 5." then **"Player 5, tap a token to draw" with ZERO face-down tokens** and an empty manual select. With 0 tokens there is no "Start bag draw" at all and every seat select holds only the placeholder. Setup can never complete, nothing explains why, and the game sits "In progress" on Home forever (verified at 5 and 15 players).
2. **Leftover token never surfaced.** With 6 tokens for 5 players, setup completes at 5/5 and the undrawn token (Monk) is never shown anywhere — it stays in `game.bag` in localStorage but the storyteller can only deduce it by elimination. In physical play the ST checks the leftover; it matters for bluffs.
3. **Builder state is ephemeral.** Everything in the bag builder is React state written only on "Continue to seating": a reload (or browser-back from `/game/`, which resets the builder) wipes player count, traveller count, and all toggles — and the reset-then-Continue path is exactly how the 0-token game above gets created.

### Repro
1. Select 4 characters for 5 players (or none), "Continue anyway", attempt the draw.
2. Select 6 characters for 5 players, "Continue anyway", complete the draw, look for the leftover.
3. Half-build a 15-player bag and reload.

### Expected
ADR 0003 permits the warned continue, but the warned-through state must be playable or recoverable: surface that the bag is short, offer a way back to bag-building, never instruct a player to draw from an empty bag; after an over-bag draw, show the storyteller what stayed in the bag; persist in-progress builder work (ADR 0001 offline-first).

### Root cause
`src/components/GrimoireSetup.tsx:571–581` (`readyForNextDraw`/`startDraw` enter 'choosing' with an empty shuffled tokenOrder; nothing handles `bag.length <` unassigned seats); `src/components/GrimoireSetup.tsx:921` (setupComplete branch never renders `game.bag`; export omits it too); `src/components/BagBuilder.tsx:144` (all selections in `useState`; the only write is `saveGame(game)` at `:344`).

### Evidence
`qa/shots/tb-baron-15/24-empty-bag-choosing.png`, `qa/shots/tb-baron-15/22-short-bag-after-draws.png`, `qa/shots/tb-baron-15/23-over-bag-after-draws.png`, `qa/shots/teensy-6/a08-game-zero-tokens.png`, `qa/shots/export-import-persistence/02-bag-after-reload.png`; verifier `qa/shots/verify1/f3a-seat5-empty-bag.png`, `f3b-zero-tokens.png`

### Findings covered
`undersized-bag-unrecoverable-dead-end`, `leftover-bag-token-never-surfaced`, `bag-builder-state-lost-on-reload-or-back`

### Related
ADR 0003 (advisory, but the result must be recoverable), ADR 0001.

---

### T12: Allow adding a traveller mid-game and return removed travellers' tokens to the bag

- **Severity/labels**: `bug`, `severity: minor`, `area: travellers`

**Body:**

### What happens
"Add traveller" only renders while `game.travellerBag` is non-empty and disappears permanently after the last add; removing a traveller does not return their token; "Add character" excludes the traveller team entirely (138 options, zero travellers). A game built with 0 travellers can never gain one — but the classic traveller use case is a latecomer joining mid-game.

### Repro
1. Build a bag with traveller count 1–3; add them all to the circle — "Add traveller" disappears.
2. Remove a traveller; the button never returns.
3. Open "Add character" and search for any traveller.

### Expected
Official rulebook: travellers may join or leave the game at any time. The storyteller should be able to add a traveller whenever one walks in, or at minimum re-add one who was removed.

### Root cause
`src/components/GrimoireSetup.tsx:806` (Add traveller gated on `game.travellerBag.length > 0`); `GrimoireSetup.tsx:437–478` (`confirmRemovePlayer` never returns a removed traveller's token); `src/lib/characters.ts:111–116` (Add character filtered to `SEAT_HOLDING_TEAMS`).

### Evidence
`qa/shots/verify13/` (bag-emptied and 0-traveller runs); travellers-exile s1 run log

### Findings covered
`traveller-cannot-be-added-midgame`

### Related
—

---

### T13: Surface Teensyville where setup happens — advise on player counts above 6 and carry the badge past Home

- **Severity/labels**: `bug`, `severity: minor`, `area: bag-builder`

**Body:**

### What happens
The bag builder ignores `isTeensyville` entirely: "No Greater Joy" offers the same 5–15 player range as Trouble Brewing, and at 15 players shows targets 9/2/3/1 that the 11-character pool cannot fill — Randomize selects all 11 and three teams stay under target. The generic "Bag counts don't match the script" dialog does fire at Continue ("Townsfolk: 6/7 (1 under) …"), but nothing names the actual cause: Teensyville scripts cater to five or six players. Compounding it, the word "Teensyville" appears nowhere past the home card — not on the script-detail page, not in the bag builder — exactly the pages where the player count is chosen.

### Repro
1. Home → "No Greater Joy" (Teensyville badge) → Build the bag → set 15 players → Randomize.
2. Search the script-detail and bag-builder pages for "Teensyville" (zero matches).

### Expected
Cap the range at 6, or per ADR 0003 show a Teensyville-specific non-blocking advisory when configured above 6; render the Teensyville designation on script-detail and bag-builder pages.

### Root cause
`src/lib/bagBuilder.ts:3–4` (`MIN_PLAYERS`/`MAX_PLAYERS` global) + `src/components/BagBuilder.tsx:405–406`; `isTeensyville` is consumed only in `src/app/page.tsx:55–57`.

### Evidence
`qa/shots/teensy-6/a04-ngj-bag-15p-targets.png`, `qa/shots/teensy-6/a05-ngj-bag-15p-randomized.png`, `qa/shots/teensy-6/a01-home-library.png`, `qa/shots/teensy-6/a02-ngj-script-page.png`; verifier `04-ngj-15p-continue-alertdialog.png`

### Findings covered
`teensyville-no-player-cap-or-advisory`, `teensyville-label-lost-past-home`

### Related
ADR 0003 (advisory shape); BotC wiki "Behind the Curtain" (Teensyville is 5–6 players).

---

### T14: Tidy custom-script intake and the /share receive page — empty "Untitled script" saves, unwrapped errors, one-tap Remove, dead-end share view

- **Severity/labels**: `bug`, `severity: minor`, `area: custom-scripts`, `sharing`

**Body:**

### What happens
Four small holes around getting scripts in and out:
1. Pasting `[]` or `[{"id":"_meta"}]` saves instantly as a blank **"Untitled script"** with no characters and no warning; each attempt adds another identical row (no author, count, or date) — indistinguishable dead entries.
2. An unknown-character-id error with a long id renders as one unwrapped line **1721px wide in a 1280px viewport**, clipped with no horizontal scroll — the tail is unreachable.
3. "Remove" under Your scripts deletes on a single click — no ConfirmDialog (unlike games-list Delete), no undo (unlike reminder removal's 6s Undo) — the app's only one-tap-permanent destructive action, for JSON that may exist nowhere else.
4. The received `/share` page renders the sheet but contains **zero buttons and zero links** — no save/import, no way home; the recipient cannot keep the script through the UI at all.

### Repro
1. Home → Add a script → paste `[]` → Add script; repeat with `[{"id":"_meta"}]`; check Your scripts.
2. Paste a JSON array containing a 200-char id.
3. Click "Remove" once on any custom script.
4. Open any share URL in a fresh profile and look for a save or nav control.

### Expected
Zero-character scripts rejected with a clear message (or saved with an advisory — ADR 0003 permits advisory, but here there is none at all); error text wraps or truncates the id; Remove confirms or offers undo; /share offers "add to Your scripts" and a link home.

### Root cause
`src/lib/scriptParser.ts:200–268` (no empty-script error) + `src/components/AddScriptDialog.tsx:50–58` (unconditional save, "Untitled script" fallback); `AddScriptDialog.module.css:44–49` (no `overflow-wrap`) + `scriptParser.ts:67` (raw id interpolated); `src/components/CustomScriptsSection.tsx:43` (direct `deleteCustomScript` in onClick); `src/app/share/page.tsx` (title + read-only ScriptSheet only).

### Evidence
`qa/shots/custom-scripts-share/05-garbage-empty-array.png`, `06-home-after-garbage.png`, `05-garbage-200-char-id.png`, `07-after-remove.png`, `18-recv-catfishing.png`; verifier `f2-empty-array-saved.png`, `f3-long-id-error-overflow.png`, `f4-after-single-remove-click.png`

### Findings covered
`empty-scripts-saved-as-untitled`, `script-upload-error-overflows-layout`, `custom-script-remove-no-confirm-or-undo`, `share-receive-page-dead-end`

### Related
#73 (ConfirmDialog pattern the Remove flow should adopt); PR #36 scoped /share read-only, so the save affordance is a small feature gap rather than a broken feature.

---

### T15: Adopt `useDialogDismiss` in the four bespoke overlays and make the reveal dialog's `aria-modal` honest

- **Severity/labels**: `bug`, `severity: minor`, `area: a11y`

**Body:**

### What happens
The app has a shared accessible-dialog hook — its own header comment calls it "shared accessible-dialog behavior for every overlay in the app" — and ConfirmDialog + the QR dialog pass all checks. Four overlays skip it: **Show-to-Demon** (Escape does nothing; only Close works), **ReminderPicker** and **Info tokens** (`role=dialog` with zero modal behavior: focus stays on body, `aria-modal` absent, Escape and outside-click no-ops, 4–7 of 15 Tab stops land on background controls, and the background "Hide grimoire" button stays clickable — pressing it destroys the picker), **Setup walkthrough** (Tab trap works but no Escape, and focus lands on body after Close). Separately, the bag-draw **reveal dialog** claims `aria-modal="true"` but neither moves nor traps focus — Tab reaches "Share via QR" and "Game" buttons mounted invisibly behind the opaque privacy overlay (3/25 stops), contradicting the modal claim (Escape correctly does not dismiss — good for privacy).

### Repro
For each overlay: open it, check `document.activeElement`, Tab repeatedly, press Escape, click outside.

### Expected
Focus moves in, Tab is trapped, Escape dismisses (except the reveal, which should stay non-dismissable), focus restores to the opener. For the reveal: either a real trap that whitelists the deliberately-reachable issue-#21 controls, or drop `aria-modal`.

### Root cause
`src/components/ReminderPicker.tsx:43`, `src/components/InfoTokenLibrary.tsx:48,77`, `src/components/DemonBluffsPanel.tsx:126–148`, `src/components/SetupWalkthrough.tsx:686–717` — none call `useDialogDismiss`. Reveal: `src/components/GrimoireSetup.tsx:759–764` with the deliberate always-reachable design at `:701–704`.

### Evidence
`qa/shots/verify12/f1-reminderpicker-bg-interaction.png`, `f1-infotokens.png`, `f1-show-to-demon-after-escape.png`, `f2-reveal.png`; `qa/shots/mobile-a11y/40-reminder-picker-portrait.png`, `41-info-tokens-portrait.png`

### Findings covered
`overlays-lack-modal-dismiss-behavior`, `reveal-dialog-aria-modal-no-focus-trap`

### Related
#73 and #100 established the pattern; #21 (reveal-through reachability AC).

---

### T16: Finish the native-control pass — set `color-scheme`, theme the remaining bare controls, and bring them to 44px

- **Severity/labels**: `bug`, `severity: minor`, `area: theming`, `mobile`, `a11y`

**Body:**

### What happens
One sweep fixes two audited defects, because both come from the same bare, unclassed native controls:
1. **Light-mode natives in the dark theme.** `documentElement` `color-scheme` is `'normal'`, so every unthemed control renders as a light native: white selects/inputs jammed between themed dark controls on the Demon bluffs panel, Day-phase Nominator/Nominee, token-menu Player name/"Remove player"/"Acts as"/"Move seat", the reveal dialog's inputs, and walkthrough controls. Bluff selects (no className) measure 117px against their 96px (6rem) slots — clipped arrows, truncated names. Disabled natives ("Move seat earlier") compute to roughly 2.6:1 contrast — effectively invisible rather than visibly disabled.
2. **Touch targets at 19–36px.** The same controls violate the repo's 44px live-game minimum: Nominator/Nominee selects 181×19 and 97×19, name quick-picks 22.4px, "Use this name" 19px, ReminderPicker labels 22.4px + Cancel 19px, token-menu actions 19px (Move seat 34px), walkthrough selects/Confirm ~19px, board toolbar 33px, InfoToken buttons 29.8px. Everything #82 specifically listed measures ≥44px today — these are the siblings the pass missed.

### Repro
At 390×844 in a live game, inspect/measure the controls above; check computed `color-scheme` on `documentElement`.

### Expected
`color-scheme: dark` globally; the remaining controls take the app's themed classes (which also carry the ≥44px effective target per the #82 decision); bluff selects sized to their slots.

### Root cause
`src/app/globals.css` (no `color-scheme` declaration) + missing classNames: `src/components/DemonBluffsPanel.tsx:95` (slots at `DemonBluffsPanel.module.css:29`), `src/components/DayPhase.tsx:117,134`, `src/components/GrimoireBoard.tsx:783, 833, 887, 908–921`, plus PlayerNamePicker, ReminderPicker, SetupWalkthrough, InfoTokenLibrary, board toolbar.

### Evidence
`qa/shots/tb-baron-15/18-day1-threshold8.png`, `qa/shots/snv12/03-bluff-inplay-pick.png`, `qa/shots/mobile-a11y/24-menu-probe-alex.png`, `11-reveal-dialog-full.png`; tap-audit logs in mobile-a11y outputs; verifier measurements in `qa/shots/verify6/08, /13`

### Findings covered
`unthemed-native-light-form-controls`, `live-game-touch-targets-below-44px`

### Related
#74 (theme native controls) + #48 (contrast) — reference both; #82 (44px pass) — this is the unfinished remainder/regression of that decision.

---

### T17: Clamp phone-width overflows — script-page CTA, token menu, seat-assign selects, landscape reveal

- **Severity/labels**: `bug`, `severity: minor`, `area: mobile`, `css`

**Body:**

### What happens
Four viewport-overflow defects at phone sizes, none scrollable into view because the page suppresses horizontal scroll:
1. `/scripts/tb/` at 390×844: the primary CTA "Build the bag" renders at x=331–493 — 103 of 161px off-screen; only "Build" is visible (still tappable on its sliver, but looks broken).
2. An open token menu spans x=232–456 at 390px (right portion incl. "Move seat later" unreachable); in landscape a bottom-seat menu bottoms out at y=699 in a 390px-tall viewport, and scrolling to it is hostile because menus close on any outside pointerdown.
3. On the `/game/` setup screen, every "Assign seat N manually" select (192px intrinsic width) overflows its `minmax(10rem,1fr)` card — right-column selects clip 18px past the viewport, left-column ones overlap the neighbouring card.
4. In landscape, reveals whose ability text wraps to two lines clip the "Hide & pass" button ~5–12px below the fold with no in-dialog scroll.

### Repro
390×844: open `/scripts/tb/`; open a right-hemisphere seat's token menu; view the setup seat grid. 844×390: open a bottom-seat menu; draw a token whose ability text wraps (e.g. Washerwoman) and look at "Hide & pass".

### Expected
Headers wrap/stack so the CTA is visible; `.menuBody` clamps to the viewport; selects constrained to their cards; the reveal dialog scrolls when content exceeds the viewport.

### Root cause
`src/app/scripts/[scriptId]/page.module.css:7–12` (no flex-wrap) + `:30–38` (`white-space: nowrap`); `src/components/GrimoireBoard.module.css:203–219` (absolute, `translateX(-50%)`, no clamping); `src/components/GrimoireSetup.module.css:259–267` (`.select` has no width constraint) in `.seats` grid `:27–33`; `src/components/GrimoireSetup.module.css:157–169` (`.reveal` fixed inset:0, no `overflow-y: auto`).

### Evidence
`qa/shots/mobile-a11y/02-script-tb-portrait.png`, `22-token-menu-open-portrait.png`, `34-token-menu-landscape.png`, `05-game-setup-portrait.png`, `35-reveal-landscape.png`; verifier `qa/shots/verify10/f1-script-header-390.png`, `f3-token-menu-390.png`, `f4-setup-selects-390.png`, `f5-clipped-Washerwoman.png`

### Findings covered
`build-bag-cta-clipped-phone-width`, `token-menu-not-viewport-clamped`, `setup-seat-selects-overflow-cards`, `hide-and-pass-clipped-landscape`

### Related
Same responsive family as closed #69 (iPad clipping), but all four are new sites.

---

### T18: Keep tap targets still and dialogs double-tap-safe — the threshold layout shift loses votes; double-tap self-cancels the winner confirmation

- **Severity/labels**: `bug`, `severity: minor`, `area: day-phase`, `end-game`, `ux`

**Body:**

### What happens
Two live-play input hazards where the UI moves or swallows the storyteller's tap:
1. **Vote-row layout shift.** The instant the threshold-crossing vote lands, "— meets threshold" and an inserted "On the block: X" line shift every checkbox below by exactly 49px (one row pitch). Tapping all 7 checkboxes' starting positions top-to-bottom at a steady 100ms cadence recorded only **3/7 votes** — taps 5–7 landed on the neighbour above, toggling wrong voters. The tally math itself is correct; the storyteller counting hands around the circle is the victim.
2. **ConfirmDialog backdrop swallows double-taps.** Double-tap "Good wins": click 1 opens the ConfirmDialog, click 2 lands on the just-mounted backdrop whose tap-handler cancels — the dialog flashes open and closes within ~100ms, no winner staged. The anti-fat-finger guard (issue #79) is defeated by exactly the double-tap it guards against. Fail-safe (nothing is declared), but the same pattern affects any ConfirmDialog whose trigger sits under the backdrop (e.g. bag-builder "Continue anyway").

### Repro
1. 7-player day 1: record a nomination, tap all 7 voter checkboxes top-to-bottom at a steady pace.
2. In-progress game, Game panel expanded → double-click "Good wins".

### Expected
The status line renders below the list or its space is reserved so checkboxes never move mid-count; the backdrop ignores clicks within a grace period (or checks pointerdown origin) so a double-tap leaves the dialog open awaiting Confirm/Cancel.

### Root cause
`src/components/DayPhase.tsx:108–112` (conditional "On the block" `<p>` inserted above the nomination list); `src/components/ConfirmDialog.tsx:55–57` (overlay onClick cancels on any backdrop click, no grace period) + `src/components/EndGamePanel.tsx:85,93` (trigger sits under the backdrop).

### Evidence
`qa/shots/chaos-edge/a-vote-row-lost.png`, `v-threshold-shift.png`, `c-goodwins-dblclick.png`; verifier `qa/shots/verify3/f5-after-fixed-coordinate-taps.png`, `qa/shots/verify14/b-after-dblclick.png`

### Findings covered
`vote-threshold-layout-shift-loses-votes`, `winner-confirm-double-tap-self-cancels`

### Related
#79 (the confirmation exists as fat-finger protection).

---

### T19: Fix snapshot and games-list metadata — record the Drunk in exports, use the SGT date in filenames, count travellers on game cards

- **Severity/labels**: `bug`, `severity: minor`, `area: export`, `home`

**Body:**

### What happens
Three data-fidelity/labeling gaps in what the app records and reports:
1. **The export erases the Drunk.** A Drunk with stand-in Chef exports as `{startingCharacter:'chef', finalCharacter:'chef', startingAlignment:'good'}` — indistinguishable from a genuine Chef; the live document's `isDrunk:true` is dropped and "drunk" appears nowhere. A stats DB built on these snapshots would misattribute every Drunk game to the stand-in Townsfolk and never see the Drunk at all — corrupting exactly the win-rate stats ADR 0002 exists for. CONTEXT.md "Stand-in" is explicit: "the grimoire records them as the Drunk".
2. **Filename date lags the displayed date.** `gameSnapshotFilename` slices the raw UTC ISO string: a game the app lists as "Started 7 Jul, 01:45 SGT" downloads as `botc-trouble-brewing-2026-07-06.json` — one calendar day behind for any game in the 16:00–24:00 UTC window (SGT is the app's established reporting timezone per #55).
3. **Game cards exclude travellers.** A 9-player game (8 seats + 1 traveller, and an exile threshold the app itself computes as ceil(9/2)=5) is listed as "8 players · In progress". The count is deliberately the distribution-table count, but the unqualified label contradicts the visible board — "8 players + 1 traveller" would be honest.

### Repro
1. Export a game with a Drunk; inspect that player's JSON entry.
2. Export a game whose `endedAt` falls after 16:00 UTC; compare filename vs the "Started …" line.
3. Run an 8+1-traveller game; read the Home card.

### Expected
Snapshot records Drunk identity (e.g. `startingCharacter: 'drunk'` or an explicit flag); filename date matches the SGT date shown; card labels traveller count.

### Root cause
`src/lib/gameExport.ts:64–81` (`SnapshotPlayer` at `:17–26` has no drunk field; `buildGameSnapshot` drops `player.isDrunk`); `src/lib/gameExport.ts:115` (`(game.endedAt ?? game.createdAt).slice(0,10)`) vs `src/lib/gameTime.ts:5–22` (`formatStartTimeSGT`); `src/components/GamesList.tsx:89` (`seatedPlayerCount()` filters `isTraveller`, `gameDocument.ts:369`).

### Evidence
`qa/eip-live-A-midday2.json` vs `qa/eip-export-A-midday2.json` (Dana seat 4); `qa/shots/travellers-exile/s4-02-home-games-list.png`; verifier `qa/shots/verify13/05-home-games-list.png`

### Findings covered
`export-erases-drunk-identity`, `export-filename-date-utc-vs-sgt`, `home-player-count-excludes-travellers`

### Related
ADR 0002 (snapshot contract and its stated win-rate purpose); #55 (games-list metadata, SGT). Note `gameExport.test.ts` builds a Drunk fixture but never asserts drunk identity survives export.

---

### T20: Render player names and token notes safely — trim blanks, wrap long names, stop title-casing "(actually the Drunk)"

- **Severity/labels**: `bug`, `severity: minor`, `area: board`, `text-rendering`

**Body:**

### What happens
Three token/name text defects:
1. A 200-char unbroken player name renders as a single 1337px line across the whole 1280px viewport — cutting across the circle, overlapping other tokens' labels and the Claims panel, painting over neighbouring UI (page-level scroll is suppressed, so it just overlays).
2. Empty and whitespace-only names are stored verbatim: the Nominator/Nominee dropdowns contain a fully blank option and a whitespace option; the night list shows "Butler — " with a dangling dash. Everything still functions (ids attach correctly), but blank entries are easy to mis-pick.
3. `text-transform: capitalize` on the board token note rewrites "(actually the Drunk)" as **"(Actually The Drunk)"**, while the night list renders the correct casing in the same viewport (and the setup board uses a third, untransformed class). The transform is presumably intended for the traveller-alignment note ("good"→"Good"); the Drunk note is collateral.

### Repro
1. Set a seat's name to 200 chars with no spaces; view the board.
2. Set names to `''` and `'   '`; open the day-1 nomination form and the night list.
3. Put a Drunk in play; compare the board token note with the night list.

### Expected
Names truncate or wrap within their token/row; rename trims and falls back to "Player N" when emptied; the Drunk note renders as written.

### Root cause
`src/components/GrimoireBoard.module.css:183` (`.playerName` has no max-width/overflow-wrap); `src/components/GrimoireSetup.tsx:199` (`renamePlayer` stores raw input, no trim/fallback); `src/components/GrimoireBoard.module.css:191` (`.note { text-transform: capitalize }` applied to the Drunk note at `GrimoireBoard.tsx:756`).

### Evidence
`qa/shots/chaos-edge/n1-board-hostile-names.png`, `n2-nightlist-hostile-names.png`, `n3-day-hostile-names.png`; verifier `qa/shots/verify6/14, /15, /16`, `qa/shots/verify7/f2-token-note.png` vs `f2-nightlist.png`

### Findings covered
`long-player-name-overflows-board`, `blank-player-names-accepted`, `drunk-note-title-cased`

### Related
—

---

### T21: Keep grimoire bookkeeping coherent — reset check state on acts-as retarget, reconcile dead players' checked entries, and flag in-play Demon bluffs

- **Severity/labels**: `bug`, `severity: minor`, `area: night-list`, `board`

**Body:**

### What happens
Three small bookkeeping incoherences that can mislead a storyteller mid-night:
1. **Acts-as retarget inherits the checkmark.** Check off "Philosopher as Town Crier", retarget Acts as to Sage: **"Philosopher as Sage" appears already checked** (progress unchanged) — "done" for a wake never performed. The entry id is `actsas:<playerId>` with no target component, and `nightChecked` is never pruned on retarget. The same target-agnostic id (`char:<playerId>`, `nightList.ts:234`) makes mid-night character swaps equally susceptible.
2. **Dead + checked = ambiguous.** An entry checked earlier the same night, whose player then dies, becomes disabled "(skipped)" but **keeps its checkmark while vanishing from both sides of the "N/M done" count** — "did the Exorcist act or not?" is unanswerable from the display.
3. **In-play bluff accepted silently.** With "Show all characters" on, picking an in-play character as a Demon bluff is accepted with no "(in play)" suffix or warning — usually a storyteller mistake outside Lunatic/Marionette games. Selection must never be blocked (ADR 0003, and Show-all is a deliberate escape hatch), but under ADR 0003 the advisory cue *is* the safety mechanism, and the app already annotates options elsewhere ("(dead)", "(already nominated)").

### Repro
1. Set Philosopher's Acts as = Town Crier, start the night, check the entry, change Acts as to Sage.
2. Check an entry, mark that player dead mid-night, read the entry and the counter.
3. Demon bluffs → Show all characters → pick an in-play character.

### Expected
A retargeted acts-as entry arrives unchecked; a completed-then-died entry either keeps counting or loses its checkmark alongside the "(skipped)" badge; in-play bluff picks get an "(in play)" annotation.

### Root cause
`src/lib/nightList.ts:261` (target-agnostic entry id) + `src/components/GrimoireSetup.tsx:511–518` (`handleSetActsAs` never prunes `game.nightChecked`); `src/components/NightList.tsx:82–83` (countable excludes skipped from both numerator and denominator) vs `:133` (checkbox still renders checked); `src/components/DemonBluffsPanel.tsx:36, 101–107` (Show-all pool, bare labels, no warning element).

### Evidence
`qa/shots/snv12/13-retarget-checked-state.png`, `qa/shots/bmr-10/19-night3-three-deaths.png`, `qa/shots/snv12/03-bluff-inplay-pick.png`; verifier `f2-*.png` (acts-as), `f3-dead-checked-entry.png`, `qa/shots/verify7/f1-showall-inplay-picked.png`

### Findings covered
`actsas-retarget-inherits-checked-state`, `dead-players-checked-night-entry-inconsistent`, `in-play-bluff-no-advisory`

### Related
#17 (night-list check-off persistence); ADR 0003 (advisory cue as the safety mechanism); Show-all is a deliberate Lunatic/Marionette escape hatch (`DemonBluffsPanel.tsx:33–35`) — keep it, annotate it.

---

### T22: Track auto-add provenance so deselecting Huntsman doesn't remove a manually-picked Damsel

- **Severity/labels**: `bug`, `severity: minor`, `area: bag-builder`

**Body:**

### What happens
In the bag builder, deselecting Huntsman always removes the Damsel from the bag — including a Damsel the storyteller deliberately selected *before* touching Huntsman. The removal is silent: no advisory, no visual cue that the manual pick was discarded.

### Repro
1. `/scripts/setup-modifiers-demo/bag/` → click Damsel (deliberate manual pick).
2. Click Huntsman (no-op — Damsel already in the bag).
3. Click Huntsman again to deselect. Damsel is deselected too (`aria-pressed=false`), with no warning.

### Expected
Only an auto-added Damsel should leave with Huntsman; a Damsel picked independently should survive (or at minimum the removal should be announced, matching the advisory style of "Huntsman needs Damsel in the bag.").

### Root cause
`src/components/BagBuilder.tsx:246–250` — `toggleCharacter` unconditionally runs `next.delete(autoAddId)` on trigger deselect; `applyAutoAdds` (`BagBuilder.tsx:50–59`) keeps no provenance of auto-added vs manually-selected, so the manual pick is indistinguishable and dropped.

### Evidence
`qa/shots/gapfill/a3-damsel-after-huntsman-cycle.png`; reproduced on two clean profiles (`gapfill-1-bagbuilder.mjs` check A9, `gapfill-6-reverify.mjs` repro3)

### Findings covered
`huntsman-deselect-removes-manual-damsel`

### Related
The rest of the Huntsman→Damsel auto-add flow verified correct (advisory on removal, mismatch dialog non-blocking, ADR 0003 respected).

---

### T23: Don't let freeform setup brackets like Marionette's disable count validation

- **Severity/labels**: `bug`, `severity: minor`, `area: bag-builder`

**Body:**

### What happens
Selecting Marionette on `pies-baking` shows "Count validation is relaxed while these are in the bag." and strips every team counter of its under/met/over state; the count-mismatch dialog never fires for any bag containing Marionette. Marionette's bracket — `[You neighbor the Demon]` — is a seating constraint, not a distribution change: official team counts stay standard, so every Marionette game on this script silently loses the entire advisory count-checking layer for the script's signature minion.

### Repro
1. `/scripts/pies-baking/bag/` → select Marionette alone.
2. Observe the relaxed banner; all team counters lose their `data-state`; build any wrong-sized bag and Continue — no mismatch dialog.

### Expected
Relaxation is meant for genuine distribution-breakers (Legion/Riot/Atheist/Summoner, Xaan/Kazali per the code comment). Seating-constraint brackets should keep the advisory counters and mismatch dialog fully active (still never-blocking either way, per ADR 0003 — this is about losing the safety signal, not about blocking).

### Root cause
`src/lib/bagBuilder.ts:129` — `parseSetupModifier` falls through to `isFreeform: true` for any unrecognized bracket text ("You neighbor the Demon" matches no pattern); `src/components/BagBuilder.tsx:105–110` `isRelaxedCharacter` treats every `isFreeform` character as fully relaxing validation. The blanket freeform rule may be intended (comment at `BagBuilder.tsx:33–39`) but is overly broad for Marionette — consider a known-list of seating/behavioral brackets that don't relax counts, or relaxing only the teams a bracket names.

### Evidence
`qa/shots/gapfill/mar-a0-banner.png`; reproduced on two clean profiles (`gapfill-3-marionette.mjs` A1, `gapfill-6-reverify.mjs` repro2)

### Findings covered
`marionette-freeform-disables-count-validation`

### Related
Legion/Riot/Atheist/Summoner relaxation itself verified working as intended, including the Randomize interaction with Huntsman→Damsel.

---

## 7. Finding → ticket index

| Finding ID | Verified severity | Ticket |
|---|---|---|
| `mid-draw-reload-reveals-drawn-roles` | critical | T1 |
| `ingame-qr-share-leaks-bag-composition` | critical | T2 |
| `last-seat-hide-and-pass-reveals-grimoire` | critical | T3 |
| `choosing-stage-dropdowns-expose-remaining-bag` | major | T4 |
| `double-tap-start-draw-commits-seat1-token` | minor | T4 |
| `walkthrough-hidden-attribute-defeated-by-css` | major | T5 |
| `block-tie-number-to-beat-forgotten` | major | T6 |
| `midday-death-rewrites-nomination-thresholds` | major | T6 |
| `exile-competes-with-execution-block` | major | T7 |
| `exile-call-counted-as-nomination` | minor | T7 |
| `first-night-fixed-info-steps-pinned-before-characters` | major | T8 |
| `custom-scripts-cannot-run-game` | major | T9 |
| `reminder-chips-cover-seat-ui-and-intercept-taps` | major | T10 |
| `token-menu-renders-under-neighbors-and-panels` | major | T10 |
| `undersized-bag-unrecoverable-dead-end` | major | T11 |
| `leftover-bag-token-never-surfaced` | minor | T11 |
| `bag-builder-state-lost-on-reload-or-back` | minor | T11 |
| `traveller-cannot-be-added-midgame` | minor | T12 |
| `teensyville-no-player-cap-or-advisory` | minor | T13 |
| `teensyville-label-lost-past-home` | minor | T13 |
| `empty-scripts-saved-as-untitled` | minor | T14 |
| `script-upload-error-overflows-layout` | minor | T14 |
| `custom-script-remove-no-confirm-or-undo` | minor | T14 |
| `share-receive-page-dead-end` | minor | T14 |
| `overlays-lack-modal-dismiss-behavior` | minor | T15 |
| `reveal-dialog-aria-modal-no-focus-trap` | minor | T15 |
| `unthemed-native-light-form-controls` | minor | T16 |
| `live-game-touch-targets-below-44px` | minor | T16 |
| `build-bag-cta-clipped-phone-width` | minor | T17 |
| `token-menu-not-viewport-clamped` | minor | T17 |
| `setup-seat-selects-overflow-cards` | minor | T17 |
| `hide-and-pass-clipped-landscape` | polish | T17 |
| `vote-threshold-layout-shift-loses-votes` | minor | T18 |
| `winner-confirm-double-tap-self-cancels` | minor | T18 |
| `export-erases-drunk-identity` | minor | T19 |
| `export-filename-date-utc-vs-sgt` | polish | T19 |
| `home-player-count-excludes-travellers` | polish | T19 |
| `long-player-name-overflows-board` | minor | T20 |
| `blank-player-names-accepted` | polish | T20 |
| `drunk-note-title-cased` | polish | T20 |
| `actsas-retarget-inherits-checked-state` | minor | T21 |
| `dead-players-checked-night-entry-inconsistent` | polish | T21 |
| `in-play-bluff-no-advisory` | polish | T21 |
| `huntsman-deselect-removes-manual-damsel` | minor | T22 |
| `marionette-freeform-disables-count-validation` | minor | T23 |
| `meta-night-order-overrides-unreachable` | polish | T9 |

*Refuted (no ticket): `export-drops-ghost-vote-spent` — working as designed per ADR 0002 (§4).*
