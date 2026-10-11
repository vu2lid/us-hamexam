// Stage 8A2: same-origin isolation between the US edition and the synthetic
// fixture edition, served under separate paths on ONE origin
// (scripts/serve-editions.js / playwright.editions.config.js, `npm run
// test:editions`). Pure validation logic (profile/registry/build-selection
// gates) is covered at the unit layer (tests/unit/build-gate.test.js); this
// file covers only what genuinely needs a browser: localStorage, the Cache
// Storage API, service-worker scope/activation, and offline load.
//
// Requires both editions already built: `npm run build && npm run build --
// --edition synthetic` (the config's webServer does not build anything).
const { test, expect } = require('@playwright/test');

const US_CANONICAL_KEY = 'ham-exam-state';
const US_LEGACY_POOL_KEY = 'ham-exam-pool';
const US_PROBE_KEY = '__ham_exam_storage_probe__';
const SYN_CANONICAL_KEY = 'synthetic-exam-state';
const SYN_LEGACY_POOL_KEY = 'synthetic-exam-pool';
const SYN_PROBE_KEY = '__synthetic_exam_storage_probe__';
const SYNTHETIC_PATH = '/editions/synthetic/';

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

async function loadReady(page, path) {
  const requests = [];
  page.on('request', (req) => requests.push(req.url()));
  await page.goto(path);
  await expect(page.locator('#question')).not.toBeEmpty();
  return requests;
}

async function allLocalStorage(page) {
  return page.evaluate(() => {
    const out = {};
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      out[key] = window.localStorage.getItem(key);
    }
    return out;
  });
}

test.describe('@editions same-origin namespace isolation (Stage 8A2)', () => {
  test.beforeEach(async ({ page }) => {
    // Both editions share one origin's localStorage; start every test from
    // a clean slate so one test's writes cannot leak into the next.
    await page.goto('/index.html');
    await page.evaluate(() => window.localStorage.clear());
  });

  test('loading one edition does not read or overwrite the other\'s saved state', async ({ page }) => {
    // Seed ONLY the US canonical key, then load the SYNTHETIC edition on
    // the same origin and confirm it never reads or overwrites it.
    await page.goto('/index.html');
    await expect(page.locator('#question')).not.toBeEmpty();
    const usStateBefore = await allLocalStorage(page);
    expect(Object.keys(usStateBefore)).toContain(US_CANONICAL_KEY);
    expect(Object.keys(usStateBefore)).not.toContain(SYN_CANONICAL_KEY);

    await page.goto(SYNTHETIC_PATH + 'index.html');
    await expect(page.locator('#question')).not.toBeEmpty();
    const afterSynthetic = await allLocalStorage(page);
    // The US key this test seeded is untouched...
    expect(afterSynthetic[US_CANONICAL_KEY]).toBe(usStateBefore[US_CANONICAL_KEY]);
    // ...and the synthetic edition wrote only its OWN, differently-named
    // canonical key -- never the US one.
    expect(afterSynthetic[SYN_CANONICAL_KEY]).toBeDefined();
    const synState = JSON.parse(afterSynthetic[SYN_CANONICAL_KEY]);
    expect(synState.study.activePool).toBe('alpha');
    expect(Object.keys(synState.study.pools).sort()).toEqual(['alpha', 'beta']);
  });

  // Review-fix: src/storage.js's POOL_KEYS/DEFAULT_POOL_KEY/
  // EXAM_TIMER_SECONDS_VALUES are no longer hardcoded -- they resolve from
  // the same embedded HAM_EXAM_EDITION_CONFIG projection src/app.js has
  // read since Stage 7D (see resolveEditionIdentity() in src/storage.js),
  // with the same fallback-to-US-literals-when-absent policy already
  // proven for namespacePolicy. This test proves real, working,
  // independently-reloadable persistence for the synthetic edition's own
  // pool keys -- not merely that a failed adapter writes nothing.
  test('the synthetic edition saves and reloads study progress for its own, non-US pool keys', async ({ page }) => {
    await page.goto(SYNTHETIC_PATH + 'index.html');
    await expect(page.locator('#question')).not.toBeEmpty();
    const diagnostics = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS);
    expect(diagnostics.storage.status).toBe('migrated');
    expect(diagnostics.storage.writable).toBe(true);
    expect(diagnostics.errors).toEqual([]);

    await openMenu(page);
    // The pool selector is populated from the synthetic edition's own
    // poolKeys (alpha/beta), not the US technician/general/extra constant.
    await expect(page.locator('#pool')).toHaveValue('alpha');
    const options = await page.locator('#pool option').allTextContents();
    expect(options.length).toBe(2);

    await page.selectOption('#pool', 'beta');
    await closeMenu(page);
    await page.click('#next');
    await page.waitForTimeout(100);

    const beforeReload = await page.evaluate(() => JSON.parse(window.localStorage.getItem('synthetic-exam-state')));
    expect(beforeReload.study.activePool).toBe('beta');
    expect(beforeReload.study.pools.beta.currentQuestionId).toBe('B102');

    await page.reload();
    await expect(page.locator('#question')).not.toBeEmpty();
    await expect(page.locator('#pool')).toHaveValue('beta');
    const afterReload = await page.evaluate(() => JSON.parse(window.localStorage.getItem('synthetic-exam-state')));
    expect(afterReload.study.pools.beta.currentQuestionId).toBe('B102');
    expect((await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.storage)).status).toBe('valid');
  });

  test('legacy and storage-probe keys are isolated per edition', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate((key) => window.localStorage.setItem(key, 'general'), US_LEGACY_POOL_KEY);
    await page.goto(SYNTHETIC_PATH + 'index.html');
    await expect(page.locator('#question')).not.toBeEmpty();

    const afterSynthetic = await allLocalStorage(page);
    // The US legacy key this test seeded is untouched, and the synthetic
    // edition never reads or writes it either -- each edition's legacy
    // pool key is a distinct literal (migrateLegacy() only ever looks at
    // its OWN resolved NAMESPACE.legacyKeys).
    expect(afterSynthetic[US_LEGACY_POOL_KEY]).toBe('general');
    expect(afterSynthetic[SYN_LEGACY_POOL_KEY]).toBeUndefined();
    // Neither edition's storage-availability probe key (distinct literals)
    // is left behind after the page settles.
    expect(Object.keys(afterSynthetic)).not.toContain(US_PROBE_KEY);
    expect(Object.keys(afterSynthetic)).not.toContain(SYN_PROBE_KEY);
  });

  test('each service worker registers with only its own path as scope', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => !!window.HAM_EXAM_DIAGNOSTICS.serviceWorker);
    const usScope = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.serviceWorker);
    expect(usScope).toBe('http://127.0.0.1:4174/');

    await page.goto(SYNTHETIC_PATH + 'index.html');
    await page.waitForFunction(() => !!window.HAM_EXAM_DIAGNOSTICS.serviceWorker);
    const synScope = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.serviceWorker);
    expect(synScope).toBe('http://127.0.0.1:4174/editions/synthetic/');
  });

  test('activating one edition\'s worker cannot delete the other edition\'s caches', async ({ page }) => {
    // Seed two STALE caches before either real service worker gets a chance
    // to activate: one under the US's own prefix (an old version it should
    // clean up) and one under the synthetic edition's prefix (which must
    // survive the US worker's activation untouched, even though Cache
    // Storage is origin-wide, not scope-partitioned, in every browser).
    await page.goto('/index.html');
    await page.evaluate(async () => {
      await caches.open('ham-exam-STALE-VERSION');
      await caches.open('synthetic-exam-STALE-VERSION');
    });
    await page.evaluate(() => navigator.serviceWorker.getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister()))));
    await page.reload();
    await page.waitForFunction(() => !!window.HAM_EXAM_DIAGNOSTICS.serviceWorker);
    // Give the "activate" handler's cache cleanup a moment to run.
    await page.waitForTimeout(500);

    const keysAfterUs = await page.evaluate(() => caches.keys());
    expect(keysAfterUs).not.toContain('ham-exam-STALE-VERSION');
    expect(keysAfterUs).toContain('synthetic-exam-STALE-VERSION');
    const usRealCache = keysAfterUs.filter((k) => k.startsWith('ham-exam-'));
    expect(usRealCache.length).toBe(1);

    // Now activate the SYNTHETIC worker and confirm the reverse: its own
    // stale cache is cleaned up, the US's real (non-stale) cache survives.
    await page.goto(SYNTHETIC_PATH + 'index.html');
    await page.waitForFunction(() => !!window.HAM_EXAM_DIAGNOSTICS.serviceWorker);
    await page.waitForTimeout(500);

    const keysAfterSynthetic = await page.evaluate(() => caches.keys());
    expect(keysAfterSynthetic).not.toContain('synthetic-exam-STALE-VERSION');
    expect(keysAfterSynthetic).toEqual(expect.arrayContaining(usRealCache));
    const synRealCache = keysAfterSynthetic.filter((k) => k.startsWith('synthetic-exam-'));
    expect(synRealCache.length).toBe(1);
  });

  test('both editions load offline after installation, with no external requests', async ({ page, context }) => {
    const usRequests = await loadReady(page, '/index.html');
    await page.waitForFunction(() => !!window.HAM_EXAM_DIAGNOSTICS.serviceWorker);
    for (const url of usRequests) {
      expect(new URL(url).origin).toBe('http://127.0.0.1:4174');
    }

    const synRequests = await loadReady(page, SYNTHETIC_PATH + 'index.html');
    await page.waitForFunction(() => !!window.HAM_EXAM_DIAGNOSTICS.serviceWorker);
    for (const url of synRequests) {
      expect(new URL(url).origin).toBe('http://127.0.0.1:4174');
    }

    await context.setOffline(true);
    try {
      await page.goto('/index.html');
      await expect(page.locator('#question')).not.toBeEmpty();
      await page.goto(SYNTHETIC_PATH + 'index.html');
      await expect(page.locator('#question')).not.toBeEmpty();
    } finally {
      await context.setOffline(false);
    }
  });
});
