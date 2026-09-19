// Stage 6A: transient scoped study navigation. Scope lives only in memory
// (src/app.js module state), backed by the pure src/study-scope.js filter --
// see tests/unit/study-scope.test.js for that module's own unit coverage.
// This file covers the DOM wiring: the drawer's scope selector, the top-bar
// summary, filtered navigation/progress, and interaction with pool
// switching, figures, bookmarks, reveal, reload, and Mock Exam.
const { test, expect } = require('@playwright/test');
const TECHNICIAN = require('../data/technician.json');

const VIEWPORTS = { phone320: { width: 320, height: 568 } };

// Stage 6A6: group T1A's 11 questions in official bank order -- small enough
// to click through completely (and back) in a fast test, unlike a full pool.
const T1A_IDS = TECHNICIAN.filter(q => q.id.startsWith('T1A')).map(q => q.id);

// Settings (Pool, Study scope, Reveal after, Theme, Mock Exam, Help & About,
// Reset) live in the slide-in drawer opened via Menu (L1 responsive shell) --
// same helpers/convention as app.spec.js and responsive-shell.spec.js.
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

async function setScope(page, token) {
  await openMenu(page);
  await page.locator('#scope-select').selectOption(token);
  await closeMenu(page);
}

async function currentId(page) {
  const meta = await page.locator('#meta').textContent();
  return meta.split(' · ')[0];
}

async function setStudyOrder(page, value) {
  await openMenu(page);
  await page.locator('#study-order-select').selectOption(value);
  await closeMenu(page);
}

async function goToFirst(page) {
  while (!(await page.locator('#prev').isDisabled())) {
    await page.locator('#prev').click();
  }
}

// Collects `count` question IDs starting from whatever is currently
// displayed, clicking Next between each -- the caller is responsible for
// starting at the list's first question (see goToFirst()) when a complete,
// order-sensitive traversal is required.
async function idsByClickingNext(page, count) {
  const ids = [await currentId(page)];
  for (let i = 1; i < count; i++) {
    await page.locator('#next').click();
    ids.push(await currentId(page));
  }
  return ids;
}

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto('index.html');
  await expect(page.locator('#question')).not.toBeEmpty();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(errors, `Console/JS errors: ${errors.join('; ')}`).toHaveLength(0);
});

// ---- Default state: unchanged from pre-Stage-6A behavior ----

test('@smoke scope defaults to "All questions", summary hidden, unscoped progress format unchanged', async ({ page }) => {
  await openMenu(page);
  await expect(page.locator('#scope-select')).toHaveValue('all');
  await expect(page.locator('#scope-select option').first()).toHaveText('All questions');
  await closeMenu(page);

  await expect(page.locator('#scope-summary')).toBeHidden();
  await expect(page.locator('#progress')).toHaveText('Question 1 / 409');
});

// ---- Selecting each scope type filters the list ----

test('@smoke selecting a subelement scopes the study list and updates the summary', async ({ page }) => {
  await setScope(page, 'subelement:T1');
  await expect(page.locator('#scope-summary')).toBeVisible();
  await expect(page.locator('#scope-summary')).toHaveText('T1');
  await expect(page.locator('#progress')).toHaveText('Question 1 of 68');
  expect(await currentId(page)).toMatch(/^T1/);
});

test('selecting a group further narrows the study list', async ({ page }) => {
  await setScope(page, 'group:T1A');
  await expect(page.locator('#scope-summary')).toHaveText('T1A');
  await expect(page.locator('#progress')).toHaveText('Question 1 of 11');
  expect(await currentId(page)).toBe('T1A01');
});

// ---- Human-readable labels (Stage 6A1) ----

test('@smoke scope options show "CODE — Title" for all three pools, from validated pool data', async ({ page }) => {
  const expected = {
    technician: { sub: 'T1 — Commission’s Rules', group: 'T1A — Purpose and permissible use of the Amateur Radio Service' },
    general: { sub: 'G1 — Commission’s Rules', group: 'G1A — General class control operator frequency privileges' },
    extra: { sub: 'E1 — Commission Rules', group: 'E1A — Frequency privileges; signal frequency range' },
  };
  for (const [pool, labels] of Object.entries(expected)) {
    await openMenu(page);
    await page.locator('#pool').selectOption(pool);
    await expect(page.locator('#pool')).toHaveValue(pool);
    await expect(page.locator('#scope-select option[value="subelement:' + pool[0].toUpperCase() + '1"]')).toHaveText(labels.sub);
    await expect(page.locator('#scope-select option[value="group:' + pool[0].toUpperCase() + '1A"]')).toHaveText(labels.group);
    await closeMenu(page);
  }
});

test('pool switching repopulates the selector with the new pool\'s own labels, not stale ones', async ({ page }) => {
  await openMenu(page);
  await expect(page.locator('#scope-select option[value="subelement:T1"]')).toHaveText('T1 — Commission’s Rules');

  await page.locator('#pool').selectOption('extra');
  await expect(page.locator('#pool')).toHaveValue('extra');
  // The Technician-specific option is gone entirely, not merely relabeled.
  await expect(page.locator('#scope-select option[value="subelement:T1"]')).toHaveCount(0);
  await expect(page.locator('#scope-select option[value="subelement:E1"]')).toHaveText('E1 — Commission Rules');
});

test('the "All questions" option and top-bar summary stay code-only, never showing a title', async ({ page }) => {
  await openMenu(page);
  await expect(page.locator('#scope-select option').first()).toHaveText('All questions');
  await page.locator('#scope-select').selectOption('group:T1A');
  await closeMenu(page);
  // Compact top-bar indicator is the bare code, not "T1A — Purpose...".
  await expect(page.locator('#scope-summary')).toHaveText('T1A');
});

test('@compat keyboard selection reaches a labelled option and its accessible text matches the visible label', async ({ page }) => {
  await openMenu(page);
  const select = page.locator('#scope-select');
  await select.focus();
  await select.selectOption('group:T1A');
  // The option's accessible name (what a screen reader announces) is its own
  // text content -- "CODE — Title" -- not a bare code, confirming no HTML
  // was interpreted and no separate accessible-name override was added.
  const selectedText = await select.evaluate(el => el.options[el.selectedIndex].textContent);
  expect(selectedText).toBe('T1A — Purpose and permissible use of the Amateur Radio Service');
  await page.keyboard.press('Escape');
  await expect(page.locator('#scope-summary')).toHaveText('T1A');
});

// ---- Previous/Next boundaries operate on the filtered list ----

test('Previous/Next stay within the scoped list boundaries', async ({ page }) => {
  await setScope(page, 'group:T1A');
  await expect(page.locator('#prev')).toBeDisabled();

  for (let i = 0; i < 10; i += 1) await page.locator('#next').click();
  await expect(page.locator('#progress')).toHaveText('Question 11 of 11');
  expect(await currentId(page)).toBe('T1A11');
  await expect(page.locator('#next')).toBeDisabled();

  await page.locator('#prev').click();
  await expect(page.locator('#progress')).toHaveText('Question 10 of 11');
});

// ---- Scope change resets position ----

test('changing scope resets the study position to the start of the new list', async ({ page }) => {
  await page.locator('#next').click();
  await page.locator('#next').click();
  await expect(page.locator('#progress')).toHaveText('Question 3 / 409');

  await setScope(page, 'group:T1A');
  await expect(page.locator('#progress')).toHaveText('Question 1 of 11');
  expect(await currentId(page)).toBe('T1A01');
});

// ---- Pool switching invalidates a scope safely ----

test('scoped navigation preserves the saved full-pool position', async ({ page }) => {
  await page.locator('#next').click();
  await page.locator('#next').click();
  const savedId = await currentId(page);
  await expect(page.locator('#progress')).toHaveText('Question 3 / 409');

  await setScope(page, 'group:T1A');
  await expect(page.locator('#progress')).toHaveText('Question 1 of 11');
  await page.locator('#next').click();
  await page.locator('#next').click();

  await setScope(page, 'all');
  await expect(page.locator('#progress')).toHaveText('Question 3 / 409');
  expect(await currentId(page)).toBe(savedId);

  await page.reload();
  await expect(page.locator('#question')).not.toBeEmpty();
  expect(await currentId(page)).toBe(savedId);
});

test('switching pools resets scope to "All questions"', async ({ page }) => {
  await setScope(page, 'group:T1A');
  await expect(page.locator('#progress')).toHaveText('Question 1 of 11');

  await openMenu(page);
  await page.locator('#pool').selectOption('general');
  await expect(page.locator('#pool')).toHaveValue('general');
  await expect(page.locator('#scope-select')).toHaveValue('all');
  await closeMenu(page);

  await expect(page.locator('#scope-summary')).toBeHidden();
  await expect(page.locator('#progress')).toHaveText('Question 1 / 423');
});

// ---- Figures, bookmarks, and reveal keep working inside a scoped study ----

test('figure-bearing question renders correctly while scoped', async ({ page }) => {
  await setScope(page, 'group:T6C');
  await expect(page.locator('#progress')).toHaveText('Question 1 of 12');
  // T6C02 (figure T-1) is the 2nd question in the T6C group.
  await page.locator('#next').click();
  expect(await currentId(page)).toBe('T6C02');
  await expect(page.locator('#study-figure')).not.toHaveAttribute('hidden', '');
  await expect(page.locator('#study-figure-caption')).toHaveText('Figure T-1');
});

test('bookmark and reveal work normally within a scoped study', async ({ page }) => {
  await setScope(page, 'group:T1A');

  await page.locator('#bookmark').click();
  await expect(page.locator('#bookmark')).toHaveText('Remove bookmark');
  await page.locator('#next').click();
  await expect(page.locator('#bookmark')).toHaveText('Bookmark');
  await page.locator('#prev').click();
  await expect(page.locator('#bookmark')).toHaveText('Remove bookmark');

  await page.locator('#reveal').click();
  await expect(page.locator('.choice.correct')).toHaveCount(1);
});

// ---- Reload returns to "all" (transient, never persisted) ----

test('reload always returns to "All questions", even after selecting a scope', async ({ page }) => {
  await setScope(page, 'group:T1A');
  await expect(page.locator('#progress')).toHaveText('Question 1 of 11');

  await page.reload();
  await expect(page.locator('#question')).not.toBeEmpty();
  await openMenu(page);
  await expect(page.locator('#scope-select')).toHaveValue('all');
  await closeMenu(page);
  await expect(page.locator('#scope-summary')).toBeHidden();
  await expect(page.locator('#progress')).toHaveText('Question 1 / 409');
});

// ---- Mock Exam ignores study scope entirely ----

test('@smoke Mock Exam selects from the full pool regardless of the active study scope', async ({ page }) => {
  // T1A has only 11 questions; a 35-question, all-unique exam session can
  // only exist if selection reads the full pool, not the scoped list.
  await setScope(page, 'group:T1A');
  await expect(page.locator('#progress')).toHaveText('Question 1 of 11');

  await openMenu(page);
  await page.click('#mockExamButton');
  await expect(page.locator('#exam-setup')).toBeVisible();
  await page.click('#exam-start');
  await expect(page.locator('#exam-session')).toBeVisible();

  const session = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examSession);
  expect(session.questions.length).toBe(35);
  expect(new Set(session.questions.map(q => q.id)).size).toBe(35);
  expect(session.questions.some(q => !q.id.startsWith('T1A'))).toBe(true);
});

// ---- Drawer keyboard/focus behavior includes the new selector ----

test('@compat Tab reaches the scope selector and Escape still closes the drawer', async ({ page }) => {
  await openMenu(page);
  await page.locator('#scope-select').focus();
  await expect(page.locator('#scope-select')).toBeFocused();
  await page.locator('#scope-select').selectOption('subelement:T1');
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings-drawer')).toBeHidden();
  expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('menuButton');
  await expect(page.locator('#scope-summary')).toHaveText('T1');
});

// ---- Smallest responsive viewport ----

test('@responsive scope selector is visible and usable at the smallest viewport', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone320);
  await openMenu(page);
  const select = page.locator('#scope-select');
  await expect(select).toBeVisible();
  const box = await select.boundingBox();
  expect(box.width).toBeGreaterThan(0);
  expect(box.x + box.width).toBeLessThanOrEqual(VIEWPORTS.phone320.width);
  await select.selectOption('group:T1A');
  await closeMenu(page);
  await expect(page.locator('#scope-summary')).toHaveText('T1A');

  const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(scroll).toBeLessThanOrEqual(0);
});

// Review finding (Stage 6A1 follow-up): a native mobile <select> does not
// reliably wrap long option text, so the smallest-viewport check needs the
// dataset's actual LONGEST label (Extra E7E, 70 characters), not an
// arbitrary short one -- confirming the worst case never breaks page layout
// and that its full text stays available to assistive tech even though the
// closed control visually clips it (an OS-rendered popup's own wrapping is
// outside what Playwright can inspect; content-length is bounded instead by
// the "concise on-mobile readability target" unit test).
test('@responsive the longest real label does not overflow or wrap at the smallest viewport', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone320);
  await openMenu(page);
  await page.locator('#pool').selectOption('extra');
  await expect(page.locator('#pool')).toHaveValue('extra');

  const select = page.locator('#scope-select');
  await select.selectOption('group:E7E');
  const fullText = await select.evaluate(el => el.options[el.selectedIndex].textContent);
  expect(fullText).toBe('E7E — Modulation and demodulation; reactance, phase, and balanced modulators');

  // The closed control itself stays a normal single-line height (no forced
  // wrap) and fully inside the 320px viewport.
  const box = await select.boundingBox();
  expect(box.height).toBeLessThan(60);
  expect(box.x + box.width).toBeLessThanOrEqual(VIEWPORTS.phone320.width);

  await closeMenu(page);
  await expect(page.locator('#scope-summary')).toHaveText('E7E');
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(scroll).toBeLessThanOrEqual(0);
});

// ---- Stage 6A6: persisted Study order (Sequential / Random) ----
//
// Study order lives in src/app.js's `studyOrder` variable and the persisted
// `preferences.studyOrder` -- storage migration/validation is unit-tested in
// tests/unit/storage.test.js and its DOM-level persistence in
// tests/storage.spec.js; this section covers the study-list/navigation
// behavior itself: the Fisher-Yates shuffle, the four rebuild triggers,
// current-question preservation, and untouched full-pool-position semantics.

test('@smoke Study order defaults to Sequential, and sequential order matches the pool exactly (unchanged behavior)', async ({ page }) => {
  await openMenu(page);
  await expect(page.locator('#study-order-select')).toHaveValue('sequential');
  await closeMenu(page);

  await setScope(page, 'group:T1A');
  const ids = await idsByClickingNext(page, T1A_IDS.length);
  expect(ids).toEqual(T1A_IDS);
});

test('Random Study order contains every question in the active scope exactly once', async ({ page }) => {
  await setScope(page, 'group:T1A');
  await setStudyOrder(page, 'random');
  await goToFirst(page);
  await expect(page.locator('#prev')).toBeDisabled();

  const ids = await idsByClickingNext(page, T1A_IDS.length);
  expect(ids.slice().sort()).toEqual(T1A_IDS.slice().sort());
  expect(new Set(ids).size).toBe(T1A_IDS.length);
  await expect(page.locator('#next')).toBeDisabled();
});

test('random Study order does not reshuffle on render or navigation', async ({ page }) => {
  await setScope(page, 'group:T1A');
  await setStudyOrder(page, 'random');
  await goToFirst(page);
  const firstPass = await idsByClickingNext(page, T1A_IDS.length);

  await goToFirst(page);
  const secondPass = await idsByClickingNext(page, T1A_IDS.length);
  expect(secondPass).toEqual(firstPass);
});

test('changing Study order rebuilds the list', async ({ page }) => {
  await setScope(page, 'group:T1A');
  await setStudyOrder(page, 'random');
  await setStudyOrder(page, 'sequential');
  await goToFirst(page);
  const ids = await idsByClickingNext(page, T1A_IDS.length);
  expect(ids).toEqual(T1A_IDS);
});

test('a pool change rebuilds the random list for the new pool', async ({ page }) => {
  await setStudyOrder(page, 'random');
  await openMenu(page);
  await page.locator('#pool').selectOption('general');
  await closeMenu(page);
  expect((await currentId(page)).startsWith('G')).toBe(true);
});

test('a Study scope change rebuilds the random list for the new scope', async ({ page }) => {
  await setStudyOrder(page, 'random');
  await setScope(page, 'group:T1A');
  expect((await currentId(page)).startsWith('T1A')).toBe(true);
  await expect(page.locator('#progress')).toHaveText('Question 1 of ' + T1A_IDS.length);
});

test('the current question ID is preserved when Study order changes, if it is still in the list', async ({ page }) => {
  await setScope(page, 'group:T1A');
  await page.locator('#next').click();
  const before = await currentId(page);

  await setStudyOrder(page, 'random');
  expect(await currentId(page)).toBe(before);

  await setStudyOrder(page, 'sequential');
  expect(await currentId(page)).toBe(before);
});

test('scoped random browsing does not overwrite the saved full-pool position', async ({ page }) => {
  await setStudyOrder(page, 'random');
  const before = await page.evaluate(() => JSON.parse(window.localStorage.getItem('ham-exam-state')).study.pools.technician.positions.all);

  await setScope(page, 'group:T1A');
  await page.locator('#next').click();
  await page.locator('#next').click();

  const after = await page.evaluate(() => JSON.parse(window.localStorage.getItem('ham-exam-state')).study.pools.technician.positions.all);
  expect(after).toBe(before);
});

test('returning to All questions restores the saved full-pool question under random Study order', async ({ page }) => {
  await page.locator('#next').click();
  await page.locator('#next').click();
  const savedId = await currentId(page); // T1A03, the saved full-pool position

  await setStudyOrder(page, 'random');
  expect(await currentId(page)).toBe(savedId); // "all" scope: order change preserves it

  await setScope(page, 'group:T1A');
  await page.locator('#next').click(); // move within the scope -- temporary, never saved
  await setScope(page, 'all');
  expect(await currentId(page)).toBe(savedId);
});

test('bookmarks, reveal, and navigation controls work normally under random Study order', async ({ page }) => {
  await setStudyOrder(page, 'random');
  await expect(page.locator('#question')).not.toBeEmpty();

  await page.locator('#bookmark').click();
  await expect(page.locator('#bookmark')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#reveal').click();
  await expect(page.locator('.choice.correct')).toBeVisible();

  const before = await currentId(page);
  await page.locator('#next').click();
  expect(await currentId(page)).not.toBe(before);
  await page.locator('#prev').click();
  expect(await currentId(page)).toBe(before);
  await expect(page.locator('#bookmark')).toHaveAttribute('aria-pressed', 'true');
});

test('a figure-bearing question still renders its figure correctly after switching to random Study order', async ({ page }) => {
  // Reach the known figure-bearing question T6C02 (Figure T-1) using
  // ordinary sequential navigation first -- Study order defaults to
  // Sequential, so #next/#prev address the same positions as the bank.
  const target = TECHNICIAN.findIndex(q => q.id === 'T6C02');
  for (let i = 0; i < target; i++) await page.locator('#next').click();
  await expect(page.locator('#meta')).toContainText('T6C02');
  await expect(page.locator('#study-figure')).toBeVisible();

  // Switching order preserves the current question by ID (proven above), so
  // the same figure-bearing question -- now reached via a shuffled list --
  // must still render its figure identically.
  await setStudyOrder(page, 'random');
  await expect(page.locator('#meta')).toContainText('T6C02');
  await expect(page.locator('#study-figure')).toBeVisible();
  await expect(page.locator('#study-figure-image')).toHaveAttribute('src', /^data:image\//);
});

test('@smoke Mock Exam remains independent of Study order and the active scope', async ({ page }) => {
  await setStudyOrder(page, 'random');
  await setScope(page, 'group:T1A');
  await expect(page.locator('#progress')).toHaveText('Question 1 of ' + T1A_IDS.length);

  await openMenu(page);
  await page.click('#mockExamButton');
  await expect(page.locator('#exam-setup')).toBeVisible();
  await page.click('#exam-start');
  await expect(page.locator('#exam-session')).toBeVisible();

  const session = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examSession);
  expect(session.questions.length).toBe(35);
  expect(new Set(session.questions.map(q => q.id)).size).toBe(35);
  expect(session.questions.some(q => !q.id.startsWith('T1A'))).toBe(true);
});

test('@compat Study order is keyboard reachable and Escape still closes the drawer', async ({ page }) => {
  await openMenu(page);
  await page.locator('#study-order-select').focus();
  await expect(page.locator('#study-order-select')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings-drawer')).toBeHidden();
});

test('@responsive Study order selector is visible and usable at the smallest viewport', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone320);
  await openMenu(page);
  const select = page.locator('#study-order-select');
  await expect(select).toBeVisible();
  const box = await select.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.x + box.width).toBeLessThanOrEqual(VIEWPORTS.phone320.width);
  await select.selectOption('random');
  await closeMenu(page);
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(scroll).toBeLessThanOrEqual(0);
});

test('Study order selector is visible with no console errors in light, dark, and night themes', async ({ page }) => {
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));

  for (const theme of ['light', 'dark', 'night']) {
    await openMenu(page);
    await page.locator('#theme').selectOption(theme);
    await expect(page.locator('#study-order-select')).toBeVisible();
    await closeMenu(page);
  }
  expect(errors).toEqual([]);
});

// Regression: the drawer's existing Stage 6A3 pause-for-the-whole-visit
// behavior does not care what controls are inside it, but this confirms the
// new #study-order-select does not somehow interfere with it.
test('switching Study order to Random and browsing makes no network requests', async ({ page }) => {
  const external = [];
  page.on('request', request => {
    const proto = new URL(request.url()).protocol;
    if (proto !== 'file:' && proto !== 'data:') external.push(request.url());
  });
  await setStudyOrder(page, 'random');
  await page.locator('#next').click();
  await page.locator('#prev').click();
  expect(external).toEqual([]);
});

test('opening Settings still pauses the recall countdown for the whole visit, and changing Study order re-pauses the fresh countdown', async ({ page }) => {
  await page.clock.install(); // see responsive-shell.spec.js's Stage 6A3 tests for why a reload follows
  await page.reload();
  await expect(page.locator('#question')).not.toBeEmpty();
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await openMenu(page);
  await page.clock.runFor(5000);
  await expect(page.locator('#pause')).toHaveText('Resume');

  // Study order rebuilds/re-renders like Reveal delay/Pool/Study scope do
  // (Stage 6A3's review fix): the fresh countdown must start paused again,
  // not tick visibly behind the still-open drawer.
  await page.locator('#study-order-select').selectOption('random');
  await expect(page.locator('#pause')).toHaveText('Resume');
  await page.clock.runFor(5000); // would advance if it were still running
  const duringText = await page.locator('#timer').textContent();

  await closeMenu(page);
  await expect(page.locator('#pause')).toHaveText('Pause');
  expect(await page.locator('#timer').textContent()).toBe(duringText); // resumed, not reset again
});
