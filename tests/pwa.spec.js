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

test('Chromium displays an embedded figure after an offline reload', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Playwright WebKit cannot navigate while context-offline');
  await page.goto('index.html');
  await expect(page.locator('#question')).not.toBeEmpty();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#meta')).toHaveText('T1A01 · T1');

  // Navigate to a figure-bearing question entirely offline.
  await page.evaluate(() => {
    const bank = window.HAM_EXAM_BANKS.technician.questions;
    const target = bank.findIndex(q => q.id === 'T6C02');
    for (let i = 0; i < target; i += 1) document.getElementById('next').click();
  });
  await expect(page.locator('#meta')).toHaveText('T6C02 · T6');
  await expect(page.locator('#study-figure-caption')).toHaveText('Figure T-1');
  const dataUrl = await page.evaluate(
    () => (document.getElementById('study-figure-image').getAttribute('src') || '')
      .startsWith('data:image/png;base64,'),
  );
  expect(dataUrl).toBe(true);
  // decoding="async": retry until the browser reports the embedded image decoded.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const img = document.getElementById('study-figure-image');
        return img.complete && img.naturalWidth > 0;
      }),
    )
    .toBe(true);
});

test('Chromium shows figures in a mock exam and its results review after an offline reload', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Playwright WebKit cannot navigate while context-offline');
  await page.goto('index.html');
  await expect(page.locator('#question')).not.toBeEmpty();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#meta')).toHaveText('T1A01 · T1');

  // Start an exam and pin a deterministic figure-bearing question set, offline.
  await page.click('#mockExamButton');
  await page.selectOption('#exam-pool-select', 'technician');
  await page.selectOption('#exam-timer-select', '0');
  await page.click('#exam-start');
  await expect(page.locator('#exam-session')).toBeVisible();
  await page.evaluate(() => {
    const bank = window.HAM_EXAM_BANKS.technician.questions;
    const s = window.HAM_EXAM_DIAGNOSTICS.examSession;
    s.questions.length = 0;
    ['T6C02', 'T6C03'].forEach(id => s.questions.push(bank.find(q => q.id === id)));
    s.answers = {
      T6C02: bank.find(q => q.id === 'T6C02').correct,
      T6C03: bank.find(q => q.id === 'T6C03').correct,
    };
    s.index = 0;
  });
  await page.click('#exam-next');
  await page.click('#exam-prev');

  await expect(page.locator('#exam-figure-caption')).toHaveText('Figure T-1');
  const examSrc = await page.locator('#exam-figure-image').getAttribute('src');
  expect((examSrc || '').startsWith('data:image/png;base64,')).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const img = document.getElementById('exam-figure-image');
    return img.complete && img.naturalWidth > 0;
  })).toBe(true);

  await page.click('#exam-finish');
  await expect(page.locator('#exam-results')).toBeVisible();
  const reviewFigs = page.locator('#exam-review-list .exam-review-figure');
  await expect(reviewFigs).toHaveCount(2);
  await expect(reviewFigs.first().locator('.study-figure-caption')).toHaveText('Figure T-1');
  await expect.poll(() => page.evaluate(() => {
    const img = document.querySelector('#exam-review-list .exam-review-figure img');
    return !!img && img.complete && img.naturalWidth > 0;
  })).toBe(true);
});

test('Chromium enlarges an embedded figure while offline, including actual size', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Playwright WebKit cannot navigate while context-offline');
  await page.goto('index.html');
  await expect(page.locator('#question')).not.toBeEmpty();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#meta')).toHaveText('T1A01 · T1');

  await page.evaluate(() => {
    const bank = window.HAM_EXAM_BANKS.technician.questions;
    const target = bank.findIndex(q => q.id === 'T6C02');
    for (let i = 0; i < target; i += 1) document.getElementById('next').click();
  });
  await expect(page.locator('#meta')).toHaveText('T6C02 · T6');

  await page.locator('#study-figure-enlarge').click();
  await expect(page.locator('#figure-viewer')).toBeVisible();
  await expect(page.locator('#figure-viewer-title')).toHaveText('Figure T-1');
  expect((await page.locator('#figure-viewer-image').getAttribute('src') || '')
    .startsWith('data:image/png;base64,')).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const img = document.getElementById('figure-viewer-image');
    return img.complete && img.naturalWidth > 0;
  })).toBe(true);

  await page.locator('#figure-viewer-actual').click();
  await expect(page.locator('#figure-viewer-stage')).toHaveClass(/is-actual/);
  const scrollable = await page.evaluate(() => {
    const s = document.getElementById('figure-viewer-stage');
    return s.scrollWidth > s.clientWidth + 1 || s.scrollHeight > s.clientHeight + 1;
  });
  expect(scrollable).toBe(true);

  await page.keyboard.press('Escape');
  await expect(page.locator('#figure-viewer')).toBeHidden();
  expect(await page.evaluate(() => document.activeElement && document.activeElement.id))
    .toBe('study-figure-enlarge');
});
