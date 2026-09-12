// L1 content-first responsive study layout: the compact top bar, the
// independently scrollable middle, the compact bottom bar, and the slide-in
// settings drawer. Study/exam/results behavior itself is covered in
// app.spec.js and mock-exam.spec.js; this file focuses on the shell and
// drawer mechanics introduced by that layout.
const { test, expect } = require('@playwright/test');

const VIEWPORTS = {
  phone320: { width: 320, height: 568 },
  phone390: { width: 390, height: 844 },
  landscape: { width: 844, height: 390 },
};

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto('index.html');
  await expect(page.locator('#question')).not.toBeEmpty();
  expect(errors, `Console/JS errors: ${errors.join('; ')}`).toHaveLength(0);
});

async function openMenu(page) {
  await page.click('#menuButton');
  await expect(page.locator('#settings-drawer')).toBeVisible();
  await expect(page.locator('#settings-drawer')).toHaveClass(/open/);
}

// ---- Drawer open/close, backdrop, Escape, focus ----

test('@smoke Menu opens the settings drawer with an accessible name and focus inside it', async ({ page }) => {
  await expect(page.locator('#menuButton')).toHaveAttribute('aria-expanded', 'false');
  await openMenu(page);
  await expect(page.locator('#menuButton')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#settings-drawer')).toHaveAttribute('role', 'dialog');
  await expect(page.locator('#settings-drawer')).toHaveAttribute('aria-modal', 'true');
  const labelledby = await page.locator('#settings-drawer').getAttribute('aria-labelledby');
  await expect(page.locator('#' + labelledby)).toHaveText('Settings');

  const activeId = await page.evaluate(() => document.activeElement && document.activeElement.id);
  expect(activeId).toBe('settings-drawer-close');
});

test('backdrop click closes the drawer and restores focus to Menu', async ({ page }) => {
  await openMenu(page);
  // The panel is anchored to the left edge, so click near the right edge of
  // the backdrop -- well outside the panel -- rather than a fixed corner.
  const viewport = page.viewportSize();
  await page.locator('.settings-drawer-backdrop').click({
    position: { x: viewport.width - 5, y: 5 },
  });
  await expect(page.locator('#settings-drawer')).toBeHidden();
  await expect(page.locator('#menuButton')).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('menuButton');
});

test('Escape closes the drawer and restores focus to Menu', async ({ page }) => {
  await openMenu(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings-drawer')).toBeHidden();
  expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('menuButton');
});

test('Close button closes the drawer and restores focus to Menu', async ({ page }) => {
  await openMenu(page);
  await page.click('#settings-drawer-close');
  await expect(page.locator('#settings-drawer')).toBeHidden();
  expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('menuButton');
});

test('@compat Tab and Shift+Tab stay inside the drawer and background controls are covered', async ({ page }) => {
  await openMenu(page);
  for (let i = 0; i < 10; i += 1) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(
      () => document.getElementById('settings-drawer').contains(document.activeElement),
    );
    expect(inside, `focus left the drawer after ${i + 1} Tab presses`).toBe(true);
  }
  for (let i = 0; i < 10; i += 1) {
    await page.keyboard.press('Shift+Tab');
    const inside = await page.evaluate(
      () => document.getElementById('settings-drawer').contains(document.activeElement),
    );
    expect(inside, `focus left the drawer after ${i + 1} Shift+Tab presses`).toBe(true);
  }

  // Background bottom-bar Next sits behind the backdrop and cannot be clicked.
  const covered = await page.evaluate(() => {
    const r = document.getElementById('next').getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return document.getElementById('settings-drawer').contains(el);
  });
  expect(covered).toBe(true);
});

test('@compat no duplicate element IDs while the drawer is open', async ({ page }) => {
  await openMenu(page);
  const dups = await page.evaluate(() => {
    const ids = Array.from(document.querySelectorAll('[id]')).map(el => el.id);
    const seen = new Set();
    const d = new Set();
    ids.forEach(id => { if (seen.has(id)) d.add(id); seen.add(id); });
    return Array.from(d);
  });
  expect(dups).toEqual([]);
});

// ---- Every relocated setting/action ----

test('the drawer contains Pool, Reveal after, Theme, Mock Exam, Help & About, and Reset progress', async ({ page }) => {
  await openMenu(page);
  const drawer = page.locator('#settings-drawer');
  await expect(drawer.locator('#pool')).toBeVisible();
  await expect(drawer.locator('#wait')).toBeVisible();
  await expect(drawer.locator('#theme')).toBeVisible();
  await expect(drawer.locator('#mockExamButton')).toBeVisible();
  await expect(drawer.locator('#helpButton')).toBeVisible();
  await expect(drawer.locator('#reset')).toBeVisible();
});

test('theme, pool, and reveal-delay changes apply immediately and leave the drawer open', async ({ page }) => {
  await openMenu(page);
  await page.locator('#theme').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#settings-drawer')).toBeVisible();

  await page.locator('#pool').selectOption('general');
  await expect(page.locator('#meta')).toHaveText('G1A01 · G1');
  await expect(page.locator('#settings-drawer')).toBeVisible();

  await page.locator('#wait').selectOption('0');
  await expect(page.locator('#timer')).toContainText('Answer hidden');
  await expect(page.locator('#settings-drawer')).toBeVisible();
});

test('Help & About closes the drawer before opening, and destination focus wins over Menu', async ({ page }) => {
  await openMenu(page);
  await page.click('#helpButton');
  await expect(page.locator('#settings-drawer')).toBeHidden();
  await expect(page.locator('#help')).toBeVisible();
  expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('closeHelp');
});

test('Mock Exam closes the drawer before opening, and destination focus wins over Menu', async ({ page }) => {
  await openMenu(page);
  await page.click('#mockExamButton');
  await expect(page.locator('#settings-drawer')).toBeHidden();
  await expect(page.locator('#exam-setup')).toBeVisible();
  expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('exam-pool-select');
});

test('Reset progress keeps its confirmation and preserves bookmarks/theme', async ({ page }) => {
  await page.click('#next');
  await page.click('#bookmark');
  await openMenu(page);
  await page.locator('#theme').selectOption('night');

  page.once('dialog', dialog => dialog.dismiss());
  await page.click('#reset');
  await expect(page.locator('#meta')).toHaveText('T1A02 · T1'); // dismissed: unchanged

  page.once('dialog', dialog => dialog.accept());
  await page.click('#reset');
  await expect(page.locator('#meta')).toHaveText('T1A01 · T1'); // accepted: reset

  await expect(page.locator('#theme')).toHaveValue('night');
  const bookmarks = await page.evaluate(
    () => JSON.parse(window.localStorage.getItem('ham-exam-bookmarks-technician') || '[]'),
  );
  expect(bookmarks).toContain('T1A02');
});

// ---- Current pool label synchronization ----

test('the current-pool label in the top bar stays synchronized with the active pool', async ({ page }) => {
  await expect(page.locator('#current-pool-label')).toHaveText('Technician');
  await openMenu(page);
  await page.locator('#pool').selectOption('general');
  await expect(page.locator('#current-pool-label')).toHaveText('General');
  await page.locator('#pool').selectOption('extra');
  await expect(page.locator('#current-pool-label')).toHaveText('Extra');

  await page.reload();
  await expect(page.locator('#current-pool-label')).toHaveText('Extra');
});

// ---- Pause/Resume contextual visibility ----

test('Pause/Resume is shown only while relevant: running, paused, hidden on Never and after reveal', async ({ page }) => {
  await openMenu(page);
  await page.locator('#wait').selectOption('10');
  await page.click('#settings-drawer-close');
  await expect(page.locator('#pause')).toBeVisible();
  await expect(page.locator('#pause')).toHaveText('Pause');

  await page.click('#pause');
  await expect(page.locator('#pause')).toHaveText('Resume');
  await expect(page.locator('#pause')).toBeVisible(); // a paused countdown keeps Resume

  await openMenu(page);
  await page.locator('#wait').selectOption('0');
  await page.click('#settings-drawer-close');
  await expect(page.locator('#pause')).toBeHidden(); // Never: no irrelevant Pause

  await openMenu(page);
  await page.locator('#wait').selectOption('10');
  await page.click('#settings-drawer-close');
  await page.click('#reveal');
  await expect(page.locator('#pause')).toBeHidden(); // revealed: no irrelevant Pause
});

test('opening the drawer does not pause or reset the recall timer', async ({ page }) => {
  await openMenu(page);
  await page.locator('#wait').selectOption('15');
  await page.click('#settings-drawer-close');
  await page.waitForTimeout(1200);
  const before = await page.locator('#timer').textContent();

  await openMenu(page);
  await page.waitForTimeout(1200);
  const during = await page.locator('#timer').textContent();
  expect(during).not.toBe(before); // the countdown kept advancing while open
  expect(await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.timerActive)).toBe(true);
});

// ---- Study scroll reset on navigation ----

test('question navigation resets the middle study scroller', async ({ page }) => {
  // Pin a small viewport so the card overflows and scrollTop can move,
  // regardless of the taller viewports some projects run this file under.
  await page.setViewportSize(VIEWPORTS.phone320);
  await page.evaluate(() => { document.getElementById('study-scroll').scrollTop = 80; });
  expect(await page.evaluate(() => document.getElementById('study-scroll').scrollTop)).toBeGreaterThan(0);
  await page.click('#next');
  expect(await page.evaluate(() => document.getElementById('study-scroll').scrollTop)).toBe(0);
});

// ---- Figure-viewer scroll preservation ----

test('opening and closing the figure viewer preserves the study scroller position', async ({ page }) => {
  // Pin a small viewport so the card overflows and scrollTop can move,
  // regardless of the taller viewports some projects run this file under.
  await page.setViewportSize(VIEWPORTS.phone320);
  await page.evaluate(() => {
    const bank = window.HAM_EXAM_BANKS.technician.questions;
    const target = bank.findIndex(q => q.id === 'T6C02');
    for (let i = 0; i < target; i += 1) document.getElementById('next').click();
  });
  await expect(page.locator('#study-figure-enlarge')).toBeVisible();

  await page.evaluate(() => { document.getElementById('study-scroll').scrollTop = 40; });
  const before = await page.evaluate(() => document.getElementById('study-scroll').scrollTop);
  expect(before).toBeGreaterThan(0);

  await page.click('#study-figure-enlarge');
  await expect(page.locator('#figure-viewer')).toBeVisible();
  await page.click('#figure-viewer-close');
  await expect(page.locator('#figure-viewer')).toBeHidden();

  const after = await page.evaluate(() => document.getElementById('study-scroll').scrollTop);
  expect(after).toBe(before);
});

test('opening and closing the figure viewer from an exam preserves the page scroll position', async ({ page }) => {
  await page.click('#menuButton');
  await page.click('#mockExamButton');
  await page.selectOption('#exam-pool-select', 'technician');
  await page.selectOption('#exam-timer-select', '0');
  await page.click('#exam-start');
  await expect(page.locator('#exam-session')).toBeVisible();
  await page.evaluate(() => {
    const bank = window.HAM_EXAM_BANKS.technician.questions;
    const s = window.HAM_EXAM_DIAGNOSTICS.examSession;
    s.questions.length = 0;
    // Two questions so Next/Previous are enabled and force a re-render.
    ['T6C02', 'T1A01'].forEach(id => s.questions.push(bank.find(q => q.id === id)));
    s.index = 0;
  });
  await page.click('#exam-next');
  await page.click('#exam-prev');
  await expect(page.locator('#exam-figure-enlarge')).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 120));
  const before = await page.evaluate(() => window.scrollY);

  await page.click('#exam-figure-enlarge');
  await expect(page.locator('#figure-viewer')).toBeVisible();
  await page.click('#figure-viewer-close');
  await expect(page.locator('#figure-viewer')).toBeHidden();

  const after = await page.evaluate(() => window.scrollY);
  expect(after).toBe(before);
});

// ---- Drawer / figure-viewer mutual exclusion ----

test('the drawer and the figure viewer are never open at the same time', async ({ page }) => {
  await page.evaluate(() => {
    const bank = window.HAM_EXAM_BANKS.technician.questions;
    const target = bank.findIndex(q => q.id === 'T6C02');
    for (let i = 0; i < target; i += 1) document.getElementById('next').click();
  });
  await page.click('#study-figure-enlarge');
  await expect(page.locator('#figure-viewer')).toBeVisible();

  // Opening the drawer while the viewer is open closes the viewer first.
  await page.evaluate(() => document.getElementById('menuButton').click());
  await expect(page.locator('#settings-drawer')).toBeVisible();
  await expect(page.locator('#figure-viewer')).toBeHidden();

  // Opening the viewer while the drawer is open closes the drawer first,
  // with no window where both are simultaneously present.
  const bothOpenAtSomePoint = await page.evaluate(() => {
    document.getElementById('study-figure-enlarge').click();
    const drawerOpen = !document.getElementById('settings-drawer').hidden;
    const viewerOpen = !document.getElementById('figure-viewer').hidden;
    return drawerOpen && viewerOpen;
  });
  expect(bothOpenAtSomePoint).toBe(false);
  await expect(page.locator('#figure-viewer')).toBeVisible();
  await expect(page.locator('#settings-drawer')).toBeHidden();
});

// ---- Help/exam transitions hide study-only bars/drawer ----

test('Help, exam setup, an active exam, and results all hide the study shell and drawer', async ({ page }) => {
  await page.click('#menuButton');
  await page.click('#helpButton');
  await expect(page.locator('#study-shell')).toBeHidden();
  await expect(page.locator('#settings-drawer')).toBeHidden();
  await page.click('#closeHelp');
  await expect(page.locator('#study-shell')).toBeVisible();

  await page.click('#menuButton');
  await page.click('#mockExamButton');
  await expect(page.locator('#study-shell')).toBeHidden();
  await expect(page.locator('#settings-drawer')).toBeHidden();

  await page.click('#exam-start');
  await expect(page.locator('#exam-session')).toBeVisible();
  await expect(page.locator('#study-shell')).toBeHidden();

  await setAllAnswersAndFinish(page);
  await expect(page.locator('#exam-results')).toBeVisible();
  await expect(page.locator('#study-shell')).toBeHidden();

  await page.click('#exam-return-study');
  await expect(page.locator('#study-shell')).toBeVisible();
});

async function setAllAnswersAndFinish(page) {
  const total = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examSession.questions.length);
  for (let i = 0; i < total; i += 1) {
    await page.locator('#exam-choices input[type="radio"][value="A"]').click();
    if (i < total - 1) await page.click('#exam-next');
  }
  await page.click('#exam-finish');
}

// ---- Layout: no horizontal overflow, safe-area clearance, viewport sizes ----

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  test(`@responsive study shell has no horizontal overflow at ${name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // The bottom bar (Previous/Reveal/Next) stays reachable without scrolling.
    await expect(page.locator('#bottom-bar')).toBeInViewport();
    await expect(page.locator('#next')).toBeInViewport();
  });
}

test('@responsive the last answer choice and reference can be scrolled fully into view', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone320);
  await page.locator('#ref').scrollIntoViewIfNeeded();
  await expect(page.locator('#ref')).toBeInViewport();
});

test('@responsive short landscape keeps the bottom bar reachable', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.landscape);
  await expect(page.locator('#bottom-bar')).toBeInViewport();
  await expect(page.locator('#menuButton')).toBeInViewport();
});

test('@responsive enlarged text does not clip top-bar or bottom-bar labels', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone320);
  await page.addStyleTag({ content: 'html { font-size: 24px !important; }' });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  // Labels wrap rather than being clipped: the Menu button grows tall enough
  // to contain its (now larger) text without overflowing its own box.
  const menuOverflow = await page.evaluate(() => {
    const el = document.getElementById('menuButton');
    return el.scrollHeight - el.clientHeight;
  });
  expect(menuOverflow).toBeLessThanOrEqual(1);
});

// ---- Reduced motion ----

test('the drawer opens and closes without a transition when reduced motion is preferred', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.click('#menuButton');
  // No animation to wait out: the drawer is immediately fully open.
  await expect(page.locator('#settings-drawer')).toHaveClass(/open/);
  const transitionDuration = await page.evaluate(() => {
    const panel = document.querySelector('.settings-drawer-panel');
    return getComputedStyle(panel).transitionDuration;
  });
  expect(transitionDuration).toMatch(/^0s(,\s*0s)*$/);

  await page.click('#settings-drawer-close');
  // Immediately hidden -- no leftover close timer to wait out.
  await expect(page.locator('#settings-drawer')).toBeHidden();
});

test('the drawer animates its slide transition when motion is not reduced', async ({ page }) => {
  const transitionDuration = await page.evaluate(() => {
    const panel = document.querySelector('.settings-drawer-panel');
    return getComputedStyle(panel).transitionDuration;
  });
  expect(transitionDuration).not.toMatch(/^0s(,\s*0s)*$/);
});
