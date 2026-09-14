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
//   chromium-desktop  all 181 tests
//   firefox-desktop   all 181 tests
//   webkit-desktop    all 181 tests
//   webkit-mobile     tests tagged @compat OR @responsive (53; a single grep
//                     alternation, so a test carrying both tags -- none do
//                     today -- would still run exactly once per project)
//   chromium-mobile   @responsive only (20)
//   chromium-tablet   @responsive only (20)
//   webkit-tablet     @responsive only (20)
//
// Expected total with the current inventory (181 logical tests): 656.
// Stage 4A2 note: the 13 `@storage` cases in tests/storage.spec.js are NOT in
// this selection -- they run only through playwright.storage.config.js
// (`npm run test:storage`, one chromium-desktop project). They were
// deliberately kept out of both the release matrix and this routine union;
// storage decision logic is owned by the Node unit suite, so the DOM wiring
// is verified once in one engine. This config's selection is unchanged
// (still 656; storage.spec.js is not in testMatch).
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
