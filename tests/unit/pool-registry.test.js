'use strict';

// Unit tests for scripts/pool-registry.js (Stage 4A0 — canonical pool identity
// registry contract and build-gate validation).
//
// The first block validates the REAL data/pools.json against the REAL question
// banks (read-only). Everything else uses SYNTHETIC in-memory fixtures: tiny
// hand-written registries and banks assembled per test. No test mutates
// tracked data.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pr = require('../../scripts/pool-registry.js');

const REPO_ROOT = path.join(__dirname, '../..');
const POOLS_REL = 'data/pools.json';

function loadReal() {
  const registry = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, POOLS_REL), 'utf8'));
  const banks = {};
  for (const key of pr.POOL_KEYS) {
    banks[key] = {
      questions: JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', `${key}.json`), 'utf8'))
    };
  }
  return { registry, banks };
}

// --------------------------------------------------------------------------
// synthetic fixture builders
// --------------------------------------------------------------------------

// A minimal valid question for a given pool prefix.
function question(prefix, n) {
  const id = `${prefix}1A${String(n).padStart(2, '0')}`;
  return { id, sub: id.slice(0, 2) };
}

// A minimal valid bank set: 3 questions per pool, distinct prefixes.
function makeBanks(counts) {
  const c = Object.assign({ technician: 3, general: 3, extra: 3 }, counts || {});
  return {
    technician: { questions: Array.from({ length: c.technician }, (_, i) => question('T', i + 1)) },
    general: { questions: Array.from({ length: c.general }, (_, i) => question('G', i + 1)) },
    extra: { questions: Array.from({ length: c.extra }, (_, i) => question('E', i + 1)) }
  };
}

function poolEntry(poolKey, overrides) {
  const prefix = pr.POOL_ID_PREFIX[poolKey];
  return Object.assign({
    poolKey,
    displayName: poolKey[0].toUpperCase() + poolKey.slice(1),
    editionId: `${poolKey}-2020-2024`,
    revisionId: `errata-2021-01-01`,
    element: 2,
    effectiveStart: '2020-07-01',
    effectiveEnd: '2024-06-30',
    expectedCount: 3,
    questionIdPrefix: prefix,
    sourceUrl: `https://example.org/${poolKey}`,
    errataLabel: 'synthetic errata'
  }, overrides || {});
}

function makeRegistry(overrides) {
  const pools = {};
  for (const key of pr.POOL_KEYS) {
    pools[key] = poolEntry(key, overrides && overrides[key]);
  }
  return { schemaVersion: 1, pools };
}

function expectErrors(registry, banks, pattern) {
  const { errors } = pr.validatePoolRegistry(registry, banks);
  const matched = errors.filter((e) => pattern.test(e));
  assert.ok(matched.length > 0,
    `expected an error matching ${pattern}, got:\n${errors.join('\n') || '(no errors)'}`);
  return errors;
}

// --------------------------------------------------------------------------
// real registry against the real banks
// --------------------------------------------------------------------------

describe('real data/pools.json against the real banks', () => {
  test('the shipped registry validates with zero errors', () => {
    const { registry, banks } = loadReal();
    assert.deepEqual(pr.validatePoolRegistry(registry, banks), { errors: [] });
    assert.doesNotThrow(() => pr.assertPoolRegistry(registry, banks));
  });

  test('the shipped registry records the expected pool identities', () => {
    const { registry } = loadReal();
    assert.equal(registry.schemaVersion, 1);
    assert.deepEqual(Object.keys(registry.pools).sort(), ['extra', 'general', 'technician']);
    assert.equal(registry.pools.technician.editionId, 'technician-2026-2030');
    assert.equal(registry.pools.general.editionId, 'general-2023-2027');
    assert.equal(registry.pools.extra.editionId, 'extra-2024-2028');
    assert.equal(registry.pools.technician.expectedCount, 409);
    assert.equal(registry.pools.general.expectedCount, 423);
    assert.equal(registry.pools.extra.expectedCount, 599);
  });
});

// --------------------------------------------------------------------------
// synthetic negative cases
// --------------------------------------------------------------------------

describe('registry shape', () => {
  test('a valid synthetic registry passes', () => {
    assert.deepEqual(pr.validatePoolRegistry(makeRegistry(), makeBanks()), { errors: [] });
  });

  test('rejects a non-object root', () => {
    assert.deepEqual(pr.validatePoolRegistry([], makeBanks()),
      { errors: ['registry: root must be a JSON object'] });
  });

  test('rejects a bad schemaVersion', () => {
    const r = makeRegistry();
    r.schemaVersion = 2;
    expectErrors(r, makeBanks(), /schemaVersion must be 1/);
  });

  test('rejects an unknown top-level key', () => {
    const r = makeRegistry();
    r.notes = 'nope';
    expectErrors(r, makeBanks(), /unknown top-level key\(s\): notes/);
  });

  test('rejects a missing pool', () => {
    const r = makeRegistry();
    delete r.pools.general;
    expectErrors(r, makeBanks(), /missing required pool "general"/);
  });

  test('rejects an extra pool', () => {
    const r = makeRegistry();
    r.pools.amateur = poolEntry('technician', { poolKey: 'amateur' });
    expectErrors(r, makeBanks(), /unknown pool key "amateur"/);
  });

  test('rejects a key/poolKey mismatch', () => {
    const r = makeRegistry();
    r.pools.general.poolKey = 'extra';
    expectErrors(r, makeBanks(), /poolKey must equal its registry key "general"/);
  });
});

describe('identity fields', () => {
  test('rejects a duplicate editionId', () => {
    const r = makeRegistry({ general: { editionId: 'technician-2020-2024' } });
    expectErrors(r, makeBanks(), /editionId "technician-2020-2024" is also used by pool "technician"/);
  });

  test('rejects a duplicate editionId+revisionId pair', () => {
    // A cross-pool edition copy is now caught by the prefix rule first, but the
    // identity must be rejected: either way the duplicated pair cannot pass.
    const r = makeRegistry({
      general: { editionId: 'technician-2020-2024', revisionId: 'errata-2021-01-01' }
    });
    const { errors } = pr.validatePoolRegistry(r, makeBanks());
    assert.ok(errors.some((e) => /identity pair|is a "technician" edition|also used by pool/.test(e)),
      `expected a duplicate-identity error, got:\n${errors.join('\n')}`);
  });

  test('rejects a missing entry field', () => {
    const r = makeRegistry();
    delete r.pools.extra.errataLabel;
    expectErrors(r, makeBanks(), /pools\["extra"\]\.errataLabel must be a non-blank string/);
  });

  test('rejects an unknown entry field', () => {
    const r = makeRegistry();
    r.pools.technician.internalNote = 'secret';
    expectErrors(r, makeBanks(), /pools\["technician"\]: unknown key\(s\): internalNote/);
  });

  test('rejects wrong field types', () => {
    const r = makeRegistry({ technician: { element: '2', displayName: 42 } });
    expectErrors(r, makeBanks(), /element must be a positive integer/);
    expectErrors(r, makeBanks(), /displayName must be a non-blank string/);
  });

  test('rejects a non-https sourceUrl', () => {
    const r = makeRegistry({ technician: { sourceUrl: 'http://example.org/t' } });
    expectErrors(r, makeBanks(), /sourceUrl must be a valid "https:\/\/" URL with a hostname/);
  });

  test('rejects malformed https URLs that only look plausible', () => {
    for (const bad of ['https://?', 'https://', 'https', 'https://exa mple.org']) {
      const r = makeRegistry({ technician: { sourceUrl: bad } });
      expectErrors(r, makeBanks(), /sourceUrl must be a valid "https:\/\/" URL with a hostname/);
    }
  });

  test('rejects malformed or unrelated editionIds', () => {
    for (const bad of ['unrelated', 'technician 2020-2024', 'Technician-2020-2024', 'technician-2020', 'technician-2020-2024x', 'technician-2020 -2024']) {
      const r = makeRegistry({ technician: { editionId: bad } });
      expectErrors(r, makeBanks(), /editionId must match "<poolKey>-<startYear>-<endYear>"/);
    }
  });

  test('rejects an editionId belonging to another pool', () => {
    const r = makeRegistry({ general: { editionId: 'technician-2020-2024' } });
    expectErrors(r, makeBanks(), /pools\["general"\]\.editionId "technician-2020-2024" is a "technician" edition, not "general"/);
  });

  test('rejects an editionId whose years disagree with the effective range', () => {
    const r = makeRegistry({ technician: { editionId: 'technician-2020-2025' } });
    expectErrors(r, makeBanks(), /does not agree with the effective range 2020-07-01\.\.2024-06-30/);
  });

  test('rejects malformed revisionId slugs', () => {
    for (const bad of ['x', 'errata', 'errata-2021-1-1', 'errata-2021-01-01 ', ' errata-2021-01-01', 'Errata-2021-01-01', 'errata-2021-01-01-x']) {
      const r = makeRegistry({ technician: { revisionId: bad } });
      expectErrors(r, makeBanks(), /revisionId must match "errata-YYYY-MM-DD" with an optional "-N" suffix/);
    }
  });

  test('rejects a revisionId with a non-calendar date', () => {
    const r = makeRegistry({ technician: { revisionId: 'errata-2021-02-30' } });
    expectErrors(r, makeBanks(), /does not contain a real calendar date/);
  });

  test('accepts a numbered errata slug suffix', () => {
    const r = makeRegistry({ general: { revisionId: 'errata-2026-02-04-6' } });
    assert.deepEqual(pr.validatePoolRegistry(r, makeBanks()).errors, []);
  });
});

describe('dates and counts', () => {
  test('rejects a bad date format', () => {
    const r = makeRegistry({ technician: { effectiveStart: '07/01/2020' } });
    expectErrors(r, makeBanks(), /effectiveStart must be a real ISO date/);
  });

  test('rejects a non-calendar date', () => {
    const r = makeRegistry({ technician: { effectiveEnd: '2024-02-30' } });
    expectErrors(r, makeBanks(), /effectiveEnd must be a real ISO date/);
  });

  test('rejects a reversed effective range', () => {
    const r = makeRegistry({ technician: { effectiveStart: '2024-06-30', effectiveEnd: '2020-07-01' } });
    expectErrors(r, makeBanks(), /effectiveStart must be before effectiveEnd/);
  });

  test('rejects non-positive element and expectedCount', () => {
    const r = makeRegistry({ technician: { element: 0, expectedCount: -3 } });
    expectErrors(r, makeBanks(), /element must be a positive integer/);
    expectErrors(r, makeBanks(), /expectedCount must be a positive integer/);
  });

  test('rejects an expectedCount that does not match the bank', () => {
    const r = makeRegistry({ technician: { expectedCount: 4 } });
    expectErrors(r, makeBanks(),
      /expectedCount is 4 but the technician bank has 3 questions/);
  });
});

describe('question cross-check', () => {
  test('rejects a wrong questionIdPrefix', () => {
    const r = makeRegistry({ general: { questionIdPrefix: 'T' } });
    expectErrors(r, makeBanks(), /questionIdPrefix must be "G"/);
  });

  test('rejects a duplicate question ID in the bank', () => {
    const banks = makeBanks();
    banks.technician.questions[1] = { id: 'T1A01', sub: 'T1' };
    expectErrors(makeRegistry(), banks, /"T1A01" has a duplicate question ID/);
  });

  test('rejects a question ID that does not match the format', () => {
    const banks = makeBanks();
    banks.extra.questions[0] = { id: 'E1A1', sub: 'E1' };
    expectErrors(makeRegistry(), banks, /"E1A1" has an invalid question ID/);
  });

  test('rejects a 00 question number (numbering starts at 01)', () => {
    const banks = makeBanks();
    banks.technician.questions[0] = { id: 'T1A00', sub: 'T1' };
    expectErrors(makeRegistry(), banks, /"T1A00" has an invalid question ID/);
  });

  test('accepts subelement 0 question IDs (T0/G0/E0 are legitimate)', () => {
    const banks = makeBanks();
    banks.technician.questions[0] = { id: 'T0A01', sub: 'T0' };
    assert.deepEqual(pr.validatePoolRegistry(makeRegistry(), banks).errors, []);
  });

  test('rejects a question ID with the wrong pool letter', () => {
    const banks = makeBanks();
    banks.general.questions[0] = { id: 'T1A01', sub: 'T1' };
    expectErrors(makeRegistry(), banks,
      /"T1A01" does not start with the general pool prefix "G"/);
  });

  test('rejects a sub that is inconsistent with the question ID', () => {
    const banks = makeBanks();
    banks.extra.questions[2] = { id: 'E1A03', sub: 'E2' };
    expectErrors(makeRegistry(), banks, /"E1A03" has sub "E2", expected "E1"/);
  });
});

describe('validator purity and exports', () => {
  test('validation never mutates frozen inputs', () => {
    const registry = makeRegistry();
    const banks = makeBanks();
    const frozenRegistry = JSON.parse(JSON.stringify(registry));
    const frozenBanks = JSON.parse(JSON.stringify(banks));
    (function deepFreeze(o) {
      if (o && typeof o === 'object') {
        Object.values(o).forEach(deepFreeze);
        Object.freeze(o);
      }
    })(frozenRegistry);
    (function deepFreeze(o) {
      if (o && typeof o === 'object') {
        Object.values(o).forEach(deepFreeze);
        Object.freeze(o);
      }
    })(frozenBanks);
    assert.deepEqual(pr.validatePoolRegistry(frozenRegistry, frozenBanks), { errors: [] });
    assert.deepEqual(JSON.parse(JSON.stringify(frozenRegistry)), registry);
    assert.deepEqual(JSON.parse(JSON.stringify(frozenBanks)), banks);
  });

  test('assertPoolRegistry throws one Error listing every error, sorted', () => {
    const r = makeRegistry();
    r.schemaVersion = 9;
    delete r.pools.extra;
    assert.throws(
      () => pr.assertPoolRegistry(r, makeBanks()),
      (err) => {
        assert.match(err.message, /Pool registry validation failed \(2 errors\):/);
        assert.ok(err.message.indexOf('- registry.pools: missing required pool "extra"') !== -1);
        assert.ok(err.message.indexOf('- registry: schemaVersion must be 1') !== -1);
        // Sorted: "registry.pools..." sorts before "registry: ..." is false
        // ('.' (46) < ':' (58)), so pools errors come first.
        assert.ok(
          err.message.indexOf('missing required pool') < err.message.indexOf('schemaVersion'),
          'errors must be sorted deterministically'
        );
        return true;
      }
    );
  });

  test('exported contract constants match the documented schema', () => {
    assert.equal(pr.SCHEMA_VERSION, 1);
    assert.deepEqual(pr.POOL_KEYS, ['technician', 'general', 'extra']);
    assert.deepEqual(pr.POOL_ID_PREFIX, { technician: 'T', general: 'G', extra: 'E' });
    assert.ok(pr.QUESTION_ID_RE.test('T1A01'));
    assert.ok(!pr.QUESTION_ID_RE.test('T1A1'));
    assert.ok(!pr.QUESTION_ID_RE.test('T1A00'));
    assert.ok(pr.QUESTION_ID_RE.test('T0A01'));
    assert.ok(pr.isValidIsoDate('2024-02-29'));
    assert.ok(!pr.isValidIsoDate('2023-02-29'));
  });
});
