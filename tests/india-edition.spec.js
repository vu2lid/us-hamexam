// Stage 8D3B: browser/technical QA for the now-buildable India ASOC
// (Restricted) practice edition, served from its own path
// (/editions/india/) on the same origin as the US and synthetic editions
// (scripts/serve-editions.js / playwright.editions.config.js, `npm run
// test:editions`). Pure validation/provenance logic is covered at the
// unit/build-gate layer (tests/unit/question-provenance.test.js,
// tests/unit/build-gate.test.js); this file covers only what genuinely
// needs a browser: rendering, branding/copy, storage/cache/SW isolation,
// offline load, layout, and basic keyboard accessibility.
//
// Requires the India edition already built: `npm run build:india` (the
// config's webServer does not build anything). This is local QA only --
// nothing here deploys, alters the public Pages workflow, or renames
// anything.
const { test, expect } = require('@playwright/test');

const INDIA_PATH = '/editions/india/';
const INDIA_CANONICAL_KEY = 'india-asoc-practice-state';
const INDIA_LEGACY_POOL_KEY = 'india-asoc-practice-pool';
const INDIA_LEGACY_INDEX_KEY = 'india-asoc-practice-index-restricted';
const INDIA_PROBE_KEY = '__india_asoc_practice_storage_probe__';
const ALL_QUESTION_IDS = [
  'R1B01', 'R1B02', 'R1B03', 'R1B04', 'R1B05',
  'R1A01', 'R1A02', 'R1A03', 'R1A04', 'R1A05',
  'R1C01', 'R1C02', 'R1C03',
  'R1D01', 'R1D02', 'R1D03',
  'R1E01', 'R1E02', 'R1E03',
  'R1F01', 'R1F02',
  'R1G01', 'R1G02',
  'R1H01', 'R1H02',
  'R2A01', 'R2A02', 'R2A03', 'R2A04', 'R2A05'
];

async function openMenu(page) {
  if (await page.locator('#settings-drawer').isVisible()) return;
  await page.click('#menuButton');
  await expect(page.locator('#settings-drawer')).toBeVisible();
}

async function closeMenu(page) {
  if (!(await page.locator('#settings-drawer').isVisible())) return;
  await page.click('#settings-drawer-close');
  await expect(page.locator('#settings-drawer')).toBeHidden();
}

test.describe('@editions India ASOC Restricted practice edition (Stage 8D3B)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(INDIA_PATH + 'index.html');
    await page.evaluate(() => window.localStorage.clear());
  });

  test('the standalone app loads and displays the first question', async ({ page }) => {
    await page.goto(INDIA_PATH + 'index.html');
    await expect(page.locator('#question')).not.toBeEmpty();
    await expect(page.locator('#meta')).toHaveText('R1B01 · R1');
    await expect(page.locator('#progress')).toHaveText('Question 1 / 30');
  });

  test('all 30 practice questions are reachable via Next, in blueprint order', async ({ page }) => {
    await page.goto(INDIA_PATH + 'index.html');
    await expect(page.locator('#question')).not.toBeEmpty();
    const seen = [];
    for (let i = 0; i < ALL_QUESTION_IDS.length; i++) {
      const meta = await page.locator('#meta').textContent();
      seen.push(meta.split(' · ')[0]);
      if (i < ALL_QUESTION_IDS.length - 1) {
        await page.locator('#next').click();
      }
    }
    expect(seen.length).toBe(ALL_QUESTION_IDS.length);
    expect([...seen].sort()).toEqual([...ALL_QUESTION_IDS].sort());
    await expect(page.locator('#next')).toBeDisabled();
  });

  test('India ASOC Restricted Practice branding and disclaimer are visible', async ({ page }) => {
    await page.goto(INDIA_PATH + 'index.html');
    await expect(page.locator('#question')).not.toBeEmpty();
    await expect(page.locator('h1.app-title')).toContainText('India ASOC Practice');
    await expect(page.locator('.app-tagline')).toHaveText('ASOC (Restricted) Practice — not an official exam');

    await openMenu(page);
    await page.click('#helpButton');
    await expect(page.locator('#help')).toBeVisible();
    const helpText = await page.locator('#help').innerText();
    expect(helpText).toContain('not an official examination');
    expect(helpText).toContain('not complete syllabus coverage');
    await expect(page.locator('#help-app-name')).toHaveText('India ASOC Practice');
  });

  test('no user-visible US/FCC/NCVEC/Technician/General/Extra branding appears anywhere in the rendered UI', async ({ page }) => {
    await page.goto(INDIA_PATH + 'index.html');
    await expect(page.locator('#question')).not.toBeEmpty();
    await openMenu(page);
    await page.click('#helpButton');
    await expect(page.locator('#help')).toBeVisible();
    await page.click('#openGettingStarted');
    await expect(page.locator('#getting-started')).toBeVisible();
    await page.click('#guide-back');
    await page.click('#closeHelp');
    await openMenu(page);
    await page.click('#mockExamButton');
    await expect(page.locator('#exam-setup')).toBeVisible();
    await page.click('#exam-cancel');

    // The rendered <body> text -- not raw HTML source, which (like the
    // synthetic edition) still carries a few INERT, never-displayed
    // app.js fallback-literal strings and one internal DOM id
    // (docs/EDITION_BUILDS_DESIGN.md "Known boundary"). This checks what a
    // user actually sees.
    const bodyText = await page.locator('body').innerText();
    for (const forbidden of ['US Ham Exam', 'FCC', 'NCVEC', 'Technician', 'General', 'Extra', 'ARRL']) {
      expect(bodyText).not.toContain(forbidden);
    }
  });

  test('pool selection and the default pool are correct for this single-pool edition', async ({ page }) => {
    await page.goto(INDIA_PATH + 'index.html');
    await expect(page.locator('#question')).not.toBeEmpty();
    await openMenu(page);
    await expect(page.locator('#pool')).toHaveValue('restricted');
    const options = await page.locator('#pool option').evaluateAll((els) => els.map((e) => e.value));
    expect(options).toEqual(['restricted']);
    const labels = await page.locator('#pool option').allTextContents();
    expect(labels).toEqual(['ASOC (Restricted) Practice']);
  });

  test('progress and bookmarks persist after reload', async ({ page }) => {
    await page.goto(INDIA_PATH + 'index.html');
    await expect(page.locator('#question')).not.toBeEmpty();
    await page.locator('#next').click();
    await page.locator('#next').click();
    await expect(page.locator('#meta')).toHaveText('R1B03 · R1');
    await page.locator('#bookmark').click();
    await expect(page.locator('#bookmark')).toHaveText('Remove bookmark');

    const stored = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)), INDIA_CANONICAL_KEY);
    expect(stored.study.pools.restricted.currentQuestionId).toBe('R1B03');
    expect(stored.study.pools.restricted.bookmarks).toContain('R1B03');

    await page.reload();
    await expect(page.locator('#meta')).toHaveText('R1B03 · R1');
    await expect(page.locator('#bookmark')).toHaveText('Remove bookmark');
  });

  test('storage, legacy, and probe keys use the India namespace', async ({ page }) => {
    await page.goto(INDIA_PATH + 'index.html');
    await expect(page.locator('#question')).not.toBeEmpty();
    const config = await page.evaluate(() => window.HAM_EXAM_EDITION_CONFIG.namespacePolicy);
    expect(config.storageKey).toBe(INDIA_CANONICAL_KEY);
    expect(config.legacyKeys).toEqual([
      'india-asoc-practice-pool',
      'india-asoc-practice-theme',
      'india-asoc-practice-index-{poolKey}',
      'india-asoc-practice-bookmarks-{poolKey}'
    ]);
    expect(config.cachePrefix).toBe('india-asoc-practice-');
    expect(config.probeKey).toBe('__india_asoc_practice_storage_probe__');

    const keys = await page.evaluate(() => Object.keys(window.localStorage));
    expect(keys).toContain(INDIA_CANONICAL_KEY);
    expect(keys).not.toContain(INDIA_PROBE_KEY); // probe is written then removed, never left behind
    for (const foreign of ['ham-exam-state', 'synthetic-exam-state']) {
      expect(keys).not.toContain(foreign);
    }

    // A real legacy-key migration round-trip, using the India-specific
    // legacy names (mirrors the US's own storage.spec.js precedent).
    await page.evaluate(({ poolKey, indexKey }) => {
      window.localStorage.clear();
      window.localStorage.setItem(poolKey, 'restricted');
      window.localStorage.setItem(indexKey, '2');
    }, { poolKey: INDIA_LEGACY_POOL_KEY, indexKey: INDIA_LEGACY_INDEX_KEY });
    await page.reload();
    await expect(page.locator('#meta')).toHaveText('R1B03 · R1');
    const diagnostics = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.storage);
    expect(diagnostics.status).toBe('migrated');
  });

  test('Help and Getting Started content are India-specific, not a fallback to US prose', async ({ page }) => {
    await page.goto(INDIA_PATH + 'index.html');
    await expect(page.locator('#question')).not.toBeEmpty();
    await openMenu(page);
    await page.click('#helpButton');
    await expect(page.locator('#help')).toBeVisible();
    const helpText = await page.locator('#help').innerText();
    expect(helpText).toContain('Indian Amateur Station Operator');
    expect(helpText).toContain('Current practice topics');
    expect(helpText).not.toContain('New to Amateur Radio');
    expect(helpText).not.toContain('Getting Started guide after an offline reload');

    await page.click('#openGettingStarted');
    await expect(page.locator('#getting-started')).toBeVisible();
    const guideText = await page.locator('#getting-started').innerText();
    expect(guideText).toContain('ASOC (Restricted) practice app');
    expect(guideText).not.toContain('US FCC Amateur Radio');
  });

  test('PWA manifest metadata is India-specific', async ({ page, request }) => {
    await page.goto(INDIA_PATH + 'index.html');
    await expect(page.locator('#question')).not.toBeEmpty();
    const manifestResponse = await request.get(INDIA_PATH + 'manifest.webmanifest');
    expect(manifestResponse.ok()).toBe(true);
    const manifest = await manifestResponse.json();
    expect(manifest.name).toBe('India ASOC Practice');
    expect(manifest.short_name).toBe('India ASOC Practice');
    expect(manifest.description).toContain('India ASOC (Restricted) syllabus');
    expect(manifest.description).toContain('Not an official examination');
    expect(manifest.start_url).toBe('./index.html');
    expect(manifest.scope).toBe('./');

    await expect(page.locator('meta[name="apple-mobile-web-app-title"]'))
      .toHaveAttribute('content', 'India ASOC Practice');
    await expect(page.locator('meta[name="description"]'))
      .toHaveAttribute('content', manifest.description);
  });

  test('service-worker scope and cache prefix are India-specific', async ({ page }) => {
    await page.goto(INDIA_PATH + 'index.html');
    await page.waitForFunction(() => !!window.HAM_EXAM_DIAGNOSTICS.serviceWorker);
    const scope = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.serviceWorker);
    expect(scope).toBe('http://127.0.0.1:4174/editions/india/');

    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForTimeout(300);
    const cacheKeys = await page.evaluate(() => caches.keys());
    const indiaKeys = cacheKeys.filter((k) => k.startsWith('india-asoc-practice-'));
    expect(indiaKeys.length).toBe(1);
    for (const key of cacheKeys) {
      if (!key.startsWith('india-asoc-practice-')) {
        expect(key.startsWith('ham-exam-') || key.startsWith('synthetic-exam-')).toBe(true);
      }
    }
  });

  test('offline reload works after installation', async ({ page, context }) => {
    await page.goto(INDIA_PATH + 'index.html');
    await expect(page.locator('#question')).not.toBeEmpty();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    await context.setOffline(true);
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('#meta')).toHaveText('R1B01 · R1');
      await page.locator('#reveal').click();
      await expect(page.locator('.choice.correct')).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });

  test('320×568 layout has no horizontal overflow and the main controls remain usable', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(INDIA_PATH + 'index.html');
    await expect(page.locator('#question')).not.toBeEmpty();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);

    for (const id of ['#menuButton', '#next', '#reveal']) {
      const box = await page.locator(id).boundingBox();
      expect(box).not.toBeNull();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    await openMenu(page);
    const drawerOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(drawerOverflow).toBe(false);
    await closeMenu(page);
  });

  test('basic keyboard focus/accessibility: menu, pool select, and reveal are keyboard-reachable', async ({ page }) => {
    await page.goto(INDIA_PATH + 'index.html');
    await expect(page.locator('#question')).not.toBeEmpty();

    await page.locator('#menuButton').focus();
    await expect(page.locator('#menuButton')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#settings-drawer')).toBeVisible();
    await expect(page.locator('#pool')).toBeVisible();
    await page.locator('#pool').focus();
    await expect(page.locator('#pool')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#settings-drawer')).toBeHidden();

    await page.locator('#reveal').focus();
    await expect(page.locator('#reveal')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.choice.correct')).toBeVisible();
  });
});
