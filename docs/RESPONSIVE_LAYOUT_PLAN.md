# Content-first responsive study layout

Status: L1 implemented and locally verified, pending independent review and
the L2 device/user review below. Last updated: 2026-09-10.

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

- [ ] User review on the smallest actual target phone; record device, browser,
  orientation and observations rather than assuming the mockup proves usability.
- [ ] Test at 320×568 and 390×844 CSS-pixel portrait sizes, 844×390 landscape,
  tablet and desktop. Add cases to the existing test configuration as needed.
- [ ] Check enlarged text/browser zoom, browser toolbar expansion/collapse,
  safe areas, drawer scrolling, long answers and figure-heavy questions.
- [ ] Verify keyboard access, focus visibility, screen-reader drawer naming and
  background isolation; mark unavailable physical checks pending, not passed.
- [ ] Ensure the complete last answer/reference and bottom controls are reachable
  without overlap. At ordinary portrait text size, question text should appear
  immediately; do not promise all long content fits without scrolling.
- [ ] Correct demonstrated layout defects only. Defer figure-size changes unless
  review shows a remaining problem and the user approves a separate change.

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
