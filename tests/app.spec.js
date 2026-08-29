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
  await expect(page).toHaveTitle(/FCC Technician/);
  await expect(page.locator('#meta')).toHaveText('T0A01 · T0');
  await expect(page.locator('#progress')).toHaveText('Question 1 / 409');
  await expect(page.locator('.choice')).toHaveCount(4);
  await expect(page.locator('#footer')).toContainText('all 409 Technician questions');
  await expect(page.locator('#footer')).toContainText(`Version ${APP_VERSION} (beta)`);
});

test('startup diagnostics report successful initialization', async ({ page }) => {
  await expect(page.locator('#startup')).toBeHidden();
  const diagnostics = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS);
  expect(diagnostics.stage).toBe('Application ready');
  expect(diagnostics.version).toBe(APP_VERSION);
  expect(diagnostics.errors).toEqual([]);
  expect(await page.evaluate(() => window.HAM_EXAM_BANK.length)).toBe(409);
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
  await expect(page.locator('#meta')).toHaveText('T0A02 · T0');
  await expect(page.locator('#progress')).toHaveText('Question 2 / 409');

  await page.locator('#prev').click();
  await expect(page.locator('#meta')).toHaveText('T0A01 · T0');
  await expect(page.locator('#progress')).toHaveText('Question 1 / 409');

  // At first question, previous buttons are disabled.
  await expect(page.locator('#prev')).toBeDisabled();
  await expect(page.locator('#bottomPrev')).toBeDisabled();
});

test('navigation reaches the final question and respects its boundary', async ({ page }) => {
  await page.evaluate(() => {
    for (let i = 1; i < window.HAM_EXAM_BANK.length; i += 1) {
      document.getElementById('next').click();
    }
  });
  await expect(page.locator('#meta')).toHaveText('T9B12 · T9');
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

test('layout fits viewport without horizontal scroll', async ({ page }) => {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth;
  });
  expect(overflow, 'Page has horizontal scrollbar').toBe(false);
});

test('controls meet the minimum touch target height', async ({ page }) => {
  const heights = await page.locator('button, select').evaluateAll(elements =>
    elements.map(element => element.getBoundingClientRect().height)
  );
  expect(heights.every(height => height >= 44)).toBe(true);
});

test('UTF-8 question text survives inline embedding', async ({ page }) => {
  const lastQuestion = await page.evaluate(() =>
    window.HAM_EXAM_BANK[window.HAM_EXAM_BANK.length - 1]
  );
  expect(lastQuestion.choices.D).toContain('station’s ground connection');
});

test('a missing question bank produces visible diagnostics', async ({ page }) => {
  const html = fs.readFileSync(BUILT_APP, 'utf8')
    // This fixture intentionally changes a hashed script, so remove the
    // production CSP here and test CSP separately against the untampered build.
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]+>\n?/, '')
    .replace(
      /window\.HAM_EXAM_BANK = \[.*?\];/,
      'window.HAM_EXAM_BANK = null;'
    );
  await page.goto('about:blank');
  await page.setContent(html);
  await expect(page.locator('#startup')).toBeVisible();
  await expect(page.locator('#startup-title')).toHaveText('Unable to start the study app');
  await expect(page.locator('#startup-details')).toContainText('embedded question bank is missing');
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
