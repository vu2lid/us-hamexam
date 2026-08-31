const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: ['app.spec.js', 'exam-engine.spec.js', 'mock-exam.spec.js'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: `file://${process.cwd()}/dist/`,
    trace: 'on-first-retry',
    headless: true,
  },
  projects: [
    // Chromium
    { name: 'chromium-mobile', use: { ...devices['Pixel 5'] } },
    { name: 'chromium-tablet', use: { ...devices['iPad Mini'] } },
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },

    // Firefox
    { name: 'firefox-mobile', use: { browserName: 'firefox', viewport: { width: 375, height: 667 } } },
    { name: 'firefox-tablet', use: { browserName: 'firefox', viewport: { width: 768, height: 1024 } } },
    { name: 'firefox-desktop', use: { browserName: 'firefox', viewport: { width: 1280, height: 720 } } },

    // WebKit (closest to Safari / iOS)
    { name: 'webkit-mobile', use: { browserName: 'webkit', viewport: { width: 375, height: 667 } } },
    { name: 'webkit-tablet', use: { browserName: 'webkit', viewport: { width: 768, height: 1024 } } },
    { name: 'webkit-desktop', use: { browserName: 'webkit', viewport: { width: 1280, height: 720 } } },
  ],
});
