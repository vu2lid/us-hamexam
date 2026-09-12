# Content-first responsive study layout

Status: L1 implemented and committed (`60a545a`). L2 local validation
(automated suites + scripted inspection — Chromium at five viewports,
Firefox/WebKit at 390×844 only) executed 2026-09-11 against commit `59e11d2`
with zero P1 findings; one P2 defect (WebKit `<select>` legibility, all three
themes) confirmed by direct screenshot review and fixed 2026-09-12
(`color-scheme: dark`); two P3 observations recorded. The user separately
provided Pixel 10 / Chrome (Android) usability acceptance — all themes,
figure questions, no issues. See
[§L2 findings and handoff](#l2-findings-and-handoff) for the full record.
Required Safari/screen-reader/physical-device checks remain pending — L2 is
**not** complete. Last updated: 2026-09-12.

This bounded usability workstream temporarily takes priority over the
[original implementation plan](IMPLEMENTATION_PLAN.md). On completion, resume
Stage 3 closeout and then Stage 4; do not silently expand this into a redesign
of exams, storage, or the release roadmap.

## Agreed direction

The user approved a mobile-first arrangement: narrow top and bottom bands,
study material in the middle, and a slide-in drawer for occasional controls.
Apply the same arrangement to larger screens, with a centered reading column.
Mobile-first does not mean desktop automatically works: verify both explicitly.

- Top: labelled Menu button and current pool; short title where space allows.
- Middle: existing question ID, Bookmark, question, figure/enlargement, answers,
  references and progress. Preserve the current content and image presentation.
- Bottom: Previous, Reveal, Next. One visible set of navigation controls.
- Pause/Resume: beside the recall countdown, only when timed reveal is enabled
  and the action is relevant. A paused countdown must retain Resume. When an
  answer is already revealed, do not leave a meaningless Pause action visible.
- Drawer: pool, reveal delay, theme, Mock Exam, Help & About, and a separated
  Reset progress action retaining its confirmation.
- Remove the permanently displayed instructional hint; retain guidance in Help.
- Preserve current defaults, timer policies, stored keys, and study behavior.

Concept outline (illustrative questions in earlier mockups are not exam data):

```text
Menu                         Current pool
-----------------------------------------
Question ID                     Bookmark
Question / diagram / answer choices
Recall countdown              Pause/Resume
Progress / reference
-----------------------------------------
Previous             Reveal          Next
```

## Layout and interaction contract

Use a viewport-height study shell with automatic-height header/footer and a
flexible, independently scrollable middle. Bars must not cover content. Account
for safe-area insets and provide a usable fallback for browsers without dynamic
viewport units. Keep touch targets at least 44 CSS pixels; allow wrapping at
large text sizes rather than truncating labels. Bound the reading width on
desktop instead of stretching answer rows across the entire screen.

The drawer overlays, rather than pushes, study content. It has an accessible
name, Close button, scrollable contents, backdrop dismissal and Escape support.
The Menu button exposes expanded state and its controlled panel. Use ordinary
buttons/selects, not ARIA menu/menuitem roles. Contain focus and background
interaction; restore focus on ordinary dismissal. Respect reduced motion.
Custom swipe gestures are deferred.

Theme, pool and reveal-delay changes apply immediately and leave the drawer
open. Help/Mock Exam close it before opening the destination; destination focus
wins over restoration to Menu. Settings retain their existing effects on timers
and progress. Merely opening a drawer does not pause a timer.

Drawer and figure viewer must not be open simultaneously. Hide study-only bars
in Help, exam setup, active exams and results; preserve those modes' existing
controls. On return to study, restore the shell and established study state.

Audit all existing window.scrollTo/pageYOffset assumptions. Question navigation
must reset the middle scroller; figure viewer open/close must preserve the
originating scroller, including the existing window-scrolling exam/results
contexts. Do not globally replace every window scroll operation.

## Execution slices

Each slice requires independent review before its commit. Do not implement the
next slice merely because the preceding one passed local tests.

### L1 — Study shell, compact bars and settings drawer

- [x] Record baseline screenshots, artifact sizes and working-tree status.
  _(Baseline `dist/index.html` 966,113 B, captured before any L1 code change,
  at 320×568/390×844/844×390/tablet/desktop, in the session scratchpad.)_
- [x] Map current control IDs, handlers, focus destinations and scrolling calls
  before restructuring (`.top`/`.controls`/`.control-group`, `#bottomPrev`/
  `#bottomNext`, `window.scrollTo`/`pageYOffset` call sites in `showQuestion`,
  `showExamQuestion`, exam setup/exit/results, `openHelp`/`closeHelp`, and the
  figure viewer's scroll capture/restore).
- [x] Build the responsive shell, top/bottom bars and drawer as one coherent
  slice, using existing controls rather than duplicate IDs/synchronized copies.
  _(`#study-shell` = `#top-bar` (Menu, app title, `#current-pool-label`) +
  `#study-main`/`#study-scroll` (existing question/bookmark/figure/answers/
  timer/reference/progress, unchanged content and order except answers now
  precede the timer row) + `#bottom-bar` (Previous/Reveal Now/Next — the sole
  surviving nav set; `#bottomPrev`/`#bottomNext` and the header's duplicate
  Previous/Next removed after confirming no other reference). `#settings-drawer`
  reuses `#pool`/`#wait`/`#theme`/`#mockExamButton`/`#helpButton`/`#reset` by
  ID, moved (not duplicated) into the drawer markup. The permanent `.hint` line
  was removed; its guidance is now in Help's "Getting started" section.)_
- [x] Relocate Pause/Resume and implement conditional visibility with tests for
  running, paused, revealed and Never states. _(`updatePauseButton()`; beside
  `.timer-row`'s countdown; hidden — not merely disabled — when revealed or
  `waitSeconds === 0`; covered in `responsive-shell.spec.js`.)_
- [x] Implement drawer accessibility, dismissal, motion preferences and mode
  transitions; integrate figure-viewer scroll preservation. _(`role="dialog"`
  `aria-modal="true"`, visible "Settings" title, Close button, scrollable
  content; full-viewport backdrop present for the whole open state (not
  `aria-modal` alone) blocks background pointer events through both slide
  transitions; capture-phase `keydown` Tab/Shift+Tab trap + Escape + a
  `focusin` guard; `@media (prefers-reduced-motion: no-preference)` gates the
  CSS transition, and closing is `hidden=true` immediately under reduced
  motion rather than after a fixed exit-transition delay. Help/Mock Exam close
  the drawer with `{ immediate: true }` before opening their destination, so
  destination focus wins and the two full-viewport overlays (drawer, figure
  viewer) are never simultaneously present, even mid-transition. `showQuestion()`
  resets `#study-scroll`; the figure viewer now captures/restores both the
  study scroller's `scrollTop` and the page `scrollY`, covering the study and
  the page-scrolling exam/results contexts.)_
- [x] Preserve all three themes and visible/selected-control contrast.
  _(Verified via the existing Stage 3C contrast test plus manual screenshots
  of the drawer in light/dark/night; no filter/theme changes were made to the
  shell or drawer.)_
- [x] Update existing tests that assumed settings were always visible: open the
  drawer through user interaction, rather than force-clicking hidden controls.
  _(`app.spec.js` and `mock-exam.spec.js` updated throughout — every `#pool`/
  `#wait`/`#theme`/`#reset`/`#mockExamButton`/`#helpButton` interaction is now
  preceded by a real click on `#menuButton`, using `openMenu`/`closeMenu`
  helpers; `app.spec.js`'s shared `beforeEach` emulates
  `prefers-reduced-motion: reduce` so functional tests wait on end state, not
  the drawer's slide animation, and stay compatible with fake-clock tests.)_
- [x] Add focused tests for controls, scroller reset/restoration, drawer/viewer
  exclusion, Help/exam return focus, and unchanged persisted state.
  _(New `tests/responsive-shell.spec.js`, 27 tests, added to
  `playwright.config.js`'s `testMatch`.)_
- [x] Rebuild both artifacts, run unit/smoke/compat/responsive/PWA suites and
  targeted study/mock-exam regression tests. Record commands and exact results.
  _(See the development-state log row below for exact commands and counts.)_
- [x] Update Help, README and architecture/testing docs to match the new layout.
  _(`src/index.html` Help "Getting started"/"Mock Exam" sections,
  `docs/ARCHITECTURE.md` new "Content-first responsive study shell" section
  plus updated Help/file-responsibilities/runtime-behavior text,
  `docs/TESTING.md`, `README.md`.)_

L1 is implemented and locally verified; it has **not** had the L2 device/user
review described below. Next action: independent review of this slice, then
proceed to L2.

### L2 — Device review and bounded corrections

Local portion executed 2026-09-11 at commit `59e11d2` (clean tree). Automated
suites: unit 233/233, smoke 16/16, compat 128/128, responsive 80/80, PWA 17
passed + 5 skips (Chromium-only offline tests skip on the WebKit project —
Playwright WebKit cannot navigate while context-offline; pre-existing).
Scripted inspection: 129/129 checks passed across Chromium/Firefox/WebKit at
320×568, 390×844, 844×390, 768×1024, and 1280×720, all three themes, and
reduced motion; 37 screenshots + full report in `test-results/l2-inspection/`
(gitignored; copy before cleaning). Findings and the handoff checklist are in
[§L2 findings and handoff](#l2-findings-and-handoff).

- [x] User review on an actual target phone; record device, browser,
  orientation and observations rather than assuming the mockup proves usability.
  _(Pixel 10 / Chrome (Android) — see "Pixel 10 / Chrome acceptance" below.
  Not the smallest target device, no orientation change reported, and this is
  Android/Chrome only — a Safari/iOS device review remains a separate pending
  item; see the handoff checklist.)_
- [x] Test at 320×568 and 390×844 CSS-pixel portrait sizes, 844×390 landscape,
  tablet and desktop. _(Automated: Chromium at all five sizes; Firefox and
  WebKit at 390×844 only — see the coverage note in
  [§L2 findings and handoff](#l2-findings-and-handoff).)_
- [x] Check enlarged text/browser zoom, drawer scrolling, long answers and
  figure-heavy questions. _(130% root font: no clipping/overflow; real browser
  zoom remains a human check — emulation ≠ zoom.)_
- [ ] Check safe areas, browser toolbar expansion/collapse. _(Pending physical
  device; CSS `env(safe-area-inset-*)` + `100vh`→`100dvh` fallback verified
  only by code review and layout metrics.)_
- [x] Verify keyboard access, focus visibility, drawer naming and background
  isolation. _(Automated: focus trap, Esc/backdrop restoration, dialog labelling.)_
- [ ] Screen-reader dialog announcement and background isolation on a real
  screen reader (VoiceOver/TalkBack). _(Pending; do not mark passed from
  emulation.)_
- [x] Ensure the complete last answer/reference and bottom controls are reachable
  without overlap. _(Automated at 320×568/390×844/768×1024.)_
- [x] Correct demonstrated layout defects only — the one recorded P2 (WebKit
  `<select>` legibility, all three themes) is fixed with `color-scheme: dark`
  on the shared `button, select` rule; see "WebKit select-legibility fix"
  below. No other layout defect has been demonstrated, so nothing else was
  changed.

### Pixel 10 / Chrome acceptance

Recorded 2026-09-12, from the user directly (not a scripted check):

- Device/browser: Pixel 10, Chrome (Android).
- Covered: all three color themes; questions with figures.
- Result: no issues observed. The new layout noticeably improves study space
  by hiding occasional controls (the settings drawer, versus the old
  always-visible header controls).
- Scope of this acceptance: **Android/Chrome usability only.** It is not a
  Safari check, not a screen-reader check, and not source-PDF figure-fidelity
  review — those remain separately tracked and pending (see the outstanding
  human checklist below and `docs/FIGURE_REVIEW.md` §7 for figure fidelity).
  No orientation change was reported.

### L2 findings and handoff

Handoff for the interrupted L2 session (hit its usage limit after producing
`test-results/l2-inspection/report.md` + `l2-manifest.json`, gitignored). This
section is the durable record; the raw screenshots are not committed and are
not guaranteed to survive a clean checkout — copy them out first if needed.

**Tested commit:** `59e11d2` (clean tree at the time; the only change since is
this doc). Current working tree still matches `59e11d2` for all source, tests,
and generated artifacts — only this documentation file differs. The prior
agent's results below apply as-is to the current tree.

**Prior-agent results (not re-run by me — attributed, not personally verified):**
- Automated suites: unit 233/233, smoke 16/16, compat 128/128, responsive
  80/80, PWA 17 passed + 5 skipped (pre-existing Chromium-only-offline
  pattern).
- Scripted inspection: 129 table rows, 0 failures, across Chromium (all five
  viewports: 320×568, 390×844, 844×390, 768×1024, 1280×720; light/dark/night;
  default + reduced motion), plus Firefox and WebKit **at 390×844 only** — the
  report's "Engines … Viewports …" header lists both lists side by side, which
  reads as full engine×viewport coverage; it is not. Firefox/WebKit were not
  exercised at 320×568, 844×390, 768×1024, or 1280×720, and had no dedicated
  reduced-motion or 130%-text pass (those were Chromium-only). Some rows are
  exact duplicates (e.g. `1.bars-in-viewport`/`1.no-doc-vertical-overflow` at
  each Chromium viewport appear three times with identical values) — the
  count of 129 is rows recorded, not 129 distinct conditions. Two rows
  (`12.pwa-install-banner`, `13.zoom-vs-emulation`) are informational
  pointers/notes, not independently executed assertions — the report itself
  says so ("skipped here per plan", "noted").
- One P2 finding (WebKit dark/night `<select>` legibility) and two P3
  observations (Firefox favicon CSP console message under plain HTTP; a
  placeholder timer glyph in headless Chromium screenshots) — both P3s are
  environment/harness artifacts, not app defects.

**My additional checks (personally performed, this session, ~15 min):**
- Confirmed git state: working tree matches `59e11d2` except this doc; no
  rebuild performed (none needed — source unchanged).
- Reviewed the WebKit vs. Chromium vs. Firefox dark-drawer screenshots
  side-by-side (`webkit-390x844-dark-drawer.png`,
  `chromium-390x844-dark-drawer.png`, `firefox-390x844-dark-drawer.png`):
  **confirmed by direct visual inspection**, not just computed-style
  inference. WebKit paints the Pool/Reveal-after/Theme `<select>` boxes with a
  light native control background while the CSS `color` stays near-white
  (`rgb(232,234,237)`) — value text is barely legible. Chromium and Firefox
  both render the intended dark background (`rgb(37,41,45)`/`--select-bg`)
  with light text and are clearly readable.
- Closed one evidence gap the original report identified but did not
  screenshot: ran one targeted WebKit/390×844/dark check of the **Mock Exam
  setup** selects (`#exam-pool-select`, `#exam-timer-select`), reached via
  Menu → Theme: Dark → Mock Exam. Confirmed the same defect: computed style is
  correct (`color: rgb(232,234,237)`, `background-color: rgb(37,41,45)`,
  `appearance: auto`) but the rendered control shows light-on-light,
  unreadable — same root cause as the drawer. Screenshot:
  `test-results/l2-inspection/webkit-390x844-dark-exam-setup-followup.png`
  (gitignored, not committed).
- Did **not** additionally screenshot Night theme on WebKit (no prior evidence
  existed either). Not reproduced independently, but expected to share the
  identical root cause: WebKit's native `<select>` chrome ignoring a
  non-default `background-color` under `appearance: auto` is not
  theme-specific, and Night uses the same `button, select` rule with its own
  dark `--select-bg` (`#1a1512`). Treat as **inferred, not confirmed** for
  Night specifically.

**Visual finding verdict: CONFIRMED** (WebKit-specific, both the settings
drawer and Mock Exam setup selects, Dark theme; Night inferred by shared
mechanism, not independently screenshotted).
- **Reproduction:** Open `dist/index.html` in WebKit at 390×844 → Menu → Theme:
  Dark → observe Pool/Reveal after/Theme selects in the drawer; or → Mock Exam
  → observe Question pool/Practice timer selects in setup.
- **Affected controls:** `#pool`, `#wait`, `#theme` (drawer); `#exam-pool-select`,
  `#exam-timer-select` (Mock Exam setup). All share the generic `button,
  select` rule in `src/style.css`.
- **Screenshot evidence:** `webkit-390x844-dark-drawer.png` vs.
  `chromium-390x844-dark-drawer.png` / `firefox-390x844-dark-drawer.png`;
  `webkit-390x844-dark-exam-setup-followup.png` (new this session). All
  gitignored under `test-results/l2-inspection/`.
- **Real Safari confirmation still needed.** This is Playwright's WebKit
  (`webkit`/GTK port on Linux), not Apple's shipped Safari; iOS/macOS Safari
  can paint native form controls differently. Treat as strong evidence of a
  real risk, not a substitute for the pending physical-device check below.
- **Suggested correction at the time (superseded, never implemented):**
  `appearance: none` + a custom dropdown indicator. Fixed differently — see
  below.

#### WebKit select-legibility fix (2026-09-12)

**Root cause, confirmed by evaluating the existing native-control styling
before choosing a fix:** `--button-bg`/`--button-text` are a dark
background + light text pair in **all three** app themes (light theme's
`--button-bg: #303438` is just as dark as dark/night's) — buttons and selects
are always styled as dark controls, by design, regardless of the overall page
theme. WebKit paints native `<select>` chrome (the closed box and the open
listbox) using its own default palette for whatever it does not derive from
page CSS, and defaults to a light native palette unless told otherwise —
producing light chrome under our light `color`, i.e. light-on-light. Chromium
and Firefox already paint that native chrome from the page's own
background/color, so they were unaffected.

**Chosen fix — `color-scheme: dark`, not `appearance: none`:** added
`color-scheme: dark;` to the existing shared `button, select` rule in
`src/style.css` (one property, no new rule, no selector changes). This tells
every engine which native palette variant to use for chrome it paints itself,
so WebKit switches its native `<select>` painting to the dark variant that
matches our own dark background — without touching `appearance` at all.
Native dropdown indicator, keyboard interaction (arrow keys, type-ahead),
native selection popup, disabled-state styling, and touch-target sizing
(padding/`min-height: 44px` unchanged) are all untouched, because nothing
about how the control itself works was changed — only which built-in palette
WebKit references for the parts it paints natively. `appearance: none` was
evaluated and rejected as unnecessary: it would have meant rebuilding the
dropdown indicator, focus ring, and native listbox behavior from scratch for
a defect that a single existing CSS property already fully resolves.
Reapplies automatically to every current and future application `<select>`
through the same shared rule (drawer's `#pool`/`#wait`/`#theme` and Mock Exam
setup's `#exam-pool-select`/`#exam-timer-select`; no per-control overrides
were added).

**Verification (this session, WebKit — Playwright's engine, still not Apple's
shipped Safari):**
- Screenshots confirm the fix by direct visual comparison, not computed style
  alone, in **all three themes** (Light was not previously screenshotted and
  turned out to share the same defect before this fix, consistent with the
  root cause above): `webkit-390x844-{light,dark,night}-drawer-colorscheme-fix.png`
  and `webkit-390x844-{light,dark,night}-exam-setup-colorscheme-fix.png` (all
  gitignored, not committed). Selects now show light text on the same dark
  background as the surrounding buttons, matching Chromium/Firefox.
- Regression check: `chromium-390x844-dark-drawer-colorscheme-fix.png` and
  `firefox-390x844-dark-drawer-colorscheme-fix.png` are visually unchanged
  from the pre-fix screenshots — `color-scheme` did not alter the
  author-specified colors those engines were already rendering correctly.
- Added one focused `@compat` regression test,
  `tests/responsive-shell.spec.js` — "every select opts into color-scheme:
  dark, in every theme, so WebKit paints matching native chrome": checks
  `getComputedStyle(select).colorScheme === 'dark'` and a ≥44px touch target
  for `#pool`/`#wait`/`#theme` **and** `#exam-pool-select`/`#exam-timer-select`
  in **each** of Light/Dark/Night (Mock Exam setup is opened and cancelled
  once per theme iteration, not only after the loop) and confirms
  `selectOption` and keyboard selection actually change the value. Review
  fix (2026-09-12): the first version only asserted the post-`ArrowDown`
  value was non-empty — true of the untouched default too, so it didn't prove
  the keypress did anything — and checked the exam-setup selects only once,
  after the loop, when the theme was left on whatever the last iteration set
  (Night), not in Light/Dark. Now asserts the known default
  (`#exam-timer-select` = `'2100'`, 35 min) changes to the adjacent option
  (`'3000'`, 50 min) after one `ArrowDown`, and checks exam-setup selects in
  all three themes. Computed style cannot prove correct native *painting*
  (that needs the screenshots above), but it does guard the property against
  a future edit silently dropping it. Ran on Chromium, Firefox, WebKit
  desktop, and webkit-mobile — 4/4 passed (both before and after the test
  fix). Also ran the full `tests/responsive-shell.spec.js` file on
  chromium-desktop (28/28) and the existing `@compat` view-mode contrast test
  in `tests/app.spec.js` (1/1) to check for regressions elsewhere the CSS
  change could plausibly reach.
- **Not rerun this session** (source outside `src/style.css` and the one new
  test is unchanged): the full unit/smoke/compat/responsive/PWA battery, the
  standalone matrix, and `responsive-shell.spec.js` on tablet/mobile Chromium
  or Firefox projects. The change is a single additive CSS property on an
  existing rule with no selector/layout/markup change, so this is treated as
  a low cross-project risk; it has not been independently reverified on those
  configurations.
- `npm run build` twice → byte-identical `dist/` (9 files); `dist/index.html`
  **983,584 B**, 64,992 B under the 1,048,576 budget; `git diff --check`
  clean.
- **Real Safari confirmation is still required** — Playwright's WebKit is not
  Apple's shipped Safari, and this fix, however standard, has not been
  confirmed on actual iOS/macOS Safari.

**Essential evidence gaps reviewed against the L2 checklist above:** the two
unchecked items with no automated substitute (physical-device review;
screen-reader dialog/isolation) have no usable evidence and cannot be closed
by further scripted inspection — they need a human with real hardware/AT.
Safe-area/toolbar behavior is also unverifiable by viewport emulation alone.
No other consequential item lacked evidence, so no further targeted checks
were run.

**Outstanding human checks (updated after the Pixel 10 acceptance and the
select fix above):**
1. Real Safari (iOS and/or macOS) confirmation that the `color-scheme: dark`
   fix actually resolves select legibility there too (Apple's shipped Safari,
   not Playwright's WebKit).
2. ~~Smallest actual target phone~~ — **partially done:** Pixel 10 / Chrome
   (Android) acceptance obtained (see "Pixel 10 / Chrome acceptance" above);
   no orientation-change observation was recorded, and this is Android only —
   an iOS/Safari device pass is still needed (folds into item 1).
3. Browser toolbar show/hide (real scrolling, not emulation) with the
   `100dvh`/`100vh` fallback — bars must not jump or clip.
4. Real pinch/OS-level zoom (not the 130% root-font emulation already done).
5. Notch/safe-area device check of `env(safe-area-inset-*)` padding.
6. Real screen reader (VoiceOver and/or TalkBack): drawer dialog announcement
   and confirmation that background content is not reachable.

**Current status:** L2's local/automated portion is complete. Its one visual
finding (WebKit `<select>` legibility, confirmed in all three themes by direct
screenshot comparison, not computed style alone) has a chosen and verified
fix (`color-scheme: dark`, above) — the correction is no longer pending, only
its confirmation on real Safari is. The user has separately provided Android
usability acceptance (Pixel 10 / Chrome, all themes, figure questions, no
issues, positive feedback on the drawer's space-saving effect) — this is real
positive evidence but is Android/Chrome-only, not Safari, not a screen reader,
and not figure-fidelity approval. L2 remains **incomplete**: items 1, 3, 4, 5,
and 6 above have no substitute for a human with a device or assistive
technology. Source-PDF figure-fidelity review is a separate, already-tracked
open item (`docs/FIGURE_REVIEW.md` §7) and is not part of L2.

**Next action:** the user chooses one of — (a) the remaining
physical-device/Safari/screen-reader review in the checklist above (now
smaller: confirm the shipped fix rather than diagnose a defect), or (b)
proceed to **L3** integration audit while leaving L2's pending human items
open, subject to those same outstanding checks before any release decision.
L2 cannot be marked complete until items 1 and 3–6 above are done by a human.

### L3 — Integration audit and release readiness

- [ ] Run a complete uninterrupted `npm test` (standalone matrix and PWA), plus
  tag suites where they cover additional configurations. Record skips honestly.
- [ ] Run two builds; compare all generated paths/hashes and confirm mandatory
  figure validation and the 1,048,576-byte standalone gate still pass.
- [ ] Confirm no external runtime requests, no changed storage keys/defaults,
  no asset/data changes, and no exam/scoring/timer-policy changes.
- [ ] Run `git diff --check`; independently review final source, tests, docs and
  generated artifacts. Resolve blockers before deployment.
- [ ] Complete or explicitly carry forward manual accessibility/device and
  source-PDF fidelity checks; layout approval is not content-fidelity approval.

## Commit, deployment and release

Use a work branch for this sequence and push it for backup/review. The current
`.github/workflows/deploy-pages.yml` runs on pushes to **main** (and manual
dispatch), executes `npm test`, then deploys `dist/pwa` to GitHub Pages. A work
branch push does not trigger that workflow; local verification is still needed.
Do not merge/push to main merely to obtain a preview without acknowledging that
it deploys. This plan does not authorize pushes, merges, or workflow changes.

- [ ] Before merging, obtain user acceptance and resolve release-blocking findings.
- [ ] Commit source, tests, docs and both regenerated release targets together.
- [ ] When authorized, merge/push to main and verify build/deploy jobs complete.
- [ ] Check hosted loading, existing-PWA update behavior and offline relaunch;
  remember update-notification improvements are still a later roadmap stage.
- [ ] If rollback is needed, revert the scoped change via a new reviewed commit,
  rebuild and redeploy; do not reset history or restore artifacts alone.

No version bump/tag per layout slice. Keep beta.2 versioning and formal release
in the original Stage 5 gate. If the user wants a separately versioned UI release,
agree that release scope first rather than declaring beta.2 complete early.

## Return to the original plan

- [ ] Close this workstream with commit IDs, verification and remaining issues.
- [ ] Resume Stage 3 closeout using the new layout, including outstanding manual
  device/accessibility checks and source-PDF fidelity approval.
- [ ] Plan Stage 4 storage centralization and idempotent migration; keep the
  exam-loss warning a separate reviewable change.
- [ ] Continue Stage 5 metadata/CI/full release gates before beta.2 release.

Out of scope: custom drawer gestures, adjustable figure zoom, re-encoding,
content redesign, changing manual/timed reveal defaults, storage migration,
exam-layout redesign, dependencies and frameworks.

## Development-state log

At every handoff, update this log and the current-work pointer in
IMPLEMENTATION_PLAN.md. Record commit, tests, pending checks and next action.
Check boxes only when implemented and verified, not on an agent report alone.

| Date | Slice | State / evidence | Next action |
|---|---|---|---|
| 2026-09-10 | Planning | User approved content-first responsive direction. Plan saved; no UI implemented. | Review plan, then prepare the L1 implementation prompt. |
| 2026-09-10 | L1 | `60a545a`. Implemented the viewport-height study shell (`#study-shell`: top bar with Menu/title/`#current-pool-label`, `#study-scroll` middle, `#bottom-bar`), removed the duplicate header nav and `.navrow`/`#bottomPrev`/`#bottomNext`, removed the permanent `.hint` (guidance moved into Help), relocated Pool/Reveal-delay/Theme/Mock-Exam/Help/Reset into `#settings-drawer` (existing IDs reused, not duplicated) with dialog semantics, a full-viewport backdrop present for the whole open state, keydown focus trap + Escape, a `focusin` guard, and `prefers-reduced-motion`-gated slide transitions; made Pause/Resume contextual (`updatePauseButton()`); centered a `max-width:720px` reading column; added `env(safe-area-inset-*)` padding and a `100vh`→`100dvh` shell-height fallback; made the drawer and the figure viewer mutually exclusive (immediate close, no simultaneous overlays); had `showQuestion()` reset the study scroller and the figure viewer capture/restore both the study-scroll and page-scroll positions; fixed a latent focus-race in `openHelp()` (hash-navigation could silently reset focus to `<body>`, discovered by a new drawer test) by setting the hash before focusing and scrolling last. **No** exam/results layout redesign, no manual/timed-reveal-default changes, no storage-key changes, no adjustable zoom/pinch/pan, no dependency/framework/version changes. **Tests:** rewrote `tests/app.spec.js` and `tests/mock-exam.spec.js` throughout to open the drawer via a real Menu click before every relocated-control interaction (`openMenu`/`closeMenu` helpers; `app.spec.js`'s `beforeEach` emulates reduced motion so functional assertions target end state, not the drawer's animation, and stay compatible with fake-clock tests); added `tests/responsive-shell.spec.js` (27 tests: drawer open/close/backdrop/Escape/focus-trap/restoration, every relocated setting, current-pool sync, contextual Pause/Resume, scroller reset, figure-viewer scroll preservation from study and from an exam, drawer/viewer exclusion, Help/exam-transition shell hiding, no duplicate IDs, 320×568/390×844/844×390-landscape/tablet/desktop layout, enlarged-text non-clipping, reduced-motion behavior); added one offline drawer test to `tests/pwa.spec.js`; wired the new file into `playwright.config.js`. **Verification:** `npm run test:unit` 233/233; `npm run test:smoke` 16/16; `npm run test:compat` 128/128; `npm run test:responsive` 80/80; `npm run test:pwa` 15 passed / 5 skipped (webkit-mobile Chromium-only tests, pre-existing pattern); full `app.spec.js` 62/62 and `mock-exam.spec.js` 152/152 on chromium-desktop, both also green on firefox-desktop + webkit-desktop; `responsive-shell.spec.js` 135/135 across chromium/firefox/webkit desktop, chromium/webkit tablet, webkit-mobile; `npm run build` twice → byte-identical `dist/` (9 files, icons/manifest untouched); standalone `dist/index.html` 981,106 B (67,470 B under the 1,048,576 budget); `git diff --check` clean. Full 9-project standalone matrix and chromium-mobile/firefox-mobile/firefox-tablet runs of the new file were not all executed (representative subsets were). Before/after screenshots (320×568, 390×844, 844×390, tablet, desktop, plus the drawer in light/dark/night) captured in the session scratchpad, not committed to the repo. | Independent review of this slice; then L2 device/user review (real device, enlarged text/zoom, safe areas, screen-reader drawer naming) — none of L2's manual checks have been performed. |
| 2026-09-11 | L1 (review fixes) | `60a545a`. Fixed a P1 layout regression from review: the PWA install banner sat above `#study-shell`, which independently claimed `height:100dvh`, so the banner's height was added on top of a full viewport height rather than sharing it — at 390×844 with the banner visible the bottom bar was measured entirely off-screen (top 908px) with a 975px document height. Fix: wrapped the banner and the shell in a new `#study-viewport` (`height:100vh`→`100dvh`, flex column); the banner is now `flex:none` (natural height) and `.study-shell` is `flex:1 1 auto; min-height:0`, so the shell always gets exactly the height that remains — verified with the banner visible (bottom bar bottom = viewport height, zero document overflow) and after Dismiss (shell reclaims the space live). Discovered and fixed a second-order regression this introduced: `hideStudyUI()`/`showStudyUI()` still toggled `#study-shell` alone, leaving the now-separate `#study-viewport` wrapper present-but-empty at its full `100dvh` during Help/exam/results, pushing those page-flow panels down a full viewport height (caught by the existing figure-viewer exam-scroll-preservation test) — fixed by toggling `#study-viewport` instead. Also addressed two smaller follow-ups: the settings drawer now slides in from the left (`justify-content: flex-start`, `translateX(-100%)`, border/shadow/safe-area-inset flipped to the left edge), matching the plan's top-left Menu association rather than the right-side slide implemented in the first L1 pass; and corrected Help's "Getting started" text, which had described figures as appearing "between the answer choices and the countdown" (backwards) — the markup and the text now agree that figures sit between the question and the answer choices. **Tests:** added `tests/pwa.spec.js` — "the install banner does not push the bottom bar off-screen or add a page scrollbar" (banner visible: bottom bar in-viewport, no doc overflow; after Dismiss: shell reclaims the space) — and fixed `responsive-shell.spec.js`'s backdrop-click test, which had assumed a right-anchored panel (click point moved to the viewport's right edge, now clearly inside the backdrop rather than the left-anchored panel). **Verification:** `npm run test:unit` 233/233; `npm run test:smoke` 16/16; `npm run test:compat` 128/128; `npm run test:responsive` 80/80; `npm run test:pwa` 17 passed / 5 skipped (same pre-existing webkit-mobile Chromium-only pattern, plus the new banner test green on both projects); full `app.spec.js`/`exam-engine.spec.js`/`mock-exam.spec.js`/`responsive-shell.spec.js` 180/180 on chromium-desktop; `npm run build` twice → byte-identical `dist/`; standalone `dist/index.html` 982,686 B (65,890 B under budget); `git diff --check` clean; `responsive-shell.spec.js` also re-verified green on firefox-desktop and webkit-desktop (54/54) after these fixes. Not re-run this round: chromium/webkit-tablet and webkit-mobile for `responsive-shell.spec.js` and the full 9-project standalone matrix (both passed in the prior round; these fixes do not touch tablet/mobile-specific code paths). | Independent review of these fixes; then L2 device/user review as above. |
| 2026-09-11 | L2 (automated) | `59e11d2`, clean tree. Ran the full automated suite (unit 233/233, smoke 16/16, compat 128/128, responsive 80/80, PWA 17 passed/5 skipped) plus a one-off scripted multi-engine inspection script (`/tmp/l2-inspect.js`, not committed) against `dist/index.html` served locally: 129 table rows, 0 automated failures, Chromium at all five viewports (320×568/390×844/844×390/768×1024/1280×720) × three themes × default/reduced motion; Firefox and WebKit **at 390×844 only**. Found one P2 (WebKit dark/night `<select>` legibility) and two P3 environment observations (Firefox favicon CSP console message; placeholder timer glyph in headless Chromium). Full report + 37 screenshots + manifest in `test-results/l2-inspection/` (gitignored). Session ended (usage limit) before folding results into this tracked doc — the `[§L2 findings and handoff]` reference this row's author left in the checklist above pointed at a section that did not yet exist. | Fold the report into this doc's tracked findings section; confirm the visual finding by direct screenshot comparison, not computed style alone; close any consequential evidence gaps; then hand off to the user for the correction decision and the pending human checks. |
| 2026-09-11 | L2 (handoff completion) | `59e11d2`, clean tree except this doc. Did not rerun the unit/smoke/compat/responsive/PWA suites or the full standalone matrix (out of scope for this pass; source unchanged since the prior row). Confirmed by direct visual comparison (not just computed `color`/`background-color`) that the WebKit P2 is real: `webkit-390x844-dark-drawer.png` shows light-on-light `#pool`/`#wait`/`#theme` selects vs. correctly dark `chromium-390x844-dark-drawer.png` and `firefox-390x844-dark-drawer.png`. Closed one evidence gap the prior report had asserted but not screenshotted: one targeted WebKit/390×844/Dark run confirmed the same defect on the Mock Exam setup selects (`#exam-pool-select`, `#exam-timer-select`); saved as `webkit-390x844-dark-exam-setup-followup.png` (gitignored). Did not additionally screenshot Night on WebKit (inferred to share the same root cause, not independently confirmed) or re-check any already-covered engine/viewport/theme combination. Corrected an implicit coverage overstatement: the report's "Engines … / Viewports …" header reads as full cross coverage; Firefox/WebKit only got 390×844, and 129 recorded rows include exact duplicates and two informational (non-executed) rows — now stated explicitly in [§L2 findings and handoff](#l2-findings-and-handoff). Wrote that section (tested commit, prior-agent results clearly attributed, my additional checks, confirmed/inconclusive verdict, smallest suggested correction — not implemented, and the itemized outstanding human checklist) and corrected the stale current-priority paragraph in `docs/IMPLEMENTATION_PLAN.md`. No application code, tests, dependencies, version, or generated artifacts changed; `git diff --check` clean; no commit. | User decides: (a) bounded WebKit-select-legibility fix, (b) physical-device/Safari/screen-reader review, or (c) proceed to L3 while leaving L2's human items open. L2 stays incomplete until the physical-device and screen-reader items are done. |
| 2026-09-12 | L2 (Android acceptance + select fix) | `59e11d2`, clean tree except docs (no application code changes committed). Recorded the user's Pixel 10 / Chrome (Android) usability acceptance: all three themes, figure questions, no issues, positive feedback that the drawer noticeably improves study space — Android/Chrome scope only, not Safari/screen-reader/figure-fidelity. Fixed the WebKit `<select>` legibility P2: root cause is that `--button-bg`/`--button-text` are a dark-background/light-text pair in *all three* app themes (not just dark/night), and WebKit paints native `<select>` chrome with its own light default unless told otherwise. Evaluated `appearance: none` (the previously suggested fix) and rejected it as unnecessarily invasive; added `color-scheme: dark;` to the existing shared `button, select` rule in `src/style.css` instead — one property, no selector/markup change, no native-appearance/keyboard/selection/touch-target change, covers every application select automatically. **Verification:** screenshotted WebKit Light/Dark/Night for both the drawer and Mock Exam setup (`webkit-390x844-{light,dark,night}-{drawer,exam-setup}-colorscheme-fix.png`) — all now show light-on-dark, matching Chromium/Firefox; regression-checked Chromium and Firefox Dark (`{chromium,firefox}-390x844-dark-drawer-colorscheme-fix.png`) — visually unchanged (all gitignored, not committed). Added one `@compat` regression test to `tests/responsive-shell.spec.js` (computed `color-scheme: dark` + ≥44px height on all five application selects across Light/Dark/Night, plus `selectOption`/keyboard-selection still working) — passed on Chromium, Firefox, WebKit desktop, and webkit-mobile (4/4); full `responsive-shell.spec.js` on chromium-desktop 28/28; the existing `@compat` view-mode contrast test in `app.spec.js` 1/1 (regression check). **Not rerun:** the full unit/smoke/compat/responsive/PWA battery, the standalone matrix, and `responsive-shell.spec.js` on tablet/mobile Chromium/Firefox projects — treated as low-risk for a single additive CSS property with no selector/layout change, but not independently reverified there. `npm run build` twice → byte-identical `dist/` (9 files); `dist/index.html` **983,584 B** (64,992 B under the 1,048,576 budget); `git diff --check` clean. No dependency/version/storage/timer/question-bank/figure/viewer change. | User/independent review of the CSS fix and updated docs; then real Safari confirmation of the fix (folds into the pending iOS device check), remaining physical-device/screen-reader checks, and/or proceed to L3 while those stay open. |
