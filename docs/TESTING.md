# Testing Guide

## Overview

Tests use [Playwright](https://playwright.dev/) to load the generated `dist/index.html` in real browser engines at multiple viewport sizes. This gives confidence that the single-file app works across desktop and mobile platforms.

A second Playwright configuration serves `dist/pwa/` over localhost so service-worker, manifest, icon, cache, and offline behaviors can be tested in a secure context.

## What is tested

The test matrix covers:

- **Browsers:** Chromium, Firefox, WebKit
- **Viewports:** mobile (375×667), tablet (768×1024), desktop (1280×720)

That is 3 browsers × 3 viewports = 9 project configurations.

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
14. **PII minimization** — visible diagnostics redact local usernames and omit the browser user agent and other browser fingerprints.

The normal suite loads the actual release artifact through a `file://` URL, matching the offline distribution model rather than relying on a development server.

The PWA suite covers Chromium desktop and mobile WebKit. Both engines verify the complete app shell is present in Cache Storage. Chromium additionally performs a browser-level offline reload; Playwright WebKit cannot navigate while its test context is forced offline, so real Safari installation remains a release check.

The PWA suite also verifies the build-generated CSP, confirms inline JavaScript does not use `unsafe-inline`, and rejects cross-origin runtime requests.

## Running tests

```bash
# Build and run all tests
npm test

# Run tests without rebuilding
npx playwright test

# Run only the hosted PWA tests
npm run test:pwa

# Run tests in a specific browser project
npx playwright test --project=webkit-mobile

# Run tests with the UI debugger
npx playwright test --ui

# Show the HTML report
npx playwright show-report
```

## Installing browsers

After a fresh clone, install the Playwright browser binaries:

```bash
npx playwright install chromium firefox webkit
```

## Test file structure

- `tests/app.spec.js` — all test cases.
- `playwright.config.js` — browsers, viewports, retries, and reporters.
- `tests/pwa.spec.js` — installability, cache, offline, and network-boundary tests.
- `playwright.pwa.config.js` — localhost PWA server and browser projects.

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
