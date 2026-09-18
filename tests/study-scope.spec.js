// Stage 6A: transient scoped study navigation. Scope lives only in memory
// (src/app.js module state), backed by the pure src/study-scope.js filter --
// see tests/unit/study-scope.test.js for that module's own unit coverage.
// This file covers the DOM wiring: the drawer's scope selector, the top-bar
// summary, filtered navigation/progress, and interaction with pool
// switching, figures, bookmarks, reveal, reload, and Mock Exam.
const { test, expect } = require('@playwright/test');

const VIEWPORTS = { phone320: { width: 320, height: 568 } };

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
