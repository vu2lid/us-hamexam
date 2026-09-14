// Stage 4A2 focused storage-integration selection: the 13 @storage cases in
// tests/storage.spec.js, run once on Chromium desktop (see
// docs/TEST_EFFICIENCY_PLAN.md). This file exists so the storage-migration
// cases stay out of the nine-project release matrix and the routine union
// (their decision logic is owned by tests/unit/storage.test.js; one engine
// suffices for the DOM wiring). playwright.config.js and
// playwright.routine.config.js are unchanged and do not match this file.
const { defineConfig } = require('@playwright/test');
const fullConfig = require('./playwright.config.js');

function projectByName(name) {
  const found = fullConfig.projects.find(p => p.name === name);
  if (!found) {
    throw new Error(`playwright.storage.config.js: project "${name}" not found in playwright.config.js`);
  }
  return { ...found };
}

module.exports = defineConfig({
  testDir: './tests',
  testMatch: 'storage.spec.js',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: fullConfig.reporter,
  use: { ...fullConfig.use },
  projects: [projectByName('chromium-desktop')],
});
