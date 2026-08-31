const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const APP_URL = 'index.html';
const BUILT_APP = path.resolve(__dirname, '../dist/index.html');
const APP_VERSION = require('../package.json').version;

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto(APP_URL);
  await expect(page.locator('#question')).not.toBeEmpty();

  // Surface any JS or console errors that occurred during load.
  expect(errors, `Console/JS errors: ${errors.join('; ')}`).toHaveLength(0);
});

test('page title and first question render', async ({ page }) => {
  await expect(page).toHaveTitle(/FCC Ham Exam/);
  await expect(page.locator('#pool')).toHaveValue('technician');
  await expect(page.locator('#meta')).toHaveText('T1A01 · T1');
  await expect(page.locator('#progress')).toHaveText('Question 1 / 409');
  await expect(page.locator('.choice')).toHaveCount(4);
  await expect(page.locator('#footer')).toContainText('Technician, General, Extra question pools');
  await expect(page.locator('#footer')).toContainText(`Version ${APP_VERSION} (beta)`);
});

test('startup diagnostics report successful initialization', async ({ page }) => {
  await expect(page.locator('#startup')).toBeHidden();
  const diagnostics = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS);
  expect(diagnostics.stage).toBe('Application ready');
  expect(diagnostics.version).toBe(APP_VERSION);
  expect(diagnostics.errors).toEqual([]);
  expect(await page.evaluate(() => window.HAM_EXAM_BANKS.technician.questions.length)).toBe(409);
  expect(await page.evaluate(() => window.HAM_EXAM_BANKS.general.questions.length)).toBe(423);
  expect(await page.evaluate(() => window.HAM_EXAM_BANKS.extra.questions.length)).toBe(599);
});

test('startup diagnostics do not disclose user paths or browser fingerprints', async ({ page }) => {
  await page.evaluate(() => {
    window.hamExamFail(new Error('Unable to read /home/private-user/study/index.html'));
  });
  const details = page.locator('#startup-details');
  await expect(details).toContainText('/home/[user]/study/index.html');
  await expect(details).not.toContainText('private-user');
  await expect(details).not.toContainText('Browser:');
  await expect(details).not.toContainText(process.cwd());
});

test('navigation works and respects boundaries', async ({ page }) => {
  await page.locator('#next').click();
  await expect(page.locator('#meta')).toHaveText('T1A02 · T1');
  await expect(page.locator('#progress')).toHaveText('Question 2 / 409');

  await page.locator('#prev').click();
  await expect(page.locator('#meta')).toHaveText('T1A01 · T1');
  await expect(page.locator('#progress')).toHaveText('Question 1 / 409');

  // At first question, previous buttons are disabled.
  await expect(page.locator('#prev')).toBeDisabled();
  await expect(page.locator('#bottomPrev')).toBeDisabled();
});

test('navigation reaches the final question and respects its boundary', async ({ page }) => {
  await page.evaluate(() => {
    const bank = window.HAM_EXAM_BANKS.technician.questions;
    for (let i = 1; i < bank.length; i += 1) {
      document.getElementById('next').click();
    }
  });
  await expect(page.locator('#meta')).toHaveText('T0C13 · T0');
  await expect(page.locator('#progress')).toHaveText('Question 409 / 409');
  await expect(page.locator('#next')).toBeDisabled();
  await expect(page.locator('#bottomNext')).toBeDisabled();
});

test('reveal answer highlights the correct choice', async ({ page }) => {
  await page.locator('#reveal').click();

  const correctChoice = page.locator('.choice.correct');
  await expect(correctChoice).toBeVisible();

  const letter = await correctChoice.getAttribute('data-letter');
  expect(letter).toMatch(/^[A-D]$/);

  await expect(page.locator('#timer')).toContainText(`Correct answer: ${letter}`);
  expect(await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.timerActive)).toBe(false);
});

test('timer automatically reveals the answer', async ({ page }) => {
  await page.clock.install();
  await page.locator('#wait').selectOption('5');
  await page.clock.fastForward(5000);
  await expect(page.locator('.choice.correct')).toBeVisible();
  await expect(page.locator('#timer')).toContainText('Correct answer:');
});

test('timer setting updates the countdown', async ({ page }) => {
  await page.locator('#wait').selectOption('5');
  await expect(page.locator('#timer')).toContainText('Revealing in 5 seconds');
});

test('timer "Never" option hides the countdown', async ({ page }) => {
  await page.locator('#wait').selectOption('0');
  await expect(page.locator('#timer')).toContainText('Answer hidden');
});

test('pause and resume timer', async ({ page }) => {
  await page.locator('#wait').selectOption('5');
  // Let the countdown tick at least once.
  await page.waitForTimeout(1200);

  const textBefore = await page.locator('#timer').textContent();
  expect(textBefore).toMatch(/Revealing in \d+ seconds?…/);

  await page.locator('#pause').click();
  await expect(page.locator('#pause')).toHaveText('Resume');

  // Wait again; the text should not have changed while paused.
  await page.waitForTimeout(1200);
  const textAfterPause = await page.locator('#timer').textContent();
  expect(textAfterPause).toBe(textBefore);

  await page.locator('#pause').click();
  await expect(page.locator('#pause')).toHaveText('Pause');
});

test('pool selector switches question banks', async ({ page }) => {
  await page.locator('#pool').selectOption('general');
  await expect(page.locator('#pool')).toHaveValue('general');
  await expect(page.locator('#meta')).toHaveText('G1A01 · G1');
  await expect(page.locator('#progress')).toHaveText('Question 1 / 423');

  await page.locator('#pool').selectOption('extra');
  await expect(page.locator('#pool')).toHaveValue('extra');
  await expect(page.locator('#meta')).toHaveText('E1A01 · E1');
  await expect(page.locator('#progress')).toHaveText('Question 1 / 599');

  await page.locator('#pool').selectOption('technician');
  await expect(page.locator('#pool')).toHaveValue('technician');
  await expect(page.locator('#meta')).toHaveText('T1A01 · T1');
  await expect(page.locator('#progress')).toHaveText('Question 1 / 409');
});

test('pool selection and progress persist in localStorage', async ({ page }) => {
  await page.locator('#pool').selectOption('general');
  await page.locator('#next').click();
  await page.locator('#next').click();
  await expect(page.locator('#meta')).toHaveText('G1A03 · G1');

  const storedPool = await page.evaluate(() => window.localStorage.getItem('ham-exam-pool'));
  const storedIndex = await page.evaluate(() => window.localStorage.getItem('ham-exam-index-general'));
  expect(storedPool).toBe('general');
  expect(storedIndex).toBe('2');

  // Reload and verify the saved state is restored.
  await page.reload();
  await expect(page.locator('#pool')).toHaveValue('general');
  await expect(page.locator('#meta')).toHaveText('G1A03 · G1');
  await expect(page.locator('#progress')).toHaveText('Question 3 / 423');
});

test('each pool remembers its own progress', async ({ page }) => {
  await page.locator('#pool').selectOption('technician');
  await page.locator('#next').click();
  await page.locator('#next').click();
  await expect(page.locator('#meta')).toHaveText('T1A03 · T1');

  await page.locator('#pool').selectOption('general');
  await page.locator('#next').click();
  await expect(page.locator('#meta')).toHaveText('G1A02 · G1');

  await page.locator('#pool').selectOption('technician');
  await expect(page.locator('#meta')).toHaveText('T1A03 · T1');

  await page.locator('#pool').selectOption('general');
  await expect(page.locator('#meta')).toHaveText('G1A02 · G1');
});

test('theme selector switches themes and persists in localStorage', async ({ page }) => {
  await expect(page.locator('#theme')).toHaveValue('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.locator('#theme').selectOption('dark');
  await expect(page.locator('#theme')).toHaveValue('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const storedDark = await page.evaluate(() => window.localStorage.getItem('ham-exam-theme'));
  expect(storedDark).toBe('dark');

  await page.locator('#theme').selectOption('night');
  await expect(page.locator('#theme')).toHaveValue('night');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');

  await page.reload();
  await expect(page.locator('#theme')).toHaveValue('night');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  const storedNight = await page.evaluate(() => window.localStorage.getItem('ham-exam-theme'));
  expect(storedNight).toBe('night');
});

test('reset progress requires confirmation and cancel preserves progress', async ({ page }) => {
  await page.locator('#pool').selectOption('general');
  await page.locator('#next').click();
  await page.locator('#next').click();
  await expect(page.locator('#meta')).toHaveText('G1A03 · G1');

  page.on('dialog', dialog => dialog.dismiss());
  await page.locator('#reset').click();

  await expect(page.locator('#meta')).toHaveText('G1A03 · G1');
  const storedGeneral = await page.evaluate(() => window.localStorage.getItem('ham-exam-index-general'));
  expect(storedGeneral).toBe('2');
});

test('reset progress confirm resets all pool indexes and preserves theme and pool', async ({ page }) => {
  // Set a non-default theme so we can verify it survives reset.
  await page.locator('#theme').selectOption('dark');

  // Set up progress in multiple pools.
  await page.locator('#pool').selectOption('technician');
  await page.locator('#next').click();
  await page.locator('#next').click();
  await page.locator('#pool').selectOption('general');
  await page.locator('#next').click();
  await page.locator('#pool').selectOption('extra');
  await page.locator('#next').click();
  await page.locator('#next').click();
  await page.locator('#next').click();
  await expect(page.locator('#meta')).toHaveText('E1A04 · E1');

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', error => consoleErrors.push(error.message));

  page.on('dialog', dialog => dialog.accept());
  await page.locator('#reset').click();

  // Active pool resets to question 1 and remains selected.
  await expect(page.locator('#meta')).toHaveText('E1A01 · E1');
  await expect(page.locator('#progress')).toHaveText('Question 1 / 599');
  await expect(page.locator('#pool')).toHaveValue('extra');

  // Other pools also start from question 1 after reset.
  await page.locator('#pool').selectOption('technician');
  await expect(page.locator('#meta')).toHaveText('T1A01 · T1');
  await page.locator('#pool').selectOption('general');
  await expect(page.locator('#meta')).toHaveText('G1A01 · G1');

  // Theme remains unchanged.
  await expect(page.locator('#theme')).toHaveValue('dark');
  const storedTheme = await page.evaluate(() => window.localStorage.getItem('ham-exam-theme'));
  expect(storedTheme).toBe('dark');

  expect(consoleErrors).toEqual([]);
});

test('bookmark button toggles and persists per pool', async ({ page }) => {
  await expect(page.locator('#bookmark')).toHaveText('Bookmark');
  await expect(page.locator('#bookmark')).toHaveAttribute('aria-pressed', 'false');

  // Bookmark the current Technician question.
  await page.locator('#bookmark').click();
  await expect(page.locator('#bookmark')).toHaveText('Remove bookmark');
  await expect(page.locator('#bookmark')).toHaveAttribute('aria-pressed', 'true');

  // Navigate away and back; bookmark state is restored.
  await page.locator('#next').click();
  await expect(page.locator('#bookmark')).toHaveText('Bookmark');
  await expect(page.locator('#bookmark')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#prev').click();
  await expect(page.locator('#bookmark')).toHaveText('Remove bookmark');
  await expect(page.locator('#bookmark')).toHaveAttribute('aria-pressed', 'true');

  // Bookmarks are isolated between pools.
  await page.locator('#pool').selectOption('general');
  await expect(page.locator('#bookmark')).toHaveText('Bookmark');
  await expect(page.locator('#bookmark')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#bookmark').click();
  await expect(page.locator('#bookmark')).toHaveText('Remove bookmark');

  // Remove bookmark works.
  await page.locator('#bookmark').click();
  await expect(page.locator('#bookmark')).toHaveText('Bookmark');
  await expect(page.locator('#bookmark')).toHaveAttribute('aria-pressed', 'false');

  const bookmarks = await page.evaluate(() => ({
    technician: JSON.parse(window.localStorage.getItem('ham-exam-bookmarks-technician') || '[]'),
    general: JSON.parse(window.localStorage.getItem('ham-exam-bookmarks-general') || '[]'),
    extra: JSON.parse(window.localStorage.getItem('ham-exam-bookmarks-extra') || '[]')
  }));
  expect(bookmarks.technician).toContain('T1A01');
  expect(bookmarks.general).toEqual([]);
  expect(bookmarks.extra).toEqual([]);
});

test('bookmarks persist after reload and survive progress reset', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', error => consoleErrors.push(error.message));

  await page.locator('#bookmark').click();
  await page.locator('#next').click();
  await page.locator('#bookmark').click();
  await expect(page.locator('#meta')).toHaveText('T1A02 · T1');

  await page.reload();
  await expect(page.locator('#meta')).toHaveText('T1A02 · T1');
  await expect(page.locator('#bookmark')).toHaveText('Remove bookmark');

  // Reset progress must not delete bookmarks.
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#reset').click();
  await expect(page.locator('#meta')).toHaveText('T1A01 · T1');

  const bookmarks = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem('ham-exam-bookmarks-technician') || '[]')
  );
  expect(bookmarks).toContain('T1A01');
  expect(bookmarks).toContain('T1A02');

  expect(consoleErrors).toEqual([]);
});

test('help opens and closes while preserving study state', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', error => consoleErrors.push(error.message));

  // Navigate to a later Technician question and bookmark it.
  await page.locator('#next').click();
  await page.locator('#next').click();
  await expect(page.locator('#meta')).toHaveText('T1A03 · T1');
  await page.locator('#bookmark').click();
  await expect(page.locator('#bookmark')).toHaveText('Remove bookmark');

  await page.locator('#helpButton').click();
  await expect(page.locator('#help')).toBeVisible();
  await expect(page.locator('main')).toBeHidden();
  await expect(page.locator('#footer')).toBeHidden();

  // Study control groups are hidden so they cannot be used while Help is open.
  await expect(page.locator('.nav-group')).toBeHidden();
  await expect(page.locator('.action-group')).toBeHidden();
  await expect(page.locator('.settings-group')).toBeHidden();
  await expect(page.locator('.danger-group')).toBeHidden();

  // The Help control group remains visible.
  await expect(page.locator('.help-group')).toBeVisible();

  // Timer should be paused while Help is open.
  const timerBefore = await page.locator('#timer').textContent();
  await page.waitForTimeout(1200);
  const timerDuring = await page.locator('#timer').textContent();
  expect(timerDuring).toBe(timerBefore);

  await page.locator('#closeHelp').click();
  await expect(page.locator('#help')).toBeHidden();
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('#footer')).toBeVisible();

  // Study controls are restored.
  await expect(page.locator('.nav-group')).toBeVisible();
  await expect(page.locator('.action-group')).toBeVisible();
  await expect(page.locator('.settings-group')).toBeVisible();
  await expect(page.locator('.danger-group')).toBeVisible();

  // Same question and bookmark state are restored.
  await expect(page.locator('#meta')).toHaveText('T1A03 · T1');
  await expect(page.locator('#bookmark')).toHaveText('Remove bookmark');

  expect(consoleErrors).toEqual([]);
});

test('help displays version and all pool metadata', async ({ page }) => {
  await page.locator('#helpButton').click();
  await expect(page.locator('#help-version-text')).toContainText(APP_VERSION);

  const pools = [
    { name: 'Technician', element: 'Element 2', count: '409 questions', effective: 'July 1, 2026' },
    { name: 'General', element: 'Element 3', count: '423 questions', effective: 'July 1, 2023' },
    { name: 'Extra', element: 'Element 4', count: '599 questions', effective: 'July 1, 2024' }
  ];

  for (const pool of pools) {
    const entry = page.locator('#help-pool-list', { hasText: pool.name });
    await expect(entry).toContainText(pool.element);
    await expect(entry).toContainText(pool.count);
    await expect(entry).toContainText(pool.effective);
  }

  const ncvecLinks = await page.locator('#help-pool-list a').evaluateAll(els =>
    els.map(el => el.getAttribute('href'))
  );
  expect(ncvecLinks).toContain('https://ncvec.org/index.php/2026-2030-technician-question-pool');
  expect(ncvecLinks).toContain('https://ncvec.org/index.php/2023-2027-general-question-pool-release');
  expect(ncvecLinks).toContain('https://ncvec.org/index.php/2024-2028-extra-class-question-pool-release');
});

test('help contains correct source and project links', async ({ page }) => {
  await page.locator('#helpButton').click();
  const links = await page.locator('#help a').evaluateAll(els =>
    els.map(el => ({ href: el.getAttribute('href'), text: el.textContent.trim() }))
  );

  const hrefs = links.map(l => l.href);
  expect(hrefs).toContain('https://ncvec.org/index.php/2026-2030-technician-question-pool');
  expect(hrefs).toContain('https://ncvec.org/index.php/2023-2027-general-question-pool-release');
  expect(hrefs).toContain('https://ncvec.org/index.php/2024-2028-extra-class-question-pool-release');
  expect(hrefs).toContain('https://vu2lid.github.io/us-hamexam/');
  expect(hrefs).toContain('https://github.com/vu2lid/us-hamexam');
  expect(hrefs).toContain('https://github.com/vu2lid/us-hamexam/blob/main/AUTHORS.md');
});

test('help preserves pool selection, progress, and theme', async ({ page }) => {
  await page.locator('#theme').selectOption('dark');
  await page.locator('#pool').selectOption('general');
  await page.locator('#next').click();
  await page.locator('#next').click();
  await expect(page.locator('#meta')).toHaveText('G1A03 · G1');

  await page.locator('#helpButton').click();
  await page.locator('#closeHelp').click();

  await expect(page.locator('#pool')).toHaveValue('general');
  await expect(page.locator('#meta')).toHaveText('G1A03 · G1');
  await expect(page.locator('#theme')).toHaveValue('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('help fragment opens help directly and focuses Help', async ({ page }) => {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', error => errors.push(error.message));

  await page.goto(`${APP_URL}#help`);
  await expect(page.locator('#question')).not.toBeEmpty();
  await expect(page.locator('#help')).toBeVisible();
  await expect(page.locator('main')).toBeHidden();
  await expect(page.locator('#help-version-text')).toContainText(APP_VERSION);

  // Help should be presented at the top of the page.
  const scrollY = await page.evaluate(() => window.scrollY);
  expect(scrollY).toBe(0);

  // Focus should be on a Help control.
  const activeId = await page.evaluate(() => document.activeElement?.id);
  expect(['closeHelp', 'helpButton']).toContain(activeId);

  expect(errors).toEqual([]);
});

test('Escape closes Help and restores focus', async ({ page }) => {
  await page.locator('#helpButton').click();
  await expect(page.locator('#help')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('#help')).toBeHidden();
  await expect(page.locator('main')).toBeVisible();

  const activeId = await page.evaluate(() => document.activeElement?.id);
  expect(activeId).toBe('helpButton');
});

test('Tab does not enter hidden study controls while Help is open', async ({ page }) => {
  await page.locator('#helpButton').click();
  await expect(page.locator('#help')).toBeVisible();

  // Tab through the Help panel and beyond. The hidden study controls should
  // never receive focus because they are removed from the tab order.
  const studySelectors = ['#prev', '#next', '#bottomPrev', '#bottomNext', '#pause', '#reveal', '#pool', '#theme', '#wait', '#reset', '#bookmark'];
  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.press('Tab');
    const activeId = await page.evaluate(() => document.activeElement?.id);
    expect(studySelectors, `Focus moved to hidden study control "${activeId}" after ${i + 1} Tab presses`).not.toContain(activeId);
  }
});

test('browser back closes Help and restores study view', async ({ page }) => {
  await page.locator('#next').click();
  await page.locator('#next').click();
  await expect(page.locator('#meta')).toHaveText('T1A03 · T1');

  await page.locator('#helpButton').click();
  await expect(page.locator('#help')).toBeVisible();

  await page.goBack();
  await expect(page.locator('#help')).toBeHidden();
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('#meta')).toHaveText('T1A03 · T1');
});

test('help panel fits viewport without horizontal scroll', async ({ page }) => {
  await page.locator('#helpButton').click();
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth;
  });
  expect(overflow, 'Page has horizontal scrollbar with Help open').toBe(false);
});

test('help controls meet the minimum touch target height', async ({ page }) => {
  await page.locator('#helpButton').click();
  const heights = await page.locator('#help button, #help a').evaluateAll(elements =>
    elements.map(element => element.getBoundingClientRect().height)
  );
  expect(heights.every(height => height >= 44)).toBe(true);
});

test('layout fits viewport without horizontal scroll', async ({ page }) => {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth;
  });
  expect(overflow, 'Page has horizontal scrollbar').toBe(false);
});

test('controls meet the minimum touch target height', async ({ page }) => {
  const heights = await page.locator('button:visible, select:visible').evaluateAll(elements =>
    elements.map(element => element.getBoundingClientRect().height)
  );
  expect(heights.every(height => height >= 44)).toBe(true);
});

test('controls are grouped with accessible labels', async ({ page }) => {
  const groups = await page.locator('.control-group').evaluateAll(elements =>
    elements.map(el => ({
      role: el.getAttribute('role'),
      label: el.getAttribute('aria-label'),
      visible: el.offsetParent !== null
    }))
  );
  expect(groups).toHaveLength(6);
  expect(groups.every(g => g.role === 'group' && g.label && g.visible)).toBe(true);

  const labels = groups.map(g => g.label);
  expect(labels).toContain('Navigation');
  expect(labels).toContain('Study actions');
  expect(labels).toContain('Study settings');
  expect(labels).toContain('Progress');
  expect(labels).toContain('Mock exam');
  expect(labels).toContain('Help');
});

test('keyboard tab order follows control order', async ({ page }) => {
  const tabOrder = [];
  for (let i = 0; i < 14; i += 1) {
    await page.keyboard.press('Tab');
    const active = await page.evaluate(() => document.activeElement?.id || document.activeElement?.textContent?.trim() || '');
    tabOrder.push(active);
  }
  const unique = [...new Set(tabOrder)];
  expect(unique.indexOf('prev')).toBeLessThan(unique.indexOf('next'));
  expect(unique.indexOf('next')).toBeLessThan(unique.indexOf('pause'));
  expect(unique.indexOf('pause')).toBeLessThan(unique.indexOf('reveal'));
  expect(unique.indexOf('reveal')).toBeLessThan(unique.indexOf('pool'));
  expect(unique.indexOf('pool')).toBeLessThan(unique.indexOf('theme'));
  expect(unique.indexOf('theme')).toBeLessThan(unique.indexOf('wait'));
  expect(unique.indexOf('wait')).toBeLessThan(unique.indexOf('reset'));
  expect(unique.indexOf('reset')).toBeLessThan(unique.indexOf('helpButton'));
});

test('UTF-8 question text survives inline embedding', async ({ page }) => {
  const t9b12 = await page.evaluate(() =>
    window.HAM_EXAM_BANKS.technician.questions.find(q => q.id === 'T9B12')
  );
  expect(t9b12.choices.D).toContain('station’s ground connection');
});

test('a missing question bank produces visible diagnostics', async ({ page }) => {
  const html = fs.readFileSync(BUILT_APP, 'utf8')
    // This fixture intentionally changes a hashed script, so remove the
    // production CSP here and test CSP separately against the untampered build.
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]+>\n?/, '')
    .replace(
      /window\.HAM_EXAM_BANKS = \{.*?\};/,
      'window.HAM_EXAM_BANKS = null;'
    );
  await page.goto('about:blank');
  await page.setContent(html);
  await expect(page.locator('#startup')).toBeVisible();
  await expect(page.locator('#startup-title')).toHaveText('Unable to start the study app');
  await expect(page.locator('#startup-details')).toContainText('embedded question banks are missing');
});

test('static guidance remains visible when JavaScript is disabled', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(pathToFileURL(BUILT_APP).href);
  await expect(page.locator('#startup-title')).toHaveText('Starting the study app…');
  await expect(page.locator('#startup-help')).toContainText('open an HTTPS web link in Safari');
  await expect(page.locator('#progress')).toHaveText('Loading questions…');
  await context.close();
});

// ---- Mock-exam timer state preservation ----

test('active study timer is suspended and resumed around Mock Exam setup', async ({ page }) => {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', error => errors.push(error.message));

  await page.locator('#wait').selectOption('10');
  await page.waitForTimeout(1500);

  const beforeSetup = await page.locator('#timer').textContent();
  expect(beforeSetup).toMatch(/Revealing in \d+ seconds?…/);
  const beforeMatch = beforeSetup.match(/(\d+)/);
  const beforeRemaining = beforeMatch ? Number(beforeMatch[1]) : 10;

  await page.locator('#mockExamButton').click();
  await expect(page.locator('#exam-setup')).toBeVisible();
  await expect(page.locator('main')).toBeHidden();
  expect(await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.timerActive)).toBe(false);

  await page.waitForTimeout(1500);
  const duringSetup = await page.locator('#timer').textContent();
  expect(duringSetup).toBe(beforeSetup);

  await page.locator('#exam-cancel').click();
  await expect(page.locator('#exam-setup')).toBeHidden();
  await expect(page.locator('main')).toBeVisible();

  const afterCancel = await page.locator('#timer').textContent();
  expect(afterCancel).toMatch(/Revealing in \d+ seconds?…/);
  expect(await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.timerActive)).toBe(true);

  await page.waitForTimeout(1500);
  const afterResume = await page.locator('#timer').textContent();
  const afterMatch = afterResume.match(/(\d+)/);
  const afterRemaining = afterMatch ? Number(afterMatch[1]) : 10;
  expect(afterRemaining).toBeLessThan(beforeRemaining);

  expect(errors).toEqual([]);
});

test('active study timer is suspended and resumed around a mock exam session', async ({ page }) => {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', error => errors.push(error.message));

  await page.locator('#wait').selectOption('10');
  await page.waitForTimeout(1500);

  const beforeSetup = await page.locator('#timer').textContent();
  expect(beforeSetup).toMatch(/Revealing in \d+ seconds?…/);

  await page.locator('#mockExamButton').click();
  await page.locator('#exam-start').click();
  await expect(page.locator('#exam-session')).toBeVisible();

  await page.waitForTimeout(1500);
  const duringExam = await page.locator('#timer').textContent();
  expect(duringExam).toBe(beforeSetup);

  page.on('dialog', dialog => dialog.accept());
  await page.locator('#exam-exit').click();
  await expect(page.locator('#exam-session')).toBeHidden();
  await expect(page.locator('main')).toBeVisible();

  const afterExit = await page.locator('#timer').textContent();
  expect(afterExit).toMatch(/Revealing in \d+ seconds?…/);
  expect(await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.timerActive)).toBe(true);

  await page.waitForTimeout(1500);
  const afterResume = await page.locator('#timer').textContent();
  expect(afterResume).not.toBe(afterExit);

  expect(errors).toEqual([]);
});

test('manually paused study timer stays paused around Mock Exam setup', async ({ page }) => {
  await page.locator('#wait').selectOption('10');
  await page.waitForTimeout(1500);

  await page.locator('#pause').click();
  await expect(page.locator('#pause')).toHaveText('Resume');
  const beforeSetup = await page.locator('#timer').textContent();

  await page.locator('#mockExamButton').click();
  await page.waitForTimeout(1200);
  await page.locator('#exam-cancel').click();

  await expect(page.locator('#pause')).toHaveText('Resume');
  const afterCancel = await page.locator('#timer').textContent();
  expect(afterCancel).toBe(beforeSetup);

  await page.waitForTimeout(1200);
  const afterWait = await page.locator('#timer').textContent();
  expect(afterWait).toBe(beforeSetup);
});

test('Never reveal setting is preserved around Mock Exam setup', async ({ page }) => {
  await page.locator('#wait').selectOption('0');
  await expect(page.locator('#timer')).toContainText('Answer hidden');

  await page.locator('#mockExamButton').click();
  await page.waitForTimeout(1200);
  await page.locator('#exam-cancel').click();

  await expect(page.locator('#timer')).toContainText('Answer hidden');
  expect(await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.timerActive)).toBe(false);
});

test('revealed answer state is preserved around Mock Exam setup', async ({ page }) => {
  await page.locator('#reveal').click();
  await expect(page.locator('.choice.correct')).toBeVisible();
  await expect(page.locator('#timer')).toContainText('Correct answer:');

  await page.locator('#mockExamButton').click();
  await page.waitForTimeout(1200);
  await page.locator('#exam-cancel').click();

  await expect(page.locator('.choice.correct')).toBeVisible();
  await expect(page.locator('#timer')).toContainText('Correct answer:');
  expect(await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.timerActive)).toBe(false);
});

test('study timer does not advance while Mock Exam setup or session is open', async ({ page }) => {
  await page.locator('#wait').selectOption('10');
  await page.waitForTimeout(1500);

  const baseline = await page.locator('#timer').textContent();

  await page.locator('#mockExamButton').click();
  await page.waitForTimeout(1500);
  const inSetup = await page.locator('#timer').textContent();
  expect(inSetup).toBe(baseline);

  await page.locator('#exam-start').click();
  await page.waitForTimeout(1500);
  const inExam = await page.locator('#timer').textContent();
  expect(inExam).toBe(baseline);

  page.on('dialog', dialog => dialog.accept());
  await page.locator('#exam-exit').click();
  await page.waitForTimeout(1500);
  const afterReturn = await page.locator('#timer').textContent();
  expect(afterReturn).not.toBe(baseline);
});
