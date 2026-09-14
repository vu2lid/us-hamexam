'use strict';

// Unit tests for src/storage.js (Stage 4A1 — pure versioned-storage schema,
// migration, reconciliation, and injected-storage adapter).
//
// Loaded exactly like production code would `require()` it in Node: no `vm`
// sandboxing. Most tests use tiny SYNTHETIC registries/banks (3 pools, 2-4
// questions each) built by the helpers below; a small dedicated block checks
// the module against the REAL data/pools.json + real banks. No test writes to
// real storage, launches a browser, or touches tracked data.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const S = require('../../src/storage.js').HAM_EXAM_STORAGE;

const REPO_ROOT = path.join(__dirname, '../..');

// --------------------------------------------------------------------------
// synthetic fixture builders
// --------------------------------------------------------------------------

function question(prefix, n) {
  return { id: prefix + '1A' + String(n).padStart(2, '0') };
}

// counts: { technician, general, extra } question-array lengths.
function makeBanks(counts) {
  const c = Object.assign({ technician: 3, general: 3, extra: 3 }, counts || {});
  function bank(prefix, n) {
    const qs = [];
    for (let i = 1; i <= n; i++) qs.push(question(prefix, i));
    return { questions: qs };
  }
  return {
    technician: bank('T', c.technician),
    general: bank('G', c.general),
    extra: bank('E', c.extra)
  };
}

// overrides: { technician: { editionId, revisionId }, ... } partial per pool.
function makeRegistry(overrides) {
  const base = {
    technician: { editionId: 'technician-2020-2024', revisionId: 'errata-2021-01-01' },
    general: { editionId: 'general-2020-2024', revisionId: 'errata-2021-01-01' },
    extra: { editionId: 'extra-2020-2024', revisionId: 'errata-2021-01-01' }
  };
  const pools = {};
  for (const key of S.POOL_KEYS) {
    pools[key] = Object.assign({}, base[key], overrides && overrides[key]);
  }
  return { pools: pools };
}

function deepFreeze(o) {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }

// A fake Web-Storage-shaped object backed by a plain Map, for adapter tests.
// Behaviors (throwing, corrupting reads, etc.) are layered on by individual
// tests via direct overrides of getItem/setItem/removeItem.
function fakeStorage(initial) {
  const map = new Map(Object.entries(initial || {}));
  return {
    getItem: function(key) { return map.has(key) ? map.get(key) : null; },
    setItem: function(key, value) { map.set(key, String(value)); },
    removeItem: function(key) { map.delete(key); },
    __map: map
  };
}

// --------------------------------------------------------------------------
// createDefaultState
// --------------------------------------------------------------------------

describe('createDefaultState', () => {
  test('contains all three pool identities and first question IDs', () => {
    const registry = makeRegistry();
    const banks = makeBanks();
    const state = S.createDefaultState(registry, banks);
    assert.deepEqual(Object.keys(state.study.pools).sort(), ['extra', 'general', 'technician']);
    assert.equal(state.study.pools.technician.currentQuestionId, 'T1A01');
    assert.equal(state.study.pools.general.currentQuestionId, 'G1A01');
    assert.equal(state.study.pools.extra.currentQuestionId, 'E1A01');
    assert.equal(state.study.pools.technician.positions.all, 'T1A01');
    assert.equal(state.study.activePool, 'technician');
    assert.deepEqual(S.validateState(state, registry, banks), { errors: [] });
  });

  test('attributes each pool to the registry current edition/revision', () => {
    const registry = makeRegistry({ general: { editionId: 'general-2023-2027', revisionId: 'errata-2026-02-04-6' } });
    const state = S.createDefaultState(registry, makeBanks());
    assert.equal(state.study.pools.general.editionId, 'general-2023-2027');
    assert.equal(state.study.pools.general.revisionId, 'errata-2026-02-04-6');
  });

  test('does not mutate registry or banks', () => {
    const registry = deepFreeze(makeRegistry());
    const banks = deepFreeze(makeBanks());
    assert.doesNotThrow(() => S.createDefaultState(registry, banks));
  });
});

// --------------------------------------------------------------------------
// validateState -- strict, every level
// --------------------------------------------------------------------------

describe('validateState', () => {
  test('accepts the default state as-is', () => {
    const registry = makeRegistry();
    const banks = makeBanks();
    assert.deepEqual(S.validateState(S.createDefaultState(registry, banks), registry, banks), { errors: [] });
  });

  test('rejects a non-object root', () => {
    assert.deepEqual(S.validateState([], makeRegistry(), makeBanks()), { errors: ['state: root must be an object'] });
  });

  test('rejects an unknown root key', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const state = S.createDefaultState(registry, banks);
    state.extra = 'nope';
    const { errors } = S.validateState(state, registry, banks);
    assert.ok(errors.some(e => /unknown key\(s\): extra/.test(e)));
  });

  test('rejects a wrong schemaVersion', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const state = S.createDefaultState(registry, banks);
    state.schemaVersion = 2;
    const { errors } = S.validateState(state, registry, banks);
    assert.ok(errors.some(e => /schemaVersion must be 1/.test(e)));
  });

  describe('preferences', () => {
    function withPrefs(overrides) {
      const registry = makeRegistry(); const banks = makeBanks();
      const state = S.createDefaultState(registry, banks);
      Object.assign(state.preferences, overrides);
      return { state, registry, banks };
    }

    test('rejects an unknown preferences key', () => {
      const { state, registry, banks } = withPrefs({ extra: 1 });
      assert.ok(S.validateState(state, registry, banks).errors.some(e => /preferences: unknown key/.test(e)));
    });

    test('accepts every allowed theme and rejects others', () => {
      for (const theme of S.THEMES) {
        const { state, registry, banks } = withPrefs({ theme: theme });
        assert.deepEqual(S.validateState(state, registry, banks).errors, []);
      }
      const { state, registry, banks } = withPrefs({ theme: 'blue' });
      assert.ok(S.validateState(state, registry, banks).errors.some(e => /preferences\.theme/.test(e)));
    });

    test('accepts every allowed recallSeconds and rejects others', () => {
      for (const n of S.RECALL_SECONDS_VALUES) {
        const { state, registry, banks } = withPrefs({ recallSeconds: n });
        assert.deepEqual(S.validateState(state, registry, banks).errors, []);
      }
      for (const bad of [1, -5, 10.5, '10', null]) {
        const { state, registry, banks } = withPrefs({ recallSeconds: bad });
        assert.ok(S.validateState(state, registry, banks).errors.some(e => /recallSeconds/.test(e)),
          `expected recallSeconds ${JSON.stringify(bad)} to be rejected`);
      }
    });

    test('accepts null and every allowed examTimerSeconds, rejects others', () => {
      for (const n of [null].concat(S.EXAM_TIMER_SECONDS_VALUES)) {
        const { state, registry, banks } = withPrefs({ examTimerSeconds: n });
        assert.deepEqual(S.validateState(state, registry, banks).errors, []);
      }
      for (const bad of [1, -1, 2100.5, '2100', undefined]) {
        const { state, registry, banks } = withPrefs({ examTimerSeconds: bad });
        assert.ok(S.validateState(state, registry, banks).errors.some(e => /examTimerSeconds/.test(e)),
          `expected examTimerSeconds ${JSON.stringify(bad)} to be rejected`);
      }
    });
  });

  describe('study / pools', () => {
    test('rejects an unknown study key', () => {
      const registry = makeRegistry(); const banks = makeBanks();
      const state = S.createDefaultState(registry, banks);
      state.study.extra = 1;
      assert.ok(S.validateState(state, registry, banks).errors.some(e => /state\.study: unknown key/.test(e)));
    });

    test('rejects an activePool outside the registry pool keys', () => {
      const registry = makeRegistry(); const banks = makeBanks();
      const state = S.createDefaultState(registry, banks);
      state.study.activePool = 'amateur';
      assert.ok(S.validateState(state, registry, banks).errors.some(e => /activePool/.test(e)));
    });

    test('rejects a missing pool and an unknown pool key', () => {
      const registry = makeRegistry(); const banks = makeBanks();
      const state = S.createDefaultState(registry, banks);
      delete state.study.pools.general;
      state.study.pools.amateur = clone(state.study.pools.technician);
      const { errors } = S.validateState(state, registry, banks);
      assert.ok(errors.some(e => /missing required pool "general"/.test(e)));
      assert.ok(errors.some(e => /unknown pool key "amateur"/.test(e)));
    });

    test('rejects an unknown pool-entry key', () => {
      const registry = makeRegistry(); const banks = makeBanks();
      const state = S.createDefaultState(registry, banks);
      state.study.pools.technician.extra = 1;
      assert.ok(S.validateState(state, registry, banks).errors.some(e => /unknown key\(s\): extra/.test(e)));
    });

    test('requires editionId/revisionId to equal the registry current values', () => {
      const registry = makeRegistry(); const banks = makeBanks();
      const state = S.createDefaultState(registry, banks);
      state.study.pools.technician.editionId = 'technician-1999-2003';
      state.study.pools.general.revisionId = 'errata-1999-01-01';
      const { errors } = S.validateState(state, registry, banks);
      assert.ok(errors.some(e => /technician.*\.editionId must equal the registry edition/.test(e)));
      assert.ok(errors.some(e => /general.*\.revisionId must equal the registry revision/.test(e)));
    });

    test('rejects a currentQuestionId not in that pool\'s bank', () => {
      const registry = makeRegistry(); const banks = makeBanks();
      const state = S.createDefaultState(registry, banks);
      state.study.pools.technician.currentQuestionId = 'G1A01'; // cross-pool
      const { errors } = S.validateState(state, registry, banks);
      assert.ok(errors.some(e => /currentQuestionId must be a question ID in the technician bank/.test(e)));
    });

    describe('bookmarks', () => {
      test('rejects a non-array', () => {
        const registry = makeRegistry(); const banks = makeBanks();
        const state = S.createDefaultState(registry, banks);
        state.study.pools.technician.bookmarks = 'T1A01';
        assert.ok(S.validateState(state, registry, banks).errors.some(e => /bookmarks must be an array/.test(e)));
      });

      test('rejects an unknown ID, a cross-pool ID, and a duplicate', () => {
        const registry = makeRegistry(); const banks = makeBanks();
        const state = S.createDefaultState(registry, banks);
        state.study.pools.technician.bookmarks = ['T1A01', 'T9Z99', 'G1A01', 'T1A01'];
        const { errors } = S.validateState(state, registry, banks);
        assert.ok(errors.some(e => /bookmarks\[1\] must be a question ID/.test(e)));
        assert.ok(errors.some(e => /bookmarks\[2\] must be a question ID/.test(e)));
        assert.ok(errors.some(e => /bookmarks\[3\] duplicates "T1A01"/.test(e)));
      });

      test('rejects a bookmark list beyond the bound', () => {
        const registry = makeRegistry();
        const banks = makeBanks({ technician: S.BOUNDS.MAX_BOOKMARKS_PER_POOL + 5 });
        const state = S.createDefaultState(registry, banks);
        const all = [];
        for (let i = 1; i <= S.BOUNDS.MAX_BOOKMARKS_PER_POOL + 1; i++) all.push(question('T', i).id);
        state.study.pools.technician.bookmarks = all;
        assert.ok(S.validateState(state, registry, banks).errors.some(e => /exceeds the maximum/.test(e)));
      });
    });

    describe('scope', () => {
      test('accepts only { level: "all", id: null }', () => {
        const registry = makeRegistry(); const banks = makeBanks();
        const state = S.createDefaultState(registry, banks);
        assert.deepEqual(S.validateState(state, registry, banks).errors, []);
      });

      test('rejects a non-"all" level, a non-null id, and an unknown scope key', () => {
        const registry = makeRegistry(); const banks = makeBanks();
        const a = S.createDefaultState(registry, banks); a.study.pools.technician.scope = { level: 'subelement', id: 'T1' };
        assert.ok(S.validateState(a, registry, banks).errors.some(e => /scope\.level must be "all"/.test(e)));
        const b = S.createDefaultState(registry, banks); b.study.pools.technician.scope = { level: 'all', id: 'T1' };
        assert.ok(S.validateState(b, registry, banks).errors.some(e => /scope\.id must be null/.test(e)));
        const c = S.createDefaultState(registry, banks); c.study.pools.technician.scope = { level: 'all', id: null, group: 'A' };
        assert.ok(S.validateState(c, registry, banks).errors.some(e => /scope: unknown key/.test(e)));
      });
    });

    describe('positions', () => {
      test('rejects an unknown positions key (no arbitrary map keys)', () => {
        const registry = makeRegistry(); const banks = makeBanks();
        const state = S.createDefaultState(registry, banks);
        state.study.pools.technician.positions.subelement = 'T1A01';
        assert.ok(S.validateState(state, registry, banks).errors.some(e => /positions: unknown key\(s\): subelement/.test(e)));
      });

      test('rejects positions.all not in the bank', () => {
        const registry = makeRegistry(); const banks = makeBanks();
        const state = S.createDefaultState(registry, banks);
        state.study.pools.technician.positions.all = 'T9Z99';
        assert.ok(S.validateState(state, registry, banks).errors.some(e => /positions\.all must be a question ID/.test(e)));
      });
    });
  });

  test('missing/malformed registry or banks input fails safely (throws a clear Error)', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const state = S.createDefaultState(registry, banks);
    assert.throws(() => S.validateState(state, null, banks), /registry/);
    assert.throws(() => S.validateState(state, {}, banks), /registry/);
    assert.throws(() => S.validateState(state, registry, null), /banks/);
    assert.throws(() => S.validateState(state, registry, { technician: { questions: [] } }), /banks/);
  });

  test('never mutates its inputs, including deeply frozen fixtures', () => {
    const registry = deepFreeze(makeRegistry());
    const banks = deepFreeze(makeBanks());
    const state = deepFreeze(S.createDefaultState(clone(registry), clone(banks)));
    assert.doesNotThrow(() => S.validateState(state, registry, banks));
  });
});

// --------------------------------------------------------------------------
// normalizeState -- lenient repair, never fails
// --------------------------------------------------------------------------

describe('normalizeState', () => {
  test('repairs invalid preferences to defaults', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const garbage = { preferences: { theme: 'ultraviolet', recallSeconds: 7, examTimerSeconds: 42 }, study: {} };
    const out = S.normalizeState(garbage, registry, banks).state;
    assert.equal(out.preferences.theme, S.DEFAULT_THEME);
    assert.equal(out.preferences.recallSeconds, S.DEFAULT_RECALL_SECONDS);
    assert.equal(out.preferences.examTimerSeconds, S.DEFAULT_EXAM_TIMER_SECONDS);
    assert.deepEqual(S.validateState(out, registry, banks), { errors: [] });
  });

  test('an invalid active pool falls back to Technician', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const out = S.normalizeState({ study: { activePool: 'amateur' } }, registry, banks).state;
    assert.equal(out.study.activePool, 'technician');
  });

  test('missing pool entries are reconstructed from the registry and bank', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const out = S.normalizeState({ study: { pools: {} } }, registry, banks).state;
    assert.equal(out.study.pools.general.currentQuestionId, 'G1A01');
    assert.deepEqual(S.validateState(out, registry, banks), { errors: [] });
  });

  test('an invalid current question or positions.all falls back to the first question', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const src = S.createDefaultState(registry, banks);
    src.study.pools.technician.currentQuestionId = 'nonsense';
    src.study.pools.technician.positions.all = 'also-nonsense';
    const out = S.normalizeState(src, registry, banks).state;
    assert.equal(out.study.pools.technician.currentQuestionId, 'T1A01');
    assert.equal(out.study.pools.technician.positions.all, 'T1A01');
  });

  test('duplicate, unknown, and cross-pool bookmarks are removed; order is preserved', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const src = S.createDefaultState(registry, banks);
    src.study.pools.technician.bookmarks = ['T1A02', 'nonsense', 'T1A02', 'G1A01', 'T1A01'];
    const out = S.normalizeState(src, registry, banks).state;
    assert.deepEqual(out.study.pools.technician.bookmarks, ['T1A02', 'T1A01']);
  });

  test('bounds a huge raw bookmarks array without unbounded work', () => {
    const registry = makeRegistry();
    const banks = makeBanks({ technician: 5 });
    const huge = [];
    for (let i = 0; i < S.BOUNDS.MAX_BOOKMARKS_PER_POOL * 3; i++) huge.push('T1A01');
    const src = S.createDefaultState(registry, banks);
    src.study.pools.technician.bookmarks = huge;
    const out = S.normalizeState(src, registry, banks).state;
    assert.deepEqual(out.study.pools.technician.bookmarks, ['T1A01']); // deduped to one valid ID
  });

  test('unknown fields are removed (produces a clean canonical object)', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const src = S.createDefaultState(registry, banks);
    src.rogue = 'field';
    src.study.pools.technician.rogue = 'field';
    const out = S.normalizeState(src, registry, banks).state;
    assert.equal(out.rogue, undefined);
    assert.equal(out.study.pools.technician.rogue, undefined);
  });

  test('any stored scope normalizes to { level: "all", id: null }', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const src = S.createDefaultState(registry, banks);
    src.study.pools.technician.scope = { level: 'subelement', id: 'T1' };
    const out = S.normalizeState(src, registry, banks).state;
    assert.deepEqual(out.study.pools.technician.scope, { level: 'all', id: null });
  });

  test('never mutates its inputs, including deeply frozen fixtures', () => {
    const registry = deepFreeze(makeRegistry());
    const banks = deepFreeze(makeBanks());
    const state = deepFreeze(S.createDefaultState(clone(registry), clone(banks)));
    const before = clone(state);
    S.normalizeState(state, registry, banks);
    assert.deepEqual(state, before);
  });

  test('missing/malformed registry or banks input fails safely', () => {
    assert.throws(() => S.normalizeState({}, null, makeBanks()), /registry/);
    assert.throws(() => S.normalizeState({}, makeRegistry(), undefined), /banks/);
  });
});

// --------------------------------------------------------------------------
// migrateLegacy
// --------------------------------------------------------------------------

describe('migrateLegacy', () => {
  test('an absent snapshot produces the default state', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const out = S.migrateLegacy({}, registry, banks).state;
    assert.deepEqual(out, S.createDefaultState(registry, banks));
  });

  test('migrates pool, theme, index, and bookmarks independently', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const snapshot = {};
    snapshot[S.LEGACY_POOL_KEY] = 'general';
    snapshot[S.LEGACY_THEME_KEY] = 'dark';
    snapshot[S.legacyIndexKey('general')] = '1';
    snapshot[S.legacyBookmarksKey('general')] = JSON.stringify(['G1A01', 'G1A03']);
    const out = S.migrateLegacy(snapshot, registry, banks).state;
    assert.equal(out.study.activePool, 'general');
    assert.equal(out.preferences.theme, 'dark');
    assert.equal(out.study.pools.general.currentQuestionId, 'G1A02');
    assert.deepEqual(out.study.pools.general.bookmarks, ['G1A01', 'G1A03']);
    assert.deepEqual(S.validateState(out, registry, banks), { errors: [] });
  });

  test('a malformed field does not discard other valid legacy fields', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const snapshot = {};
    snapshot[S.LEGACY_THEME_KEY] = 'not-a-real-theme';
    snapshot[S.legacyIndexKey('technician')] = '2junk'; // malformed
    snapshot[S.LEGACY_POOL_KEY] = 'extra'; // valid, independent field
    const out = S.migrateLegacy(snapshot, registry, banks).state;
    assert.equal(out.preferences.theme, S.DEFAULT_THEME); // defaulted, not thrown away
    assert.equal(out.study.pools.technician.currentQuestionId, 'T1A01'); // defaulted to first question
    assert.equal(out.study.activePool, 'extra'); // still applied
  });

  test('attributes migrated pools to the registry CURRENT edition/revision', () => {
    const registry = makeRegistry({ technician: { editionId: 'technician-2026-2030', revisionId: 'errata-2026-02-19' } });
    const snapshot = {}; snapshot[S.legacyIndexKey('technician')] = '0';
    const out = S.migrateLegacy(snapshot, registry, makeBanks()).state;
    assert.equal(out.study.pools.technician.editionId, 'technician-2026-2030');
    assert.equal(out.study.pools.technician.revisionId, 'errata-2026-02-19');
  });

  describe('legacy index parsing', () => {
    const badIndexes = ['2junk', '-1', '1.5', '1e3', ' 1', '1 ', '', '01x', 'NaN', 'Infinity', '\t2', '2\n', '+2'];
    for (const bad of badIndexes) {
      test('rejects malformed index ' + JSON.stringify(bad) + ' (falls back to first question)', () => {
        const registry = makeRegistry(); const banks = makeBanks();
        const snapshot = {}; snapshot[S.legacyIndexKey('technician')] = bad;
        const out = S.migrateLegacy(snapshot, registry, banks).state;
        assert.equal(out.study.pools.technician.currentQuestionId, 'T1A01');
      });
    }

    test('index zero selects the first question', () => {
      const registry = makeRegistry(); const banks = makeBanks({ technician: 4 });
      const snapshot = {}; snapshot[S.legacyIndexKey('technician')] = '0';
      const out = S.migrateLegacy(snapshot, registry, banks).state;
      assert.equal(out.study.pools.technician.currentQuestionId, 'T1A01');
    });

    test('the last valid index selects the last question', () => {
      const registry = makeRegistry(); const banks = makeBanks({ technician: 4 });
      const snapshot = {}; snapshot[S.legacyIndexKey('technician')] = '3';
      const out = S.migrateLegacy(snapshot, registry, banks).state;
      assert.equal(out.study.pools.technician.currentQuestionId, 'T1A04');
    });

    test('an out-of-range index falls back to the first question', () => {
      const registry = makeRegistry(); const banks = makeBanks({ technician: 4 });
      const snapshot = {}; snapshot[S.legacyIndexKey('technician')] = '999';
      const out = S.migrateLegacy(snapshot, registry, banks).state;
      assert.equal(out.study.pools.technician.currentQuestionId, 'T1A01');
    });
  });

  describe('legacy bookmark parsing', () => {
    test('malformed JSON, wrong type, and a non-array are all ignored (defaults to no bookmarks)', () => {
      const registry = makeRegistry(); const banks = makeBanks();
      for (const bad of ['{not json', '"just a string"', '42', 'null', JSON.stringify({ not: 'array' })]) {
        const snapshot = {}; snapshot[S.legacyBookmarksKey('technician')] = bad;
        const out = S.migrateLegacy(snapshot, registry, banks).state;
        assert.deepEqual(out.study.pools.technician.bookmarks, [], `input ${bad}`);
      }
    });

    test('unknown IDs and cross-pool IDs are dropped', () => {
      const registry = makeRegistry(); const banks = makeBanks();
      const snapshot = {}; snapshot[S.legacyBookmarksKey('technician')] = JSON.stringify(['T1A01', 'nonsense', 'G1A01']);
      const out = S.migrateLegacy(snapshot, registry, banks).state;
      assert.deepEqual(out.study.pools.technician.bookmarks, ['T1A01']);
    });

    test('duplicates are removed, preserving first-seen order', () => {
      const registry = makeRegistry(); const banks = makeBanks();
      const snapshot = {};
      snapshot[S.legacyBookmarksKey('technician')] = JSON.stringify(['T1A03', 'T1A01', 'T1A03', 'T1A02', 'T1A01']);
      const out = S.migrateLegacy(snapshot, registry, banks).state;
      assert.deepEqual(out.study.pools.technician.bookmarks, ['T1A03', 'T1A01', 'T1A02']);
    });
  });

  test('is deterministic and idempotent for the same snapshot', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const snapshot = {};
    snapshot[S.LEGACY_POOL_KEY] = 'general';
    snapshot[S.legacyBookmarksKey('general')] = JSON.stringify(['G1A01']);
    const a = S.migrateLegacy(snapshot, registry, banks).state;
    const b = S.migrateLegacy(snapshot, registry, banks).state;
    assert.deepEqual(a, b);
  });

  test('never mutates its inputs', () => {
    const registry = deepFreeze(makeRegistry());
    const banks = deepFreeze(makeBanks());
    const snapshot = deepFreeze({ [S.LEGACY_POOL_KEY]: 'general' });
    assert.doesNotThrow(() => S.migrateLegacy(snapshot, registry, banks));
  });

  test('missing/malformed registry or banks input fails safely', () => {
    assert.throws(() => S.migrateLegacy({}, null, makeBanks()), /registry/);
    assert.throws(() => S.migrateLegacy({}, makeRegistry(), null), /banks/);
  });
});

// --------------------------------------------------------------------------
// reconcileState -- same-edition vs. replacement-edition
// --------------------------------------------------------------------------

describe('reconcileState', () => {
  test('same edition, new revision: retains valid IDs and bumps the revision', () => {
    const oldRegistry = makeRegistry();
    const banks = makeBanks({ technician: 4 });
    const state = S.createDefaultState(oldRegistry, banks);
    state.study.pools.technician.currentQuestionId = 'T1A03';
    state.study.pools.technician.positions.all = 'T1A03';
    state.study.pools.technician.bookmarks = ['T1A02', 'T1A04'];

    const newRegistry = makeRegistry({ technician: { revisionId: 'errata-2022-06-01' } });
    const { state: out, resetPools } = S.reconcileState(state, newRegistry, banks);

    assert.deepEqual(resetPools, []);
    assert.equal(out.study.pools.technician.revisionId, 'errata-2022-06-01');
    assert.equal(out.study.pools.technician.currentQuestionId, 'T1A03');
    assert.deepEqual(out.study.pools.technician.bookmarks, ['T1A02', 'T1A04']);
    assert.deepEqual(S.validateState(out, newRegistry, banks), { errors: [] });
  });

  test('same edition: removed/invalid IDs fall back/filter safely', () => {
    const oldRegistry = makeRegistry();
    const oldBanks = makeBanks({ technician: 5 });
    const state = S.createDefaultState(oldRegistry, oldBanks);
    state.study.pools.technician.currentQuestionId = 'T1A05';
    state.study.pools.technician.positions.all = 'T1A05';
    state.study.pools.technician.bookmarks = ['T1A02', 'T1A05'];

    // Same edition/revision, but the bank shrank (T1A05 no longer exists).
    const shrunkBanks = makeBanks({ technician: 3 });
    const { state: out, resetPools } = S.reconcileState(state, oldRegistry, shrunkBanks);

    assert.deepEqual(resetPools, []); // still the same edition -- not a hard reset
    assert.equal(out.study.pools.technician.currentQuestionId, 'T1A01'); // fell back
    assert.deepEqual(out.study.pools.technician.bookmarks, ['T1A02']); // T1A05 filtered out
  });

  test('replacement edition resets that pool even when the new bank reuses the same IDs', () => {
    const oldRegistry = makeRegistry();
    const banks = makeBanks({ technician: 4 });
    const state = S.createDefaultState(oldRegistry, banks);
    state.study.pools.technician.currentQuestionId = 'T1A03';
    state.study.pools.technician.positions.all = 'T1A03';
    state.study.pools.technician.bookmarks = ['T1A02', 'T1A04'];

    // New edition, but the bank happens to reuse the exact same ID strings.
    const newRegistry = makeRegistry({ technician: { editionId: 'technician-2026-2030', revisionId: 'errata-2026-02-19' } });
    const { state: out, resetPools } = S.reconcileState(state, newRegistry, banks);

    assert.deepEqual(resetPools, ['technician']);
    assert.equal(out.study.pools.technician.editionId, 'technician-2026-2030');
    assert.equal(out.study.pools.technician.revisionId, 'errata-2026-02-19');
    assert.equal(out.study.pools.technician.currentQuestionId, 'T1A01'); // reset, not transferred
    assert.deepEqual(out.study.pools.technician.bookmarks, []); // reset, not transferred
    assert.deepEqual(out.study.pools.technician.scope, { level: 'all', id: null });
  });

  test('a rollback-build mismatch (stored edition unknown to this build) also resets that pool', () => {
    const registry = makeRegistry();
    const banks = makeBanks();
    const state = S.createDefaultState(registry, banks);
    state.study.pools.general.editionId = 'general-2099-2103'; // not this build's edition
    state.study.pools.general.revisionId = 'errata-2099-01-01';
    const { resetPools } = S.reconcileState(state, registry, banks);
    assert.deepEqual(resetPools, ['general']);
  });

  // Regression test for a P1 review finding: a pool entry with NO editionId
  // must never be treated as "current edition" merely because normalizeState
  // backfills a missing editionId from the registry -- that would let a
  // reused current-question/bookmark ID silently survive with no genuine
  // basis for believing it belongs to the current edition.
  test('a pool with no editionId is reset, never trusted as "current edition" merely because normalization backfills one', () => {
    const registry = makeRegistry();
    const banks = makeBanks({ technician: 4 });
    const state = S.createDefaultState(registry, banks);
    delete state.study.pools.technician.editionId; // no edition identity at all
    state.study.pools.technician.currentQuestionId = 'T1A03'; // happens to exist in the CURRENT bank
    state.study.pools.technician.bookmarks = ['T1A02'];

    const { state: out, resetPools } = S.reconcileState(state, registry, banks);

    assert.deepEqual(resetPools, ['technician']);
    assert.equal(out.study.pools.technician.currentQuestionId, 'T1A01', 'must reset to the first question, not keep the reused ID');
    assert.deepEqual(out.study.pools.technician.bookmarks, [], 'must not keep a bookmark with no genuine edition basis');
    assert.equal(out.study.pools.technician.editionId, registry.pools.technician.editionId);
  });

  test('unaffected pools and preferences survive reconciliation untouched', () => {
    const oldRegistry = makeRegistry();
    const banks = makeBanks();
    const state = S.createDefaultState(oldRegistry, banks);
    state.preferences.theme = 'night';
    state.preferences.recallSeconds = 30;
    state.study.pools.general.bookmarks = ['G1A01'];

    const newRegistry = makeRegistry({ technician: { editionId: 'technician-2026-2030', revisionId: 'errata-2026-02-19' } });
    const { state: out } = S.reconcileState(state, newRegistry, banks);

    assert.equal(out.preferences.theme, 'night');
    assert.equal(out.preferences.recallSeconds, 30);
    assert.deepEqual(out.study.pools.general.bookmarks, ['G1A01']);
    assert.equal(out.study.pools.general.editionId, oldRegistry.pools.general.editionId);
  });

  test('preserves the active-pool choice even when that pool is the one reset', () => {
    const oldRegistry = makeRegistry();
    const banks = makeBanks();
    const state = S.createDefaultState(oldRegistry, banks);
    state.study.activePool = 'technician';
    const newRegistry = makeRegistry({ technician: { editionId: 'technician-2026-2030', revisionId: 'errata-2026-02-19' } });
    const { state: out } = S.reconcileState(state, newRegistry, banks);
    assert.equal(out.study.activePool, 'technician');
  });

  test('never mutates its inputs', () => {
    const registry = deepFreeze(makeRegistry());
    const banks = deepFreeze(makeBanks());
    const state = deepFreeze(S.createDefaultState(clone(registry), clone(banks)));
    assert.doesNotThrow(() => S.reconcileState(state, registry, banks));
  });

  test('missing/malformed registry or banks input fails safely', () => {
    assert.throws(() => S.reconcileState({}, null, makeBanks()), /registry/);
    assert.throws(() => S.reconcileState({}, makeRegistry(), null), /banks/);
  });
});

// --------------------------------------------------------------------------
// resolveState -- the full state-precedence policy
// --------------------------------------------------------------------------

describe('resolveState (state precedence)', () => {
  test('a valid canonical state wins over conflicting legacy values', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const canonical = S.createDefaultState(registry, banks);
    canonical.study.activePool = 'extra';
    const legacy = {}; legacy[S.LEGACY_POOL_KEY] = 'general'; // conflicting
    const result = S.resolveState(JSON.stringify(canonical), legacy, registry, banks);
    assert.equal(result.status, S.STATUS.VALID);
    assert.equal(result.writable, true);
    assert.equal(result.state.study.activePool, 'extra'); // canonical wins, not legacy
  });

  test('missing canonical state migrates all valid legacy fields', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const legacy = {}; legacy[S.LEGACY_POOL_KEY] = 'extra'; legacy[S.LEGACY_THEME_KEY] = 'dark';
    const result = S.resolveState(null, legacy, registry, banks);
    assert.equal(result.status, S.STATUS.MIGRATED);
    assert.equal(result.state.study.activePool, 'extra');
    assert.equal(result.state.preferences.theme, 'dark');
    assert.equal(result.writable, true);
  });

  test('malformed canonical JSON falls back to independently valid legacy data', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const legacy = {}; legacy[S.LEGACY_THEME_KEY] = 'night';
    const result = S.resolveState('{not json', legacy, registry, banks);
    assert.equal(result.status, S.STATUS.MIGRATED);
    assert.equal(result.state.preferences.theme, 'night');
  });

  test('an invalid schema-1 canonical object falls back to the documented legacy recovery path', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    // schemaVersion 1 but `study` is a string -- reconcileState/normalizeState
    // cannot repair this into anything meaningful, so it must fall through.
    const broken = JSON.stringify({ schemaVersion: 1, preferences: {}, study: 'nope' });
    const legacy = {}; legacy[S.LEGACY_POOL_KEY] = 'general';
    const result = S.resolveState(broken, legacy, registry, banks);
    assert.equal(result.status, S.STATUS.MIGRATED);
    assert.equal(result.state.study.activePool, 'general');
  });

  // Regression test for a P1 review finding: a canonical object with an
  // invalid global field (here, an invalid theme) must NOT be selectively
  // repaired in place while discarding legacy data -- it must be treated as
  // the documented "invalid schema 1" case and migrate from legacy in full,
  // so a valid legacy preference is not lost underneath an unrelated
  // in-place repair.
  test('an invalid preference value migrates from legacy instead of being silently repaired in place', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const canonical = S.createDefaultState(registry, banks);
    canonical.preferences.theme = 'ultraviolet'; // invalid -- not a real theme
    const legacy = {}; legacy[S.LEGACY_THEME_KEY] = 'night'; // independently valid
    const result = S.resolveState(JSON.stringify(canonical), legacy, registry, banks);
    assert.equal(result.status, S.STATUS.MIGRATED);
    assert.equal(result.state.preferences.theme, 'night', 'the valid legacy theme must not be lost under a default');
  });

  // Regression test for the same P1 finding: a pool entry with no
  // editionId, but with a currentQuestionId/bookmark reused from elsewhere,
  // must not silently win in place -- resolveState must route it through
  // legacy/reconciliation the same way as reconcileState does directly (see
  // the dedicated reconcileState test above), never trusting those IDs.
  test('a pool with no editionId is never trusted to belong to the current edition via resolveState', () => {
    const registry = makeRegistry(); const banks = makeBanks({ technician: 4 });
    const canonical = S.createDefaultState(registry, banks);
    delete canonical.study.pools.technician.editionId;
    canonical.study.pools.technician.currentQuestionId = 'T1A03';
    canonical.study.pools.technician.bookmarks = ['T1A02'];
    const result = S.resolveState(JSON.stringify(canonical), {}, registry, banks);
    assert.equal(result.state.study.pools.technician.currentQuestionId, 'T1A01');
    assert.deepEqual(result.state.study.pools.technician.bookmarks, []);
  });

  test('a future schema is preserved (not repaired) and marked non-writable', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const future = JSON.stringify({ schemaVersion: 2, some: 'future-shape' });
    const result = S.resolveState(future, {}, registry, banks);
    assert.equal(result.status, S.STATUS.FUTURE_SCHEMA);
    assert.equal(result.writable, false);
    assert.deepEqual(S.validateState(result.state, registry, banks), { errors: [] }); // a safe default
  });

  test('an older unsupported schema receives an explicit safe status, not a silent schema-1 guess', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const older = JSON.stringify({ schemaVersion: 0, pool: 'general' });
    const result = S.resolveState(older, {}, registry, banks);
    assert.equal(result.status, S.STATUS.UNSUPPORTED_SCHEMA);
    assert.equal(result.writable, false);
  });

  test('a same-edition drift is reconciled and reported distinctly from a pristine valid state', () => {
    const oldRegistry = makeRegistry();
    const banks = makeBanks();
    const canonical = S.createDefaultState(oldRegistry, banks);
    const newRegistry = makeRegistry({ technician: { revisionId: 'errata-2022-06-01' } });
    const result = S.resolveState(JSON.stringify(canonical), {}, newRegistry, banks);
    assert.equal(result.status, S.STATUS.RECONCILED);
    assert.equal(result.state.study.pools.technician.revisionId, 'errata-2022-06-01');
  });

  test('missing/malformed registry or banks input fails safely', () => {
    assert.throws(() => S.resolveState(null, {}, null, makeBanks()), /registry/);
    assert.throws(() => S.resolveState(null, {}, makeRegistry(), null), /banks/);
  });
});

// --------------------------------------------------------------------------
// safe parse / serialize
// --------------------------------------------------------------------------

describe('safeParseJson / safeSerialize', () => {
  test('safeParseJson returns undefined for absent, oversized, or malformed input', () => {
    assert.equal(S.safeParseJson(null), undefined);
    assert.equal(S.safeParseJson(undefined), undefined);
    assert.equal(S.safeParseJson(''), undefined);
    assert.equal(S.safeParseJson('{not json'), undefined);
    assert.equal(S.safeParseJson('x'.repeat(S.BOUNDS.MAX_STORAGE_VALUE_LENGTH + 1)), undefined);
  });

  test('safeParseJson parses a bounded, well-formed value', () => {
    assert.deepEqual(S.safeParseJson('{"a":1}'), { a: 1 });
  });

  test('safeSerialize returns undefined for cyclic or unserializable input', () => {
    const cyclic = {}; cyclic.self = cyclic;
    assert.equal(S.safeSerialize(cyclic), undefined);
    assert.equal(S.safeSerialize(undefined), undefined);
  });

  test('safeSerialize returns undefined when the result would exceed the storage-value bound', () => {
    const huge = { text: 'x'.repeat(S.BOUNDS.MAX_STORAGE_VALUE_LENGTH) };
    assert.equal(S.safeSerialize(huge), undefined);
  });

  test('safeSerialize round-trips through safeParseJson', () => {
    const value = { a: 1, b: [1, 2, 3] };
    assert.deepEqual(S.safeParseJson(S.safeSerialize(value)), value);
  });
});

// --------------------------------------------------------------------------
// Injected storage adapter
// --------------------------------------------------------------------------

describe('createStorageAdapter', () => {
  test('requires a storage-like object', () => {
    assert.throws(() => S.createStorageAdapter(null, makeRegistry(), makeBanks()), /storageLike/);
    assert.throws(() => S.createStorageAdapter({}, makeRegistry(), makeBanks()), /storageLike/);
  });

  test('probes availability at most once per adapter instance', () => {
    const storage = fakeStorage();
    let getCalls = 0, setCalls = 0, removeCalls = 0;
    const spy = {
      getItem: function(k) { getCalls++; return storage.getItem(k); },
      setItem: function(k, v) { setCalls++; return storage.setItem(k, v); },
      removeItem: function(k) { removeCalls++; return storage.removeItem(k); }
    };
    const adapter = S.createStorageAdapter(spy, makeRegistry(), makeBanks());
    adapter.isAvailable(); adapter.isAvailable(); adapter.isAvailable();
    const totalAfterProbeOnly = getCalls + setCalls + removeCalls;
    assert.ok(totalAfterProbeOnly > 0, 'the probe itself should touch storage once');
    adapter.isAvailable();
    assert.equal(getCalls + setCalls + removeCalls, totalAfterProbeOnly, 'a second call must not re-probe');
  });

  test('probing does not overwrite an existing value at the probe key', () => {
    const probeKey = '__ham_exam_storage_probe__';
    const storage = fakeStorage();
    storage.setItem(probeKey, 'pre-existing-user-value');
    const adapter = S.createStorageAdapter(storage, makeRegistry(), makeBanks());
    assert.equal(adapter.isAvailable(), true);
    assert.equal(storage.getItem(probeKey), 'pre-existing-user-value');
  });

  // Regression test for a P2 review finding: an earlier implementation
  // temporarily overwrote an existing probe-key value with "1" and then
  // tried to restore it -- if that restoration itself threw, the original
  // value was left permanently clobbered. The fix never writes to an
  // occupied probe key at all, so there is nothing to "restore" and nothing
  // that can fail partway through. This test proves that directly: setItem/
  // removeItem on the probe key would throw if ever called, and the
  // original value must still be exactly what it was before.
  test('probing never attempts to write to an occupied probe key, even one whose write/restore would throw', () => {
    const probeKey = '__ham_exam_storage_probe__';
    const storage = fakeStorage();
    storage.setItem(probeKey, 'important-old-value');
    const spy = Object.assign({}, storage, {
      setItem: function(k, v) {
        if (k === probeKey) throw new Error('must never write to an occupied probe key');
        return storage.setItem(k, v);
      },
      removeItem: function(k) {
        if (k === probeKey) throw new Error('must never remove an occupied probe key');
        return storage.removeItem(k);
      }
    });
    const adapter = S.createStorageAdapter(spy, makeRegistry(), makeBanks());
    assert.equal(adapter.isAvailable(), true, 'a successful read of an occupied probe key is sufficient evidence of availability');
    assert.equal(storage.getItem(probeKey), 'important-old-value', 'the original value must remain completely untouched');
  });

  test('probing removes its own throwaway key when none existed before', () => {
    const probeKey = '__ham_exam_storage_probe__';
    const storage = fakeStorage();
    const adapter = S.createStorageAdapter(storage, makeRegistry(), makeBanks());
    adapter.isAvailable();
    assert.equal(storage.getItem(probeKey), null);
  });

  test('a throwing getItem/setItem/removeItem is caught and reported as unavailable', () => {
    function throwingStorage() {
      return { getItem: () => { throw new Error('boom'); }, setItem: () => { throw new Error('boom'); }, removeItem: () => { throw new Error('boom'); } };
    }
    const adapter = S.createStorageAdapter(throwingStorage(), makeRegistry(), makeBanks());
    assert.equal(adapter.isAvailable(), false);
    const loaded = adapter.load();
    assert.equal(loaded.status, S.STATUS.UNAVAILABLE);
    assert.equal(loaded.writable, false);
  });

  test('load() with no canonical or legacy data returns the default state', () => {
    const adapter = S.createStorageAdapter(fakeStorage(), makeRegistry(), makeBanks());
    const result = adapter.load();
    assert.equal(result.status, S.STATUS.MIGRATED);
    assert.deepEqual(result.state, S.createDefaultState(makeRegistry(), makeBanks()));
  });

  test('load() never touches legacy keys (no removal/rewrite)', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const storage = fakeStorage();
    storage.setItem(S.LEGACY_POOL_KEY, 'general');
    const adapter = S.createStorageAdapter(storage, registry, banks);
    adapter.load();
    assert.equal(storage.getItem(S.LEGACY_POOL_KEY), 'general');
  });

  test('save() writes exactly one canonical key and reports ok on successful read-back', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const storage = fakeStorage();
    let canonicalSetCalls = 0;
    const spy = Object.assign({}, storage, {
      setItem: function(k, v) {
        if (k === S.STORAGE_KEY) canonicalSetCalls++;
        return storage.setItem(k, v);
      }
    });
    const adapter = S.createStorageAdapter(spy, registry, banks);
    const state = S.createDefaultState(registry, banks);
    const result = adapter.save(state);
    assert.equal(result.ok, true);
    assert.equal(result.status, S.STATUS.OK);
    assert.equal(canonicalSetCalls, 1, 'exactly one setItem of the canonical key (separate from the one-time availability probe)');
    assert.deepEqual(JSON.parse(storage.getItem(S.STORAGE_KEY)), state);
  });

  test('save() never touches legacy keys', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const storage = fakeStorage();
    storage.setItem(S.LEGACY_THEME_KEY, 'dark');
    const adapter = S.createStorageAdapter(storage, registry, banks);
    adapter.save(S.createDefaultState(registry, banks));
    assert.equal(storage.getItem(S.LEGACY_THEME_KEY), 'dark');
  });

  test('save() refuses to write an invalid state', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const adapter = S.createStorageAdapter(fakeStorage(), registry, banks);
    const result = adapter.save({ not: 'valid' });
    assert.equal(result.ok, false);
    assert.equal(result.status, S.STATUS.INVALID);
    assert.ok(result.errors.length > 0);
  });

  test('a throwing setItem on save() is reported as a structured failure, not thrown', () => {
    // Only the canonical-key write throws; the availability probe (a
    // different key) must still succeed so this genuinely exercises the
    // real-write failure path rather than "storage unavailable".
    const registry = makeRegistry(); const banks = makeBanks();
    const storage = fakeStorage();
    const spy = Object.assign({}, storage, {
      setItem: function(k, v) {
        if (k === S.STORAGE_KEY) throw new Error('write failed');
        return storage.setItem(k, v);
      }
    });
    const adapter = S.createStorageAdapter(spy, registry, banks);
    const result = adapter.save(S.createDefaultState(registry, banks));
    assert.equal(result.ok, false);
    assert.equal(result.status, S.STATUS.WRITE_ERROR);
  });

  test('quota/full-storage failure on save() is reported, not thrown', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const storage = fakeStorage();
    const spy = Object.assign({}, storage, {
      setItem: function(k, v) {
        if (k === S.STORAGE_KEY) {
          const e = new Error('exceeded the quota'); e.name = 'QuotaExceededError'; throw e;
        }
        return storage.setItem(k, v);
      }
    });
    const adapter = S.createStorageAdapter(spy, registry, banks);
    const result = adapter.save(S.createDefaultState(registry, banks));
    assert.equal(result.ok, false);
    assert.equal(result.status, S.STATUS.WRITE_ERROR);
  });

  test('read-back corruption/mismatch after a write is reported as failure, not success', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const storage = fakeStorage();
    const spy = Object.assign({}, storage, {
      setItem: function(k, v) { storage.setItem(k, v); },
      getItem: function(k) {
        const real = storage.getItem(k);
        return k === S.STORAGE_KEY && real !== null ? real + 'CORRUPTED' : real;
      }
    });
    const adapter = S.createStorageAdapter(spy, registry, banks);
    const result = adapter.save(S.createDefaultState(registry, banks));
    assert.equal(result.ok, false);
    assert.equal(result.status, S.STATUS.READ_BACK_MISMATCH);
  });

  test('a throwing getItem during read-back is reported as failure, not thrown', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const storage = fakeStorage();
    let writeHappened = false;
    const spy = {
      getItem: function(k) {
        if (k === S.STORAGE_KEY && writeHappened) throw new Error('read boom');
        return storage.getItem(k);
      },
      setItem: function(k, v) { writeHappened = writeHappened || k === S.STORAGE_KEY; return storage.setItem(k, v); },
      removeItem: function(k) { return storage.removeItem(k); }
    };
    const adapter = S.createStorageAdapter(spy, registry, banks);
    const result = adapter.save(S.createDefaultState(registry, banks));
    assert.equal(result.ok, false);
    assert.equal(result.status, S.STATUS.READ_BACK_ERROR);
  });

  test('save() never overwrites a detected future-schema canonical value', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const storage = fakeStorage();
    storage.setItem(S.STORAGE_KEY, JSON.stringify({ schemaVersion: 99, whatever: true }));
    let canonicalSetCalls = 0;
    const spy = Object.assign({}, storage, {
      setItem: function(k, v) {
        if (k === S.STORAGE_KEY) canonicalSetCalls++;
        return storage.setItem(k, v);
      }
    });
    const adapter = S.createStorageAdapter(spy, registry, banks);
    const result = adapter.save(S.createDefaultState(registry, banks));
    assert.equal(result.ok, false);
    assert.equal(result.status, S.STATUS.FUTURE_SCHEMA);
    assert.equal(canonicalSetCalls, 0, 'no setItem of the canonical key may occur once a future schema is detected');
    assert.match(storage.getItem(S.STORAGE_KEY), /"schemaVersion":99/); // untouched
  });

  test('load() also preserves an existing future-schema value untouched', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const storage = fakeStorage();
    const rawFuture = JSON.stringify({ schemaVersion: 99, whatever: true });
    storage.setItem(S.STORAGE_KEY, rawFuture);
    const adapter = S.createStorageAdapter(storage, registry, banks);
    const result = adapter.load();
    assert.equal(result.status, S.STATUS.FUTURE_SCHEMA);
    assert.equal(result.writable, false);
    assert.equal(storage.getItem(S.STORAGE_KEY), rawFuture);
  });

  // Regression tests for a P1 review finding: a guarded read of the
  // canonical key that THROWS must never be treated the same as "the key is
  // absent" -- the unreadable value might be a future/unsupported schema
  // this module must never overwrite.
  test('save() fails closed on a throwing canonical preflight read, instead of writing over an unknown value', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const storage = fakeStorage();
    // A real value IS present underneath -- a future schema -- but the
    // preflight read of it throws. save() must not treat this as "absent".
    storage.setItem(S.STORAGE_KEY, JSON.stringify({ schemaVersion: 99, whatever: true }));
    let canonicalSetCalls = 0;
    const spy = Object.assign({}, storage, {
      getItem: function(k) {
        if (k === S.STORAGE_KEY) throw new Error('preflight read boom');
        return storage.getItem(k);
      },
      setItem: function(k, v) {
        if (k === S.STORAGE_KEY) canonicalSetCalls++;
        return storage.setItem(k, v);
      }
    });
    const adapter = S.createStorageAdapter(spy, registry, banks);
    const result = adapter.save(S.createDefaultState(registry, banks));
    assert.equal(result.ok, false);
    assert.equal(result.status, S.STATUS.READ_ERROR);
    assert.equal(canonicalSetCalls, 0, 'must not write over a canonical value it failed to inspect');
  });

  test('load() fails closed (read-error, non-writable) on a throwing canonical read, not "migrated"', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const storage = fakeStorage();
    const spy = {
      getItem: function(k) {
        if (k === S.STORAGE_KEY) throw new Error('load read boom');
        return storage.getItem(k);
      },
      setItem: function(k, v) { return storage.setItem(k, v); },
      removeItem: function(k) { return storage.removeItem(k); }
    };
    const adapter = S.createStorageAdapter(spy, registry, banks);
    const result = adapter.load();
    assert.equal(result.status, S.STATUS.READ_ERROR);
    assert.equal(result.writable, false);
  });

  test('save() also refuses to overwrite an existing OLDER unsupported schema (schemaVersion 0)', () => {
    const registry = makeRegistry(); const banks = makeBanks();
    const storage = fakeStorage();
    storage.setItem(S.STORAGE_KEY, JSON.stringify({ schemaVersion: 0, whatever: true }));
    let canonicalSetCalls = 0;
    const spy = Object.assign({}, storage, {
      setItem: function(k, v) {
        if (k === S.STORAGE_KEY) canonicalSetCalls++;
        return storage.setItem(k, v);
      }
    });
    const adapter = S.createStorageAdapter(spy, registry, banks);
    const result = adapter.save(S.createDefaultState(registry, banks));
    assert.equal(result.ok, false);
    assert.equal(result.status, S.STATUS.UNSUPPORTED_SCHEMA);
    assert.equal(canonicalSetCalls, 0);
  });
});

// --------------------------------------------------------------------------
// Module import: no I/O, no browser-global side effects
// --------------------------------------------------------------------------

describe('module import has no storage I/O or browser-global side effects', () => {
  test('require() in Node returns the API and never touches `window`', () => {
    const before = typeof global.window;
    const mod = require('../../src/storage.js');
    assert.equal(typeof global.window, before, 'requiring the module must not create a global `window`');
    assert.ok(mod.HAM_EXAM_STORAGE, 'require() must return an object carrying HAM_EXAM_STORAGE');
  });

  test('requiring the module performs no file I/O (spawned in an empty scratch cwd)', () => {
    // Spawn a fresh Node process with CWD set to a directory containing
    // nothing but this one file, so any incidental fs read/require of
    // something else in the repo would throw.
    const scratch = fs.mkdtempSync(path.join(require('os').tmpdir(), 'hamexam-storage-io-'));
    try {
      const storageSrc = fs.readFileSync(path.join(REPO_ROOT, 'src/storage.js'), 'utf8');
      fs.writeFileSync(path.join(scratch, 'storage.js'), storageSrc);
      const out = execFileSync(process.execPath, ['-e', 'require("./storage.js"); console.log("ok");'], {
        cwd: scratch, encoding: 'utf8'
      });
      assert.equal(out.trim(), 'ok');
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  });

  test('src/app.js does not reference the storage module (not wired in yet)', () => {
    const appSrc = fs.readFileSync(path.join(REPO_ROOT, 'src/app.js'), 'utf8');
    assert.ok(!/HAM_EXAM_STORAGE/.test(appSrc), 'src/app.js must not reference HAM_EXAM_STORAGE yet');
    assert.ok(!/createStorageAdapter/.test(appSrc), 'src/app.js must not reference createStorageAdapter yet');
    assert.ok(!/ham-exam-state/.test(appSrc), 'src/app.js must not reference the canonical key yet');
  });

  test('loading the module in a browser-like sandbox does not touch localStorage', () => {
    const vm = require('node:vm');
    let getCalls = 0, setCalls = 0, removeCalls = 0;
    const sandbox = {
      window: {
        localStorage: {
          getItem: () => { getCalls++; return null; },
          setItem: () => { setCalls++; },
          removeItem: () => { removeCalls++; }
        }
      }
    };
    sandbox.window.window = sandbox.window; // self-reference, as in a real browser
    vm.createContext(sandbox);
    const src = fs.readFileSync(path.join(REPO_ROOT, 'src/storage.js'), 'utf8');
    vm.runInContext(src, sandbox);
    assert.ok(sandbox.window.HAM_EXAM_STORAGE, 'the module must still attach itself to window');
    assert.equal(getCalls + setCalls + removeCalls, 0, 'loading the module must not touch localStorage');
  });
});

// --------------------------------------------------------------------------
// Real registry/banks contract test (small, dedicated -- not the bulk of coverage)
// --------------------------------------------------------------------------

describe('real data/pools.json and real banks', () => {
  function loadReal() {
    const registry = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/pools.json'), 'utf8'));
    const banks = {};
    for (const key of S.POOL_KEYS) {
      banks[key] = { questions: JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', key + '.json'), 'utf8')) };
    }
    return { registry, banks };
  }

  test('createDefaultState against the real registry/banks validates with zero errors', () => {
    const { registry, banks } = loadReal();
    const state = S.createDefaultState(registry, banks);
    assert.deepEqual(S.validateState(state, registry, banks), { errors: [] });
    assert.equal(state.study.pools.technician.editionId, 'technician-2026-2030');
    assert.equal(state.study.pools.general.editionId, 'general-2023-2027');
    assert.equal(state.study.pools.extra.editionId, 'extra-2024-2028');
  });

  test('migrating a realistic legacy snapshot against the real registry/banks succeeds', () => {
    const { registry, banks } = loadReal();
    const snapshot = {};
    snapshot[S.LEGACY_POOL_KEY] = 'general';
    snapshot[S.LEGACY_THEME_KEY] = 'dark';
    snapshot[S.legacyIndexKey('general')] = '10';
    snapshot[S.legacyBookmarksKey('general')] = JSON.stringify([banks.general.questions[0].id, banks.general.questions[5].id]);
    const out = S.migrateLegacy(snapshot, registry, banks).state;
    assert.deepEqual(S.validateState(out, registry, banks), { errors: [] });
    assert.equal(out.study.pools.general.currentQuestionId, banks.general.questions[10].id);
  });
});
