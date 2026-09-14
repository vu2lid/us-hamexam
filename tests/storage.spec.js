// Stage 4A2: canonical versioned-storage integration tests.
//
// Focused Chromium-only coverage of the application-integration boundary
// (src/app.js + src/storage.js): legacy migration, canonical authority,
// stable-ID positions, write-failure behavior, and memory-only exams. The
// migration/decision logic itself is owned by tests/unit/storage.test.js
// (pure Node); these cases verify the DOM-level wiring once, in one engine,
// per docs/TEST_EFFICIENCY_PLAN.md. They run only through
// playwright.storage.config.js (`npm run test:storage`) and are deliberately
// excluded from the release matrix and the routine union.
const { test, expect } = require('@playwright/test');

const CANONICAL_KEY = 'ham-exam-state';

async function openMenu(page) {
  if (await page.locator('#settings-drawer').isVisible()) return;
  await page.click('#menuButton');
  await expect(page.locator('#settings-drawer')).toBeVisible();
}

async function readCanonicalState(page) {
  return page.evaluate(() => JSON.parse(window.localStorage.getItem('ham-exam-state')));
}

async function readStorageDiagnostics(page) {
  return page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.storage);
}

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('index.html');
  await expect(page.locator('#question')).not.toBeEmpty();

  // Keep drawer transitions synchronous, matching tests/app.spec.js.
  await page.emulateMedia({ reducedMotion: 'reduce' });

  expect(errors, `Console/JS errors: ${errors.join('; ')}`).toHaveLength(0);
});

// 1. Complete legacy state migrates into the canonical document.
test('@storage complete legacy state migrates into the canonical document and survives reload', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('ham-exam-pool', 'general');
    window.localStorage.setItem('ham-exam-index-general', '2');
    window.localStorage.setItem('ham-exam-theme', 'dark');
    window.localStorage.setItem('ham-exam-bookmarks-technician', '["T1A01"]');
  });
  // The beforeEach load already committed a canonical document; drop it so
  // this navigation exercises a genuine first-run migration.
  await page.evaluate(() => window.localStorage.clear());
  await page.goto('index.html');
  await expect(page.locator('#question')).not.toBeEmpty();

  await expect(page.locator('#pool')).toHaveValue('general');
  await expect(page.locator('#meta')).toHaveText('G1A03 · G1');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  const state = await readCanonicalState(page);
  expect(state.study.activePool).toBe('general');
  expect(state.study.pools.general.currentQuestionId).toBe('G1A03');
  expect(state.study.pools.general.positions.all).toBe('G1A03');
  expect(state.preferences.theme).toBe('dark');
  expect(state.study.pools.technician.bookmarks).toEqual(['T1A01']);

  // Migration is a one-shot commit attempt; the legacy keys are retained,
  // not deleted or mirrored.
  expect(await page.evaluate(() => window.localStorage.getItem('ham-exam-pool'))).toBe('general');
  expect((await readStorageDiagnostics(page)).status).toBe('migrated');

  await page.reload();
  await expect(page.locator('#pool')).toHaveValue('general');
  await expect(page.locator('#meta')).toHaveText('G1A03 · G1');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect((await readStorageDiagnostics(page)).status).toBe('valid');
});

// 2. Malformed legacy values recover field-by-field.
test('@storage partial or malformed legacy values recover without discarding valid fields', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('ham-exam-pool', 'bogus');
    window.localStorage.setItem('ham-exam-theme', 'neon');
    window.localStorage.setItem('ham-exam-index-technician', 'abc');
    window.localStorage.setItem('ham-exam-bookmarks-technician', '{oops');
    window.localStorage.setItem('ham-exam-index-general', '5');
    window.localStorage.setItem('ham-exam-bookmarks-general', '["G1A01","bogus","G1A01"]');
  });
  await page.evaluate(() => window.localStorage.clear());
  await page.goto('index.html');
  await expect(page.locator('#question')).not.toBeEmpty();

  // Invalid pool/theme fall back to defaults...
  await expect(page.locator('#pool')).toHaveValue('technician');
  await expect(page.locator('#meta')).toHaveText('T1A01 · T1');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  // ...while independently valid legacy fields are still applied.
  const state = await readCanonicalState(page);
  const expectedGeneralId = await page.evaluate(
    () => window.HAM_EXAM_BANKS.general.questions[5].id
  );
  expect(state.study.pools.general.positions.all).toBe(expectedGeneralId);
  expect(state.study.pools.general.currentQuestionId).toBe(expectedGeneralId);
  expect(state.study.pools.general.bookmarks).toEqual(['G1A01']);
  expect(state.study.pools.technician.bookmarks).toEqual([]);
});

// 3. A failed canonical write leaves migration rerunnable.
test('@storage migration reruns safely after a failed canonical write', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('ham-exam-pool', 'general');
    window.localStorage.setItem('ham-exam-index-general', '2');
    if (window.__hamExamBlockedSetItem) return;
    window.__hamExamBlockedSetItem = true;
    const orig = Storage.prototype.setItem;
    window.__hamExamOrigSetItem = orig;
    window.__canonicalWriteAttempts = 0;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'ham-exam-state') {
        window.__canonicalWriteAttempts += 1;
        throw new Error('canonical write blocked');
      }
      return orig.call(this, key, value);
    };
  });
  await page.evaluate(() => window.localStorage.clear());
  await page.goto('index.html');
  await expect(page.locator('#question')).not.toBeEmpty();

  // The app runs from the migrated in-memory state even though the commit
  // failed; the canonical key was never created.
  await expect(page.locator('#pool')).toHaveValue('general');
  await expect(page.locator('#meta')).toHaveText('G1A03 · G1');
  expect(await page.evaluate(() => window.localStorage.getItem('ham-exam-state'))).toBeNull();
  expect(await page.evaluate(() => window.__canonicalWriteAttempts)).toBeGreaterThan(0);
  // Legacy keys are untouched, so the next load can migrate again.
  expect(await page.evaluate(() => window.localStorage.getItem('ham-exam-index-general'))).toBe('2');

  // Unblock writes; the next user mutation commits the in-memory state.
  await page.evaluate(() => { Storage.prototype.setItem = window.__hamExamOrigSetItem; });
  await openMenu(page);
  await page.locator('#theme').selectOption('dark');
  const state = await readCanonicalState(page);
  expect(state.study.activePool).toBe('general');
  expect(state.study.pools.general.positions.all).toBe('G1A03');
  expect(state.preferences.theme).toBe('dark');

  await page.reload();
  await expect(page.locator('#meta')).toHaveText('G1A03 · G1');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect((await readStorageDiagnostics(page)).status).toBe('valid');
});

// 4. A valid canonical state wins over conflicting legacy values.
test('@storage a valid canonical state wins over conflicting legacy values', async ({ page }) => {
  // First load: default state migrates and commits the canonical document.
  const first = await readCanonicalState(page);
  expect(first.study.activePool).toBe('technician');

  // Plant conflicting legacy values; they must be ignored on the next load.
  await page.evaluate(() => {
    window.localStorage.setItem('ham-exam-pool', 'extra');
    window.localStorage.setItem('ham-exam-theme', 'night');
    window.localStorage.setItem('ham-exam-index-technician', '5');
    window.localStorage.setItem('ham-exam-bookmarks-technician', '["E1A01"]');
  });
  await page.reload();
  await expect(page.locator('#pool')).toHaveValue('technician');
  await expect(page.locator('#meta')).toHaveText('T1A01 · T1');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect((await readCanonicalState(page)).study.pools.technician.bookmarks).toEqual([]);
});

// 5. Positions are stored as stable question IDs, not numeric indexes.
test('@storage per-pool positions are stored as stable question IDs, not numeric indexes', async ({ page }) => {
  await page.locator('#next').click();
  await page.locator('#next').click();
  await expect(page.locator('#meta')).toHaveText('T1A03 · T1');

  const state = await readCanonicalState(page);
  expect(state.study.pools.technician.positions.all).toBe('T1A03');
  expect(state.study.pools.technician.currentQuestionId).toBe('T1A03');
  expect(typeof state.study.pools.technician.positions.all).toBe('string');
});

// 6. Switching pools restores each pool's canonical question.
test('@storage switching pools restores each pool\'s canonical question', async ({ page }) => {
  await page.locator('#next').click();
  await page.locator('#next').click();
  await expect(page.locator('#meta')).toHaveText('T1A03 · T1');

  await openMenu(page);
  await page.locator('#pool').selectOption('general');
  await closeCheck(page);
  await expect(page.locator('#meta')).toHaveText('G1A01 · G1');
  await page.locator('#next').click();
  await expect(page.locator('#meta')).toHaveText('G1A02 · G1');

  await openMenu(page);
  await page.locator('#pool').selectOption('technician');
  await expect(page.locator('#meta')).toHaveText('T1A03 · T1');
  await page.locator('#pool').selectOption('general');
  await expect(page.locator('#meta')).toHaveText('G1A02 · G1');

  const state = await readCanonicalState(page);
  expect(state.study.pools.technician.positions.all).toBe('T1A03');
  expect(state.study.pools.general.positions.all).toBe('G1A02');
});

// 7. Bookmarks and theme survive reload.
test('@storage bookmarks and theme survive reload', async ({ page }) => {
  await openMenu(page);
  await page.locator('#theme').selectOption('night');
  await closeCheck(page);
  await page.locator('#bookmark').click();
  await expect(page.locator('#bookmark')).toHaveText('Remove bookmark');
  await page.locator('#next').click();
  await page.locator('#bookmark').click();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  await expect(page.locator('#meta')).toHaveText('T1A02 · T1');
  await expect(page.locator('#bookmark')).toHaveText('Remove bookmark');

  const state = await readCanonicalState(page);
  expect(state.preferences.theme).toBe('night');
  expect(state.study.pools.technician.bookmarks).toContain('T1A01');
  expect(state.study.pools.technician.bookmarks).toContain('T1A02');
});

// 8. Reset progress resets positions but preserves pool, bookmarks, theme.
test('@storage reset progress resets all pool positions but preserves active pool, bookmarks, and theme', async ({ page }) => {
  await openMenu(page);
  await page.locator('#theme').selectOption('dark');
  await page.locator('#pool').selectOption('technician');
  await closeCheck(page);
  await page.locator('#next').click();
  await page.locator('#bookmark').click();

  await openMenu(page);
  await page.locator('#pool').selectOption('general');
  await closeCheck(page);
  await page.locator('#next').click();

  await openMenu(page);
  await page.locator('#pool').selectOption('extra');
  await closeCheck(page);
  await page.locator('#next').click();
  await page.locator('#next').click();
  await page.locator('#next').click();
  await expect(page.locator('#meta')).toHaveText('E1A04 · E1');

  page.once('dialog', dialog => dialog.accept());
  await openMenu(page);
  await page.locator('#reset').click();

  await expect(page.locator('#meta')).toHaveText('E1A01 · E1');
  await expect(page.locator('#pool')).toHaveValue('extra');
  await expect(page.locator('#theme')).toHaveValue('dark');

  const state = await readCanonicalState(page);
  expect(state.study.activePool).toBe('extra');
  expect(state.study.pools.extra.positions.all).toBe('E1A01');
  expect(state.study.pools.general.positions.all).toBe('G1A01');
  expect(state.study.pools.technician.positions.all).toBe('T1A01');
  expect(state.study.pools.technician.bookmarks).toContain('T1A02');
  expect(state.preferences.theme).toBe('dark');
});

// 9. A future-schema canonical value is never overwritten.
test('@storage a future-schema canonical value is never overwritten', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'ham-exam-state',
      JSON.stringify({ schemaVersion: 99, note: 'from the future' })
    );
  });
  await page.evaluate(() => window.localStorage.clear());
  await page.goto('index.html');
  await expect(page.locator('#question')).not.toBeEmpty();

  // The app runs from safe defaults, read-only.
  await expect(page.locator('#meta')).toHaveText('T1A01 · T1');
  expect(await readStorageDiagnostics(page)).toEqual({ status: 'future-schema', writable: false });

  const before = await page.evaluate(() => window.localStorage.getItem('ham-exam-state'));
  await page.locator('#next').click();
  await openMenu(page);
  await page.locator('#theme').selectOption('dark');
  await closeCheck(page);
  await page.locator('#bookmark').click();
  const after = await page.evaluate(() => window.localStorage.getItem('ham-exam-state'));
  expect(after).toBe(before);
});

// 10. Throwing storage keeps the app fully functional in memory.
test('@storage throwing or disabled storage keeps the app fully functional in memory', async ({ page }) => {
  await page.addInitScript(() => {
    if (window.__hamExamThrowingStorage) return;
    window.__hamExamThrowingStorage = true;
    const orig = {
      getItem: Storage.prototype.getItem,
      setItem: Storage.prototype.setItem,
      removeItem: Storage.prototype.removeItem
    };
    window.__hamExamOrigStorage = orig;
    Storage.prototype.getItem = function () { throw new Error('storage disabled'); };
    Storage.prototype.setItem = function () { throw new Error('storage disabled'); };
    Storage.prototype.removeItem = function () { throw new Error('storage disabled'); };
  });
  await page.goto('index.html');
  await expect(page.locator('#question')).not.toBeEmpty();

  expect(await readStorageDiagnostics(page)).toEqual({ status: 'storage-unavailable', writable: false });

  // Study flows still work: navigation, bookmarks, theme, pool switching.
  await page.locator('#next').click();
  await expect(page.locator('#meta')).toHaveText('T1A02 · T1');
  await page.locator('#bookmark').click();
  await expect(page.locator('#bookmark')).toHaveText('Remove bookmark');
  await openMenu(page);
  await page.locator('#theme').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('#pool').selectOption('general');
  await expect(page.locator('#meta')).toHaveText('G1A01 · G1');

  // Restore storage and reload: nothing was persisted, so this is a fresh
  // default migration, not a resurrection of the in-memory session.
  await page.evaluate(() => {
    Storage.prototype.getItem = window.__hamExamOrigStorage.getItem;
    Storage.prototype.setItem = window.__hamExamOrigStorage.setItem;
    Storage.prototype.removeItem = window.__hamExamOrigStorage.removeItem;
  });
  await page.reload();
  await expect(page.locator('#meta')).toHaveText('T1A01 · T1');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

// 11. Help and Mock Exam transitions preserve study state and write nothing.
test('@storage Help and Mock Exam transitions preserve study state and write nothing', async ({ page }) => {
  await page.locator('#next').click();
  await page.locator('#next').click();
  await expect(page.locator('#meta')).toHaveText('T1A03 · T1');
  await page.locator('#bookmark').click();
  await openMenu(page);
  await page.locator('#theme').selectOption('dark');
  await closeCheck(page);

  const before = await page.evaluate(() => window.localStorage.getItem('ham-exam-state'));

  await openMenu(page);
  await page.locator('#helpButton').click();
  await expect(page.locator('#help')).toBeVisible();
  await page.locator('#closeHelp').click();
  await expect(page.locator('#help')).toBeHidden();

  await openMenu(page);
  await page.locator('#mockExamButton').click();
  await expect(page.locator('#exam-setup')).toBeVisible();
  await page.locator('#exam-cancel').click();
  await expect(page.locator('#exam-setup')).toBeHidden();

  await expect(page.locator('#meta')).toHaveText('T1A03 · T1');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#bookmark')).toHaveText('Remove bookmark');

  const after = await page.evaluate(() => window.localStorage.getItem('ham-exam-state'));
  expect(after).toBe(before);
});

// 12. A full mock exam persists nothing.
test('@storage a full mock exam writes no session, answer, score, or result data to storage', async ({ page }) => {
  await openMenu(page);
  await page.locator('#mockExamButton').click();
  await expect(page.locator('#exam-setup')).toBeVisible();
  await page.locator('#exam-start').click();
  await expect(page.locator('#exam-session')).toBeVisible();

  const total = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examSession.questions.length);
  for (let i = 0; i < total; i += 1) {
    await page.locator('#exam-choices input[type="radio"][value="A"]').click();
    if (i < total - 1) await page.locator('#exam-next').click();
  }
  await page.locator('#exam-finish').click();
  await expect(page.locator('#exam-results')).toBeVisible();

  const keys = await page.evaluate(() => Object.keys(window.localStorage));
  expect(keys).toEqual([CANONICAL_KEY]);
  const raw = await page.evaluate(() => window.localStorage.getItem('ham-exam-state'));
  expect(raw).not.toMatch(/"answers"|"questions"|"examSession"|"percentage"|"bySubelement"/);
  const state = JSON.parse(raw);
  expect(Object.keys(state).sort()).toEqual(['preferences', 'schemaVersion', 'study']);
  expect(Object.keys(state.study).sort()).toEqual(['activePool', 'pools']);
});

// 13. A valid canonical startup performs no unnecessary canonical rewrite.
test('@storage a valid canonical startup performs no unnecessary canonical rewrite', async ({ page }) => {
  // First load: default migration commits the canonical document; move so the
  // saved state is non-trivial.
  await page.locator('#next').click();
  await expect(page.locator('#meta')).toHaveText('T1A02 · T1');
  expect((await readCanonicalState(page)).study.pools.technician.positions.all).toBe('T1A02');

  // Now arm a setItem spy (applies from the next navigation on) and reload:
  // the stored state is already valid and current, so startup must not save.
  await page.addInitScript(() => {
    if (window.__hamExamCountSpy) return;
    window.__hamExamCountSpy = true;
    const orig = Storage.prototype.setItem;
    window.__canonicalSetCount = 0;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'ham-exam-state') window.__canonicalSetCount += 1;
      return orig.call(this, key, value);
    };
  });
  await page.reload();
  await expect(page.locator('#meta')).toHaveText('T1A02 · T1');
  expect((await readStorageDiagnostics(page)).status).toBe('valid');
  expect(await page.evaluate(() => window.__canonicalSetCount)).toBe(0);
});

async function closeCheck(page) {
  if (!(await page.locator('#settings-drawer').isVisible())) return;
  await page.click('#settings-drawer-close');
  await expect(page.locator('#settings-drawer')).toBeHidden();
}
