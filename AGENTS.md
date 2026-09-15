# Agent Guide for `us-hamexam`

This document is for AI agents (and human contributors) working on the FCC Technician Ham Radio study app.

## Project purpose

An offline-first web app for studying the FCC Technician, General, and Extra Class Amateur Radio exams. The build produces a self-contained HTML file for desktop/local-file use and an installable PWA for HTTPS hosting, Apple Home Screen installation, and offline use after the first load.

## Repository layout

```
us-hamexam/
├── data/
│   ├── technician.json      # Technician question pool (source of truth)
│   ├── general.json         # General question pool (source of truth)
│   └── extra.json           # Extra question pool (source of truth)
├── src/
│   ├── index.html           # HTML template with placeholders
│   ├── style.css            # Styles
│   ├── app.js               # Vanilla JS application logic
│   └── pwa/                 # Manifest, service worker, install UI, and icons
├── assets/
│   └── app-icon-master.png  # Master application icon
├── scripts/
│   └── build.js             # Inlines src/ + data/ into dist/index.html
├── dist/
│   ├── index.html           # Generated single-file release artifact
│   └── pwa/                 # Generated installable web application
├── tests/
│   ├── app.spec.js          # Standalone cross-browser/viewport tests
│   ├── exam-engine.spec.js  # Exam selection-engine tests
│   ├── mock-exam.spec.js    # Mock-exam setup, session, scoring, and results tests
│   └── pwa.spec.js          # Install, cache, and offline tests
├── playwright.config.js     # Standalone test configuration
├── playwright.pwa.config.js # Hosted PWA test configuration
├── package.json
├── README.md
└── AGENTS.md                # This file
```

## Key constraints

1. **Preserve the standalone artifact.** Everything required by `dist/index.html` must remain inlined.
2. **Keep the PWA installable and offline.** `dist/pwa/` may contain its manifest, service worker, and local icons. It must make no external runtime requests.
3. **Maintain all three pools.** Technician, General, and Extra pools must remain available and selectable.
4. **No external dependencies.** Do not add CDN links, external fonts, images, or API calls.
5. **No frameworks.** Keep the runtime as vanilla HTML/CSS/JS so it works on old/low-resource devices.
6. **Cross-platform.** The app must work on desktop Chrome/Firefox/Edge/Safari and mobile WebKit (iOS/iPad/Android).
7. **Offline.** The standalone file works immediately offline; the PWA works offline after its first successful HTTPS load.

## Common commands

```bash
# Build the standalone file and installable PWA
npm run build

# Run cross-browser tests (builds first)
npm test

# Install/update Playwright browsers after a fresh clone
npx playwright install chromium firefox webkit
```

## How to make changes

1. Edit source files under `src/` or `data/`.
2. Run `npm run build` to regenerate `dist/index.html` and `dist/pwa/`.
3. Choose verification using the efficiency policy below. Run `npm test` for
   release/full-integration gates; ordinary slices use relevant targeted checks.
4. Commit source changes and both regenerated release targets.

## What to watch out for

- **iOS/Safari compatibility:** Avoid `JSON.parse` on `textContent` of `<script type="application/json">`; Safari/WebKit can garble UTF-8 characters. The current build embeds the question banks as an explicit `window.HAM_EXAM_BANKS` assignment.
- **Apple file previews:** Files/Quick Look can render HTML without running JavaScript. iPhone and iPad users should use the HTTPS PWA in Safari.
- **PWA scope:** Keep manifest, service-worker, icon, and registration URLs relative so GitHub Pages project paths work.
- **Touch targets:** Keep buttons and interactive elements large enough for touch (minimum ~44×44 px).
- **Viewport:** Do not break the responsive layout; test mobile/tablet/desktop viewports.
- **File size:** Keep `dist/index.html` reasonably small. Minify JSON and CSS where possible.
- **Question bank format:** Each entry must have `id`, `sub`, `q`, `choices` (object with A/B/C/D), `correct` (letter), `correctText`, and `ref`.
- **Figure references (optional `figure` field):** A question that references an official NCVEC diagram — its prompt or a choice contains a `figure <id>` mention (case-insensitive; Technician and General use lowercase `figure`, Extra uses `Figure`) — also carries an optional `figure` field holding the normalized uppercase figure ID (`T-1`, `G7-1`, `E9-3`; prefix `T`/`G`/`E` matches the pool). `scripts/build.js` calls `scripts/figure-references.js` while loading each pool and **fails the build** if a textual reference has no `figure` field, the field is malformed, cross-pool, non-normalized, or does not match the reference, or a question with no textual reference carries the field. Separately, `scripts/build.js` then calls `scripts/figure-manifest.js` to validate `data/figures.json` (the 14 figure *assets* under `assets/figures/`, their checksums, and the checksum-pinned source PDFs under `data/pool-sources/`) against all three pools, and **fails the build before writing anything to `dist/`** if that manifest, an asset, or a source PDF is invalid or missing. See `docs/FIGURE_PIPELINE.md`.

## Adding or editing questions

1. Modify the relevant pool file under `data/` (`technician.json`, `general.json`, or `extra.json`).
2. Run `npm run build`.
3. Verify the question count and a few samples in `dist/index.html`.

## Adding a new question pool

1. Obtain the official NCVEC PDF for the pool.
2. Run `node scripts/extract-pool.js <pdf> data/<pool>.json`.
3. Validate the output and spot-check several questions.
4. Add the pool key and title to `src/app.js` and `scripts/build.js`.
5. Update `src/index.html` if needed.
6. Run `npm test`.

## Adding features

- Keep changes minimal and scoped.
- Prefer vanilla JS over libraries.
- If a new feature requires data, add it to the question bank or inline it at build time.
- Update `tests/app.spec.js` and `README.md` if user-facing behavior changes.

## Testing checklist before finishing

For ordinary slices, report applicable checks and explicitly list those not
run. The full checklist is a release/integration gate, not an instruction to
repeat the full matrix after every edit.

- [ ] `npm run build` succeeds.
- [ ] `npm test` passes all browser/viewport combinations.
- [ ] `dist/index.html` has no external `<link>` or `<script src>` references.
- [ ] `dist/pwa/manifest.webmanifest`, `sw.js`, and all icons are present.
- [ ] The PWA installs its service worker and caches the complete app shell.
- [ ] The app loads and the first question displays.
- [ ] Pool selector switches between Technician, General, and Extra.
- [ ] Per-pool progress is saved and restored after reload.
- [ ] Theme selector switches between Light, Dark, and Night themes.
- [ ] Selected theme is saved and restored after reload.
- [ ] Reset progress asks for confirmation and clears all per-pool indexes.
- [ ] Bookmark button toggles state, uses `aria-pressed`, and persists per pool.
- [ ] Bookmarks survive reload and are not cleared by reset progress.
- [ ] Navigation, reveal, pause/resume, and timer settings still work.
- [ ] Help & About opens and closes, preserves question/pool/theme/progress state, and displays version and pool metadata.
- [ ] Mock Exam setup starts a Technician/General/Extra session with the correct question count.
- [ ] Finish Exam submits the session; unanswered questions trigger a confirmation.
- [ ] Results show correct score, percentage, passing threshold, Pass/Needs review status, subelement breakdown, and review list.
- [ ] Return to study from results restores the prior study question, pool, theme, bookmarks, and progress.
- [ ] Retake exam starts a fresh in-memory session with empty answers.

## Build and test efficiency policy

Efficiency is a design and review requirement, not permission to weaken
assertions or skip required release gates. Follow docs/TESTING.md and the
current status in docs/TEST_EFFICIENCY_PLAN.md; do not assume proposed commands
already exist unless that plan records them as implemented.

`npm run test:routine` (T2 of docs/TEST_EFFICIENCY_PLAN.md) is implemented and
measured: build once, Node tests, an audited 656-execution standalone union
(`playwright.routine.config.js`, one worker), the 29 `@storage` cases
(`playwright.storage.config.js`, Stage 4A2/4A3), then the PWA suite, with
per-phase and total timing. `npm run test:routine:list` lists the standalone
selection without a browser. Use it as a between-release confidence check for
a change broader than one scoped row below; it is not a release gate — `npm
test` (`test:full`) and the tag-scoped commands are unchanged (though `npm
test` also now runs `@storage`, after its standalone phase), and the
deployment workflow still runs `npm test`.

- Before adding a test, select the lowest sufficient layer: Node for pure
  logic/build validation; browsers for DOM, focus, native controls, rendering,
  storage integration, CSP enforcement, and service workers.
- Explain each new test's required engines/viewports and tags. A new standalone
  test currently expands to nine executions in the full matrix. Avoid repeating
  a test's internally fixed viewport under multiple projects without a reason.
- Prefer fake clocks for timer semantics and observable-state assertions for
  asynchronous UI. New fixed sleeps require a documented reason; preserve
  deliberate real-animation coverage and meaningful assertions.
- Before running tests, state the scoped command(s). Use one worker for routine
  local browser checks unless there is a measured reason for more. Do not run
  concurrent overlapping suites or all scoped suites followed by the full suite
  against unchanged code without explaining the additional coverage needed.
- Build once per verification sequence when practical. Ensure browser tests
  exercise fresh generated artifacts. Isolated fixture builds that test build
  failures are intentional coverage and must not be removed as duplication.
- For test/config/build/workflow changes, report selection counts (`--list`
  before browser execution where relevant), expected cost, and measured duration
  when executed. Label estimates as estimates. Explain coverage reductions and
  obtain approval before changing deployment/release gates.
- Keep the full matrix available. Do not hide failures with extra retries,
  blanket skips, weaker assertions, or timeout increases presented as speedups.
- Reuse prior results only when tested source, artifacts, test configuration,
  and relevant environment match; distinguish prior evidence from your checks.
- Preserve needed reports/screenshots outside Playwright's disposable output
  directory before another run. Record a concise durable summary in the docs.
- At 30 minutes of exploratory testing/debugging, report progress and remaining
  questions before expanding the investigation. This checkpoint is not a reason
  to cancel a required release run that is making progress.
- Handoffs must name the tested commit/worktree, commands, pass/fail/skip/retry
  results, duration where available, checks not run, and the next bounded task.
- Time local verification commands and record elapsed time plus exit status.
  Before longer runs, state the expected duration and any configured timeout;
  provide periodic progress updates and investigate overruns instead of waiting
  silently. An interrupted or timed-out run is incomplete, never a pass. Shell
  timing alone does not enforce a timeout; see docs/TESTING.md.
