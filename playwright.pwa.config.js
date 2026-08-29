const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: 'pwa.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  webServer: {
    command: 'node scripts/serve-pwa.js',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://127.0.0.1:4173/',
    trace: 'on-first-retry',
    headless: true,
  },
  projects: [
    { name: 'pwa-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'pwa-webkit-mobile', use: { ...devices['iPhone 13'] } },
  ],
});
