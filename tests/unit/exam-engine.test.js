'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const engineSrc = fs.readFileSync(path.join(__dirname, '../../src/exam-engine.js'), 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(engineSrc, sandbox);
const ENGINE = sandbox.HAM_EXAM_ENGINE;

// Stage 5A: src/exam-engine.js no longer carries its own EXAM_CONFIG global.
// selectExamQuestions(poolKey, banks, rng, poolConfig) takes that pool's
// configuration explicitly, exactly as production code passes it in from
// window.HAM_EXAM_POOLS (built from data/pools.json -- see
// scripts/pool-registry.js / scripts/build.js#buildPublicPoolsRegistry).
// Reading the real registry here means these tests exercise the exact
// object shape the browser runtime supplies, not a hand-rolled duplicate.
const REGISTRY = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../data/pools.json'), 'utf8')
).pools;

// Generate 3 questions per blueprint group for each pool.
// Question IDs follow the real format (e.g. "T1A01"); 3 per group gives 2
// non-selected extras to exercise the Fisher-Yates shuffle path.
function makeFakeBanks() {
  const banks = {};
  ['technician', 'general', 'extra'].forEach(poolKey => {
    const groups = Object.keys(REGISTRY[poolKey].groupBlueprint);
    const questions = [];
    groups.forEach(g => {
      for (let i = 1; i <= 3; i++) {
        questions.push({
          id: g + String(i).padStart(2, '0'),
          q: 'Q',
          correct: 'A',
          choices: { A: 'a', B: 'b', C: 'c', D: 'd' },
          sub: g.slice(0, 2)
        });
      }
    });
    banks[poolKey] = { questions };
  });
  return banks;
}

describe('canonical pool configuration (data/pools.json)', () => {
  test('technician has correct element, counts, timer, and blueprint sum', () => {
    const tech = REGISTRY.technician;
    assert.equal(tech.poolKey, 'technician');
    assert.equal(tech.element, 2);
    assert.equal(tech.examQuestionCount, 35);
    assert.equal(tech.passingScore, 26);
    assert.equal(tech.defaultTimeLimitSeconds, 2100);
    assert.ok(Array.isArray(tech.withdrawnIds));
    assert.equal(Object.keys(tech.groupBlueprint).length, 35);
    const total = Object.values(tech.groupBlueprint).reduce((s, n) => s + n, 0);
    assert.equal(total, 35);
  });

  test('general has correct element, counts, timer, and blueprint sum', () => {
    const gen = REGISTRY.general;
    assert.equal(gen.poolKey, 'general');
    assert.equal(gen.element, 3);
    assert.equal(gen.examQuestionCount, 35);
    assert.equal(gen.passingScore, 26);
    assert.equal(gen.defaultTimeLimitSeconds, 2100);
    assert.equal(Object.keys(gen.groupBlueprint).length, 35);
    const total = Object.values(gen.groupBlueprint).reduce((s, n) => s + n, 0);
    assert.equal(total, 35);
  });

  test('extra has correct element, counts, timer, and blueprint sum', () => {
    const extra = REGISTRY.extra;
    assert.equal(extra.poolKey, 'extra');
    assert.equal(extra.element, 4);
    assert.equal(extra.examQuestionCount, 50);
    assert.equal(extra.passingScore, 37);
    assert.equal(extra.defaultTimeLimitSeconds, 3000);
    assert.equal(Object.keys(extra.groupBlueprint).length, 50);
    const total = Object.values(extra.groupBlueprint).reduce((s, n) => s + n, 0);
    assert.equal(total, 50);
  });
});

describe('seededRng', () => {
  test('produces values in [0, 1)', () => {
    const rng = ENGINE.seededRng(1);
    for (let i = 0; i < 20; i++) {
      const v = rng();
      assert.ok(v >= 0 && v < 1, `value ${v} not in [0, 1)`);
    }
  });

  test('same seed produces the same sequence', () => {
    const rng1 = ENGINE.seededRng(42);
    const rng2 = ENGINE.seededRng(42);
    for (let i = 0; i < 20; i++) {
      assert.equal(rng1(), rng2());
    }
  });

  test('different seeds produce different sequences', () => {
    const seq1 = Array.from({ length: 20 }, ENGINE.seededRng(100));
    const seq2 = Array.from({ length: 20 }, ENGINE.seededRng(999));
    assert.notDeepEqual(seq1, seq2);
  });
});

describe('selectExamQuestions — basic counts', () => {
  test('technician returns 35 unique questions', () => {
    const banks = makeFakeBanks();
    const qs = ENGINE.selectExamQuestions('technician', banks, ENGINE.seededRng(1), REGISTRY.technician);
    assert.equal(qs.length, 35);
    assert.equal(new Set(qs.map(q => q.id)).size, 35);
  });

  test('general returns 35 unique questions', () => {
    const banks = makeFakeBanks();
    const qs = ENGINE.selectExamQuestions('general', banks, ENGINE.seededRng(2), REGISTRY.general);
    assert.equal(qs.length, 35);
    assert.equal(new Set(qs.map(q => q.id)).size, 35);
  });

  test('extra returns 50 unique questions', () => {
    const banks = makeFakeBanks();
    const qs = ENGINE.selectExamQuestions('extra', banks, ENGINE.seededRng(3), REGISTRY.extra);
    assert.equal(qs.length, 50);
    assert.equal(new Set(qs.map(q => q.id)).size, 50);
  });
});

describe('selectExamQuestions — seeded determinism', () => {
  test('same seed always produces the same exam', () => {
    const banks = makeFakeBanks();
    function run() {
      return ENGINE.selectExamQuestions('technician', banks, ENGINE.seededRng(42), REGISTRY.technician).map(q => q.id);
    }
    assert.deepEqual(run(), run());
  });

  test('different seeds produce different exams', () => {
    const banks = makeFakeBanks();
    const ids1 = ENGINE.selectExamQuestions('technician', banks, ENGINE.seededRng(100), REGISTRY.technician).map(q => q.id);
    const ids2 = ENGINE.selectExamQuestions('technician', banks, ENGINE.seededRng(999), REGISTRY.technician).map(q => q.id);
    assert.notDeepEqual(ids1, ids2);
  });
});

describe('selectExamQuestions — group balancing', () => {
  test('each blueprint group is represented exactly once for all pools', () => {
    const banks = makeFakeBanks();
    for (const poolKey of ['technician', 'general', 'extra']) {
      const config = REGISTRY[poolKey];
      const qs = ENGINE.selectExamQuestions(poolKey, banks, ENGINE.seededRng(8), config);
      const tally = {};
      qs.forEach(q => {
        const g = q.id.match(/^[A-Z]\d[A-Z]/)[0];
        tally[g] = (tally[g] || 0) + 1;
      });
      for (const g of Object.keys(config.groupBlueprint)) {
        assert.equal(tally[g], config.groupBlueprint[g],
          `${poolKey}: group ${g} count mismatch`);
      }
    }
  });
});

describe('selectExamQuestions — withdrawn IDs', () => {
  test('withdrawn question IDs are never selected across 30 seeds', () => {
    const banks = makeFakeBanks();
    const config = Object.assign({}, REGISTRY.technician, { withdrawnIds: ['T1A01'] });
    for (let seed = 0; seed < 30; seed++) {
      const qs = ENGINE.selectExamQuestions('technician', banks, ENGINE.seededRng(seed), config);
      assert.ok(!qs.some(q => q.id === 'T1A01'), `seed ${seed}: withdrawn T1A01 was selected`);
    }
  });
});

describe('selectExamQuestions — duplicate prevention', () => {
  test('no duplicate IDs appear in a single selection', () => {
    const banks = makeFakeBanks();
    for (let seed = 0; seed < 10; seed++) {
      const qs = ENGINE.selectExamQuestions('technician', banks, ENGINE.seededRng(seed), REGISTRY.technician);
      const ids = qs.map(q => q.id);
      assert.equal(new Set(ids).size, ids.length, `seed ${seed}: duplicate IDs found`);
    }
  });
});

describe('selectExamQuestions — source-bank immutability', () => {
  test('selection does not mutate the source bank arrays', () => {
    const banks = makeFakeBanks();
    const before = banks.technician.questions.map(q => q.id).join(',');
    ENGINE.selectExamQuestions('technician', banks, ENGINE.seededRng(10), REGISTRY.technician);
    const after = banks.technician.questions.map(q => q.id).join(',');
    assert.equal(before, after);
  });
});

describe('selectExamQuestions — malformed input', () => {
  test('missing pool configuration throws a descriptive error', () => {
    const banks = makeFakeBanks();
    assert.throws(
      () => ENGINE.selectExamQuestions('unknown-pool', banks, ENGINE.seededRng(1), undefined),
      /pool configuration must be an object/i
    );
  });

  test('mismatched pool configuration throws a descriptive error', () => {
    const banks = makeFakeBanks();
    assert.throws(
      () => ENGINE.selectExamQuestions('technician', banks, ENGINE.seededRng(1), REGISTRY.general),
      /does not match requested pool key/i
    );
  });

  test('null banks throws a descriptive error', () => {
    assert.throws(
      () => ENGINE.selectExamQuestions('technician', null, ENGINE.seededRng(1), REGISTRY.technician),
      /banks must be an object/i
    );
  });

  test('missing pool entry in banks throws a descriptive error', () => {
    assert.throws(
      () => ENGINE.selectExamQuestions('technician', {}, ENGINE.seededRng(1), REGISTRY.technician),
      /no questions found for pool/i
    );
  });

  test('empty string pool key throws a descriptive error', () => {
    const banks = makeFakeBanks();
    assert.throws(
      () => ENGINE.selectExamQuestions('', banks, ENGINE.seededRng(1), REGISTRY.technician),
      /pool key must be a non-empty string/i
    );
  });
});

describe('selectExamQuestions — insufficient groups', () => {
  test('zero available questions in a group throws naming the group', () => {
    const banks = makeFakeBanks();
    banks.technician.questions = banks.technician.questions.filter(q => !q.id.startsWith('T1A'));
    assert.throws(
      () => ENGINE.selectExamQuestions('technician', banks, ENGINE.seededRng(1), REGISTRY.technician),
      /T1A/
    );
    assert.throws(
      () => ENGINE.selectExamQuestions('technician', banks, ENGINE.seededRng(1), REGISTRY.technician),
      /available/i
    );
  });
});
