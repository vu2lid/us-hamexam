// Tests for the Phase 1 mock-exam selection engine (HAM_EXAM_ENGINE).
// All tests run against the built dist/index.html via page.evaluate so that
// the engine is tested in exactly the environment it ships in.
const { test, expect } = require('@playwright/test');

test.describe('exam engine', () => {
  test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto('index.html');
    await expect(page.locator('#question')).not.toBeEmpty();
    expect(errors, `JS errors on load: ${errors.join('; ')}`).toHaveLength(0);
  });

  // 1. Correct configuration for all three pools.
  test('EXAM_CONFIG has correct configuration for all three pools', async ({ page }) => {
    const configs = await page.evaluate(() => window.HAM_EXAM_ENGINE.EXAM_CONFIG);

    const tech = configs.technician;
    expect(tech.poolKey).toBe('technician');
    expect(tech.element).toBe(2);
    expect(tech.questionCount).toBe(35);
    expect(tech.passingScore).toBe(26);
    expect(typeof tech.effectiveDateRange).toBe('string');
    expect(typeof tech.ncvecSource).toBe('string');
    expect(Array.isArray(tech.withdrawnIds)).toBe(true);
    expect(typeof tech.groupBlueprint).toBe('object');
    expect(Object.keys(tech.groupBlueprint).length).toBe(35);
    const techTotal = Object.values(tech.groupBlueprint).reduce((s, n) => s + n, 0);
    expect(techTotal).toBe(35);

    const gen = configs.general;
    expect(gen.poolKey).toBe('general');
    expect(gen.element).toBe(3);
    expect(gen.questionCount).toBe(35);
    expect(gen.passingScore).toBe(26);
    expect(Object.keys(gen.groupBlueprint).length).toBe(35);
    const genTotal = Object.values(gen.groupBlueprint).reduce((s, n) => s + n, 0);
    expect(genTotal).toBe(35);

    const extra = configs.extra;
    expect(extra.poolKey).toBe('extra');
    expect(extra.element).toBe(4);
    expect(extra.questionCount).toBe(50);
    expect(extra.passingScore).toBe(37);
    expect(Object.keys(extra.groupBlueprint).length).toBe(50);
    const extraTotal = Object.values(extra.groupBlueprint).reduce((s, n) => s + n, 0);
    expect(extraTotal).toBe(50);
  });

  // 2. Technician selection returns 35 unique questions.
  test('Technician selection returns 35 unique questions', async ({ page }) => {
    const ids = await page.evaluate(() => {
      const rng = window.HAM_EXAM_ENGINE.seededRng(1);
      const qs = window.HAM_EXAM_ENGINE.selectExamQuestions(
        'technician', window.HAM_EXAM_BANKS, rng
      );
      return qs.map(q => q.id);
    });
    expect(ids.length).toBe(35);
    expect(new Set(ids).size).toBe(35);
  });

  // 3. General selection returns 35 unique questions.
  test('General selection returns 35 unique questions', async ({ page }) => {
    const ids = await page.evaluate(() => {
      const rng = window.HAM_EXAM_ENGINE.seededRng(2);
      const qs = window.HAM_EXAM_ENGINE.selectExamQuestions(
        'general', window.HAM_EXAM_BANKS, rng
      );
      return qs.map(q => q.id);
    });
    expect(ids.length).toBe(35);
    expect(new Set(ids).size).toBe(35);
  });

  // 4. Extra selection returns 50 unique questions.
  test('Extra selection returns 50 unique questions', async ({ page }) => {
    const ids = await page.evaluate(() => {
      const rng = window.HAM_EXAM_ENGINE.seededRng(3);
      const qs = window.HAM_EXAM_ENGINE.selectExamQuestions(
        'extra', window.HAM_EXAM_BANKS, rng
      );
      return qs.map(q => q.id);
    });
    expect(ids.length).toBe(50);
    expect(new Set(ids).size).toBe(50);
  });

  // 5. Deterministic seed produces the same result on repeated calls.
  test('same seed always produces the same exam', async ({ page }) => {
    const [ids1, ids2] = await page.evaluate(() => {
      function run() {
        const rng = window.HAM_EXAM_ENGINE.seededRng(42);
        return window.HAM_EXAM_ENGINE.selectExamQuestions(
          'technician', window.HAM_EXAM_BANKS, rng
        ).map(q => q.id);
      }
      return [run(), run()];
    });
    expect(ids1).toEqual(ids2);
  });

  // 6. Different seeds can produce different valid results.
  test('different seeds produce different exams', async ({ page }) => {
    const [ids1, ids2] = await page.evaluate(() => {
      const rng1 = window.HAM_EXAM_ENGINE.seededRng(100);
      const rng2 = window.HAM_EXAM_ENGINE.seededRng(999);
      const qs1 = window.HAM_EXAM_ENGINE.selectExamQuestions(
        'technician', window.HAM_EXAM_BANKS, rng1
      ).map(q => q.id);
      const qs2 = window.HAM_EXAM_ENGINE.selectExamQuestions(
        'technician', window.HAM_EXAM_BANKS, rng2
      ).map(q => q.id);
      return [qs1, qs2];
    });
    expect(ids1).not.toEqual(ids2);
  });

  // 7. Selected questions belong to the requested pool.
  test('all selected questions come from the correct pool', async ({ page }) => {
    const allCorrectPool = await page.evaluate(() => {
      const engine = window.HAM_EXAM_ENGINE;
      const banks = window.HAM_EXAM_BANKS;
      const techIds = new Set(banks.technician.questions.map(q => q.id));
      const genIds  = new Set(banks.general.questions.map(q => q.id));
      const extraIds = new Set(banks.extra.questions.map(q => q.id));

      function check(poolKey, idSet) {
        const rng = engine.seededRng(7);
        const qs = engine.selectExamQuestions(poolKey, banks, rng);
        return qs.every(q => idSet.has(q.id));
      }
      return (
        check('technician', techIds) &&
        check('general',    genIds)  &&
        check('extra',      extraIds)
      );
    });
    expect(allCorrectPool).toBe(true);
  });

  // 8. Official group distribution is respected (one question per group).
  test('each blueprint group is represented exactly once', async ({ page }) => {
    const result = await page.evaluate(() => {
      const engine = window.HAM_EXAM_ENGINE;
      const banks  = window.HAM_EXAM_BANKS;

      function groupKey(id) {
        var m = id.match(/^[A-Z]\d[A-Z]/);
        return m ? m[0] : null;
      }

      function checkDistribution(poolKey) {
        const rng = engine.seededRng(8);
        const config = engine.EXAM_CONFIG[poolKey];
        const qs = engine.selectExamQuestions(poolKey, banks, rng);
        const tally = {};
        qs.forEach(function(q) {
          var g = groupKey(q.id);
          tally[g] = (tally[g] || 0) + 1;
        });
        for (var g in config.groupBlueprint) {
          if (tally[g] !== config.groupBlueprint[g]) return false;
        }
        return true;
      }
      return (
        checkDistribution('technician') &&
        checkDistribution('general')    &&
        checkDistribution('extra')
      );
    });
    expect(result).toBe(true);
  });

  // 9. Withdrawn questions are never selected.
  test('withdrawn question IDs are excluded from selection', async ({ page }) => {
    const excluded = await page.evaluate(() => {
      const engine = window.HAM_EXAM_ENGINE;
      const banks  = window.HAM_EXAM_BANKS;

      // Inject a fake withdrawn ID into the config, pick a real question ID
      // from the Technician T1A group, declare it withdrawn, then verify it
      // never appears across many seeds.
      var config = engine.EXAM_CONFIG.technician;
      var targetId = banks.technician.questions[0].id; // T1A01
      var original = config.withdrawnIds.slice();
      config.withdrawnIds = [targetId];

      var found = false;
      for (var seed = 0; seed < 30; seed++) {
        var rng = engine.seededRng(seed);
        var qs = engine.selectExamQuestions('technician', banks, rng);
        if (qs.some(function(q) { return q.id === targetId; })) {
          found = true;
          break;
        }
      }

      config.withdrawnIds = original; // restore
      return found; // should remain false
    });
    expect(excluded).toBe(false);
  });

  // 10. Source bank arrays are not mutated by the selection engine.
  test('selection does not mutate the source bank arrays', async ({ page }) => {
    const unchanged = await page.evaluate(() => {
      const engine = window.HAM_EXAM_ENGINE;
      const banks  = window.HAM_EXAM_BANKS;
      var before = banks.technician.questions.map(function(q) { return q.id; });
      var rng = engine.seededRng(10);
      engine.selectExamQuestions('technician', banks, rng);
      var after = banks.technician.questions.map(function(q) { return q.id; });
      return before.join(',') === after.join(',');
    });
    expect(unchanged).toBe(true);
  });

  // 11a. Unknown pool key throws a clear error.
  test('unknown pool key throws a descriptive error', async ({ page }) => {
    const errorMsg = await page.evaluate(() => {
      try {
        window.HAM_EXAM_ENGINE.selectExamQuestions(
          'unknown-pool', window.HAM_EXAM_BANKS, window.HAM_EXAM_ENGINE.seededRng(1)
        );
        return null;
      } catch (e) {
        return e.message;
      }
    });
    expect(errorMsg).toMatch(/unknown pool key/i);
  });

  // 11b. Insufficient questions in a group throw a clear error.
  test('insufficient group questions throw a descriptive error', async ({ page }) => {
    const errorMsg = await page.evaluate(() => {
      const engine = window.HAM_EXAM_ENGINE;

      // Build a fake banks object with zero questions in T1A.
      var fakeBanks = {
        technician: {
          questions: window.HAM_EXAM_BANKS.technician.questions.filter(function(q) {
            return q.id.indexOf('T1A') !== 0;
          })
        }
      };
      try {
        engine.selectExamQuestions('technician', fakeBanks, engine.seededRng(1));
        return null;
      } catch (e) {
        return e.message;
      }
    });
    expect(errorMsg).toMatch(/T1A/);
    expect(errorMsg).toMatch(/available/i);
  });

  // 12. Existing study-mode behavior is unchanged.
  test('study mode still renders the first question after engine is loaded', async ({ page }) => {
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
