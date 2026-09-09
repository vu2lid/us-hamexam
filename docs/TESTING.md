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
6. **Pause / Resume** — pause stops the timer; resume continues it.
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

The normal suite loads the actual release artifact through a `file://` URL, matching the offline distribution model rather than relying on a development server.

The PWA suite covers Chromium desktop and mobile WebKit. Both engines verify the complete app shell is present in Cache Storage. Chromium additionally performs a browser-level offline reload; Playwright WebKit cannot navigate while its test context is forced offline, so real Safari installation remains a release check.

The PWA suite also verifies the build-generated CSP, confirms inline JavaScript does not use `unsafe-inline`, and rejects cross-origin runtime requests.

## Running tests

```bash
# Build and run the full suite (unit + standalone matrix + PWA)
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

# A specific browser project
npx playwright test --project=webkit-mobile

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

- `tests/unit/exam-engine.test.js` — pure Node (`node --test`) unit tests for the
  selection engine: `EXAM_CONFIG` values, the seeded RNG, group balancing,
  determinism, withdrawn-ID exclusion, source-bank immutability, and malformed
  input. Runs without a browser via `npm run test:unit`.
- `tests/unit/build-gate.test.js` — drives the real `node scripts/build.js` in
  isolated temp-repo fixtures: the mandatory figure-manifest gate's failure
  modes, and (Stage 3A) the inline figure registry (14 figures once each,
  matching validated asset bytes and alt text; both release targets; no separate
  PWA figure files) plus the standalone byte-budget check — including that an
  oversized final HTML fails before any `dist/` output and leaves a pre-existing
  tree byte-identical.
- `tests/app.spec.js` — standalone study-mode Playwright tests: page load,
  navigation, reveal, recall timer, pool switching, theme, reset, bookmarks,
  Help/About, keyboard tab order, startup diagnostics and username/path
  redaction, the study-timer suspend/resume around Mock Exam, and (Stage 3A)
  study-mode figure rendering — correct loaded image / caption / alt for
  figure-bearing questions across all three pools, shared-figure reuse, no stale
  image on figure↔non-figure navigation, pool-switch and reload selection, no
  horizontal overflow, no network requests, and the unchanged figure CSP.
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
  content, and responsive sizing in both exam contexts.
- `tests/pwa.spec.js` — installability, complete app-shell caching, offline
  reload, generated CSP, cross-origin request rejection, (Stage 3A) that an
  embedded figure still displays after an offline reload (Chromium), and
  (Stage 3B) that figures render in an active mock exam and its results review
  after an offline reload (Chromium).
- `playwright.config.js` — standalone suite: `testMatch` of `app.spec.js`,
  `exam-engine.spec.js`, and `mock-exam.spec.js` over 3 browsers × 3 viewports
  (9 projects), served from a `file://` URL.
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

`npm test` (alias `npm run test:full`) builds, then runs the unit tests, the
complete standalone matrix (`npx playwright test`), and the PWA suite.

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
