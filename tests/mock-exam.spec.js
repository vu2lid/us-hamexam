// Phase 3: Mock Exam scoring, submission, and results tests.
// All tests run against the built dist/index.html.
const { test, expect } = require('@playwright/test');

// --- helpers ---

async function loadClean(page) {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('index.html');
  await expect(page.locator('#question')).not.toBeEmpty();
  expect(errors, `JS errors on load: ${errors.join('; ')}`).toHaveLength(0);
}

// Settings (Pool, Reveal after, Theme, Mock Exam, Help & About, Reset) live
// in the slide-in drawer opened via Menu (L1 responsive shell). Real user
// interaction opens it -- no force-clicks on a covered/hidden control. Once
// open, the drawer's backdrop covers Menu itself, so re-clicking it would
// hang; treat an already-open drawer as a no-op, matching real usage.
async function openMenu(page) {
  if (await page.locator('#settings-drawer').isVisible()) return;
  await page.click('#menuButton');
  await expect(page.locator('#settings-drawer')).toBeVisible();
}

async function openSetup(page) {
  await openMenu(page);
  await page.click('#mockExamButton');
  await expect(page.locator('#exam-setup')).toBeVisible();
}

async function startExam(page, poolKey) {
  await openSetup(page);
  if (poolKey) await page.selectOption('#exam-pool-select', poolKey);
  await page.click('#exam-start');
  await expect(page.locator('#exam-session')).toBeVisible();
}

async function answerAll(page, letter = 'A') {
  const total = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examSession.questions.length);
  for (let i = 0; i < total; i += 1) {
    await page.locator(`#exam-choices input[type="radio"][value="${letter}"]`).click();
    if (i < total - 1) await page.click('#exam-next');
  }
}

async function setSessionAnswers(page, correctCount, wrongCount = 0, unansweredCount = 0) {
  await page.evaluate(({ correctCount, wrongCount, unansweredCount }) => {
    const session = window.HAM_EXAM_DIAGNOSTICS.examSession;
    session.answers = {};
    session.questions.forEach((q, i) => {
      if (i < correctCount) {
        session.answers[q.id] = q.correct;
      } else if (i < correctCount + wrongCount) {
        const wrong = ['A', 'B', 'C', 'D'].filter(l => l !== q.correct)[0];
        session.answers[q.id] = wrong;
      }
    });
  }, { correctCount, wrongCount, unansweredCount });
}

async function getScoreSummary(page) {
  const boxes = await page.locator('#exam-score-summary > .exam-score-box:not(.exam-score-main)').all();
  const summary = {};
  for (const box of boxes) {
    const label = await box.locator('.exam-score-label').textContent();
    const value = await box.locator('.exam-score-value').textContent();
    summary[label.trim()] = value.trim();
  }
  return summary;
}

async function submitAllAnswered(page) {
  await setSessionAnswers(page, await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examSession.questions.length), 0, 0);
  await page.click('#exam-finish');
  await expect(page.locator('#exam-results')).toBeVisible();
}

// --- tests ---

test.describe('mock exam', () => {
  test.beforeEach(async ({ page }) => {
    await loadClean(page);
  });

  // 14. No console/page errors occur during normal usage.
  test('no console errors loading the app with exam UI present', async ({ page }) => {
    await expect(page.locator('#menuButton')).toBeVisible();
    await expect(page.locator('#exam-setup')).toBeHidden();
    await expect(page.locator('#exam-session')).toBeHidden();
  });

  // 1. Mock Exam entry point is visible and usable (reached via the settings
  // drawer -- see the L1 responsive-shell tests for drawer-specific coverage).
  test('@smoke Mock Exam button is visible in study mode and opens setup', async ({ page }) => {
    await openMenu(page);
    const btn = page.locator('#mockExamButton');
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
    await btn.click();
    await expect(page.locator('#exam-setup')).toBeVisible();
    await expect(page.locator('#study-shell')).toBeHidden();
    const mode = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examMode);
    expect(mode).toBe('exam-setup');
  });

  // 2. Setup view displays correct metadata for all three pools.
  test('setup metadata is correct for Technician', async ({ page }) => {
    await openSetup(page);
    await page.selectOption('#exam-pool-select', 'technician');
    const metaText = await page.locator('#exam-setup-meta').textContent();
    expect(metaText).toMatch(/35/);
    expect(metaText).toMatch(/26/);
    expect(metaText).toMatch(/2026.*2030|2030.*2026/);
  });

  test('setup metadata is correct for General', async ({ page }) => {
    await openSetup(page);
    await page.selectOption('#exam-pool-select', 'general');
    const metaText = await page.locator('#exam-setup-meta').textContent();
    expect(metaText).toMatch(/35/);
    expect(metaText).toMatch(/26/);
    expect(metaText).toMatch(/2023.*2027|2027.*2023/);
  });

  test('setup metadata is correct for Extra', async ({ page }) => {
    await openSetup(page);
    await page.selectOption('#exam-pool-select', 'extra');
    const metaText = await page.locator('#exam-setup-meta').textContent();
    expect(metaText).toMatch(/50/);
    expect(metaText).toMatch(/37/);
    expect(metaText).toMatch(/2024.*2028|2028.*2024/);
  });

  // 3. Starting Technician creates a 35-question session.
  test('@smoke Technician exam session has 35 questions', async ({ page }) => {
    await startExam(page, 'technician');
    const session = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examSession);
    expect(session).not.toBeNull();
    expect(session.poolKey).toBe('technician');
    expect(session.questions.length).toBe(35);
    expect(new Set(session.questions.map(q => q.id)).size).toBe(35);
    await expect(page.locator('#exam-progress')).toContainText('1 of 35');
  });

  // 4. Starting General creates a 35-question session.
  test('General exam session has 35 questions', async ({ page }) => {
    await startExam(page, 'general');
    const session = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examSession);
    expect(session.poolKey).toBe('general');
    expect(session.questions.length).toBe(35);
    await expect(page.locator('#exam-progress')).toContainText('1 of 35');
  });

  // 5. Starting Extra creates a 50-question session.
  test('Extra exam session has 50 questions', async ({ page }) => {
    await startExam(page, 'extra');
    const session = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examSession);
    expect(session.poolKey).toBe('extra');
    expect(session.questions.length).toBe(50);
    await expect(page.locator('#exam-progress')).toContainText('1 of 50');
  });

  // 6. The exam displays one question and four accessible answer choices.
  test('@smoke exam shows one question and four radio-button choices', async ({ page }) => {
    await startExam(page, 'technician');
    await expect(page.locator('#exam-question')).not.toBeEmpty();
    const radios = page.locator('#exam-choices input[type="radio"]');
    await expect(radios).toHaveCount(4);
    const labels = page.locator('#exam-choices .exam-choice-label');
    await expect(labels).toHaveCount(4);
    const values = await radios.evaluateAll(rs => rs.map(r => r.value));
    expect(values).toEqual(['A', 'B', 'C', 'D']);
  });

  // 6b. The answer fieldset retains a question-specific accessible legend.
  test('@compat exam answer fieldset keeps a question-specific accessible legend', async ({ page }) => {
    await startExam(page, 'technician');

    async function expectLegendForCurrentQuestion() {
      const qid = await page.evaluate(() => {
        const s = window.HAM_EXAM_DIAGNOSTICS.examSession;
        return s.questions[s.index].id;
      });
      const fieldset = page.locator('#exam-choices');
      const legends = fieldset.locator('legend');
      await expect(legends).toHaveCount(1);
      const legend = legends.first();
      await expect(legend).toHaveClass(/visually-hidden/);
      await expect(legend).toHaveText('Answer choices for ' + qid);
      // The legend must precede the radio labels in DOM order.
      const firstChildTag = await fieldset.evaluate(el => el.firstElementChild && el.firstElementChild.tagName);
      expect(firstChildTag).toBe('LEGEND');
      // The fieldset gets its accessible name from the legend.
      await expect(fieldset).toHaveAccessibleName('Answer choices for ' + qid);
      return qid;
    }

    const firstId = await expectLegendForCurrentQuestion();
    await page.click('#exam-next');
    await expect(page.locator('#exam-progress')).toContainText('2 of 35');
    const secondId = await expectLegendForCurrentQuestion();
    expect(secondId).not.toBe(firstId);
    await page.click('#exam-prev');
    await expect(page.locator('#exam-progress')).toContainText('1 of 35');
    expect(await expectLegendForCurrentQuestion()).toBe(firstId);
  });

  // 6c. Focus moves into newly displayed exam views and is never stranded
  //     inside a hidden panel or on <body>.
  test('@compat setup focuses the pool select; starting an exam focuses the session heading', async ({ page }) => {
    await openSetup(page);
    expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('exam-pool-select');

    const sessionHeading = page.locator('#exam-session-heading');
    expect(await sessionHeading.getAttribute('tabindex')).toBe('-1');

    await page.selectOption('#exam-pool-select', 'technician');
    await page.click('#exam-start');
    await expect(page.locator('#exam-session')).toBeVisible();
    await expect(sessionHeading).toBeVisible();
    expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('exam-session-heading');
    // Focus must not remain inside the now-hidden setup panel.
    const focusInHiddenPanel = await page.evaluate(() => {
      var el = document.activeElement;
      return el ? el.closest('[hidden]') !== null : false;
    });
    expect(focusInHiddenPanel).toBe(false);

    // tabindex="-1" keeps the heading out of the ordinary Tab sequence:
    // tabbing through the session view must never land on it.
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      const id = await page.evaluate(() => document.activeElement && document.activeElement.id);
      expect(id).not.toBe('exam-session-heading');
    }
  });

  test('@compat submitting an exam focuses the results heading; retake focuses the session heading', async ({ page }) => {
    await startExam(page, 'technician');
    const total = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examSession.questions.length);
    await setSessionAnswers(page, total, 0, 0);
    await page.click('#exam-finish');
    await expect(page.locator('#exam-results')).toBeVisible();
    const resultsHeading = page.locator('#exam-results-heading');
    await expect(resultsHeading).toBeVisible();
    expect(await resultsHeading.getAttribute('tabindex')).toBe('-1');
    expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('exam-results-heading');
    // Focus must not remain inside the now-hidden session panel.
    const focusInHiddenPanel = await page.evaluate(() => {
      var el = document.activeElement;
      return el ? el.closest('[hidden]') !== null : false;
    });
    expect(focusInHiddenPanel).toBe(false);

    await page.click('#exam-retake');
    await expect(page.locator('#exam-session')).toBeVisible();
    await expect(page.locator('#exam-session-heading')).toBeVisible();
    expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('exam-session-heading');
  });

  test('@compat exit and return-to-study restore focus to the Menu button', async ({ page }) => {
    await startExam(page, 'technician');
    page.once('dialog', dialog => dialog.accept());
    await page.click('#exam-exit');
    await expect(page.locator('#exam-session')).toBeHidden();
    await expect(page.locator('#menuButton')).toBeVisible();
    expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('menuButton');

    await startExam(page, 'technician');
    const total = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examSession.questions.length);
    await setSessionAnswers(page, total, 0, 0);
    await page.click('#exam-finish');
    await expect(page.locator('#exam-results')).toBeVisible();
    await page.click('#exam-return-study');
    await expect(page.locator('#exam-results')).toBeHidden();
    await expect(page.locator('#menuButton')).toBeVisible();
    expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('menuButton');
  });

  test('@compat cancel restores focus to the Menu button', async ({ page }) => {
    await openSetup(page);
    await expect(page.locator('#exam-setup')).toBeVisible();
    expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('exam-pool-select');

    await page.click('#exam-cancel');
    await expect(page.locator('#exam-setup')).toBeHidden();
    await expect(page.locator('#study-shell')).toBeVisible();
    await expect(page.locator('#menuButton')).toBeVisible();
    const focusAfterCancel = await page.evaluate(() => {
      var el = document.activeElement;
      return {
        id: el && el.id,
        isBody: el === document.body,
        inHiddenAncestor: el ? el.closest('[hidden]') !== null : false
      };
    });
    expect(focusAfterCancel.id).toBe('menuButton');
    expect(focusAfterCancel.isBody).toBe(false);
    expect(focusAfterCancel.inHiddenAncestor).toBe(false);

    // The transition is repeatable: reopening setup focuses the pool select again.
    await openSetup(page);
    await expect(page.locator('#exam-setup')).toBeVisible();
    expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('exam-pool-select');
  });

  test('@compat Mock Exam setup defaults to the active study pool', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    const studyPool = page.locator('#pool');
    const examPool = page.locator('#exam-pool-select');
    const timer = page.locator('#exam-timer-select');
    const meta = page.locator('#exam-setup-meta');

    // 1. Fresh Technician study -> setup defaults to Technician, focus on the select.
    await openSetup(page);
    await expect(examPool).toHaveValue('technician');
    expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('exam-pool-select');
    await page.click('#exam-cancel');
    await expect(page.locator('#exam-setup')).toBeHidden();

    // 2. Study General -> setup defaults to General with General metadata and 35-min timer.
    await openMenu(page);
    await studyPool.selectOption('general');
    await openSetup(page);
    await expect(examPool).toHaveValue('general');
    expect(await meta.textContent()).toMatch(/2023.*2027|2027.*2023/);
    await expect(timer).toHaveValue('2100');

    // 3-4. Manually pick a different exam pool, cancel, reopen -> resets to the still-active study pool.
    await examPool.selectOption('extra');
    await page.click('#exam-cancel');
    await expect(page.locator('#exam-setup')).toBeHidden();
    await expect(studyPool).toHaveValue('general');
    await openSetup(page);
    await expect(examPool).toHaveValue('general');
    await expect(studyPool).toHaveValue('general');

    // 5. Return to study, switch to Extra, reopen -> setup defaults to Extra with Extra metadata and 50-min timer.
    await page.click('#exam-cancel');
    await openMenu(page);
    await studyPool.selectOption('extra');
    await openSetup(page);
    await expect(examPool).toHaveValue('extra');
    expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('exam-pool-select');
    expect(await meta.textContent()).toMatch(/2024.*2028|2028.*2024/);
    await expect(timer).toHaveValue('3000');

    // 6. Users can still manually choose another exam pool; it does not touch the active study pool.
    await examPool.selectOption('technician');
    await expect(examPool).toHaveValue('technician');
    await expect(timer).toHaveValue('2100');
    await expect(studyPool).toHaveValue('extra');

    // 8. No page or console errors during the whole flow.
    expect(errors, `Console/JS errors: ${errors.join('; ')}`).toHaveLength(0);
  });

  // 7. Selecting an answer updates the radio state.
  test('@compat selecting an answer checks the radio and marks the label selected', async ({ page }) => {
    await startExam(page, 'technician');
    const radios = page.locator('#exam-choices input[type="radio"]');
    await radios.nth(1).click();
    expect(await radios.nth(1).isChecked()).toBe(true);
    expect(await radios.nth(0).isChecked()).toBe(false);
    const labels = page.locator('#exam-choices .exam-choice-label');
    await expect(labels.nth(1)).toHaveClass(/selected/);
    await expect(labels.nth(0)).not.toHaveClass(/selected/);
    const answers = await page.evaluate(
      () => window.HAM_EXAM_DIAGNOSTICS.examSession.answers
    );
    const values = Object.values(answers);
    expect(values.length).toBe(1);
    expect(values[0]).toBe('B');
  });

  // 7b. An answer can be chosen with the keyboard alone: the radio group is
  //     reachable by Tab and operable with the arrow keys / Space, and the
  //     selection is recorded and visually marked without a pointer.
  test('@compat an answer can be selected using only the keyboard', async ({ page }) => {
    await startExam(page, 'technician');
    // Tab from the session heading until focus lands on a choice radio.
    let onRadio = false;
    for (let i = 0; i < 12 && !onRadio; i += 1) {
      await page.keyboard.press('Tab');
      onRadio = await page.evaluate(() => {
        const el = document.activeElement;
        return !!el && el.matches('#exam-choices input[type="radio"]');
      });
    }
    expect(onRadio, 'a choice radio is reachable by Tab').toBe(true);

    // Space checks the focused radio; the change handler records it.
    const firstValue = await page.evaluate(() => document.activeElement.value);
    await page.keyboard.press('Space');
    await expect(page.locator('#exam-choices input[type="radio"]:checked')).toHaveValue(firstValue);

    // Arrow keys move focus and selection within the native radio group.
    await page.keyboard.press('ArrowDown');
    const afterArrow = await page.evaluate(() => document.activeElement.value);
    expect(afterArrow).not.toBe(firstValue);

    await expect(page.locator('#exam-choices input[type="radio"]:checked')).toHaveValue(afterArrow);
    const selectedLabels = page.locator('#exam-choices .exam-choice-label.selected');
    await expect(selectedLabels).toHaveCount(1);
    await expect(selectedLabels.first()).toContainText(afterArrow + '.');

    const answers = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examSession.answers);
    expect(Object.values(answers)).toEqual([afterArrow]);
  });

  // 8. Previous/Next navigation works and preserves selected answers.
  test('navigation preserves selected answers across questions', async ({ page }) => {
    await startExam(page, 'technician');
    await page.locator('#exam-choices input[type="radio"][value="C"]').click();
    await expect(page.locator('#exam-progress')).toContainText('1 of 35');
    await page.click('#exam-next');
    await expect(page.locator('#exam-progress')).toContainText('2 of 35');
    const checkedCount = await page.locator('#exam-choices input[type="radio"]:checked').count();
    expect(checkedCount).toBe(0);
    await page.click('#exam-prev');
    await expect(page.locator('#exam-progress')).toContainText('1 of 35');
    const checkedValue = await page.locator('#exam-choices input[type="radio"]:checked').inputValue();
    expect(checkedValue).toBe('C');
    await expect(page.locator('#exam-choices .exam-choice-label.selected')).toHaveCount(1);
  });

  // 9. Exit confirmation cancel preserves the active session.
  test('dismissing the exit confirmation keeps the session active', async ({ page }) => {
    await startExam(page, 'technician');
    page.once('dialog', dialog => dialog.dismiss());
    await page.click('#exam-exit');
    await expect(page.locator('#exam-session')).toBeVisible();
    const mode = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examMode);
    expect(mode).toBe('exam');
    const session = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examSession);
    expect(session).not.toBeNull();
  });

  // 10. Exit confirmation accept returns to study mode.
  test('accepting the exit confirmation returns to study mode', async ({ page }) => {
    await startExam(page, 'technician');
    page.once('dialog', dialog => dialog.accept());
    await page.click('#exam-exit');
    await expect(page.locator('#exam-session')).toBeHidden();
    await expect(page.locator('#study-shell')).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
    const mode = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examMode);
    expect(mode).toBe('study');
    const session = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examSession);
    expect(session).toBeNull();
  });

  // 11. Study mode state remains unchanged after entering and exiting setup/exam.
  test('study pool, index, and theme survive a full setup/start/exit cycle', async ({ page }) => {
    await page.click('#next');
    await page.click('#next');
    const studyMeta = await page.locator('#meta').textContent();
    const studyProgress = await page.locator('#progress').textContent();

    await startExam(page, 'general');
    page.once('dialog', dialog => dialog.accept());
    await page.click('#exam-exit');

    await expect(page.locator('#meta')).toHaveText(studyMeta);
    await expect(page.locator('#progress')).toHaveText(studyProgress);
    await expect(page.locator('#pool')).toHaveValue('technician');
  });

  // 12. No exam session is written to localStorage.
  test('@compat no exam-session data is written to localStorage', async ({ page }) => {
    const keysBefore = await page.evaluate(
      () => Object.keys(localStorage).filter(k => /exam.session|mock/i.test(k))
    );
    await startExam(page, 'extra');
    await page.locator('#exam-choices input[type="radio"]').first().click();
    page.once('dialog', dialog => dialog.accept());
    await page.click('#exam-exit');
    const keysAfter = await page.evaluate(
      () => Object.keys(localStorage)
    );
    const newKeys = keysAfter.filter(k => !['ham-exam-state', 'ham-exam-pool', 'ham-exam-theme',
      'ham-exam-index-technician', 'ham-exam-index-general', 'ham-exam-index-extra',
      'ham-exam-bookmarks-technician', 'ham-exam-bookmarks-general',
      'ham-exam-bookmarks-extra'].includes(k));
    expect(keysBefore).toHaveLength(0);
    expect(newKeys).toHaveLength(0);
  });

  // 13. Layout: prev/next boundaries work; First and last question constraints hold.
  test('exam nav boundaries are enforced', async ({ page }) => {
    await startExam(page, 'technician');
    await expect(page.locator('#exam-prev')).toBeDisabled();
    await expect(page.locator('#exam-next')).toBeEnabled();
    const lastIdx = await page.evaluate(
      () => window.HAM_EXAM_DIAGNOSTICS.examSession.questions.length - 1
    );
    expect(lastIdx).toBe(34);
  });

  // 13 continued. Touch targets: key buttons meet 44px minimum height. Mock
  // Exam is reached via Menu -> the settings drawer, so both are checked.
  test('@responsive exam buttons meet 44px minimum touch target', async ({ page }) => {
    const h0 = await page.locator('#menuButton').evaluate(el => el.getBoundingClientRect().height);
    expect(h0, '#menuButton height').toBeGreaterThanOrEqual(44);

    await openMenu(page);
    const h1 = await page.locator('#mockExamButton').evaluate(el => el.getBoundingClientRect().height);
    expect(h1, '#mockExamButton height').toBeGreaterThanOrEqual(44);
  });

  test('@responsive exam session buttons meet 44px minimum touch target', async ({ page }) => {
    await startExam(page, 'technician');
    const btnIds = ['exam-finish', 'exam-exit', 'exam-prev', 'exam-next'];
    for (const id of btnIds) {
      const h = await page.locator('#' + id).evaluate(el => el.getBoundingClientRect().height);
      expect(h, `#${id} height`).toBeGreaterThanOrEqual(44);
    }
    const labels = page.locator('#exam-choices .exam-choice-label');
    for (let i = 0; i < 4; i++) {
      const h = await labels.nth(i).evaluate(el => el.getBoundingClientRect().height);
      expect(h, `choice label ${i} height`).toBeGreaterThanOrEqual(44);
    }
  });

  // 13 continued. No horizontal scroll at any viewport.
  test('@responsive exam setup view has no horizontal overflow', async ({ page }) => {
    await openSetup(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });

  test('@responsive exam session view has no horizontal overflow', async ({ page }) => {
    await startExam(page, 'technician');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });

  // 13 continued. Keyboard navigation: Tab reaches all major exam controls.
  test('keyboard focus can reach setup cancel and start buttons', async ({ page }) => {
    await openSetup(page);
    const focusedIds = new Set();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      const id = await page.evaluate(() => document.activeElement && document.activeElement.id);
      if (id) focusedIds.add(id);
    }
    expect(focusedIds.has('exam-cancel') || focusedIds.has('exam-pool-select') || focusedIds.has('exam-start'))
      .toBe(true);
  });

  test('review answer text renders HTML-like choice content safely', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await startExam(page, 'technician');
    const malicious = '<script>alert("x")</script>';
    await page.evaluate((text) => {
      const session = window.HAM_EXAM_DIAGNOSTICS.examSession;
      session.questions[0].choices.A = text;
    }, malicious);

    await answerAll(page, 'A');
    await page.click('#exam-finish');
    await expect(page.locator('#exam-results')).toBeVisible();

    const first = page.locator('.exam-review-item').nth(0);
    await expect(first.locator('.exam-review-answer')).toContainText(malicious);

    const scriptCount = await page.evaluate(() =>
      document.querySelectorAll('#exam-review-list script').length
    );
    expect(scriptCount).toBe(0);
    expect(errors, `JS errors during safe rendering: ${errors.join('; ')}`).toHaveLength(0);
  });

  // Help from study mode still works after the engine is loaded.
  test('Help still opens and closes normally from study mode', async ({ page }) => {
    await openMenu(page);
    await page.click('#helpButton');
    await expect(page.locator('#help')).toBeVisible();
    await expect(page.locator('#study-shell')).toBeHidden();
    await page.click('#closeHelp');
    await expect(page.locator('#help')).toBeHidden();
    await expect(page.locator('#study-shell')).toBeVisible();
  });

  // ---- Phase 3: scoring, submission, and results ----

  test('@smoke Finish Exam submits an all-answered exam and shows results', async ({ page }) => {
    await startExam(page, 'technician');
    await answerAll(page, 'A');
    await page.click('#exam-finish');
    await expect(page.locator('#exam-results')).toBeVisible();
    await expect(page.locator('#exam-session')).toBeHidden();
    const mode = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examMode);
    expect(mode).toBe('results');
  });

  test('score calculation is correct for known selected answers', async ({ page }) => {
    await startExam(page, 'technician');
    await setSessionAnswers(page, 20, 5, 10);
    page.once('dialog', dialog => dialog.accept());
    await page.click('#exam-finish');
    const summary = await getScoreSummary(page);
    expect(summary['Correct']).toBe('20');
    expect(summary['Incorrect']).toBe('5');
    expect(summary['Unanswered']).toBe('10');
    expect(summary['Total']).toBe('35');
    expect(summary['Passing']).toBe('26');
    await expect(page.locator('#exam-score-summary .exam-score-value').first()).toContainText('57%');
  });

  test('passing threshold is correct for Technician', async ({ page }) => {
    await startExam(page, 'technician');
    await setSessionAnswers(page, 26, 9, 0);
    await page.click('#exam-finish');
    await expect(page.locator('.exam-score-verdict')).toHaveText('Pass');
    const summary = await getScoreSummary(page);
    expect(summary['Passing']).toBe('26');
  });

  test('passing threshold is correct for General', async ({ page }) => {
    await startExam(page, 'general');
    await setSessionAnswers(page, 26, 9, 0);
    await page.click('#exam-finish');
    await expect(page.locator('.exam-score-verdict')).toHaveText('Pass');
    const summary = await getScoreSummary(page);
    expect(summary['Passing']).toBe('26');
  });

  test('passing threshold is correct for Extra', async ({ page }) => {
    await startExam(page, 'extra');
    await setSessionAnswers(page, 37, 13, 0);
    await page.click('#exam-finish');
    await expect(page.locator('.exam-score-verdict')).toHaveText('Pass');
    const summary = await getScoreSummary(page);
    expect(summary['Passing']).toBe('37');
  });

  test('fail status is correct one below passing score', async ({ page }) => {
    await startExam(page, 'technician');
    await setSessionAnswers(page, 25, 10, 0);
    await page.click('#exam-finish');
    await expect(page.locator('.exam-score-verdict')).toHaveText('Needs review');
  });

  test('unanswered questions count as incorrect for scoring', async ({ page }) => {
    await startExam(page, 'technician');
    await setSessionAnswers(page, 20, 0, 15);
    page.once('dialog', dialog => dialog.accept());
    await page.click('#exam-finish');
    const summary = await getScoreSummary(page);
    expect(summary['Correct']).toBe('20');
    expect(summary['Incorrect']).toBe('0');
    expect(summary['Unanswered']).toBe('15');
    expect(summary['Total']).toBe('35');
    // Verdict uses correct count vs passing threshold.
    await expect(page.locator('.exam-score-verdict')).toHaveText('Needs review');
  });

  test('submission confirmation appears when unanswered questions remain', async ({ page }) => {
    await startExam(page, 'technician');
    await setSessionAnswers(page, 5, 0, 30);
    let message = '';
    page.once('dialog', dialog => {
      message = dialog.message();
      dialog.accept();
    });
    await page.click('#exam-finish');
    expect(message).toMatch(/unanswered/i);
    expect(message).toMatch(/30/);
    await expect(page.locator('#exam-results')).toBeVisible();
  });

  test('cancelling submission preserves the active exam and answers', async ({ page }) => {
    await startExam(page, 'technician');
    await setSessionAnswers(page, 5, 0, 30);
    page.once('dialog', dialog => dialog.dismiss());
    await page.click('#exam-finish');
    await expect(page.locator('#exam-results')).toBeHidden();
    await expect(page.locator('#exam-session')).toBeVisible();
    const mode = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examMode);
    expect(mode).toBe('exam');
    const answeredCount = await page.evaluate(
      () => Object.keys(window.HAM_EXAM_DIAGNOSTICS.examSession.answers).length
    );
    expect(answeredCount).toBe(5);
  });

  test('results display correct percentage and counts', async ({ page }) => {
    await startExam(page, 'technician');
    await setSessionAnswers(page, 30, 5, 0);
    await page.click('#exam-finish');
    const summary = await getScoreSummary(page);
    expect(summary['Correct']).toBe('30');
    expect(summary['Incorrect']).toBe('5');
    expect(summary['Total']).toBe('35');
    await expect(page.locator('#exam-score-summary')).toContainText('86%');
    await expect(page.locator('.exam-score-verdict')).toHaveText('Pass');
  });

  test('missed-question review shows selected answer, correct answer, text, and reference', async ({ page }) => {
    await startExam(page, 'technician');
    // Answer the first question incorrectly, leave rest unanswered.
    await page.evaluate(() => {
      const session = window.HAM_EXAM_DIAGNOSTICS.examSession;
      const q = session.questions[0];
      const wrong = ['A', 'B', 'C', 'D'].filter(l => l !== q.correct)[0];
      session.answers[q.id] = wrong;
    });
    page.once('dialog', dialog => dialog.accept());
    await page.click('#exam-finish');

    const items = page.locator('.exam-review-item');
    await expect(items).toHaveCount(35);

    const first = items.nth(0);
    await expect(first).toHaveClass(/incorrect/);
    await expect(first.locator('.exam-review-status')).toHaveText('Incorrect');
    await expect(first.locator('.exam-review-question')).not.toBeEmpty();
    await expect(first.locator('.exam-review-answer')).toContainText('Your answer:');
    await expect(first.locator('.exam-review-correct')).toContainText('Correct answer:');
    await expect(first.locator('.exam-review-correct')).not.toBeEmpty();
    await expect(first.locator('.exam-review-ref')).toContainText('FCC reference:');
  });

  test('@compat subelement breakdown is a native accessible table with correct totals', async ({ page }) => {
    await startExam(page, 'technician');
    const expected = await page.evaluate(() => {
      const subs = {};
      window.HAM_EXAM_DIAGNOSTICS.examSession.questions.forEach(q => {
        const sub = q.sub || 'Unknown';
        subs[sub] = (subs[sub] || 0) + 1;
      });
      return subs;
    });
    await answerAll(page, 'A');
    await page.click('#exam-finish');
    await expect(page.locator('#exam-results')).toBeVisible();

    // Semantic lookup: the table's accessible name comes from the heading.
    const table = page.getByRole('table', { name: 'Subelement breakdown' });
    await expect(table).toBeVisible();
    // Structural assertions as a cross-engine fallback.
    expect(await table.evaluate(el => el.tagName)).toBe('TABLE');
    await expect(table.locator('thead')).toHaveCount(1);
    await expect(table.locator('tbody')).toHaveCount(1);

    const headers = table.getByRole('columnheader');
    await expect(headers).toHaveCount(3);
    await expect(headers.nth(0)).toHaveText('Subelement');
    await expect(headers.nth(1)).toHaveText('Correct');
    await expect(headers.nth(2)).toHaveText('Total');
    expect(await table.locator('thead th[scope="col"]').count()).toBe(3);

    const rows = table.locator('tbody tr');
    const rowCount = await rows.count();
    expect(rowCount).toBe(Object.keys(expected).length);

    const overallCorrect = await page.evaluate(() => {
      const s = window.HAM_EXAM_DIAGNOSTICS.examSession;
      return s.questions.filter(q => s.answers[q.id] === q.correct).length;
    });

    const seen = [];
    let sumCorrect = 0;
    let sumTotal = 0;
    for (let i = 0; i < rowCount; i += 1) {
      const row = rows.nth(i);
      const rowHeader = row.getByRole('rowheader');
      await expect(rowHeader).toHaveCount(1);
      expect(await row.locator('th[scope="row"]').count()).toBe(1);
      const cells = row.getByRole('cell');
      await expect(cells).toHaveCount(2);
      const sub = (await rowHeader.textContent()).trim();
      const correct = parseInt(await cells.nth(0).textContent(), 10);
      const rowTotal = parseInt(await cells.nth(1).textContent(), 10);
      expect(Number.isNaN(correct)).toBe(false);
      expect(Number.isNaN(rowTotal)).toBe(false);
      expect(expected[sub]).toBe(rowTotal);
      seen.push(sub);
      sumCorrect += correct;
      sumTotal += rowTotal;
    }
    expect(sumTotal).toBe(35);
    expect(sumCorrect).toBe(overallCorrect);
    // Rows remain alphabetically ordered by subelement.
    const sorted = seen.slice().sort();
    expect(seen).toEqual(sorted);
  });

  test('retake and resubmission do not duplicate subelement table headers or rows', async ({ page }) => {
    await startExam(page, 'technician');
    await submitAllAnswered(page);
    await page.click('#exam-retake');
    await expect(page.locator('#exam-session')).toBeVisible();
    await submitAllAnswered(page);

    const expectedRows = await page.evaluate(() => {
      const subs = {};
      window.HAM_EXAM_DIAGNOSTICS.examSession.questions.forEach(q => {
        subs[q.sub || 'Unknown'] = true;
      });
      return Object.keys(subs).length;
    });
    const table = page.locator('#exam-subelement-table');
    await expect(table.locator('thead tr')).toHaveCount(1);
    await expect(table.locator('thead th')).toHaveCount(3);
    await expect(table.locator('tbody tr')).toHaveCount(expectedRows);
  });

  test('return to study restores prior study question, pool, theme, bookmarks, and progress', async ({ page }) => {
    // Move study mode forward and bookmark current question.
    await page.click('#next');
    await page.click('#bookmark');
    const studyMeta = await page.locator('#meta').textContent();
    const studyProgress = await page.locator('#progress').textContent();
    const studyTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    const studyPool = await page.locator('#pool').inputValue();

    await startExam(page, 'general');
    await answerAll(page, 'A');
    await page.click('#exam-finish');
    await expect(page.locator('#exam-results')).toBeVisible();

    await page.click('#exam-return-study');
    await expect(page.locator('#exam-results')).toBeHidden();
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('#meta')).toHaveText(studyMeta);
    await expect(page.locator('#progress')).toHaveText(studyProgress);
    await expect(page.locator('#pool')).toHaveValue(studyPool);
    const themeAfter = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(themeAfter).toBe(studyTheme);
    const bookmarkPressed = await page.locator('#bookmark').getAttribute('aria-pressed');
    expect(bookmarkPressed).toBe('true');
    const mode = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examMode);
    expect(mode).toBe('study');
  });

  test('retake starts a fresh exam with empty answers', async ({ page }) => {
    await startExam(page, 'technician');
    await answerAll(page, 'A');
    const firstSessionIds = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examSession.questions.map(q => q.id));
    await page.click('#exam-finish');
    await expect(page.locator('#exam-results')).toBeVisible();

    await page.click('#exam-retake');
    await expect(page.locator('#exam-results')).toBeHidden();
    await expect(page.locator('#exam-session')).toBeVisible();
    const mode = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examMode);
    expect(mode).toBe('exam');
    const answeredCount = await page.evaluate(
      () => Object.keys(window.HAM_EXAM_DIAGNOSTICS.examSession.answers).length
    );
    expect(answeredCount).toBe(0);
    const newSessionIds = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examSession.questions.map(q => q.id));
    expect(newSessionIds.length).toBe(35);
  });

  test('no exam result data is written to localStorage', async ({ page }) => {
    await startExam(page, 'technician');
    await answerAll(page, 'A');
    await page.click('#exam-finish');
    await expect(page.locator('#exam-results')).toBeVisible();

    const examKeys = await page.evaluate(() => {
      const allowed = ['ham-exam-state', 'ham-exam-pool', 'ham-exam-theme',
        'ham-exam-index-technician', 'ham-exam-index-general', 'ham-exam-index-extra',
        'ham-exam-bookmarks-technician', 'ham-exam-bookmarks-general', 'ham-exam-bookmarks-extra'];
      return Object.keys(localStorage).filter(k => !allowed.includes(k) && /exam|result|mock/i.test(k));
    });
    expect(examKeys).toHaveLength(0);
  });

  test('@responsive results view has no horizontal overflow', async ({ page }) => {
    await startExam(page, 'technician');
    await answerAll(page, 'A');
    await page.click('#exam-finish');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });

  test('@responsive results action buttons meet 44px touch target', async ({ page }) => {
    await startExam(page, 'technician');
    await answerAll(page, 'A');
    await page.click('#exam-finish');
    for (const id of ['exam-retake', 'exam-return-study']) {
      const h = await page.locator('#' + id).evaluate(el => el.getBoundingClientRect().height);
      expect(h, `#${id} height`).toBeGreaterThanOrEqual(44);
    }
  });

  test('results view is usable at mobile, tablet, and desktop viewports', async ({ page }) => {
    await startExam(page, 'technician');
    await answerAll(page, 'A');
    await page.click('#exam-finish');
    await expect(page.locator('#exam-results-heading')).toBeVisible();
    await expect(page.locator('#exam-score-summary')).toBeVisible();
    await expect(page.locator('#exam-subelement-table')).toBeVisible();
    await expect(page.locator('#exam-review-list')).toBeVisible();
    await expect(page.locator('#exam-retake')).toBeVisible();
    await expect(page.locator('#exam-return-study')).toBeVisible();
  });

  // ---- Phase 4: practice timer tests (non-clock) ----

  // T1. Setup screen shows the timer selector.
  test('exam setup displays the timer selector', async ({ page }) => {
    await openSetup(page);
    await expect(page.locator('#exam-timer-select')).toBeVisible();
    const opts = await page.locator('#exam-timer-select option').allTextContents();
    expect(opts.some(t => t.includes('35'))).toBe(true);
    expect(opts.some(t => t.toLowerCase().includes('no timer'))).toBe(true);
  });

  // T2. Pool-specific defaults: Technician/General → 35 min (2100s), Extra → 50 min (3000s).
  test('timer default is pool-specific: Technician and General use 35 min, Extra uses 50 min', async ({ page }) => {
    await openSetup(page);
    await page.selectOption('#exam-pool-select', 'technician');
    await expect(page.locator('#exam-timer-select')).toHaveValue('2100');
    await page.selectOption('#exam-pool-select', 'general');
    await expect(page.locator('#exam-timer-select')).toHaveValue('2100');
    await page.selectOption('#exam-pool-select', 'extra');
    await expect(page.locator('#exam-timer-select')).toHaveValue('3000');
  });

  // T3. Manual timer selection is preserved when switching pools.
  test('manual timer selection is not overridden when pool changes', async ({ page }) => {
    await openSetup(page);
    await page.selectOption('#exam-pool-select', 'technician');
    await page.selectOption('#exam-timer-select', '900');
    await page.selectOption('#exam-pool-select', 'general');
    await expect(page.locator('#exam-timer-select')).toHaveValue('900');
    await page.selectOption('#exam-pool-select', 'extra');
    await expect(page.locator('#exam-timer-select')).toHaveValue('900');
  });

  // T4. Starting a timed exam creates the expected timer state.
  test('starting a timed exam sets timeLimitSeconds, remainingSeconds, and deadline', async ({ page }) => {
    await openSetup(page);
    await page.selectOption('#exam-pool-select', 'technician');
    await page.selectOption('#exam-timer-select', '900');
    await page.click('#exam-start');
    await expect(page.locator('#exam-session')).toBeVisible();
    const state = await page.evaluate(() => {
      const s = window.HAM_EXAM_DIAGNOSTICS.examSession;
      return { timeLimitSeconds: s.timeLimitSeconds, remainingSeconds: s.remainingSeconds, hasDeadline: s.deadline !== null };
    });
    expect(state.timeLimitSeconds).toBe(900);
    expect(state.remainingSeconds).toBe(900);
    expect(state.hasDeadline).toBe(true);
  });

  // T12. Manual submission shows the unanswered confirmation when needed, and results say "submitted manually".
  test('manual submission shows unanswered dialog and results say submitted manually', async ({ page }) => {
    let dialogText = '';
    page.on('dialog', async dialog => { dialogText = dialog.message(); await dialog.accept(); });
    await startExam(page, 'technician');
    // leave at least one unanswered
    await page.click('#exam-finish');
    await expect(page.locator('#exam-results')).toBeVisible();
    expect(dialogText).toMatch(/unanswered/i);
    const status = await page.locator('#exam-result-status').textContent();
    expect(status).toMatch(/submitted manually/i);
  });

  // T16. The study recall timer is unaffected by the exam timer.
  test('study recall timer state is preserved across exam entry and exit', async ({ page }) => {
    page.on('dialog', async dialog => dialog.accept());
    const studyWait = await page.evaluate(() => {
      var sel = document.getElementById('wait');
      return sel ? Number(sel.value) : -1;
    });
    expect(studyWait).toBeGreaterThan(0);
    await startExam(page, 'technician');
    await page.click('#exam-exit');
    await expect(page.locator('#card')).toBeVisible();
    const studyWaitAfter = await page.evaluate(() => {
      var sel = document.getElementById('wait');
      return sel ? Number(sel.value) : -1;
    });
    expect(studyWaitAfter).toBe(studyWait);
  });

  // T17. Timer element does not announce every second (aria-live="off").
  test('@compat exam timer element does not use a live region that announces every tick', async ({ page }) => {
    const liveValue = await page.locator('#exam-timer').getAttribute('aria-live');
    expect(liveValue).toBe('off');
  });

  // T18. A separate accessible announcement element exists for state transitions,
  //      is outside #exam-session (so it is never hidden by the session panel), and
  //      is not a descendant of any element with the hidden attribute on page load.
  test('@compat a visually-hidden live-region element exists for timer state announcements', async ({ page }) => {
    const el = page.locator('#exam-timer-announce');
    await expect(el).toBeAttached();
    const liveValue = await el.getAttribute('aria-live');
    expect(liveValue).toBe('assertive');
    const atomic = await el.getAttribute('aria-atomic');
    expect(atomic).toBe('true');
    // Must not be a descendant of #exam-session.
    const insideSession = await page.evaluate(() =>
      document.querySelector('#exam-session').contains(document.getElementById('exam-timer-announce'))
    );
    expect(insideSession).toBe(false);
  });

  // T19. warning and urgent classes have theme-appropriate CSS color properties.
  test('exam-timer warning and urgent classes carry background and color styles', async ({ page }) => {
    // Inject elements with warning and urgent classes and verify computed styles differ
    // from the unstyled timer, confirming the CSS rules are applied.
    const styles = await page.evaluate(() => {
      function getComputedBg(cls) {
        var el = document.createElement('span');
        el.className = 'exam-timer' + (cls ? ' ' + cls : '');
        document.body.appendChild(el);
        var bg = window.getComputedStyle(el).backgroundColor;
        document.body.removeChild(el);
        return bg;
      }
      return {
        normal: getComputedBg(''),
        warning: getComputedBg('warning'),
        urgent: getComputedBg('urgent')
      };
    });
    // Warning and urgent backgrounds must differ from each other and from normal.
    expect(styles.warning).not.toBe(styles.normal);
    expect(styles.urgent).not.toBe(styles.normal);
    expect(styles.warning).not.toBe(styles.urgent);
  });
});

// ---- Phase 4: fake-clock timer tests ----
// These tests install the clock BEFORE page navigation so fake timers
// intercept Date.now(), setInterval, and clearInterval from the start.
// page.clock.runFor() is the Playwright 1.45+ equivalent of sinon's tick().

test.describe('mock exam — fake clock timer', () => {
  async function loadWithClock(page) {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.clock.install({ time: 0 });
    await page.goto('index.html');
    await expect(page.locator('#question')).not.toBeEmpty();
    expect(errors, `JS errors on load: ${errors.join('; ')}`).toHaveLength(0);
  }

  // Inject a short-duration option so tests don't have to advance 900+ seconds.
  async function addShortTimerOption(page, seconds) {
    await page.evaluate((s) => {
      var sel = document.getElementById('exam-timer-select');
      if (!sel.querySelector('option[value="' + s + '"]')) {
        var opt = document.createElement('option');
        opt.value = String(s);
        opt.textContent = s + ' seconds (test)';
        sel.appendChild(opt);
      }
    }, seconds);
  }

  async function openSetupClocked(page) {
    await page.click('#menuButton');
    await expect(page.locator('#settings-drawer')).toBeVisible();
    await page.click('#mockExamButton');
    await expect(page.locator('#exam-setup')).toBeVisible();
  }

  // T5. Countdown updates each second.
  test('timer counts down each second', async ({ page }) => {
    await loadWithClock(page);
    await openSetupClocked(page);
    await page.selectOption('#exam-pool-select', 'technician');
    await page.selectOption('#exam-timer-select', '900');
    await page.click('#exam-start');
    await expect(page.locator('#exam-session')).toBeVisible();
    const before = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examSession.remainingSeconds);
    await page.clock.runFor(5000);
    const after = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examSession.remainingSeconds);
    expect(before - after).toBe(5);
  });

  // T6. Navigation does not reset the exam timer.
  test('navigating between questions does not reset the timer', async ({ page }) => {
    await loadWithClock(page);
    await openSetupClocked(page);
    await page.selectOption('#exam-pool-select', 'technician');
    await page.selectOption('#exam-timer-select', '900');
    await page.click('#exam-start');
    await expect(page.locator('#exam-session')).toBeVisible();
    await page.clock.runFor(10000);
    await page.click('#exam-next');
    await page.click('#exam-prev');
    const remaining = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examSession.remainingSeconds);
    expect(remaining).toBeLessThanOrEqual(890);
    expect(remaining).toBeGreaterThan(0);
  });

  // T7. Warning state appears at ≤5 minutes (300 s).
  test('timer shows warning state when 5 minutes or less remain', async ({ page }) => {
    await loadWithClock(page);
    await openSetupClocked(page);
    await page.selectOption('#exam-pool-select', 'technician');
    // Start with 15 min (900s), advance 601s → 299s remaining → warning
    await page.selectOption('#exam-timer-select', '900');
    await page.click('#exam-start');
    await expect(page.locator('#exam-session')).toBeVisible();
    await page.clock.runFor(601000);
    const cls = await page.locator('#exam-timer').getAttribute('class');
    expect(cls).toContain('warning');
    const txt = await page.locator('#exam-timer').textContent();
    expect(txt).toMatch(/Warning/i);
  });

  // T8. Urgent state appears at ≤1 minute (60 s).
  test('timer shows urgent state when 1 minute or less remains', async ({ page }) => {
    await loadWithClock(page);
    await openSetupClocked(page);
    await page.selectOption('#exam-pool-select', 'technician');
    // Start with 15 min (900s), advance 841s → 59s remaining → urgent
    await page.selectOption('#exam-timer-select', '900');
    await page.click('#exam-start');
    await expect(page.locator('#exam-session')).toBeVisible();
    await page.clock.runFor(841000);
    const cls = await page.locator('#exam-timer').getAttribute('class');
    expect(cls).toContain('urgent');
    const txt = await page.locator('#exam-timer').textContent();
    expect(txt).toMatch(/Urgent/i);
  });

  // T9. Automatic submission occurs when the deadline is reached.
  test('exam is submitted automatically when the timer reaches zero', async ({ page }) => {
    await loadWithClock(page);
    await openSetupClocked(page);
    await page.selectOption('#exam-pool-select', 'technician');
    await addShortTimerOption(page, 60);
    await page.selectOption('#exam-timer-select', '60');
    await page.click('#exam-start');
    await expect(page.locator('#exam-session')).toBeVisible();
    await page.clock.runFor(61000);
    await expect(page.locator('#exam-results')).toBeVisible();
  });

  // T10. Auto-submission bypasses the unanswered confirmation dialog.
  test('automatic submission does not show the unanswered confirmation dialog', async ({ page }) => {
    let dialogFired = false;
    page.on('dialog', async dialog => { dialogFired = true; await dialog.dismiss(); });
    await loadWithClock(page);
    await openSetupClocked(page);
    await page.selectOption('#exam-pool-select', 'technician');
    await addShortTimerOption(page, 60);
    await page.selectOption('#exam-timer-select', '60');
    await page.click('#exam-start');
    await expect(page.locator('#exam-session')).toBeVisible();
    await page.clock.runFor(61000);
    await expect(page.locator('#exam-results')).toBeVisible();
    expect(dialogFired).toBe(false);
  });

  // T11. Results identify a timed-out submission.
  test('results status indicates "time expired" when submitted automatically', async ({ page }) => {
    await loadWithClock(page);
    await openSetupClocked(page);
    await page.selectOption('#exam-pool-select', 'technician');
    await addShortTimerOption(page, 60);
    await page.selectOption('#exam-timer-select', '60');
    await page.click('#exam-start');
    await expect(page.locator('#exam-session')).toBeVisible();
    await page.clock.runFor(61000);
    await expect(page.locator('#exam-results')).toBeVisible();
    const status = await page.locator('#exam-result-status').textContent();
    expect(status).toMatch(/time expired/i);
  });

  // T13. No-timer mode: never auto-submits and timer display says "No time limit".
  test('no-timer mode shows no time limit and never auto-submits', async ({ page }) => {
    await loadWithClock(page);
    await openSetupClocked(page);
    await page.selectOption('#exam-pool-select', 'technician');
    await page.selectOption('#exam-timer-select', '0');
    await page.click('#exam-start');
    await expect(page.locator('#exam-session')).toBeVisible();
    const timerText = await page.locator('#exam-timer').textContent();
    expect(timerText).toMatch(/no time limit/i);
    await page.clock.runFor(7200000);
    await expect(page.locator('#exam-session')).toBeVisible();
    await expect(page.locator('#exam-results')).toBeHidden();
    const isActive = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examTimerActive);
    expect(isActive).toBe(false);
  });

  // T14. Exiting the exam stops the timer interval.
  test('exiting the exam stops the countdown timer', async ({ page }) => {
    page.on('dialog', async dialog => dialog.accept());
    await loadWithClock(page);
    await openSetupClocked(page);
    await page.selectOption('#exam-pool-select', 'technician');
    await page.selectOption('#exam-timer-select', '900');
    await page.click('#exam-start');
    await expect(page.locator('#exam-session')).toBeVisible();
    await page.clock.runFor(5000);
    await page.click('#exam-exit');
    await expect(page.locator('#card')).toBeVisible();
    const isActive = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examTimerActive);
    expect(isActive).toBe(false);
  });

  // T15. Retaking creates a fresh timer.
  test('retaking the exam creates a fresh countdown', async ({ page }) => {
    page.on('dialog', async dialog => dialog.accept());
    await loadWithClock(page);
    await openSetupClocked(page);
    await page.selectOption('#exam-pool-select', 'technician');
    await page.selectOption('#exam-timer-select', '900');
    await page.click('#exam-start');
    await expect(page.locator('#exam-session')).toBeVisible();
    await page.clock.runFor(30000);
    await page.click('#exam-finish');
    await expect(page.locator('#exam-results')).toBeVisible();
    await page.click('#exam-retake');
    await expect(page.locator('#exam-session')).toBeVisible();
    const remaining = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examSession.remainingSeconds);
    expect(remaining).toBe(900);
  });

  // Stale announcement: retaking after a warning clears the announce region.
  test('announcement region is cleared when retaking after a warning state', async ({ page }) => {
    page.on('dialog', async dialog => dialog.accept());
    await loadWithClock(page);
    await openSetupClocked(page);
    await page.selectOption('#exam-pool-select', 'technician');
    await page.selectOption('#exam-timer-select', '900');
    await page.click('#exam-start');
    await expect(page.locator('#exam-session')).toBeVisible();
    // Advance into warning territory (< 300 s remaining).
    await page.clock.runFor(601000);
    const warnText = await page.locator('#exam-timer-announce').textContent();
    expect(warnText).toMatch(/Warning/i);
    // Submit and retake — startExamTimer must clear the announce region.
    await page.click('#exam-finish');
    await expect(page.locator('#exam-results')).toBeVisible();
    await page.click('#exam-retake');
    await expect(page.locator('#exam-session')).toBeVisible();
    const announceText = await page.locator('#exam-timer-announce').textContent();
    expect(announceText).toBe('');
  });

  // Timeout announcement: expiry message is written to the announce region,
  // which remains attached and not hidden after the session panel is hidden.
  test('announce region shows expiration message when timer reaches zero', async ({ page }) => {
    await loadWithClock(page);
    await openSetupClocked(page);
    await page.selectOption('#exam-pool-select', 'technician');
    await addShortTimerOption(page, 60);
    await page.selectOption('#exam-timer-select', '60');
    await page.click('#exam-start');
    await expect(page.locator('#exam-session')).toBeVisible();
    await page.clock.runFor(61000);
    await expect(page.locator('#exam-results')).toBeVisible();
    // The announce region is outside #exam-session so it is never hidden.
    const el = page.locator('#exam-timer-announce');
    await expect(el).toBeAttached();
    // Visually-hidden ≠ display:none — confirm it is not inside a hidden panel.
    const isHidden = await page.evaluate(() => {
      var el = document.getElementById('exam-timer-announce');
      return el ? el.closest('[hidden]') !== null : true;
    });
    expect(isHidden).toBe(false);
    const announceText = await el.textContent();
    expect(announceText).toMatch(/time expired/i);
  });

  // Manual submission after warning clears the announce region.
  test('announce region is empty after manual submission during warning state', async ({ page }) => {
    page.on('dialog', async dialog => dialog.accept());
    await loadWithClock(page);
    await openSetupClocked(page);
    await page.selectOption('#exam-pool-select', 'technician');
    await page.selectOption('#exam-timer-select', '900');
    await page.click('#exam-start');
    await expect(page.locator('#exam-session')).toBeVisible();
    // Advance into warning territory (< 300 s remaining).
    await page.clock.runFor(601000);
    const warnText = await page.locator('#exam-timer-announce').textContent();
    expect(warnText).toMatch(/Warning/i);
    // Manually submit (unanswered questions → dialog accepted by handler above).
    await page.click('#exam-finish');
    await expect(page.locator('#exam-results')).toBeVisible();
    const announceText = await page.locator('#exam-timer-announce').textContent();
    expect(announceText).toBe('');
  });

  // Stage 3C: timer expiry while the figure viewer is open.
  test('timer expiry while the figure viewer is open submits normally and focuses the results heading', async ({ page }) => {
    await loadWithClock(page);
    await openSetupClocked(page);
    await page.selectOption('#exam-pool-select', 'technician');
    await addShortTimerOption(page, 5);
    await page.selectOption('#exam-timer-select', '5');
    await page.click('#exam-start');
    await expect(page.locator('#exam-session')).toBeVisible();

    // Pin a deterministic figure-bearing first question, then re-render it.
    await page.evaluate(() => {
      const bank = window.HAM_EXAM_BANKS.technician.questions;
      const s = window.HAM_EXAM_DIAGNOSTICS.examSession;
      s.questions.length = 0;
      ['T6C02', 'T6C03'].forEach((id) => s.questions.push(bank.find((q) => q.id === id)));
      s.answers = {};
      s.index = 0;
    });
    await page.click('#exam-next');
    await page.click('#exam-prev');
    await expect(page.locator('#exam-q-meta')).toContainText('T6C02');

    await page.locator('#exam-figure-enlarge').click();
    await expect(page.locator('#figure-viewer')).toBeVisible();

    // Run past the 5-second practice timer.
    await page.clock.runFor(6000);

    await expect(page.locator('#figure-viewer')).toBeHidden();
    await expect(page.locator('#exam-results')).toBeVisible();
    expect(await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examMode)).toBe('results');
    expect(await page.evaluate(() => document.activeElement && document.activeElement.id))
      .toBe('exam-results-heading');
    expect(await page.evaluate(() => document.body.classList.contains('figure-viewer-open')))
      .toBe(false);
    await expect(page.locator('#exam-result-status')).toContainText(/time expired/i);
  });
});

// --------------------------------------------------------------------------
// Stage 3B: figure rendering in active mock-exam questions and results review.
//
// Deterministic sessions are built by replacing the live session's question
// list through window.HAM_EXAM_DIAGNOSTICS.examSession (the same object the
// existing helpers mutate). No test depends on a random exam happening to
// include a figure question, and no production test-only switch is added.
// --------------------------------------------------------------------------

const FIG_MANIFEST = require('../data/figures.json');
const figManifestAlt = (id) => FIG_MANIFEST.figures.find((f) => f.id === id).alt;

// Real figure-bearing question IDs (see data/*.json). Each set mixes a
// figure question, a non-figure question, and a further figure question.
const DET = {
  technician: ['T6C02', 'T1A01', 'T6A09'], // T-1, none, T-2
  general: ['G7A09', 'G1A01', 'G7A10'],    // G7-1, none, G7-1 (shared)
  extra: ['E5C10', 'E1A01', 'E6A10'],      // E5-1, none, E6-1
};

async function registry(page) {
  return page.evaluate(() => window.HAM_EXAM_FIGURES);
}

async function startDeterministicExam(page, pool, ids) {
  await page.click('#menuButton');
  await expect(page.locator('#settings-drawer')).toBeVisible();
  await page.click('#mockExamButton');
  await expect(page.locator('#exam-setup')).toBeVisible();
  await page.selectOption('#exam-pool-select', pool);
  await page.selectOption('#exam-timer-select', '0'); // no countdown interval
  await page.click('#exam-start');
  await expect(page.locator('#exam-session')).toBeVisible();

  const applied = await page.evaluate(({ pool, ids }) => {
    const bank = window.HAM_EXAM_BANKS[pool].questions;
    const chosen = ids.map((id) => bank.find((q) => q.id === id));
    if (chosen.some((q) => !q)) return false;
    const s = window.HAM_EXAM_DIAGNOSTICS.examSession;
    s.questions.length = 0;
    chosen.forEach((q) => s.questions.push(q));
    s.answers = {};
    s.index = 0;
    return true;
  }, { pool, ids });
  expect(applied, `deterministic questions for ${pool}`).toBe(true);

  // Force showExamQuestion() to re-render question 1 from the new list.
  await page.click('#exam-next');
  await page.click('#exam-prev');
  await expect(page.locator('#exam-q-meta')).toContainText(ids[0]);
}

async function examFigureState(page) {
  return page.evaluate(() => {
    const img = document.getElementById('exam-figure-image');
    return {
      containerHidden: document.getElementById('exam-figure').hidden,
      frameHidden: document.getElementById('exam-figure-frame').hidden,
      unavailableHidden: document.getElementById('exam-figure-unavailable').hidden,
      caption: document.getElementById('exam-figure-caption').textContent,
      src: img.getAttribute('src'),
      alt: img.getAttribute('alt'),
      width: img.getAttribute('width'),
      height: img.getAttribute('height'),
    };
  });
}

// decoding="async": the image may not be decoded on the first paint after a
// src change. Retry until the browser reports it loaded.
async function expectImgLoaded(page, selector) {
  await expect
    .poll(() => page.evaluate((sel) => {
      const img = document.querySelector(sel);
      return !!img && img.complete && img.naturalWidth > 0;
    }, selector), { message: `image ${selector} never finished loading` })
    .toBe(true);
}

async function studyGoTo(page, pool, id) {
  await page.click('#menuButton');
  await expect(page.locator('#settings-drawer')).toBeVisible();
  await page.selectOption('#pool', pool);
  await expect(page.locator('#pool')).toHaveValue(pool);
  await page.click('#settings-drawer-close');
  await expect(page.locator('#settings-drawer')).toBeHidden();
  await page.evaluate(({ pool, id }) => {
    const bank = window.HAM_EXAM_BANKS[pool].questions;
    const target = bank.findIndex((q) => q.id === id);
    const cur = bank.findIndex(
      (q) => q.id === document.getElementById('meta').textContent.split(' · ')[0],
    );
    const btn = target >= cur ? 'next' : 'prev';
    for (let i = 0; i < Math.abs(target - cur); i += 1) document.getElementById(btn).click();
  }, { pool, id });
  await expect(page.locator('#meta')).toContainText(id);
}

test.describe('mock exam figures (Stage 3B)', () => {
  test.beforeEach(async ({ page }) => {
    await loadClean(page);
  });

  test('@smoke an active mock-exam question shows its figure with caption and alt', async ({ page }) => {
    await startDeterministicExam(page, 'technician', DET.technician);
    const reg = await registry(page);
    const s = await examFigureState(page);
    expect(s.containerHidden).toBe(false);
    expect(s.frameHidden).toBe(false);
    expect(s.unavailableHidden).toBe(true);
    expect(s.caption).toBe('Figure T-1');
    expect(s.src).toBe(reg['T-1'].src);
    expect(s.src.startsWith('data:image/png;base64,')).toBe(true);
    expect(s.alt).toBe(figManifestAlt('T-1'));
    expect(s.width).toBe(String(reg['T-1'].w));
    expect(s.height).toBe(String(reg['T-1'].h));
    await expectImgLoaded(page, '#exam-figure-image');

    // The figure is a sibling before the fieldset, never inside it.
    const insideFieldset = await page.evaluate(
      () => !!document.getElementById('exam-choices').querySelector('#exam-figure'),
    );
    expect(insideFieldset).toBe(false);
  });

  test('@compat active exam figures render correctly for all three pools', async ({ page }) => {
    for (const [pool, ids, figId] of [
      ['technician', DET.technician, 'T-1'],
      ['general', DET.general, 'G7-1'],
      ['extra', DET.extra, 'E5-1'],
    ]) {
      await startDeterministicExam(page, pool, ids);
      const reg = await registry(page);
      const s = await examFigureState(page);
      expect(s.caption, pool).toBe('Figure ' + figId);
      expect(s.alt, pool).toBe(figManifestAlt(figId));
      expect(s.src, pool).toBe(reg[figId].src);
      await expectImgLoaded(page, '#exam-figure-image');

      page.once('dialog', (d) => d.accept());
      await page.click('#exam-exit');
      await expect(page.locator('#exam-session')).toBeHidden();
    }
  });

  test('navigating figure → non-figure → figure updates the diagram and keeps answers', async ({ page }) => {
    await startDeterministicExam(page, 'technician', DET.technician); // [T-1, none, T-2]
    const reg = await registry(page);

    let s = await examFigureState(page);
    expect(s.caption).toBe('Figure T-1');
    expect(s.src).toBe(reg['T-1'].src);
    await page.locator('#exam-choices input[value="B"]').check();

    await page.click('#exam-next'); // Q2: no figure
    s = await examFigureState(page);
    expect(s.containerHidden).toBe(true);
    expect(s.frameHidden).toBe(true);
    expect(s.caption).toBe('');
    expect(s.src).toBe(null);
    expect(s.alt).toBe('');
    await page.locator('#exam-choices input[value="C"]').check();

    await page.click('#exam-next'); // Q3: T-2
    s = await examFigureState(page);
    expect(s.containerHidden).toBe(false);
    expect(s.caption).toBe('Figure T-2');
    expect(s.src).toBe(reg['T-2'].src);
    await expectImgLoaded(page, '#exam-figure-image');

    await page.click('#exam-prev');
    await page.click('#exam-prev'); // back to Q1
    s = await examFigureState(page);
    expect(s.caption).toBe('Figure T-1');
    expect(s.src).toBe(reg['T-1'].src);
    const checked = await page.evaluate(() => {
      const el = document.querySelector('#exam-choices input:checked');
      return el ? el.value : null;
    });
    expect(checked).toBe('B');
    const answers = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examSession.answers);
    expect(answers).toMatchObject({ T6C02: 'B', T1A01: 'C' });
  });

  test('a missing registry entry clears the previous exam image and shows unavailable', async ({ page }) => {
    await startDeterministicExam(page, 'technician', ['T6C02', 'T6A09']); // T-1, T-2
    const reg = await registry(page);
    let s = await examFigureState(page);
    expect(s.src).toBe(reg['T-1'].src);

    await page.evaluate(() => { delete window.HAM_EXAM_FIGURES['T-2']; });
    await page.click('#exam-next');
    s = await examFigureState(page);
    expect(s.caption).toBe('Figure T-2'); // identifier still shown
    expect(s.containerHidden).toBe(false);
    expect(s.frameHidden).toBe(true);
    expect(s.unavailableHidden).toBe(false); // concise unavailable indication
    expect(s.src).toBe(null); // no stale T-1 image
    expect(s.alt).toBe('');
  });

  test('@compat the answer fieldset keeps its legend and radio group with a figure present', async ({ page }) => {
    await startDeterministicExam(page, 'technician', DET.technician); // Q1 has T-1
    await expect(page.locator('#exam-choices > legend')).toHaveText('Answer choices for T6C02');
    await expect(page.locator('#exam-choices #exam-figure')).toHaveCount(0);

    await page.locator('#exam-choices input[value="A"]').focus();
    await page.keyboard.press('ArrowDown');
    const val = await page.evaluate(() => document.activeElement.value);
    expect(['B', 'C', 'D']).toContain(val);
    const answers = await page.evaluate(() => window.HAM_EXAM_DIAGNOSTICS.examSession.answers);
    expect(answers.T6C02).toBe(val);
  });

  test('results review shows each figure-bearing question its own diagram', async ({ page }) => {
    await startDeterministicExam(page, 'technician', ['T6C02', 'T6C03', 'T1A01']);
    await setSessionAnswers(page, 3, 0, 0); // all answered -> no confirm dialog
    await page.click('#exam-finish');
    await expect(page.locator('#exam-results')).toBeVisible();

    const items = page.locator('#exam-review-list > .exam-review-item');
    await expect(items).toHaveCount(3);

    const reg = await registry(page);
    const fig0 = items.nth(0).locator('.exam-review-figure');
    const fig1 = items.nth(1).locator('.exam-review-figure');
    const fig2 = items.nth(2).locator('.exam-review-figure');

    await expect(fig0).toHaveCount(1);
    await expect(fig1).toHaveCount(1);
    await expect(fig2).toHaveCount(0); // T1A01 has no figure

    await expect(items.nth(0).locator('.exam-review-meta')).toContainText('T6C02');
    await expect(items.nth(1).locator('.exam-review-meta')).toContainText('T6C03');
    await expect(fig0.locator('.study-figure-caption')).toHaveText('Figure T-1');
    await expect(fig1.locator('.study-figure-caption')).toHaveText('Figure T-1');

    const src0 = await fig0.locator('img').getAttribute('src');
    const src1 = await fig1.locator('img').getAttribute('src');
    expect(src0).toBe(reg['T-1'].src);
    expect(src1).toBe(reg['T-1'].src); // shared registry data URL, not duplicated
    await expectImgLoaded(
      page,
      '#exam-review-list > .exam-review-item:nth-child(1) .exam-review-figure img',
    );

    // No duplicate element IDs anywhere in the results panel.
    const dupIds = await page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll('#exam-results [id]')).map((el) => el.id);
      const seen = new Set();
      const dups = new Set();
      ids.forEach((id) => { if (seen.has(id)) dups.add(id); seen.add(id); });
      return Array.from(dups);
    });
    expect(dupIds).toEqual([]);
  });

  test('retake clears the previous results and starts with empty answers', async ({ page }) => {
    await startDeterministicExam(page, 'technician', ['T6C02', 'T6C03', 'T1A01']);
    await setSessionAnswers(page, 3, 0, 0);
    await page.click('#exam-finish');
    await expect(page.locator('#exam-results')).toBeVisible();
    await expect(page.locator('#exam-review-list .exam-review-figure')).toHaveCount(2);

    await page.click('#exam-retake');
    await expect(page.locator('#exam-session')).toBeVisible();
    await expect(page.locator('#exam-results')).toBeHidden();

    const answers = await page.evaluate(
      () => Object.keys(window.HAM_EXAM_DIAGNOSTICS.examSession.answers),
    );
    expect(answers).toEqual([]);
    const anyChecked = await page.evaluate(
      () => !!document.querySelector('#exam-choices input:checked'),
    );
    expect(anyChecked).toBe(false);
  });

  test('returning to study from results restores the prior study question and its figure', async ({ page }) => {
    await studyGoTo(page, 'general', 'G7A09'); // G7-1
    await expect(page.locator('#study-figure-caption')).toHaveText('Figure G7-1');
    const reg = await registry(page);
    const studySrcBefore = await page.locator('#study-figure-image').getAttribute('src');
    expect(studySrcBefore).toBe(reg['G7-1'].src);

    await startDeterministicExam(page, 'extra', DET.extra);
    await setSessionAnswers(page, 3, 0, 0);
    await page.click('#exam-finish');
    await expect(page.locator('#exam-results')).toBeVisible();
    await page.click('#exam-return-study');

    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('#meta')).toContainText('G7A09');
    await expect(page.locator('#study-figure-caption')).toHaveText('Figure G7-1');
    const studySrcAfter = await page.locator('#study-figure-image').getAttribute('src');
    expect(studySrcAfter).toBe(reg['G7-1'].src);
    await expectImgLoaded(page, '#study-figure-image');
  });

  test('@responsive exam and results figures stay within the viewport', async ({ page }) => {
    await startDeterministicExam(page, 'technician', ['T6C02', 'T1A01', 'T6C03']);
    await expect(page.locator('#exam-figure-image')).toBeVisible();
    let o = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      img: document.getElementById('exam-figure-image').getBoundingClientRect().width
        > document.documentElement.clientWidth,
    }));
    expect(o.doc).toBeLessThanOrEqual(0);
    expect(o.img).toBe(false);

    await setSessionAnswers(page, 3, 0, 0);
    await page.click('#exam-finish');
    await expect(page.locator('#exam-results')).toBeVisible();
    await expect(page.locator('.exam-review-figure img').first()).toBeVisible();
    o = await page.evaluate(() => {
      const img = document.querySelector('.exam-review-figure img');
      return {
        doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        img: img.getBoundingClientRect().width > document.documentElement.clientWidth,
      };
    });
    expect(o.doc).toBeLessThanOrEqual(0);
    expect(o.img).toBe(false);
  });
});

// --------------------------------------------------------------------------
// Stage 3C: shared figure viewer opened from an active exam and from results
// review. Fit + actual-size only; adjustable zoom/pinch/pan are deferred.
// --------------------------------------------------------------------------

async function expectViewerLoaded(page) {
  await expect
    .poll(() => page.evaluate(() => {
      const i = document.getElementById('figure-viewer-image');
      return !!i && i.complete && i.naturalWidth > 0;
    }), { message: 'viewer image never finished loading' })
    .toBe(true);
}

test.describe('figure viewer from exam and results (Stage 3C)', () => {
  test.beforeEach(async ({ page }) => {
    await loadClean(page);
  });

  test('@smoke opens from an active exam question and Close restores focus to the opener', async ({ page }) => {
    await startDeterministicExam(page, 'technician', DET.technician); // Q1 = T-1
    const reg = await registry(page);
    const opener = page.locator('#exam-figure-enlarge');
    await expect(opener).toHaveText('Enlarge Figure T-1');

    await opener.click();
    await expect(page.locator('#figure-viewer')).toBeVisible();
    await expect(page.locator('#figure-viewer-title')).toHaveText('Figure T-1');
    await expect(page.locator('#figure-viewer-stage')).toHaveClass(/is-fit/);
    expect(await page.locator('#figure-viewer-image').getAttribute('src')).toBe(reg['T-1'].src);
    await expectViewerLoaded(page);

    await page.locator('#figure-viewer-close').click();
    await expect(page.locator('#figure-viewer')).toBeHidden();
    expect(await page.evaluate(() => document.activeElement && document.activeElement.id))
      .toBe('exam-figure-enlarge');
  });

  test('two results entries sharing one figure restore focus to their own button', async ({ page }) => {
    await startDeterministicExam(page, 'technician', ['T6C02', 'T6C03', 'T1A01']);
    await setSessionAnswers(page, 3, 0, 0);
    await page.click('#exam-finish');
    await expect(page.locator('#exam-results')).toBeVisible();

    const items = page.locator('#exam-review-list > .exam-review-item');
    const btn0 = items.nth(0).locator('.exam-review-figure-enlarge');
    const btn1 = items.nth(1).locator('.exam-review-figure-enlarge');
    await expect(btn0).toHaveText('Enlarge Figure T-1');
    await expect(btn1).toHaveText('Enlarge Figure T-1');
    await expect(items.nth(2).locator('.exam-review-figure-enlarge')).toHaveCount(0);

    // Tag each button so we can prove focus returns to the exact node.
    await page.evaluate(() => {
      const b = document.querySelectorAll('#exam-review-list .exam-review-figure-enlarge');
      b[0].dataset.testTag = 'first';
      b[1].dataset.testTag = 'second';
    });

    await btn0.click();
    await expect(page.locator('#figure-viewer')).toBeVisible();
    const reg = await registry(page);
    expect(await page.locator('#figure-viewer-image').getAttribute('src')).toBe(reg['T-1'].src);
    await page.keyboard.press('Escape');
    await expect(page.locator('#figure-viewer')).toBeHidden();
    expect(await page.evaluate(() => document.activeElement.dataset.testTag)).toBe('first');

    await btn1.click();
    await expect(page.locator('#figure-viewer')).toBeVisible();
    await page.locator('#figure-viewer-close').click();
    await expect(page.locator('#figure-viewer')).toBeHidden();
    expect(await page.evaluate(() => document.activeElement.dataset.testTag)).toBe('second');
  });

  test('@compat no duplicate element IDs in results with the viewer open', async ({ page }) => {
    await startDeterministicExam(page, 'technician', ['T6C02', 'T6C03', 'T1A01']);
    await setSessionAnswers(page, 3, 0, 0);
    await page.click('#exam-finish');
    await expect(page.locator('#exam-results')).toBeVisible();
    await page.locator('#exam-review-list .exam-review-figure-enlarge').first().click();
    await expect(page.locator('#figure-viewer')).toBeVisible();

    const dups = await page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll('[id]')).map((el) => el.id);
      const seen = new Set();
      const d = new Set();
      ids.forEach((id) => { if (seen.has(id)) d.add(id); seen.add(id); });
      return Array.from(d);
    });
    expect(dups).toEqual([]);
  });

  test('changing the exam question dismisses an open viewer', async ({ page }) => {
    await startDeterministicExam(page, 'technician', DET.technician); // Q1 T-1, Q2 none
    await page.locator('#exam-figure-enlarge').click();
    await expect(page.locator('#figure-viewer')).toBeVisible();

    await page.evaluate(() => document.getElementById('exam-next').click());
    await expect(page.locator('#figure-viewer')).toBeHidden();
    await expect(page.locator('#exam-q-meta')).toContainText('T1A01');
    await expect(page.locator('#exam-figure-enlarge')).toBeHidden();
  });

  test('retake dismisses an open viewer', async ({ page }) => {
    await startDeterministicExam(page, 'technician', ['T6C02', 'T6C03', 'T1A01']);
    await setSessionAnswers(page, 3, 0, 0);
    await page.click('#exam-finish');
    await expect(page.locator('#exam-results')).toBeVisible();
    await page.locator('#exam-review-list .exam-review-figure-enlarge').first().click();
    await expect(page.locator('#figure-viewer')).toBeVisible();

    await page.evaluate(() => document.getElementById('exam-retake').click());
    await expect(page.locator('#figure-viewer')).toBeHidden();
    await expect(page.locator('#exam-session')).toBeVisible();
    await expect(page.locator('#exam-results')).toBeHidden();
  });

  test('return to study dismisses an open viewer and restores the study view', async ({ page }) => {
    await studyGoTo(page, 'general', 'G7A09');
    await startDeterministicExam(page, 'extra', DET.extra);
    await setSessionAnswers(page, 3, 0, 0);
    await page.click('#exam-finish');
    await expect(page.locator('#exam-results')).toBeVisible();
    await page.locator('#exam-review-list .exam-review-figure-enlarge').first().click();
    await expect(page.locator('#figure-viewer')).toBeVisible();

    await page.evaluate(() => document.getElementById('exam-return-study').click());
    await expect(page.locator('#figure-viewer')).toBeHidden();
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('#meta')).toContainText('G7A09');
    expect(await page.evaluate(() => document.activeElement && document.activeElement.id))
      .toBe('menuButton');
  });

  test('opening the viewer changes no answers or exam state', async ({ page }) => {
    await startDeterministicExam(page, 'technician', DET.technician);
    await page.locator('#exam-choices input[value="B"]').check();
    const before = await page.evaluate(() => ({
      answers: window.HAM_EXAM_DIAGNOSTICS.examSession.answers,
      index: window.HAM_EXAM_DIAGNOSTICS.examSession.index,
    }));

    await page.locator('#exam-figure-enlarge').click();
    await expect(page.locator('#figure-viewer')).toBeVisible();
    await page.locator('#figure-viewer-actual').click();
    await page.locator('#figure-viewer-close').click();
    await expect(page.locator('#figure-viewer')).toBeHidden();

    const after = await page.evaluate(() => ({
      answers: window.HAM_EXAM_DIAGNOSTICS.examSession.answers,
      index: window.HAM_EXAM_DIAGNOSTICS.examSession.index,
      checked: !!document.querySelector('#exam-choices input:checked'),
      checkedValue: (document.querySelector('#exam-choices input:checked') || {}).value,
      sessionKeys: Object.keys(window.localStorage).filter(
        (k) => /session|answer|result/i.test(k),
      ),
    }));
    expect(after.answers).toEqual(before.answers);
    expect(after.answers).toEqual({ T6C02: 'B' });
    expect(after.index).toBe(before.index);
    expect(after.checked).toBe(true);
    expect(after.checkedValue).toBe('B');
    expect(after.sessionKeys).toEqual([]);
  });

  test('@compat keyboard-only open and close from an exam, with focus containment', async ({ page }) => {
    await startDeterministicExam(page, 'technician', DET.technician);
    await page.locator('#exam-figure-enlarge').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#figure-viewer')).toBeVisible();

    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(
        () => document.getElementById('figure-viewer').contains(document.activeElement),
      );
      expect(inside).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(page.locator('#figure-viewer')).toBeHidden();
    expect(await page.evaluate(() => document.activeElement.id)).toBe('exam-figure-enlarge');
  });

  test('@responsive the viewer is usable on a small viewport from an exam', async ({ page }) => {
    await startDeterministicExam(page, 'technician', DET.technician);
    await page.locator('#exam-figure-enlarge').click();
    await expect(page.locator('#figure-viewer')).toBeVisible();
    await expectViewerLoaded(page);

    const fits = await page.evaluate(() => {
      const dlg = document.querySelector('.figure-viewer-dialog').getBoundingClientRect();
      return {
        widthOk: dlg.width <= document.documentElement.clientWidth + 1,
        docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(fits.widthOk).toBe(true);
    expect(fits.docOverflow).toBeLessThanOrEqual(0);
    await expect(page.locator('#figure-viewer-close')).toBeInViewport();

    await page.locator('#figure-viewer-actual').click();
    const canScroll = await page.evaluate(() => {
      const s = document.getElementById('figure-viewer-stage');
      return s.scrollWidth > s.clientWidth + 1 || s.scrollHeight > s.clientHeight + 1;
    });
    expect(canScroll).toBe(true);
  });
});
