'use strict';

// Stage 6A: unit tests for src/study-scope.js -- the pure, transient
// scoped-study filtering module. Loaded exactly like production code would
// `require()` it in Node (same pattern as src/storage.js's own tests): no
// `vm` sandboxing. Synthetic fixtures throughout, plus one block against the
// real data/pools.json + real banks. No test mutates tracked data.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const S = require('../../src/study-scope.js').HAM_EXAM_STUDY_SCOPE;

const REPO_ROOT = path.join(__dirname, '../..');

function loadReal(poolKey) {
  const pools = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/pools.json'), 'utf8')).pools;
  const bank = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', `${poolKey}.json`), 'utf8'));
  return { poolConfig: pools[poolKey], bank };
}

// A tiny synthetic Technician-shaped pool config + bank: two groups (T1A,
// T1B), three questions in T1A and one in T1B, deliberately NOT in ID order
// within the bank array so filtering's stability can be checked against the
// bank's own order, not a sorted one.
function makeSyntheticPool() {
  // Stage 7E: carries registry-shaped scopeLabels too -- the real
  // data/pools.json validator requires them alongside groupBlueprint.
  const poolConfig = {
    groupBlueprint: { T1A: 1, T1B: 1 },
    scopeLabels: {
      subelements: { T1: 'Rules' },
      groups: { T1A: 'Group A', T1B: 'Group B' }
    }
  };
  const bank = [
    { id: 'T1A02', sub: 'T1' },
    { id: 'T1B01', sub: 'T1' },
    { id: 'T1A01', sub: 'T1' },
    { id: 'T1A03', sub: 'T1' }
  ];
  return { poolConfig, bank };
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// --------------------------------------------------------------------------
// real pools/banks
// --------------------------------------------------------------------------

describe('real pools and banks', () => {
  for (const poolKey of ['technician', 'general', 'extra']) {
    test(`${poolKey}: every enumerated group actually has matching questions in the real bank`, () => {
      const { poolConfig, bank } = loadReal(poolKey);
      const { groups } = S.enumerateScopes(poolConfig);
      assert.ok(groups.length > 0);
      for (const g of groups) {
        const filtered = S.filterBankByScope(bank, { level: 'group', id: g }, poolConfig);
        assert.ok(filtered.length > 0, `group ${g} must have at least one real question`);
      }
    });

    test(`${poolKey}: a group scope from another pool is rejected (pool-prefix mismatch)`, () => {
      const other = poolKey === 'technician' ? 'general' : 'technician';
      const { poolConfig, bank } = loadReal(poolKey);
      const otherGroup = S.enumerateScopes(loadReal(other).poolConfig).groups[0];
      const result = S.validateScope({ level: 'group', id: otherGroup }, poolConfig, bank);
      assert.equal(result.valid, false);
    });

    // Stage 7F: per-question golden mapping over the ENTIRE real bank. The
    // expected group is derived independently of groupOf -- a literal ID
    // shape documented by the NCVEC pool (three leading characters, e.g.
    // T6C02 -> T6C), not a call to the helper under test -- and the expected
    // subelement is the question's own `sub` field from the bank data, so a
    // metadata-driven resolver regression that mis-groups even a subset of
    // real questions fails here (the "every group has >=1 question" test
    // above cannot detect that).
    test(`${poolKey}: every real question resolves to its data-derived group and subelement`, () => {
      const { poolConfig, bank } = loadReal(poolKey);
      for (const q of bank) {
        const m = /^[A-Z]\d[A-Z]/.exec(q.id);
        assert.ok(m, `${q.id} carries the documented US three-character group`);
        assert.equal(S.groupOf(q.id, poolConfig), m[0],
          `${q.id} resolves to its documented group ${m[0]}`);
        assert.equal(S.subelementOf(q.id, poolConfig), q.sub,
          `${q.id} resolves to its bank-recorded subelement ${q.sub}`);
      }
    });
  }
});

// --------------------------------------------------------------------------
// enumerateScopes
// --------------------------------------------------------------------------

describe('enumerateScopes', () => {
  test('derives subelements and groups from groupBlueprint, sorted and deduplicated', () => {
    const { poolConfig } = makeSyntheticPool();
    assert.deepEqual(S.enumerateScopes(poolConfig), {
      subelements: ['T1'],
      groups: ['T1A', 'T1B']
    });
  });

  test('handles a missing/malformed poolConfig without throwing', () => {
    assert.deepEqual(S.enumerateScopes(null), { subelements: [], groups: [] });
    assert.deepEqual(S.enumerateScopes({}), { subelements: [], groups: [] });
    assert.deepEqual(S.enumerateScopes({ groupBlueprint: null }), { subelements: [], groups: [] });
  });

  test('does not mutate poolConfig', () => {
    const { poolConfig } = makeSyntheticPool();
    const frozen = deepFreeze(JSON.parse(JSON.stringify(poolConfig)));
    assert.doesNotThrow(() => S.enumerateScopes(frozen));
  });
});

// --------------------------------------------------------------------------
// validateScope
// --------------------------------------------------------------------------

describe('validateScope', () => {
  test('accepts "all" with a null id', () => {
    assert.equal(S.validateScope({ level: 'all', id: null }, {}, []).valid, true);
  });
  test('rejects "all" with a non-null id', () => {
    assert.equal(S.validateScope({ level: 'all', id: 'x' }, {}, []).valid, false);
  });
  test('rejects a non-object scope', () => {
    for (const bad of [null, undefined, 'all', 42, ['all', null]]) {
      assert.equal(S.validateScope(bad, {}, []).valid, false);
    }
  });
  test('rejects an unknown level', () => {
    assert.equal(S.validateScope({ level: 'bogus', id: 'T1' }, {}, []).valid, false);
  });
  test('rejects a blank or non-string id for a non-"all" level', () => {
    const { poolConfig } = makeSyntheticPool();
    assert.equal(S.validateScope({ level: 'subelement', id: '' }, poolConfig, []).valid, false);
    assert.equal(S.validateScope({ level: 'group', id: null }, poolConfig, []).valid, false);
    assert.equal(S.validateScope({ level: 'question', id: 42 }, poolConfig, []).valid, false);
  });

  test('accepts a valid subelement', () => {
    const { poolConfig, bank } = makeSyntheticPool();
    assert.equal(S.validateScope({ level: 'subelement', id: 'T1' }, poolConfig, bank).valid, true);
  });
  test('rejects an unknown subelement for this pool', () => {
    const { poolConfig, bank } = makeSyntheticPool();
    assert.equal(S.validateScope({ level: 'subelement', id: 'T9' }, poolConfig, bank).valid, false);
  });
  test('accepts a valid group', () => {
    const { poolConfig, bank } = makeSyntheticPool();
    assert.equal(S.validateScope({ level: 'group', id: 'T1B' }, poolConfig, bank).valid, true);
  });
  test('rejects an unknown group for this pool (pool-prefix mismatch)', () => {
    const { poolConfig, bank } = makeSyntheticPool();
    assert.equal(S.validateScope({ level: 'group', id: 'G1A' }, poolConfig, bank).valid, false);
    assert.equal(S.validateScope({ level: 'group', id: 'T9Z' }, poolConfig, bank).valid, false);
  });
  test('accepts a question id present in the bank', () => {
    const { poolConfig, bank } = makeSyntheticPool();
    assert.equal(S.validateScope({ level: 'question', id: 'T1A02' }, poolConfig, bank).valid, true);
  });
  test('rejects a question id absent from the bank', () => {
    const { poolConfig, bank } = makeSyntheticPool();
    assert.equal(S.validateScope({ level: 'question', id: 'T1A99' }, poolConfig, bank).valid, false);
  });
  test('rejects a group that is enumerated by the registry but has no matching bank content (empty-result case)', () => {
    // Deliberately crafted mismatch: the registry says T1C exists, but no
    // bank question actually carries that group prefix -- a scenario that
    // cannot happen with the real, pool-registry-validated banks, but must
    // still be handled safely by this module in isolation.
    const poolConfig = { groupBlueprint: { T1A: 1, T1C: 1 } };
    const bank = [{ id: 'T1A01', sub: 'T1' }]; // no T1C question at all
    const check = S.validateScope({ level: 'group', id: 'T1C' }, poolConfig, bank);
    assert.equal(check.valid, true, 'the registry considers T1C a real group');
    const filtered = S.filterBankByScope(bank, { level: 'group', id: 'T1C' }, poolConfig);
    assert.deepEqual(filtered, [], 'but the bank has no matching questions');
  });

  test('does not mutate scope, poolConfig, or bank', () => {
    const { poolConfig, bank } = makeSyntheticPool();
    const frozenScope = deepFreeze({ level: 'group', id: 'T1A' });
    const frozenConfig = deepFreeze(JSON.parse(JSON.stringify(poolConfig)));
    const frozenBank = deepFreeze(JSON.parse(JSON.stringify(bank)));
    assert.doesNotThrow(() => S.validateScope(frozenScope, frozenConfig, frozenBank));
  });
});

// --------------------------------------------------------------------------
// filterBankByScope
// --------------------------------------------------------------------------

describe('filterBankByScope', () => {
  test('"all" returns every question, in original bank order, as a new array', () => {
    const { poolConfig, bank } = makeSyntheticPool();
    const result = S.filterBankByScope(bank, { level: 'all', id: null }, poolConfig);
    assert.deepEqual(result.map((q) => q.id), ['T1A02', 'T1B01', 'T1A01', 'T1A03']);
    assert.notEqual(result, bank, 'must be a new array, not the same reference');
  });

  test('subelement filtering preserves the bank\'s original relative order (stable)', () => {
    const { poolConfig, bank } = makeSyntheticPool();
    const result = S.filterBankByScope(bank, { level: 'subelement', id: 'T1' }, poolConfig);
    // All four questions are subelement T1 in this fixture; order must match
    // the bank's own order, not id-sorted order.
    assert.deepEqual(result.map((q) => q.id), ['T1A02', 'T1B01', 'T1A01', 'T1A03']);
  });

  test('group filtering returns only matching questions, in bank order', () => {
    const { poolConfig, bank } = makeSyntheticPool();
    const result = S.filterBankByScope(bank, { level: 'group', id: 'T1A' }, poolConfig);
    assert.deepEqual(result.map((q) => q.id), ['T1A02', 'T1A01', 'T1A03']);
  });

  test('question filtering returns exactly one question', () => {
    const { poolConfig, bank } = makeSyntheticPool();
    const result = S.filterBankByScope(bank, { level: 'question', id: 'T1B01' }, poolConfig);
    assert.deepEqual(result.map((q) => q.id), ['T1B01']);
  });

  test('a scope matching nothing returns an empty array, not an error', () => {
    const { poolConfig, bank } = makeSyntheticPool();
    assert.deepEqual(S.filterBankByScope(bank, { level: 'group', id: 'T9Z' }, poolConfig), []);
    assert.deepEqual(S.filterBankByScope(bank, { level: 'question', id: 'NOPE' }, poolConfig), []);
  });

  test('an unrecognized/malformed scope behaves like "all" rather than throwing', () => {
    const { poolConfig, bank } = makeSyntheticPool();
    for (const bad of [null, undefined, {}, { level: 'bogus', id: 'x' }]) {
      const result = S.filterBankByScope(bank, bad);
      assert.equal(result.length, bank.length);
    }
  });

  test('a null/non-array bank never throws', () => {
    for (const bad of [null, undefined, {}, 'nope']) {
      assert.deepEqual(S.filterBankByScope(bad, { level: 'all', id: null }), []);
    }
  });

  test('does not mutate the bank or its entries', () => {
    const { poolConfig, bank } = makeSyntheticPool();
    const before = JSON.parse(JSON.stringify(bank));
    S.filterBankByScope(bank, { level: 'group', id: 'T1A' }, poolConfig);
    assert.deepEqual(bank, before);
  });
});

// --------------------------------------------------------------------------
// resolveScope
// --------------------------------------------------------------------------

describe('resolveScope', () => {
  test('a valid, non-empty scope is returned as-is with its filtered list', () => {
    const { poolConfig, bank } = makeSyntheticPool();
    const scope = { level: 'group', id: 'T1A' };
    const resolved = S.resolveScope(scope, poolConfig, bank);
    assert.deepEqual(resolved.scope, scope);
    assert.deepEqual(resolved.list.map((q) => q.id), ['T1A02', 'T1A01', 'T1A03']);
  });

  test('an invalid scope falls back to "all" and the complete bank', () => {
    const { poolConfig, bank } = makeSyntheticPool();
    const resolved = S.resolveScope({ level: 'group', id: 'BOGUS' }, poolConfig, bank);
    assert.deepEqual(resolved.scope, { level: 'all', id: null });
    assert.equal(resolved.list.length, bank.length);
  });

  test('a stale scope after a pool change (valid shape, wrong pool) falls back to "all"', () => {
    // Simulates switching FROM a pool where "T1A" was valid TO a different
    // pool's config/bank where it is not -- resolveScope must detect this
    // exactly like any other invalid scope, with no special-cased "pool
    // change" logic needed.
    const generalPoolConfig = { groupBlueprint: { G1A: 1 } };
    const generalBank = [{ id: 'G1A01', sub: 'G1' }];
    const resolved = S.resolveScope({ level: 'group', id: 'T1A' }, generalPoolConfig, generalBank);
    assert.deepEqual(resolved.scope, { level: 'all', id: null });
    assert.deepEqual(resolved.list.map((q) => q.id), ['G1A01']);
  });

  test('a registry-valid but bank-empty scope falls back to "all" (never returns an empty list)', () => {
    const poolConfig = { groupBlueprint: { T1A: 1, T1C: 1 } };
    const bank = [{ id: 'T1A01', sub: 'T1' }];
    const resolved = S.resolveScope({ level: 'group', id: 'T1C' }, poolConfig, bank);
    assert.deepEqual(resolved.scope, { level: 'all', id: null });
    assert.equal(resolved.list.length, 1);
  });

  test('"all" resolves to itself and the complete bank', () => {
    const { poolConfig, bank } = makeSyntheticPool();
    const resolved = S.resolveScope({ level: 'all', id: null }, poolConfig, bank);
    assert.deepEqual(resolved.scope, { level: 'all', id: null });
    assert.equal(resolved.list.length, bank.length);
  });

  test('never throws for a completely malformed scope/poolConfig/bank', () => {
    assert.doesNotThrow(() => S.resolveScope(undefined, undefined, undefined));
    assert.doesNotThrow(() => S.resolveScope('nope', 42, {}));
  });

  test('does not mutate its inputs', () => {
    const { poolConfig, bank } = makeSyntheticPool();
    const scope = deepFreeze({ level: 'group', id: 'T1A' });
    const frozenConfig = deepFreeze(JSON.parse(JSON.stringify(poolConfig)));
    const frozenBank = deepFreeze(JSON.parse(JSON.stringify(bank)));
    assert.doesNotThrow(() => S.resolveScope(scope, frozenConfig, frozenBank));
  });

  test('repeated calls are deterministic', () => {
    const { poolConfig, bank } = makeSyntheticPool();
    const scope = { level: 'subelement', id: 'T1' };
    const first = S.resolveScope(scope, poolConfig, bank);
    const second = S.resolveScope(scope, poolConfig, bank);
    assert.deepEqual(first, second);
  });
});

// --------------------------------------------------------------------------
// describeScope / defaultScope / groupOf / subelementOf
// --------------------------------------------------------------------------

describe('describeScope', () => {
  test('describes "all" as "All questions"', () => {
    assert.equal(S.describeScope({ level: 'all', id: null }), 'All questions');
  });
  test('describes subelement/group/question scopes by their id', () => {
    assert.equal(S.describeScope({ level: 'subelement', id: 'T1' }), 'T1');
    assert.equal(S.describeScope({ level: 'group', id: 'T1A' }), 'T1A');
    assert.equal(S.describeScope({ level: 'question', id: 'T1A01' }), 'T1A01');
  });
  test('falls back to "All questions" for a malformed scope', () => {
    assert.equal(S.describeScope(null), 'All questions');
    assert.equal(S.describeScope({ level: 'bogus', id: 'x' }), 'All questions');
  });
});

describe('defaultScope', () => {
  test('returns a fresh, independent object each call', () => {
    const a = S.defaultScope();
    const b = S.defaultScope();
    assert.deepEqual(a, { level: 'all', id: null });
    assert.notEqual(a, b);
    a.id = 'mutated';
    assert.equal(b.id, null, 'mutating one instance must not affect another');
  });
});

describe('groupOf / subelementOf', () => {
  test('resolve group and subelement from registry metadata for a US-shaped id', () => {
    const { poolConfig } = makeSyntheticPool();
    assert.equal(S.groupOf('T1A05', poolConfig), 'T1A');
    assert.equal(S.subelementOf('T1A05', poolConfig), 'T1');
    assert.equal(S.groupOf('T1B01', poolConfig), 'T1B');
    assert.equal(S.subelementOf('T1B01', poolConfig), 'T1');
  });
  test('return null for a malformed id or missing metadata (fail closed)', () => {
    const { poolConfig } = makeSyntheticPool();
    assert.equal(S.groupOf('nope', poolConfig), null);
    assert.equal(S.subelementOf('', poolConfig), null);
    assert.equal(S.groupOf(42, poolConfig), null);
    assert.equal(S.groupOf(null, poolConfig), null);
    // No poolConfig at all: nothing to resolve against, never a guessed cut.
    assert.equal(S.groupOf('T1A05'), null);
    assert.equal(S.subelementOf('T1A05'), null);
    assert.equal(S.groupOf('T1A05', {}), null);
    // Group resolves but the registry provides no scopeLabels: subelement
    // still fails closed instead of assuming a fixed ID shape.
    assert.equal(S.groupOf('T1A05', { groupBlueprint: { T1A: 1 } }), 'T1A');
    assert.equal(S.subelementOf('T1A05', { groupBlueprint: { T1A: 1 } }), null);
  });
  test('Stage 7E: resolve a non-T/G/E group-key shape from metadata alone', () => {
    const poolConfig = {
      groupBlueprint: { PHY1A: 1, PHY1B: 1 },
      scopeLabels: {
        subelements: { PHY1: 'Physics' },
        groups: { PHY1A: 'Waves', PHY1B: 'Fields' }
      }
    };
    assert.equal(S.groupOf('PHY1A07', poolConfig), 'PHY1A');
    assert.equal(S.subelementOf('PHY1A07', poolConfig), 'PHY1');
    assert.equal(S.groupOf('PHY1B02', poolConfig), 'PHY1B');
    // A US-shaped ID claims no configured group in this pool -- no regex fallback.
    assert.equal(S.groupOf('T1A05', poolConfig), null);
    assert.equal(S.subelementOf('T1A05', poolConfig), null);
  });
  test('Stage 7E: the longest overlapping group key wins, deterministically', () => {
    const poolConfig = {
      groupBlueprint: { X1: 1, X1A: 1 },
      scopeLabels: {
        subelements: { X1: 'Sub X1' },
        groups: { X1: 'Group X1', X1A: 'Group X1A' }
      }
    };
    assert.equal(S.groupOf('X1A09', poolConfig), 'X1A');
    assert.equal(S.groupOf('X1B03', poolConfig), 'X1');
    assert.equal(S.subelementOf('X1A09', poolConfig), 'X1');
  });
  test('Stage 7E: filtering and scope validation follow metadata resolution', () => {
    const poolConfig = {
      groupBlueprint: { PHY1A: 1, PHY1B: 1 },
      scopeLabels: {
        subelements: { PHY1: 'Physics' },
        groups: { PHY1A: 'Waves', PHY1B: 'Fields' }
      }
    };
    const bank = [
      { id: 'PHY1A02', sub: 'PHY1' },
      { id: 'PHY1B01', sub: 'PHY1' }
    ];
    assert.equal(S.validateScope({ level: 'group', id: 'PHY1A' }, poolConfig, bank).valid, true);
    assert.equal(S.validateScope({ level: 'subelement', id: 'PHY1' }, poolConfig, bank).valid, true);
    assert.deepEqual(
      S.filterBankByScope(bank, { level: 'group', id: 'PHY1B' }, poolConfig).map((q) => q.id),
      ['PHY1B01']
    );
    assert.deepEqual(S.enumerateScopes(poolConfig), {
      subelements: ['PHY1'],
      groups: ['PHY1A', 'PHY1B']
    });
  });
});
