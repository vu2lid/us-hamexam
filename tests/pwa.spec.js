const { test, expect } = require('@playwright/test');
const APP_VERSION = require('../package.json').version;

test('manifest, install guidance, and icons are available', async ({ page, request }) => {
  await page.goto('index.html');
  await expect(page.locator('#question')).not.toBeEmpty();
  await expect(page.locator('#footer')).toContainText(`Version ${APP_VERSION} (beta)`);
  await expect(page.locator('#pwaInstall')).toBeVisible();
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    './manifest.webmanifest'
  );
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toContain("default-src 'self'");
  expect(csp).toMatch(/script-src 'self' 'sha256-/);
  expect(csp.match(/script-src[^;]*/)[0]).not.toContain("'unsafe-inline'");
  expect(csp).toContain("object-src 'none'");

  const manifestResponse = await request.get('manifest.webmanifest');
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest.name).toBe('FCC Ham Exam');
  expect(manifest.short_name).toBe('Ham Exam');
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('./index.html');
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ sizes: '192x192' }),
    expect.objectContaining({ sizes: '512x512' }),
    expect.objectContaining({ purpose: 'maskable' }),
  ]));

  for (const icon of manifest.icons) {
    const iconResponse = await request.get(icon.src);
    expect(iconResponse.ok(), `${icon.src} was not available`).toBe(true);
    expect(iconResponse.headers()['content-type']).toBe('image/png');
  }
});

test('service worker installs and caches the complete app shell', async ({ page }) => {
  await page.goto('index.html');
  await expect(page.locator('#question')).not.toBeEmpty();
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const key = keys.find(name => name.startsWith('ham-exam-'));
    if (!key) return [];
    const cache = await caches.open(key);
    const paths = [
      './index.html',
      './manifest.webmanifest',
      './icons/app-icon-192.png',
      './icons/app-icon-512.png',
      './icons/app-icon-maskable-512.png',
      './icons/apple-touch-icon.png',
      './icons/favicon.png',
    ];
    return Promise.all(paths.map(async path => Boolean(await cache.match(path))));
  });
  expect(cached).toEqual([true, true, true, true, true, true, true]);
});

test('Chromium reloads the installed app while offline', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Playwright WebKit cannot navigate while context-offline');
  await page.goto('index.html');
  await expect(page.locator('#question')).not.toBeEmpty();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#meta')).toHaveText('T1A01 · T1');
  await expect(page.locator('#progress')).toHaveText('Question 1 / 409');
  await page.locator('#reveal').click();
  await expect(page.locator('.choice.correct')).toBeVisible();
});

test('PWA shell makes no cross-origin requests', async ({ page }) => {
  const external = [];
  page.on('request', request => {
    if (new URL(request.url()).origin !== 'http://127.0.0.1:4173') {
      external.push(request.url());
    }
  });
  await page.goto('index.html');
  await expect(page.locator('#question')).not.toBeEmpty();
  expect(external).toEqual([]);
});

test('PWA build contains and loads the mock-exam UI', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('index.html');
  await expect(page.locator('#question')).not.toBeEmpty();
  // Mock Exam entry point is present.
  await expect(page.locator('#mockExamButton')).toBeVisible();
  // Setup and session panels are in the DOM but hidden.
  await expect(page.locator('#exam-setup')).toBeHidden();
  await expect(page.locator('#exam-session')).toBeHidden();
  // Open setup and verify metadata renders.
  await page.click('#mockExamButton');
  await expect(page.locator('#exam-setup')).toBeVisible();
  const metaText = await page.locator('#exam-setup-meta').textContent();
  expect(metaText).toMatch(/35/);
  // Cancel returns to study mode.
  await page.click('#exam-cancel');
  await expect(page.locator('#exam-setup')).toBeHidden();
  await expect(page.locator('main')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Help page opens and displays version and pool metadata in the PWA', async ({ page }) => {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('index.html');
  await expect(page.locator('#question')).not.toBeEmpty();

  await page.locator('#helpButton').click();
  await expect(page.locator('#help')).toBeVisible();
  await expect(page.locator('#help-version-text')).toContainText(APP_VERSION);
  await expect(page.locator('#help-pool-list')).toContainText('Technician');
  await expect(page.locator('#help-pool-list')).toContainText('General');
  await expect(page.locator('#help-pool-list')).toContainText('Extra');

  await page.locator('#closeHelp').click();
  await expect(page.locator('#help')).toBeHidden();
  await expect(page.locator('#question')).not.toBeEmpty();

  expect(errors).toEqual([]);
});
