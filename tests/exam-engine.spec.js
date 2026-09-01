// Integration smoke test: verifies the engine is correctly inlined in dist/index.html.
// Unit tests for the engine logic live in tests/unit/exam-engine.test.js.
const { test, expect } = require('@playwright/test');

test.describe('exam engine', () => {
  test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto('index.html');
    await expect(page.locator('#question')).not.toBeEmpty();
    expect(errors, `JS errors on load: ${errors.join('; ')}`).toHaveLength(0);
  });

  // 12. Existing study-mode behavior is unchanged.
  test('@smoke study mode still renders the first question after engine is loaded', async ({ page }) => {
    // Verifies that injecting HAM_EXAM_ENGINE does not break app initialisation.
    await expect(page.locator('#pool')).toHaveValue('technician');
    await expect(page.locator('#meta')).toHaveText('T1A01 · T1');
    await expect(page.locator('#progress')).toHaveText('Question 1 / 409');
    await expect(page.locator('.choice')).toHaveCount(4);
    // Engine must be present.
    const enginePresent = await page.evaluate(
      () => typeof window.HAM_EXAM_ENGINE === 'object' && window.HAM_EXAM_ENGINE !== null
    );
    expect(enginePresent).toBe(true);
  });
});
