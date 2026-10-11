// Stage 8A2 isolation tests: both the US and synthetic edition PWA builds,
// served under separate paths on ONE origin (scripts/serve-editions.js), so
// tests/editions-isolation.spec.js can prove same-origin storage/cache/
// service-worker isolation rather than relying on browser origin
// partitioning to do that work. One engine suffices -- this is a logic
// proof about this repository's own namespace policy, not cross-browser
// compatibility (same reasoning as playwright.storage.config.js).
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: 'editions-isolation.spec.js',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  webServer: {
    command: 'node scripts/serve-editions.js',
    url: 'http://127.0.0.1:4174/index.html',
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://127.0.0.1:4174/',
    trace: 'on-first-retry',
    headless: true,
  },
  projects: [
    { name: 'editions-chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
