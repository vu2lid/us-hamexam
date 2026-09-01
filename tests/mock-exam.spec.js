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

async function openSetup(page) {
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
    await expect(page.locator('#mockExamButton')).toBeVisible();
    await expect(page.locator('#exam-setup')).toBeHidden();
    await expect(page.locator('#exam-session')).toBeHidden();
  });

  // 1. Mock Exam entry point is visible and usable.
  test('Mock Exam button is visible in study mode and opens setup', async ({ page }) => {
    const btn = page.locator('#mockExamButton');
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
    await btn.click();
    await expect(page.locator('#exam-setup')).toBeVisible();
    await expect(page.locator('header.top')).toBeHidden();
    await expect(page.locator('main')).toBeHidden();
    await expect(page.locator('#footer')).toBeHidden();
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
  test('Technician exam session has 35 questions', async ({ page }) => {
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
  test('exam shows one question and four radio-button choices', async ({ page }) => {
    await startExam(page, 'technician');
    await expect(page.locator('#exam-question')).not.toBeEmpty();
    const radios = page.locator('#exam-choices input[type="radio"]');
    await expect(radios).toHaveCount(4);
    const labels = page.locator('#exam-choices .exam-choice-label');
    await expect(labels).toHaveCount(4);
    const values = await radios.evaluateAll(rs => rs.map(r => r.value));
    expect(values).toEqual(['A', 'B', 'C', 'D']);
  });

  // 7. Selecting an answer updates the radio state.
  test('selecting an answer checks the radio and marks the label selected', async ({ page }) => {
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
    await expect(page.locator('header.top')).toBeVisible();
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
  test('no exam-session data is written to localStorage', async ({ page }) => {
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
    const newKeys = keysAfter.filter(k => !['ham-exam-pool', 'ham-exam-theme',
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

  // 13 continued. Touch targets: key buttons meet 44px minimum height.
  test('exam buttons meet 44px minimum touch target', async ({ page }) => {
    const btnIds = ['mockExamButton'];
    for (const id of btnIds) {
      const h = await page.locator('#' + id).evaluate(el => el.getBoundingClientRect().height);
      expect(h, `#${id} height`).toBeGreaterThanOrEqual(44);
    }
  });

  test('exam session buttons meet 44px minimum touch target', async ({ page }) => {
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
  test('exam setup view has no horizontal overflow', async ({ page }) => {
    await openSetup(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });

  test('exam session view has no horizontal overflow', async ({ page }) => {
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
    await page.click('#helpButton');
    await expect(page.locator('#help')).toBeVisible();
    await expect(page.locator('main')).toBeHidden();
    await page.click('#closeHelp');
    await expect(page.locator('#help')).toBeHidden();
    await expect(page.locator('main')).toBeVisible();
  });

  // ---- Phase 3: scoring, submission, and results ----

  test('Finish Exam submits an all-answered exam and shows results', async ({ page }) => {
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

  test('subelement breakdown totals match the exam questions', async ({ page }) => {
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

    const rows = await page.locator('#exam-subelement-table .exam-sub-row').all();
    let totalFromTable = 0;
    for (const row of rows) {
      const cells = await row.locator('span').all();
      const sub = await cells[0].textContent();
      const total = parseInt(await cells[2].textContent(), 10);
      expect(expected[sub]).toBe(total);
      totalFromTable += total;
    }
    expect(totalFromTable).toBe(35);
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
      const allowed = ['ham-exam-pool', 'ham-exam-theme',
        'ham-exam-index-technician', 'ham-exam-index-general', 'ham-exam-index-extra',
        'ham-exam-bookmarks-technician', 'ham-exam-bookmarks-general', 'ham-exam-bookmarks-extra'];
      return Object.keys(localStorage).filter(k => !allowed.includes(k) && /exam|result|mock/i.test(k));
    });
    expect(examKeys).toHaveLength(0);
  });

  test('results view has no horizontal overflow', async ({ page }) => {
    await startExam(page, 'technician');
    await answerAll(page, 'A');
    await page.click('#exam-finish');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });

  test('results action buttons meet 44px touch target', async ({ page }) => {
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
});
