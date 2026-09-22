# Testing Guide

## Overview

Tests use [Playwright](https://playwright.dev/) to load the generated `dist/index.html` in real browser engines at multiple viewport sizes. This gives confidence that the single-file app works across desktop and mobile platforms.

A second Playwright configuration serves `dist/pwa/` over localhost so service-worker, manifest, icon, cache, and offline behaviors can be tested in a secure context.

## What is tested

The test matrix covers:

- **Browsers:** Chromium, Firefox, WebKit
- **Viewports:** mobile (375×667), tablet (768×1024), desktop (1280×720)

That is 3 browsers × 3 viewports = 9 project configurations. The full standalone
matrix (`npx playwright test`) runs every case on all nine; the tag-scoped npm
scripts described under [Tagged suites](#tagged-suites) run a chosen subset on a
smaller project list for routine work.

Each configuration runs tests covering:

1. **Page loads** — title, first question, meta, progress, pool selector, and four choices are visible.
2. **Navigation** — Next/Previous move between questions and disable correctly at boundaries.
3. **Reveal answer** — clicking "Reveal Now" highlights the correct choice.
4. **Timer setting** — changing the dropdown updates the countdown text.
5. **Timer "Never"** — selecting "Never" hides the countdown.
6. **Pause / Resume** — pause stops the timer; resume continues it; the control is shown only while a timed reveal is running or paused, and hidden once revealed or set to "Never".
7. **Automatic reveal** — timer expiration reveals the correct choice.
8. **Pool switching** — the pool dropdown loads Technician, General, and Extra questions.
9. **Progress persistence** — `localStorage` records the selected pool and per-pool question index, and a page reload restores them.
10. **Startup diagnostics** — successful initialization, visible failure reporting, and static guidance when JavaScript is disabled.
11. **Data embedding** — the global banks object and UTF-8 question text load intact.
12. **Boundaries** — both the first and final question disable navigation correctly.
13. **Touch targets and layout** — controls are at least 44 px tall and there is no horizontal scrollbar.
14. **PII minimization** — visible and copied diagnostics remove supported local path shapes (`file:` URLs, POSIX `/home` and `/Users`, and Windows drive-letter `Users` paths, including percent-encoded separators) and omit the browser user agent and other browser fingerprints. Tests verify that ordinary remote routes and unrelated encoded prose remain byte-for-byte intact; privacy takes precedence when a supported local-path shape is embedded in another string, including a URL.
15. **Mock Exam setup** — the setup pool defaults to the active study pool and derives its metadata and default practice-timer value from that selection; choosing an exam pool does not change the study pool.
16. **Mock Exam accessibility** — each answer `<fieldset>` keeps a question-specific visually-hidden `<legend>` ("Answer choices for `<id>`"); focus moves into the setup pool selector, the session heading, and the results heading (both `tabindex="-1"`) on the matching transitions and returns to the Mock Exam button on exit, cancel, and return-to-study; the subelement breakdown is a native `<table>` with `scope="col"`/`scope="row"` headers.
17. **Mock Exam state isolation** — sessions, answers, and results stay in memory; study question, pool, index, theme, bookmarks, and the recall timer are unchanged by entering, running, or leaving an exam.
18. **Content-first responsive study shell (L1)** — the settings drawer (Pool, Reveal after, Theme, Mock Exam, Help & About, Reset progress) opens/closes via Menu, backdrop click, Close, and Escape, traps focus, and restores it to Menu on ordinary dismissal; Help/Mock Exam close the drawer before opening; the current-pool label stays synchronized; Pause/Resume shows only while relevant; the middle study scroller resets on navigation and the figure viewer preserves its scroll position on open/close; the drawer and the figure viewer are mutually exclusive; and the shell has no horizontal overflow at 320×568, 390×844, 844×390 landscape, tablet, or desktop.
19. **Transient scoped study (Stage 6A)** — the drawer's scope selector (All questions / subelement / group) filters study navigation, progress, figures, bookmarks, and reveal without touching Mock Exam, storage, or persistence; scope resets to "all" on pool switch and restores the saved full-pool position (not the list start) on reload; boundaries and position resets are relative to the filtered list.
20. **Human-readable scope labels (Stage 6A1)** — the scope selector's subelement/group options show "code — title" using validated, NCVEC-sourced titles from `data/pools.json`, correct per pool and refreshed on pool switch; "All questions" and the top-bar summary stay code-only; an invalid label (missing, blank, unknown code, over the length limit) fails the build before any `dist/` output; group labels target a concise, on-mobile-readable length (an independent-review follow-up), with same-pool label collisions disambiguated by extending both sides with real official text rather than left identical.
21. **Drawer pauses the study recall timer (Stage 6A3)** — the countdown is paused for as long as Settings stays open, not merely at the moment it opens; opening Settings pauses an active recall countdown at its exact remaining time and closing it (Close, Escape, or backdrop) resumes from that preserved value, never restarting the full delay; this has no effect when there is no active countdown (recall delay "Never", already revealed, or already manually paused) and a manual pause survives the round trip; changing Reveal delay, Pool, or Study scope while Settings is open all apply their own normal full countdown reset but the reset countdown stays paused behind the still-open drawer, only starting to advance once the drawer actually closes; opening Help or Mock Exam setup from the drawer leaves no stale interval running. Study recall timer only — Mock Exam's own practice timer and the figure viewer's timer behavior are unrelated and unchanged.
22. **Help audit and newcomer guidance (Stage 6A4)** — a "New to Amateur Radio?" section is the first section in Help, with a short explanation of the hobby/licensing and links to official FCC, ARRL, and NCVEC resources, local-club/mentor guidance, and two HTTPS educational software-defined-radio pages (ARRL, Wikipedia) that never promise direct listening, plus an explicit listening-never-authorizes-transmitting distinction; Help's progress wording no longer implies all study progress is saved unconditionally — it now distinguishes the saved "All questions" position from a temporary Study scope; ordinary descriptive `<a>` links only (no iframe, runtime fetch, or analytics), keyboard-reachable with correct accessible names, legible in all three themes, and non-overflowing at 320×568.
23. **"Getting Started" newcomer guide (Stage 6A5)** — a second Help sub-view (`#getting-started`), reached from a short intro sentence and button near the top of Help or a `#getting-started` deep link, gives a mobile-first, jargon-explained orientation to the hobby beyond the exam (POTA/outdoor operation, hiking/camping/mobile radio, satellites/ISS, digital modes, emergency/public-service communication, home stations/clubs/mentors, and a learn → practice → exam → participate path), one inlined and metadata-stripped photo with alt text and a caption, and a "Learn more" section of HTTPS-only links (FCC, ARRL, POTA, ARISS, AMSAT) with the same listening-never-authorizes-transmitting distinction as the SDR paragraph; the guide shares Help's overlay/timer-pause/study-hiding mechanics (entered once regardless of which sub-view opens first), supports Escape, a Back button, and the browser Back button (each stepping back exactly one level, to Help, without the browser Back button then bouncing forward into the guide just left), keyboard focus containment matching Help's own (nothing outside the visible sub-view is reachable), all three themes, the 320×568 viewport, offline availability in the PWA, and no runtime network requests.
24. **Persisted Study order (Stage 6A6)** — a drawer selector (`#study-order-select`, between Study scope and Reveal after) persists `preferences.studyOrder` (`"sequential"` default, or `"random"`); storage coverage (`tests/unit/storage.test.js`, `tests/storage.spec.js`) checks the default, strict validation/rejection of invalid values, an existing pre-Stage-6A6 canonical document (missing `studyOrder` entirely) reconciling safely to sequential while every other real preference/bookmark/position survives, a present-but-invalid value instead falling through to full legacy recovery like any other corrupted preference, future/older-unsupported schemas remaining untouched regardless of `studyOrder` content, and storage-unavailable/write-failure safety; study-list coverage (`tests/study-scope.spec.js`) checks sequential order is byte-for-byte unchanged, a random order contains every question in the active scope exactly once with no reshuffle from rendering or navigating, the list rebuilds only on the four documented triggers (pool change, Study scope change, Study order change, reload) and never otherwise, the current question is preserved by stable ID across a rebuild (falling back to the new list's first question), scoped random browsing never overwrites the saved full-pool position, returning to "All questions" restores it, bookmarks/reveal/figures/navigation are unaffected, Mock Exam stays fully independent of Study order, the selector is keyboard-reachable within the existing drawer focus trap, fits the 320×568 viewport, renders correctly in all three themes, introduces no new network requests, and the existing drawer countdown-pause-for-the-whole-visit behavior (Stage 6A3) is unaffected by the new control; `tests/pwa.spec.js` confirms the preference survives an offline PWA reload alongside the other preferences.
25. **Getting Started CTA discoverability (review follow-up on Stage 6A5)** — the "Open Getting Started" button moved out of its inline sentence into its own `#guide-cta` section, with a short "New here?" supporting label, so it reads as an obviously clickable call to action: it is a real `<button type="button">` with the unchanged `id="openGettingStarted"` and `openGuide()` behavior, keeps its expected accessible name ("Open Getting Started"), is keyboard-focusable, opens `#getting-started` on click; its computed background-color and border-color are asserted to differ from an ordinary Help section's, proving the "distinct background/accent edge" requirement without a screenshot; it meets the 44px touch-target minimum and is asserted nearly full-width (over 60% of viewport width) with no page-level horizontal overflow at 320×568; and it remains visible with a non-transparent background and fully clickable in light, dark, and night themes, with no console errors.
26. **Newcomer onboarding clarity (review follow-up on Stage 6A5)** — the Getting Started guide's opening paragraph states plainly that this is a US FCC Amateur Radio exam study app and explains all three license classes ("Technician... usual starting point", "General... broader privileges after Technician", "Extra... highest class"); the "A simple path" section states `Learn → Practice → Take the exam → Explore the hobby` and adds `#startTechnician` ("Start with Technician"), a real keyboard-focusable `<button>` with that exact accessible name. Behavior coverage: from Technician/All, it is a no-op that simply returns to study, preserving position and returning focus to `#menuButton`; from General or Extra, it switches to Technician/All and restores Technician's own saved position and bookmark while leaving the other pool's progress/bookmark exactly as left (verified by switching back and re-reading it); from a temporary Study scope, scope becomes "All questions"; theme, Study order, recall delay, and exam-timer preference all survive (checked directly against the canonical `localStorage` document); no new network requests occur and the canonical document's key set is unchanged (`schemaVersion`/`preferences`/`study`, with `preferences` and the Technician pool entry both still exactly their existing key sets — no new storage key or schema field); the button stays visible with no console errors in light/dark/night, and fits the 320×568 viewport with no horizontal overflow. The existing "jargon-light hobby orientation" list (POTA, hiking/camping/mobile, satellites/ISS, digital modes, emergency/public-service, clubs/mentors/home stations) is unchanged and reverified; existing Getting Started, Help, `@storage`, study-scope, and Mock Exam tests all pass unmodified except the one pre-existing assertion for the old "A simple path" wording, updated to match the new compact phrasing.

The normal suite loads the actual release artifact through a `file://` URL, matching the offline distribution model rather than relying on a development server.

The PWA suite covers Chromium desktop and mobile WebKit. Both engines verify the complete app shell is present in Cache Storage. Chromium additionally performs a browser-level offline reload; Playwright WebKit cannot navigate while its test context is forced offline, so real Safari installation remains a release check.

The PWA suite also verifies the build-generated CSP, confirms inline JavaScript does not use `unsafe-inline`, and rejects cross-origin runtime requests.

## Running tests

### Choosing an efficient verification scope

Use the smallest scope that proves the change, while preserving full release
validation. `npm run test:routine` (T2 of
[TEST_EFFICIENCY_PLAN.md](TEST_EFFICIENCY_PLAN.md)) is implemented and measured;
it is a between-release confidence check, not a replacement for `npm test` on a
release candidate or for the deployment-gate command, which is unchanged.

| Change | Initial verification |
| --- | --- |
| Markdown only | Check links/content and `git diff --check`; no browser suite |
| Help/template copy or link | Build once; affected Help/template browser tests |
| Pure engine/validator/build logic | Relevant Node tests; browser integration only when generated behavior changes |
| Theme/native control/focus | Build; affected tests on relevant engines, including WebKit |
| Layout/touch behavior | Build; affected responsive sizes and relevant engines |
| Service worker/cache/installation | Build; affected hosted PWA tests |
| Test selection/config/workflow | Inspect/list selection first; execute the changed path once after it stabilizes |
| Broad cross-cutting change spanning several areas above | `npm run test:routine` (audited standalone union, 977 executions as of the newcomer onboarding clarity follow-up — re-check with `test:routine:list`; see below) |
| Release candidate | Full required matrix and manual gates; do not substitute targeted results |

These are starting scopes, not ceilings: expand when risk or a reproduced
failure warrants it and explain why. Raw Playwright and `test:pwa` do not
rebuild. The tagged npm scripts do rebuild; avoid stacking them just to repeat
the same build. Do not remove isolated fixture builds from build-gate tests.

### Required review questions for new tests and build changes

1. Why is this a Node or browser test? Does equivalent coverage already exist?
2. Which engines/viewports add distinct evidence? What is the expanded test
   count, including internally parameterized viewport loops?
3. Are waits condition-based or clock-controlled? If not, why is real elapsed
   time necessary? Do not weaken timer or transition assertions to save time.
   For a *repeating* interval (`setInterval`), advance a fake clock with
   `page.clock.runFor(ms)`, not `fastForward(ms)` -- the latter only fires a
   due repeating timer at most once per call (it simulates a suspend/resume,
   e.g. a closed laptop lid, not elapsed real ticks) and will silently
   under-count every decrement for something like the study recall
   countdown. Also install the clock and reload before interacting, rather
   than installing over an already-navigated page: `page.clock.install()`
   only mocks timers *created after* install, so the page's very first
   interval (already running under the real clock from an earlier
   navigation) is a genuine real timer it cannot adopt, and it keeps ticking
   in the background in real wall-clock time -- a source of exactly the kind
   of flakiness this rule exists to prevent (see `tests/responsive-shell.spec.js`'s
   Stage 6A3 tests for the pattern).
4. Does the command build fresh artifacts exactly where needed and propagate
   failures? Can it accidentally test stale output or duplicate selections?
5. What is the expected execution cost? After running, what was the actual
   duration and retry count? Do not run a broad benchmark just to fill a field;
   state when a measurement is unavailable.
6. Does this change coverage or release/deployment gates? Document the tradeoff
   and approval. Preserve the full matrix and explicit manual limitations.

For routine local browser runs, use `--workers=1` and execute suites
sequentially unless a measured need justifies more. CI parallelism requires a
bounded measurement of both elapsed time and runner cost. Increasing a timeout
provides capacity, not efficiency; retries must not conceal persistent defects.

Save needed evidence outside `test-results/` before another Playwright run,
which can clear that directory. Record the tested commit and working-tree
changes, commands/results/skips/retries, environment, duration where available,
and outstanding checks in a durable handoff. Prior results must be attributed
and applicable to the current inputs, not silently presented as fresh runs.

### Routine verification (`npm run test:routine`)

```bash
# List the routine selection without launching a browser (fast sanity check)
npm run test:routine:list

# Build once, then run Node tests, the routine standalone selection, and the
# PWA suite in sequence, printing per-phase and total timing; stops at the
# first failed phase and propagates its exit status
npm run test:routine
```

`test:routine` runs, strictly in order and stopping at the first failure, five
phases: `npm run build` once, `npm run test:unit`, the standalone union
defined in `playwright.routine.config.js` (one worker, 977 executions as of
the newcomer onboarding clarity follow-up), the `@storage` cases via `playwright.storage.config.js` (Stage
4A2; chromium-desktop only), then `npm run test:pwa`. See
[TEST_EFFICIENCY_PLAN.md](TEST_EFFICIENCY_PLAN.md) for the exact standalone
selection, the measured local run (currently ~20.5 minutes for the original
four phases; the `storage` phase was added afterward and has not yet been
folded into a fresh end-to-end measurement — see that document's "Later
additions" note), and its current status.

Use it as a between-release confidence check after a change that is broader
than one of the scoped rows above, or before handing work off for review. It
is not a release gate: `npm test` (`test:full`) remains the required
pre-release/deployment command. **CI (Stage 5B2):** pull requests are
verified by `.github/workflows/verify-pr.yml`, which runs `test:routine` plus
`npm run test:generated` (see "Generated-artifact freshness" below) instead
of the full matrix; the GitHub Pages deployment workflow
(`.github/workflows/deploy-pages.yml`, push to `main`) still runs the full
`npm test` gate unchanged, with the same freshness check added as one more
step after it. `test:routine` also does not replace the tag-scoped
`test:smoke`/`test:compat`/`test:responsive` commands for a narrowly-scoped
change — those remain cheaper when only one tag's coverage is relevant.

`test:routine` is dependency-free (Node core `child_process` only) and spawns
every phase with an explicit executable/argument array and `shell: false` — no
shell interpolation. On SIGINT/SIGTERM it signals the active phase's whole
process group (POSIX) or its process tree via `taskkill /t` (Windows), not
just the immediate child, so an npm phase's Node subprocess or Playwright's
worker/browser descendants are terminated too, not left behind; a descendant
that itself starts a new session (e.g. `setsid()`) is a documented residual
limit of this approach. An interrupted run always exits nonzero rather than
reporting success, including a signal that lands in the gap between two
phases. Its orchestration logic (phase order, argument construction, failure
propagation, and signal/process-tree handling) is covered by
`tests/unit/run-routine-tests.test.js`, part of `npm run test:unit`.

After 30 minutes of exploratory investigation, provide a status checkpoint and
a bounded next action. Avoid inventing another inspection harness when existing
tests or saved evidence answer the question. Required release runs can continue
while making progress; the checkpoint is not a test timeout.

### Generated-artifact freshness (`npm run test:generated` / `check:generated`)

```bash
# Check the CURRENT working tree only -- does not rebuild. Use after another
# command (a manual `npm run build`, `test:routine`, or `npm test`) has
# already built.
npm run test:generated

# Build once, then check. Use when no prior build is guaranteed.
npm run check:generated
```

`scripts/check-generated.js` is a dependency-free freshness checker: it runs
`git status --porcelain=v1 --untracked-files=all --ignored=matching -- dist`
(an explicit executable/argument array, `shell: false` — no shell
interpolation, so it works correctly even when the repository's own path
contains a space) and fails if `dist/` differs from Git in *any* way — a
modified tracked file, a deleted tracked file, a rename, an untracked file, a
gitignored file (e.g. a stray `dist/.DS_Store` — `.DS_Store` is repo-ignored,
so without `--ignored=matching` it would read as clean despite being an
unexpected extra file), or any other unexpected extra generated file. `git
diff --exit-code` alone is deliberately not used, because it does not report
untracked or ignored files. Exit codes distinguish a genuine
freshness failure (`1`, entries printed one per line, sorted by path for
deterministic output) from Git itself failing to run (`2` — not a
repository, git missing, etc.); `0` means `dist/` exactly matches Git. The
checker only ever reads Git state; it never writes, stages, resets, or checks
out anything. Covered by `tests/unit/check-generated.test.js` (isolated
temporary Git repositories per case, including a repository path containing a
space, a real gitignored file under `dist/`, injected Git-failure results,
and a real-subprocess CLI exit-code check), part of `npm run test:unit`.

CI runs `test:generated` after its own build step (`test:routine`'s build
phase in `verify-pr.yml`; `npm test`'s build step in `deploy-pages.yml`) —
never a separate rebuild — so it inspects exactly the tree that verification
just produced. A small, dependency-free static policy suite,
`tests/unit/workflow-policy.test.js` (also part of `npm run test:unit`),
line-anchors both workflow YAML files (not a general YAML parser) to guard
the PR/deployment policy itself: trigger type, permission scope, action
pinning, command order, and that neither workflow silently swaps its intended
test selection for the other's.

### Timing and timeout visibility

Time local verification, including the build when it is part of the command.
On this Linux workstation, for example:

```bash
/usr/bin/time -f 'Elapsed: %E | Exit: %x' npm run test:unit
/usr/bin/time -f 'Elapsed: %E | Exit: %x' npx playwright test tests/app.spec.js --grep 'help contains correct source and project links' --project=chromium-desktop --workers=1
```

`/usr/bin/time` reports wall-clock duration and the command's exit status; it
does not stop a slow run. Its formatting flags are GNU-specific; elsewhere use
the shell's `time` command and record the exit status separately. Preserve the
test command's exit status in automation; if piping output through `tee`, use
`set -o pipefail` in Bash so a successful logger cannot conceal failed tests.

Before a longer run, record its scope, expected duration (or "unknown — first
measurement"), worker count, and any test/job/outer timeout. During agent-run
verification, provide progress updates at least once a minute. If expected
duration is exceeded, inspect the latest progress and report the overrun. Do
not blindly rerun the suite or terminate a progressing release run merely
because a routine run would normally be shorter.

For interrupted/time-limited runs, record elapsed time, exit status or signal
when available, last completed phase, and unfinished work. Distinguish test
assertion timeouts, job-level deadlines, and agent/session limits. Passing
cases before interruption do not establish a passing suite. External session
termination may prevent a final timing summary, so progress must not exist
only in the agent's final message.

CI timeouts must be compared with successful **end-to-end job** measurements,
including dependency/browser installation, build, all suites, and artifact
upload. Record queue time separately. Leave explicit headroom for variability;
do not choose a deadline from just one local browser-test duration. The former
30-minute deployment timeout is a concrete example of an inadequate job budget.

T2/T4 of the efficiency plan will add structured phase timing and CI summaries;
the documentation here does not claim an automatic warning/watchdog exists yet.

### Available commands

```bash
# Build and run the full suite (unit + standalone matrix + @storage + PWA)
npm test

# Engine unit tests only (no browser)
npm run test:unit

# Tag-scoped runs (each rebuilds first)
npm run test:smoke        # @smoke on chromium-desktop
npm run test:compat       # @compat on chromium/firefox/webkit desktop + webkit-mobile
npm run test:responsive   # @responsive on chromium/webkit mobile + tablet

# Standalone matrix without rebuilding
npx playwright test

# Hosted PWA tests only
npm run test:pwa

# Stage 4A2 focused storage-integration tests (@storage on chromium-desktop only;
# outside the release matrix and routine union -- see tests/storage.spec.js).
# `npm test`, `test:routine`, and `test:storage` all run these; `test:storage:run`
# is the no-build variant they call, for running the suite again without rebuilding.
npm run test:storage
npm run test:storage:run

# A specific browser project
npx playwright test --project=webkit-mobile

# Focused Stage 6A scoped-study tests only (chromium-desktop first while
# developing; add other projects once stable -- see tests/study-scope.spec.js)
npx playwright test study-scope.spec.js --project=chromium-desktop

# UI debugger / HTML report
npx playwright test --ui
npx playwright show-report
```

## Installing browsers

After a fresh clone, install the Playwright browser binaries:

```bash
npx playwright install chromium firefox webkit
```

## Test file structure

Test cases are split across several files by area:

- `tests/unit/version-label.test.js` — pure Node (`node --test`) direct unit
  tests for `scripts/version-label.js`'s `deriveVersionDisplay` (Stage 5B1):
  a stable version has no suffix; a beta prerelease gets `(beta)`; a non-beta
  prerelease gets `(prerelease)`, never `(beta)`; classification looks at the
  parsed prerelease identifier's first segment, not merely at the hyphen (an
  identifier merely starting with "beta" as a substring, or "beta" appearing
  later than the first segment, does not count); and a malformed version
  throws a descriptive error. Runs without a browser via `npm run test:unit`.
- `tests/unit/check-generated.test.js` — pure Node (`node --test`) unit tests
  for `scripts/check-generated.js` (Stage 5B2), using isolated temporary Git
  repositories (never the real project repo): clean/modified/deleted/
  untracked/renamed/gitignored (e.g. `.DS_Store`) dist/ content, multiple
  simultaneous changes with deterministic path-sorted output, a repository
  path containing a space, a non-repository directory, injected Git
  spawn/signal/nonzero-exit failures, the real CLI's three distinct exit
  codes (0 clean / 1 stale / 2 Git couldn't run), and that checking never
  mutates the repository it inspects. Runs without a browser via `npm run
  test:unit`.
- `tests/unit/workflow-policy.test.js` — pure Node (`node --test`) static
  policy tests for `.github/workflows/{verify-pr,deploy-pages}.yml` and the
  related `package.json` scripts (Stage 5B2): narrowly-scoped, line-anchored
  extraction of `run:`/`uses:`/`permissions:` structure (not a general YAML
  parser) proves the PR workflow triggers only on `pull_request`, pins every
  action to a commit SHA, grants only `contents: read`, runs `test:routine`
  then `test:generated` and never the full `npm test` gate or a deployment
  action; and that the deployment workflow still runs the full `npm test`
  gate, still deploys to Pages, gained `test:generated` after `npm test`, and
  never substitutes `test:routine` for its full gate. Runs without a browser
  via `npm run test:unit`.
- `tests/unit/routine-routing.test.js` — pure Node (`node --test`) policy
  tests for the routine/full-matrix project routing (Stage 5B3), via real
  `playwright test --list --reporter=json` calls (fast, ~1s each, no browser
  launched): the routine selection has no duplicate (file, line, title,
  project) pair; all three desktop projects run the identical, complete
  logical test set; webkit-mobile runs exactly the `@compat`-OR-`@responsive`
  set; the three mobile/tablet-only projects each run exactly the
  `@responsive` set; the routine selection never covers a test/project pair
  the full matrix doesn't also cover; and every one of the full matrix's nine
  projects runs the identical, complete logical test set. Every comparison
  uses a stable per-test identity (`file::line::title`, unique because two
  `test(...)` calls cannot share a source line) rather than a bare title, so
  two same-named tests in different files or describe blocks are never
  conflated (a review fix); 5 synthetic cases against hand-built fake reports
  (no Playwright subprocess) exercise the identity/collection logic directly,
  including a same-leaf-title-in-different-files case a title-only Set would
  wrongly collapse. This encodes, as a standing regression test, the audit
  the original T2 work performed manually. Runs via `npm run test:unit`.
- `tests/unit/question-bank.test.js` — pure Node (`node --test`) direct unit
  tests for `scripts/question-bank.js` (Stage 5B4), the base question-bank
  schema validator: the real Technician/General/Extra banks validate with
  zero errors; positive cases (minimal valid question, empty `ref`, valid
  `figure`, no mutation, determinism); bank-level shape (null/object/string/
  empty-array bank); question-entry shape (null/array/primitive/custom-
  prototype question rejected, null-prototype accepted, inherited
  properties -- via temporary `Object.prototype` pollution with guaranteed
  cleanup -- never satisfy required fields); every required field's absence
  reported (individually and in combination, deterministically); unknown
  top-level fields rejected (sorted in the diagnostic); every scalar's wrong
  type/blank/whitespace-only value; duplicate IDs; `choices` shape (missing/
  unexpected/non-string/blank keys, inherited keys not satisfying A-D,
  null-prototype accepted); `correct`/`correctText` validity and their
  cross-check (skipped, not double-reported, when `correct` itself is
  invalid); and that `validateQuestionBank` returns structured errors while
  `assertQuestionBank` throws one aggregated error. Runs without a browser
  via `npm run test:unit`.
- `tests/unit/exam-engine.test.js` — pure Node (`node --test`) unit tests for the
  selection engine: canonical pool configuration values (read from the real
  `data/pools.json`, Stage 5A), the seeded RNG, group balancing, determinism,
  withdrawn-ID exclusion, source-bank immutability, and malformed input (a
  missing or mismatched `poolConfig` argument). Runs without a browser via
  `npm run test:unit`.
- `tests/unit/build-gate.test.js` — drives the real `node scripts/build.js` in
  isolated temp-repo fixtures. A `build question-bank gate (Stage 5B4)` block
  proves `scripts/question-bank.js` runs as the FIRST gate `loadPool()`
  reaches, before every other gate and any `dist/` mutation: a missing
  required field, a wrong `q`/`ref` type, malformed/missing/extra `choices`
  (grouped, each diagnostic asserted individually), a duplicate ID, an
  invalid `correct`, a mismatched `correctText`, an empty bank (proving gate
  ORDER -- it fails here, not at the pool-registry's `expectedCount` check,
  which would also be true), and an unknown top-level field -- each aborting
  nonzero with no `dist/` created; one case also seeds a seeded `dist/` and
  confirms it stays byte-identical. The mandatory figure-manifest gate's
  failure modes, and (Stage 3A) the inline figure registry (14 figures once each,
  matching validated asset bytes and alt text; both release targets; no separate
  PWA figure files) plus the standalone byte-budget check — including that an
  oversized final HTML fails before any `dist/` output and leaves a pre-existing
  tree byte-identical. Stage 4A0 cases cover the pool-registry gate (missing
  file, malformed JSON, tampered registry — each aborting nonzero and naming
  the file or listing the error, with `dist/` preserved or never created) and
  the `window.HAM_EXAM_POOLS` embedding (exactly once per target, public
  identity fields only, repeat build byte-identical, and — Stage 6A1 —
  `scopeLabels` embedded with real content, e.g. Technician `T1A`'s real
  title). A `build scope-labels gate (Stage 6A1)` block: a missing
  `scopeLabels` field, a code outside `groupBlueprint`, a blank title, an
  overlong title (over `MAX_SCOPE_LABEL_LENGTH`) — each aborting nonzero and
  naming the validation error, with `dist/` preserved or never created.
  Stage 4A1 adds two cases: `src/storage.js` is inlined exactly once per document (via a unique
  function-name marker) and is consumed through exactly one adapter
  construction call site with no direct `localStorage` access anywhere in the
  generated documents (see `tests/unit/storage.test.js` for the module's own
  coverage); and a
  renderer regression proving `render()`'s placeholder substitution inserts
  arbitrary inlined source content — including a sentinel containing all
  four special `String.replace()` sequences (`$&`, `` $` ``, `$'`, `$$`) —
  completely literally, never interpreting them. A `release version display
  (Stage 5B1)` block drives fixture `package.json` versions through the real
  build: a beta version (deliberately different from the real checked-in one)
  renders `(beta)` in both generated documents' footer and embedded
  `window.HAM_EXAM_VERSION_DISPLAY`; a stable version (`0.3.0`) renders the
  plain version with no `(beta)` anywhere in either document; a non-beta
  prerelease (`0.3.0-rc.1`) renders `(prerelease)` and is never labeled beta;
  package.json's raw version is confirmed as the only authority (the
  undecorated `window.HAM_EXAM_VERSION` embed always matches the fixture
  exactly); and a malformed version still aborts the build before any `dist/`
  output, unchanged from before.
- `tests/unit/storage.test.js` — pure Node unit tests for `src/storage.js`
  (Stage 4A1): `createDefaultState`/`validateState`/`normalizeState` against
  every root/preferences/study/pool/scope/positions/bookmark field (unknown
  keys, allowed enum values, bank membership, bounds); `migrateLegacy` against
  every malformed legacy-index form, index zero/last/out-of-range, malformed
  bookmark JSON, cross-pool/duplicate bookmark IDs, and independent-field
  recovery; `reconcileState` for same-edition revision bumps (retaining valid
  IDs) versus replacement-edition/rollback-mismatch resets (even when the new
  bank reuses the same ID strings), with unaffected pools/preferences
  untouched; `resolveState`'s full state-precedence policy (valid canonical
  wins, absent/malformed/not-plausibly-schema-1 canonical recovers from
  legacy, future/older schemas are preserved and marked non-writable);
  `safeParseJson`/`safeSerialize` against oversized and cyclic input; the
  injected-storage adapter's cached availability probe (never overwriting an
  existing probe-key value), one-`setItem` writes with read-back validation,
  structured failure on a throwing/quota-full/corrupting storage
  implementation, and refusal to overwrite a future-schema value; module-import
  purity (no I/O, no `window` creation in Node, no `localStorage` touched when
  loaded in a browser-like sandbox, `src/app.js` referencing the adapter
  exactly once with no direct `localStorage` access); and a
  small real-`data/pools.json`-and-banks contract check. (Stage 6A6) the
  `studyOrder` preference: default, strict validation of every allowed/
  rejected value, `normalizeState` backfilling a missing OR invalid value to
  the default, `isValidExceptEditionDrift` tolerating a MISSING value (real
  pre-Stage-6A6 data) while still rejecting a present-but-invalid one exactly
  like an invalid theme, `resolveState` reconciling the former in place
  (preserving every other real preference/bookmark/position) while routing
  the latter through full legacy recovery, a future schema staying untouched
  even if it happens to carry a `studyOrder`-shaped field, and a save()/
  load() round trip plus a write-failure case through the injected adapter.
  Uses tiny synthetic registries/banks throughout, per the project's
  efficiency policy of using the lowest sufficient layer and reserving real
  data for a dedicated check.
- `tests/unit/pool-registry.test.js` — pure Node unit tests for
  `scripts/pool-registry.js`: the real `data/pools.json` against the real
  banks, plus synthetic negative fixtures (bad schemaVersion, missing/extra
  pools, key/poolKey mismatch, duplicate identities, missing/unknown fields,
  wrong types, bad/reversed/non-calendar dates, count mismatches, wrong ID
  prefix, duplicate/malformed/cross-pool question IDs, `sub` inconsistency,
  and (Stage 5A) the mock-exam fields — non-positive/out-of-bound
  `examQuestionCount`/`passingScore`/`defaultTimeLimitSeconds`, malformed or
  cross-pool `withdrawnIds`, and malformed/cross-pool/non-positive/impossible/
  mismatched-total `groupBlueprint` entries; and (Stage 6A1) `scopeLabels` —
  valid custom labels, a missing/non-object `scopeLabels`, an unknown key
  inside it, a non-object `subelements`/`groups` collection, a code absent
  from `groupBlueprint`, a code from another pool's prefix, a missing
  subelement/group title, a blank/non-string/whitespace-padded title, a
  title over (and exactly at) `MAX_SCOPE_LABEL_LENGTH`, and malformed
  metadata shapes — plus a validator-purity check on deep-frozen inputs. Two
  real-data checks (independent-review follow-up) against the shipped
  `data/pools.json`: every group label stays within a concise on-mobile
  readability target (56 characters, with two named exceptions for the
  official-text disambiguation of same-pool collisions — see
  `docs/SCOPED_STUDY_PLAN.md`), and no two groups in the same pool share an
  identical label.
- `tests/unit/study-scope.test.js` — pure Node unit tests for
  `src/study-scope.js` (Stage 6A), the transient scoped-study filter module:
  every real pool's enumerated groups match real bank question prefixes, and
  a pool-prefix mismatch (e.g. a General group id against the Technician
  bank) is rejected; `enumerateScopes` sorting/deduplication; `validateScope`
  for all four levels including a registry-valid-but-bank-empty group and
  every malformed-input shape; `filterBankByScope` preserving original bank
  order (a deliberately non-ID-sorted synthetic fixture proves this isn't
  accidental), returning a new array, and never mutating its inputs;
  `resolveScope`'s fallback to `all` for an invalid or now-empty scope (the
  "stale scope after a pool change" case) and its determinism; `describeScope`
  and `defaultScope` (independent object instances per call); and
  `groupOf`/`subelementOf` id parsing. Runs without a browser via `npm run
  test:unit`.
- `tests/app.spec.js` — standalone study-mode Playwright tests: page load,
  navigation, reveal, recall timer, pool switching, theme, reset, bookmarks,
  Help/About, keyboard tab order, startup diagnostics and username/path
  redaction, the study-timer suspend/resume around Mock Exam, and (Stage 3A)
  study-mode figure rendering — correct loaded image / caption / alt for
  figure-bearing questions across all three pools, shared-figure reuse, no stale
  image on figure↔non-figure navigation, pool-switch and reload selection, no
  horizontal overflow, no network requests, and the unchanged figure CSP.
  (Stage 3C) the shared figure viewer from study mode — opens in fit mode with
  the right caption/alt/registry image, actual size shows intrinsic pixels and
  scrolls, fit re-constrains, every open resets to fit, keyboard-only
  open/mode-switch/close, Tab/Shift+Tab containment with background controls
  covered, Escape and Close both restore focus to the opener, a question change
  dismisses a stale viewer without trapping focus, the recall timer keeps
  running while open, no enlarge button for non-figure questions, no duplicate
  IDs, the selected view-mode control meeting 4.5:1 contrast in light / dark /
  night, and responsive fit/scroll with reachable controls. (Stage 6A4) the
  "New to Amateur Radio?" newcomer section: it is the first section in Help
  content; all 7 required links (FCC, ARRL Getting Licensed, ARRL Find an
  Exam Session, NCVEC Official Question Pools, ARRL Find a Club, ARRL:
  Software Defined Radio, Wikipedia: Software-defined radio) are present
  with descriptive text (not raw URLs) and the exact expected `href`; the
  SDR paragraph names "independently operated receiver directories" as
  outside this app's control and never claims "no license needed to
  listen"; the listening-never-authorizes-transmitting wording is present;
  the corrected progress-persistence wording (only "All questions"
  is saved per pool, a Study scope is temporary and resets on reload,
  browsing inside one never overwrites the saved full-pool position) and the
  unchanged drawer timer-pause sentence are both present; a newcomer link is
  keyboard-focusable with the correct accessible name; the section stays
  visible with no console errors across light/dark/night and at the 320×568
  viewport; and opening Help with the section present makes no network
  requests (the links are plain, unfetched `<a href>` markup). (Stage 6A5)
  the "Getting Started" newcomer guide: Help shows the short intro sentence
  and "Open Getting Started" button; the guide's heading, image (a `data:`
  URI, not a network request), caption, body content (POTA, hiking/camping/
  mobile, satellites/ISS, digital modes, emergency/public-service, home
  stations/clubs/mentors, and the learn → practice → exam → participate
  path), and all 5 "Learn more" links (FCC, ARRL, POTA, ARISS, AMSAT) are
  present with descriptive text and HTTPS `href`s; the guide opens from
  Help's button and from a `#getting-started` deep link; its Back button,
  Escape, and the browser Back button each step it back to Help (Escape/Back
  button replace the history entry so the browser Back button does not
  bounce forward into the guide); a second Escape/Back-button press from
  Help then closes to study, matching Help's own behavior; Tab never reaches
  a hidden study or Help control while the guide is open; the guide is
  visible with no console errors across light/dark/night and at the 320×568
  viewport; opening it makes no network requests; and opening it pauses the
  recall countdown exactly like Help, resuming it, not resetting it, once
  back in study. (CTA discoverability follow-up) the "Open Getting Started"
  button's own `#guide-cta` wrapper is visible when Help opens; the button
  stays a real, keyboard-focusable `<button>` with its expected accessible
  name; its computed background-color and border-color differ from an
  ordinary Help section's (proving visual distinctness without a
  screenshot); it meets the 44px touch target and stays nearly full-width
  with no horizontal overflow at 320×568; and it stays visible, non-
  transparent, and clickable in all three themes. (Newcomer onboarding
  clarity follow-up) the guide's opening paragraph names the US FCC exam
  study app and all three license classes; `#startTechnician` ("Start with
  Technician") is a real, keyboard-focusable button with that exact
  accessible name; clicking it from Technician/All is a no-op return to
  study preserving position and focus; from General or Extra it switches to
  Technician/All and restores Technician's own saved position/bookmark while
  the other pool's progress/bookmark (re-read after switching back) is
  untouched; a temporary Study scope becomes "All questions"; theme, Study
  order, recall delay, and exam-timer preference all survive (read directly
  from the canonical document); no network requests fire and the canonical
  document's key set (`schemaVersion`/`preferences`/`study`, and each pool
  entry's own keys) is unchanged; and the button stays visible with no
  console errors in all three themes and at the 320×568 viewport.
- `tests/exam-engine.spec.js` — a small Playwright integration check that the
  engine is inlined into `dist/index.html` and does not break study-mode startup.
  (Engine logic is unit-tested in `tests/unit/exam-engine.test.js`.)
- `tests/mock-exam.spec.js` — Mock Exam setup, session, scoring, submission,
  results/review, retake, focus management, the question-specific answer-group
  legend, the native subelement results table, the active-study-pool default,
  memory-only session/results storage, and the practice countdown timer
  (including fake-clock tests). (Stage 3B) figure rendering in active exam
  questions and the results review, driven by deterministic sessions built by
  replacing the live session's question list: correct caption / alt / registry
  data URL / dimensions / loaded image for figure questions from all three
  pools, figure↔non-figure↔figure navigation with no stale content and answers
  preserved, the answer fieldset keeping its legend and keyboard radio group
  with a figure present, one review figure per figure-bearing question with
  shared figures reusing one registry data URL, no duplicate DOM IDs in the
  results panel, retake clearing prior results, return-to-study restoring the
  prior study question and its figure, a missing registry entry clearing stale
  content, and responsive sizing in both exam contexts. (Stage 3C) the shared
  figure viewer from an active exam and from results review — opens with the
  right caption/registry image, Close/Escape restore focus to the exact opener
  (two results entries sharing one figure return to their own button),
  question-change / retake / return-to-study dismiss a stale viewer, opening
  changes no answers or session state, keyboard containment, responsive use,
  and — in the fake-clock suite — a practice-timer expiry while the viewer is
  open still submits normally and focuses the results heading. (Stage 4B)
  active-exam `beforeunload` protection — a dispatched, cancelable
  `beforeunload` event's `defaultPrevented` result (never a real browser
  dialog) is checked across every production lifecycle transition: not
  protected in study mode or exam setup; protected the instant an exam
  starts, even unanswered; still protected after answering, navigating,
  pausing, and opening/closing the figure viewer; not protected after
  explicit exit, normal submission, or (fake-clock) timer-expiry
  auto-submission; protected again after retake; not protected after
  returning to study; and a repeated start/exit and submit/retake cycle
  neither accumulates protection nor drifts from the expected result.
- `tests/pwa.spec.js` — installability, complete app-shell caching, offline
  reload, generated CSP, cross-origin request rejection, (Stage 3A) that an
  embedded figure still displays after an offline reload (Chromium),
  (Stage 3B) that figures render in an active mock exam and its results review
  after an offline reload (Chromium), (Stage 3C) that the figure viewer
  opens offline with a loaded image, switches to a scrollable actual-size view,
  and restores focus on close (Chromium), (L1) that the settings drawer
  opens and switches pools while offline (Chromium), and (Stage 4A2/4A3/6A6)
  that the canonical study state (position, bookmark, theme, recall delay,
  and Study order) is restored after an offline reload (Chromium).
- `tests/storage.spec.js` — Stage 4A2/4A3/6A6 focused Chromium-only integration
  tests (tag `@storage`, one project via `playwright.storage.config.js`, 34
  cases): complete and partial/malformed legacy migration into the canonical
  document, migration rerun after a failed canonical write, canonical-over-legacy
  precedence, stable-ID (not numeric-index) positions, per-pool question
  restoration, bookmark/theme reload survival, reset-progress field
  preservation, future-schema non-overwrite, fully in-memory operation on
  throwing storage, Help/Mock-Exam transition state preservation, no exam
  data in storage after a full mock exam, zero canonical rewrites on an
  unchanged valid startup (observed through a `localStorage.setItem` spy),
  and (Stage 4A3) recall-delay persistence and restoration including `0`
  ("Never") and an immediate running-timer update; a `null` exam-timer
  preference selecting "Pool default" with its label resolving to 35 minutes
  for Technician/General and 50 for Extra; a fixed preference surviving
  setup close/reopen, exam-pool changes, and reload; `0` ("No timer")
  persisting distinctly from `null`; re-selecting "Pool default" persisting
  `null` again; future-schema non-overwrite and in-memory-only operation
  covering both new preferences; confirming no exam-session field is added
  to the canonical document by either; and (review fix) two cases exercising
  `startExam()`'s own timer-resolution branches directly — "Pool default"
  resolving to the correct `examSession.timeLimitSeconds`/`remainingSeconds`
  (2100 for a 35-minute pool, 3000 for Extra), and an unsupported injected
  duration (e.g. a short test-only option) being used as the exam's
  effective duration while the canonical `examTimerSeconds` preference is
  asserted unchanged both before and after starting that exam; and (Stage
  6A6) the default `studyOrder` and its `#study-order-select` control,
  persisting a change immediately, surviving reload, an existing
  pre-Stage-6A6 canonical document (no `studyOrder` field) reconciling
  safely to sequential with every other real field intact, future-schema
  non-overwrite, and in-memory-only operation on throwing storage. Deliberately
  excluded from the release matrix and the routine union; the decision logic
  underneath is owned by `tests/unit/storage.test.js`.
- `tests/responsive-shell.spec.js` — the L1 content-first responsive study
  shell: settings-drawer open/close via Menu, backdrop, Close, and Escape;
  focus moving into the drawer and being contained by Tab/Shift+Tab with
  background controls covered; ordinary dismissal restoring focus to Menu;
  every relocated setting (Pool, Reveal after, Theme, Mock Exam, Help & About,
  Reset progress) present and applying immediately without closing the
  drawer; Help/Mock Exam closing the drawer first with destination focus
  winning; the current-pool label staying synchronized; Pause/Resume shown
  only while relevant; the middle study
  scroller resetting on question navigation; the figure viewer preserving the
  study-scroll or page-scroll position on open/close from study and from an
  exam; the drawer and figure viewer never being open simultaneously; Help,
  exam setup, an active exam, and results all hiding the study shell and
  drawer; no duplicate IDs; no horizontal overflow and a reachable bottom bar
  at 320×568, 390×844, and 844×390 landscape; enlarged text not clipping
  top/bottom-bar labels; and the drawer animating when motion is not reduced
  but not when `prefers-reduced-motion: reduce` is set. (Stage 6A3, all
  deterministic fake-clock tests via `page.clock.runFor()` -- never
  `fastForward()`, which only fires a repeating interval at most once per
  call and would under-count every decrement -- each installing the clock
  and reloading before interacting, so the page's very first interval is
  itself fake-clock-controlled rather than a stray real one ticking in the
  background) opening the drawer pauses an active recall countdown at its
  exact remaining value; Close, Escape, and backdrop dismissal all resume
  it from that preserved value, never restarting the full delay; a
  countdown with recall delay "Never", an already-revealed answer, or an
  already-manually-paused timer is completely unaffected by opening or
  closing the drawer (a manual pause survives the round trip); changing
  Reveal delay, Pool, or Study scope while the drawer is still open all
  apply their own normal full countdown reset (review fix: the reset
  countdown stays paused behind the still-open drawer -- it does not
  visibly run until the drawer actually closes); opening Help
  or Mock Exam setup from an already-paused-by-the-drawer state leaves no
  stale interval running behind the destination; the same behavior holds
  once the drawer is closed and stays closed, across light/dark/night
  themes, and at the 320×568 viewport.
- `tests/study-scope.spec.js` — focused Chromium/cross-engine tests for the
  Stage 6A scoped-study drawer control and its effect on study mode: default
  state unchanged (`#scope-select` at `all`, `#scope-summary` hidden, the
  exact pre-Stage-6A `"Question N / M"` progress string); selecting a
  subelement and a group narrows the list and updates `#scope-summary` and
  the `"Question N of M"` progress format; Previous/Next respect the scoped
  list's own boundaries (not the full bank's); changing scope resets position
  to the start of the new list; switching pools resets scope to `all`;
  figures, bookmarks, and reveal all behave normally while scoped; a reload
  always returns to `all` (nothing is persisted); Mock Exam started while a
  narrow scope (11-question group) is active still draws a full 35-question,
  all-unique session including questions outside that scope; a return to
  `all` restores the exact full-pool question that was showing before
  scoping, including across a reload; Tab reaches `#scope-select` and Escape
  still closes the drawer normally afterward; and the selector stays usable
  with no page-level horizontal overflow at the 320×568 viewport. (Stage
  6A1) scope options read `"<code> — <title>"` from validated pool data for
  all three pools (a distinct real title/apostrophe per pool, not a shared
  placeholder); switching pools repopulates the selector with that pool's
  own labels, not stale ones; "All questions" and `#scope-summary` stay
  code-only, never showing a title; and a keyboard-selected option's
  accessible text (its own `textContent`, what a screen reader announces)
  matches the visible "code — title" label exactly. Theme (light/dark/night)
  coverage for `#scope-select` is shared with `responsive-shell.spec.js`'s
  existing native-`<select>` `color-scheme` regression test rather than
  duplicated here (see that file's bullet below). (Independent-review
  follow-up) the dataset's actual longest label (Extra `E7E`, 70
  characters) is selected at the 320×568 viewport and checked for a normal
  single-line control height (no forced wrap), no page-level horizontal
  overflow, and an unclipped full accessible-name string — the worst case,
  not an arbitrary short one. (Stage 6A6) Study order: Sequential matches
  the pool's own order exactly (traversing all of group `T1A`'s 11
  questions, small enough to click through completely and back); Random
  contains every question in the active scope exactly once, in a stable
  order across two full traversal passes (no reshuffle from rendering or
  navigation); changing Study order, the pool, or the Study scope each
  rebuild the list; the currently displayed question is preserved by stable
  ID across a Study-order-change rebuild; scoped random browsing never
  overwrites the saved full-pool position and returning to "All questions"
  restores it; bookmarks/reveal/navigation and a figure-bearing question's
  figure keep working under Random; Mock Exam stays fully independent of
  both Study order and the active scope; `#study-order-select` is keyboard-
  reachable within the drawer's existing focus trap, fits the 320×568
  viewport, renders in all three themes with no console errors, introduces
  no new network requests, and does not disturb the existing Stage 6A3
  drawer countdown-pause-for-the-whole-visit behavior.
- `playwright.config.js` — standalone suite: `testMatch` of `app.spec.js`,
  `exam-engine.spec.js`, `mock-exam.spec.js`, `responsive-shell.spec.js`, and
  `study-scope.spec.js` over 3 browsers × 3 viewports (9 projects), served
  from a `file://` URL.
- `playwright.pwa.config.js` — hosted PWA suite: `pwa.spec.js` over
  `pwa-chromium` and `pwa-webkit-mobile`, served from `http://127.0.0.1:4173`.

### Tagged suites

Playwright test titles carry tags so routine runs do not execute every case
across all nine projects:

| Tag | Purpose | Command | Projects |
|-----|---------|---------|----------|
| `@smoke` | Fast confidence check on core flows | `npm run test:smoke` | `chromium-desktop` |
| `@compat` | Cross-engine behavior, accessibility, and privacy | `npm run test:compat` | `chromium-desktop`, `firefox-desktop`, `webkit-desktop`, `webkit-mobile` |
| `@responsive` | Layout, overflow, and touch-target checks | `npm run test:responsive` | `chromium-mobile`, `chromium-tablet`, `webkit-mobile`, `webkit-tablet` |
| `@storage` | Stage 4A2/4A3 storage-migration and preference-persistence integration (decision logic owned by the Node unit suite) | `npm run test:storage` | `chromium-desktop` only, via `playwright.storage.config.js`; a dedicated project, not folded into the nine-project release matrix or the routine standalone selection |

`@storage` is nonetheless part of both required gates: `npm test` runs it
(via `test:storage:run`) after the full standalone matrix, and
`npm run test:routine` runs it as its own phase between the routine
standalone selection and the PWA suite — it is only excluded from the
*standalone test counts themselves* (the nine-project matrix and the routine
selection), not from either command's overall pass/fail gate.

`npm test` (alias `npm run test:full`) builds, then runs the unit tests, the
complete standalone matrix (`npx playwright test`), the `@storage` suite, and
the PWA suite.

## Interpreting failures

If a test fails, check:

1. Did `npm run build` succeed? `npm test` runs the build first.
2. Are the Playwright browsers installed?
3. Look at the trace and screenshots in `test-results/`.
4. Check the error message in the test output; console errors are captured automatically.

## Limitations

- These are browser-engine tests, not tests on physical devices.
- They catch most rendering, layout, and logic issues but cannot reproduce every real-world device quirk (e.g., specific OEM browser skins, very old iOS versions, or hardware limitations).
- Always do a quick manual check on an actual target device before a major release.
