// Routine (T2) standalone selection: a smaller, audited union of the full
// nine-project matrix defined in playwright.config.js, for fast local/CI
// verification between full release runs. This file does not modify or
// import-and-mutate that matrix -- it requires it read-only and clones the
// specific project objects it reuses, so the two configurations cannot
// silently diverge in browser/device/viewport definitions while remaining
// fully independent files. playwright.config.js and its `npx playwright
// test` / `npm run test:standalone` behavior are unchanged by this file.
//
// Selection (see docs/TEST_EFFICIENCY_PLAN.md T1/T2 for the audit):
//   chromium-desktop  every logical standalone test
//   firefox-desktop   every logical standalone test
//   webkit-desktop    every logical standalone test
//   webkit-mobile     tests tagged @compat OR @responsive (a single grep
//                     alternation, so a test carrying both tags -- none do
//                     today -- would still run exactly once per project)
//   chromium-mobile   @responsive only
//   chromium-tablet   @responsive only
//   webkit-tablet     @responsive only
//
// The exact logical-test and per-project execution counts drift as tests are
// added; do not hardcode them here or trust an old comment -- run
// `npm run test:routine:list` (or the full `npx playwright test --list` for
// the release matrix in playwright.config.js) to get the authoritative
// current numbers. As of Stage 5B3 (2026-09-15): 192 logical standalone
// tests; this routine selection totals 696 executions (192 desktop x 3 +
// 60 webkit-mobile + 20 x 3 mobile/tablet); the full nine-project matrix
// totals 1,728 (192 x 9). Both were previously measured at 181 logical /
// 656 routine executions (Stage 4B added 11 tests, 7 tagged @compat, after
// that baseline) -- see docs/TEST_EFFICIENCY_PLAN.md's "Later additions"
// note for the full reconciliation.
// Stage 4A2 note: the `@storage` cases in tests/storage.spec.js (29 as of
// Stage 4A3) are NOT in this selection -- they run only through
// playwright.storage.config.js (`npm run test:storage`, one chromium-desktop
// project). They are deliberately kept out of both the release matrix and
// this routine union; storage decision logic is owned by the Node unit
// suite, so the DOM wiring is verified once in one engine (storage.spec.js
// is not in testMatch here or in playwright.config.js).
// firefox-mobile and firefox-tablet are intentionally excluded from this
// routine selection (full-suite-only); every logical test, including new
// untagged ones, is still covered on all three desktop engines above.
const { defineConfig } = require('@playwright/test');
const fullConfig = require('./playwright.config.js');

// Tag-selection regex, matching Playwright's own --grep semantics: a test
// title containing either tag matches once. Kept as a single pattern (not
// separate @compat and @responsive runs) so no test/project pair can appear
// twice even if a future test carries both tags.
const COMPAT_OR_RESPONSIVE = /@compat|@responsive/;
const RESPONSIVE_ONLY = /@responsive/;

function projectByName(name) {
  const found = fullConfig.projects.find(p => p.name === name);
  if (!found) {
    throw new Error(`playwright.routine.config.js: project "${name}" not found in playwright.config.js`);
  }
  // Shallow-clone so adding `grep` here can never mutate the cached,
  // shared playwright.config.js module object.
  return { ...found };
}

function fullProject(name) {
  return projectByName(name);
}

function taggedProject(name, grep) {
  return { ...projectByName(name), grep };
}

module.exports = defineConfig({
  testDir: fullConfig.testDir,
  testMatch: fullConfig.testMatch,
  fullyParallel: fullConfig.fullyParallel,
  forbidOnly: fullConfig.forbidOnly,
  retries: fullConfig.retries,
  // T2 default: one worker for routine local/CI runs (see
  // docs/TEST_EFFICIENCY_PLAN.md T2 and docs/TESTING.md). Overridable with
  // `--workers=N` for a measured exception, same as the full config.
  workers: 1,
  reporter: fullConfig.reporter,
  use: { ...fullConfig.use },
  projects: [
    fullProject('chromium-desktop'),
    fullProject('firefox-desktop'),
    fullProject('webkit-desktop'),
    taggedProject('webkit-mobile', COMPAT_OR_RESPONSIVE),
    taggedProject('chromium-mobile', RESPONSIVE_ONLY),
    taggedProject('chromium-tablet', RESPONSIVE_ONLY),
    taggedProject('webkit-tablet', RESPONSIVE_ONLY),
  ],
});
