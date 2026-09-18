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
    errataLabel: 'synthetic errata',
    // Stage 5A mock-exam configuration. makeBanks() below puts all 3
    // synthetic questions per pool in a single "<prefix>1A" group, so the
    // default blueprint draws all 3 of them from that one group.
    examQuestionCount: 3,
    passingScore: 2,
    defaultTimeLimitSeconds: 1500,
    withdrawnIds: [],
    groupBlueprint: { [`${prefix}1A`]: 3 },
    // Stage 6A1: identity is derived from groupBlueprint's own keys above
    // ("<prefix>1A" -> subelement "<prefix>1"), so this default always stays
    // in sync with it without being independently maintained.
    scopeLabels: {
      subelements: { [`${prefix}1`]: 'Synthetic Subelement One' },
      groups: { [`${prefix}1A`]: 'Synthetic group one A' }
    }
  }, overrides || {});
}

function makeRegistry(overrides) {
  const pools = {};
  for (const key of pr.POOL_KEYS) {
    pools[key] = poolEntry(key, overrides && overrides[key]);
  }
  return { schemaVersion: 3, pools };
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
    assert.equal(registry.schemaVersion, 3);
    assert.deepEqual(Object.keys(registry.pools).sort(), ['extra', 'general', 'technician']);
    assert.equal(registry.pools.technician.editionId, 'technician-2026-2030');
    assert.equal(registry.pools.general.editionId, 'general-2023-2027');
    assert.equal(registry.pools.extra.editionId, 'extra-2024-2028');
    assert.equal(registry.pools.technician.expectedCount, 409);
    assert.equal(registry.pools.general.expectedCount, 423);
    assert.equal(registry.pools.extra.expectedCount, 599);
  });

  test('the shipped registry records the expected mock-exam configuration', () => {
    const { registry } = loadReal();
    assert.equal(registry.pools.technician.examQuestionCount, 35);
    assert.equal(registry.pools.general.examQuestionCount, 35);
    assert.equal(registry.pools.extra.examQuestionCount, 50);
    assert.equal(registry.pools.technician.passingScore, 26);
    assert.equal(registry.pools.general.passingScore, 26);
    assert.equal(registry.pools.extra.passingScore, 37);
    assert.equal(registry.pools.technician.defaultTimeLimitSeconds, 2100);
    assert.equal(registry.pools.general.defaultTimeLimitSeconds, 2100);
    assert.equal(registry.pools.extra.defaultTimeLimitSeconds, 3000);
    for (const key of pr.POOL_KEYS) {
      const entry = registry.pools[key];
      assert.deepEqual(entry.withdrawnIds, []);
      const total = Object.values(entry.groupBlueprint).reduce((s, n) => s + n, 0);
      assert.equal(total, entry.examQuestionCount,
        `${key}: groupBlueprint total must equal examQuestionCount`);
    }
  });

  // Review finding (Stage 6A1 follow-up): native mobile <select> menus do not
  // reliably wrap long option text, so a group label needs to stay
  // realistically readable well under the hard schema ceiling
  // (MAX_SCOPE_LABEL_LENGTH). This is a stricter, real-data regression bound
  // distinct from that schema check -- it catches a label quietly regrowing
  // past a sensible display length even though it would still pass
  // validation. CONCISE_TARGET is the soft per-label target every label
  // should be at or under; the two named exceptions are official-text
  // disambiguation for same-pool label collisions (see
  // docs/SCOPED_STUDY_PLAN.md), each still well under the hard ceiling.
  test('every real group label stays within the concise on-mobile readability target', () => {
    const { registry } = loadReal();
    const CONCISE_TARGET = 56; // covers every real label except the two
                                // disambiguated pairs below
    const KNOWN_DISAMBIGUATION_EXCEPTIONS = { extra: { E2D: 63, E7E: 70 } };
    for (const key of pr.POOL_KEYS) {
      const groups = registry.pools[key].scopeLabels.groups;
      for (const [code, title] of Object.entries(groups)) {
        const exceptionMax = KNOWN_DISAMBIGUATION_EXCEPTIONS[key] && KNOWN_DISAMBIGUATION_EXCEPTIONS[key][code];
        const limit = exceptionMax || CONCISE_TARGET;
        assert.ok(title.length <= limit,
          `${key}.scopeLabels.groups["${code}"] is ${title.length} chars (limit ${limit}): "${title}"`);
        assert.ok(title.length <= pr.MAX_SCOPE_LABEL_LENGTH,
          `${key}.scopeLabels.groups["${code}"] exceeds the hard schema ceiling too`);
      }
    }
  });

  test('no two groups in the same pool share an identical label', () => {
    const { registry } = loadReal();
    for (const key of pr.POOL_KEYS) {
      const groups = registry.pools[key].scopeLabels.groups;
      const byLabel = {};
      for (const [code, title] of Object.entries(groups)) {
        (byLabel[title] = byLabel[title] || []).push(code);
      }
      for (const [title, codes] of Object.entries(byLabel)) {
        assert.equal(codes.length, 1,
          `${key}: groups ${codes.join(', ')} share the identical label "${title}"`);
      }
    }
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
    expectErrors(r, makeBanks(), /schemaVersion must be 3/);
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
    // The default blueprint draws all 3 exam questions from T1A; moving one
    // bank question to T0A leaves only 2 there, so rebalance the blueprint
    // to match this fixture's actual group composition (still summing to 3).
    // scopeLabels must cover the added T0/T0A identity too (Stage 6A1).
    const r = makeRegistry({
      technician: {
        groupBlueprint: { T1A: 2, T0A: 1 },
        scopeLabels: {
          subelements: { T1: 'Synthetic Subelement One', T0: 'Synthetic Subelement Zero' },
          groups: { T1A: 'Synthetic group one A', T0A: 'Synthetic group zero A' }
        }
      }
    });
    assert.deepEqual(pr.validatePoolRegistry(r, banks).errors, []);
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

describe('mock-exam configuration (Stage 5A)', () => {
  test('rejects a non-positive examQuestionCount', () => {
    const r = makeRegistry({ technician: { examQuestionCount: 0 } });
    expectErrors(r, makeBanks(), /examQuestionCount must be a positive integer/);
  });

  test('rejects a non-positive passingScore', () => {
    const r = makeRegistry({ technician: { passingScore: 0 } });
    expectErrors(r, makeBanks(), /passingScore must be a positive integer/);
  });

  test('rejects a passingScore greater than examQuestionCount', () => {
    const r = makeRegistry({ technician: { passingScore: 4 } });
    expectErrors(r, makeBanks(), /passingScore \(4\) must not exceed examQuestionCount \(3\)/);
  });

  test('rejects a negative defaultTimeLimitSeconds', () => {
    const r = makeRegistry({ technician: { defaultTimeLimitSeconds: -1 } });
    expectErrors(r, makeBanks(), /defaultTimeLimitSeconds must be an integer between 0 and/);
  });

  test('rejects a defaultTimeLimitSeconds over the documented bound', () => {
    const r = makeRegistry({ technician: { defaultTimeLimitSeconds: pr.MAX_DEFAULT_TIME_LIMIT_SECONDS + 1 } });
    expectErrors(r, makeBanks(), /defaultTimeLimitSeconds must be an integer between 0 and/);
  });

  test('accepts a zero defaultTimeLimitSeconds (untimed) and the exact upper bound', () => {
    const r = makeRegistry({
      technician: { defaultTimeLimitSeconds: 0 },
      general: { defaultTimeLimitSeconds: pr.MAX_DEFAULT_TIME_LIMIT_SECONDS }
    });
    assert.deepEqual(pr.validatePoolRegistry(r, makeBanks()).errors, []);
  });

  test('rejects a non-array withdrawnIds', () => {
    const r = makeRegistry({ technician: { withdrawnIds: 'T1A02' } });
    expectErrors(r, makeBanks(), /withdrawnIds must be an array/);
  });

  test('rejects a malformed withdrawn question ID', () => {
    const r = makeRegistry({ technician: { withdrawnIds: ['not-an-id'] } });
    expectErrors(r, makeBanks(), /withdrawnIds\[0\] must be a valid question ID/);
  });

  test('rejects a withdrawn ID from another pool\'s prefix', () => {
    const r = makeRegistry({ technician: { withdrawnIds: ['G1A02'] } });
    expectErrors(r, makeBanks(), /withdrawnIds\[0\] "G1A02" does not start with the technician pool prefix "T"/);
  });

  test('rejects a duplicate withdrawn ID', () => {
    const r = makeRegistry({ technician: { withdrawnIds: ['T1A02', 'T1A02'] } });
    expectErrors(r, makeBanks(), /withdrawnIds\[1\] "T1A02" is a duplicate withdrawn ID/);
  });

  test('accepts a withdrawn ID no longer present in the bank', () => {
    // A withdrawn ID may legitimately be absent from an already-updated bank
    // file; format is checked, presence is not.
    const r = makeRegistry({ technician: { withdrawnIds: ['T9Z99'] } });
    assert.deepEqual(pr.validatePoolRegistry(r, makeBanks()).errors, []);
  });

  test('rejects a non-object groupBlueprint', () => {
    const r = makeRegistry({ technician: { groupBlueprint: [] } });
    expectErrors(r, makeBanks(), /groupBlueprint must be an object mapping group IDs to positive integers/);
  });

  test('rejects an empty groupBlueprint', () => {
    const r = makeRegistry({ technician: { groupBlueprint: {} } });
    expectErrors(r, makeBanks(), /groupBlueprint must not be empty/);
  });

  test('rejects a malformed group ID key', () => {
    const r = makeRegistry({ technician: { groupBlueprint: { T1: 3 } } });
    expectErrors(r, makeBanks(), /groupBlueprint\["T1"\]: key must be a 3-character group ID/);
  });

  test('rejects a group ID using another pool\'s prefix', () => {
    const r = makeRegistry({ technician: { groupBlueprint: { G1A: 3 } } });
    expectErrors(r, makeBanks(), /groupBlueprint\["G1A"\]: group "G1A" does not start with the technician pool prefix "T"/);
  });

  test('rejects a non-positive blueprint entry value', () => {
    const r = makeRegistry({ technician: { groupBlueprint: { T1A: 0 } } });
    expectErrors(r, makeBanks(), /groupBlueprint\["T1A"\] must be a positive integer, got 0/);
  });

  test('rejects an impossible blueprint entry (needs more than the bank has)', () => {
    const r = makeRegistry({ technician: { groupBlueprint: { T1A: 5 } } });
    expectErrors(r, makeBanks(),
      /groupBlueprint\["T1A"\] needs 5 question\(s\) but the technician bank has only 3 available/);
  });

  test('an impossible entry is reported even when the blueprint total matches examQuestionCount', () => {
    // examQuestionCount raised to 5 to agree with the (impossible) blueprint
    // total, isolating the "not enough in the bank" error from a total mismatch.
    const r = makeRegistry({ technician: { groupBlueprint: { T1A: 5 }, examQuestionCount: 5 } });
    const { errors } = pr.validatePoolRegistry(r, makeBanks());
    assert.ok(errors.some((e) => /needs 5 question\(s\) but the technician bank has only 3 available/.test(e)));
    assert.ok(!errors.some((e) => /groupBlueprint totals \d+ but examQuestionCount is/.test(e)));
  });

  test('rejects a groupBlueprint total that does not match examQuestionCount', () => {
    const r = makeRegistry({ technician: { groupBlueprint: { T1A: 2 } } });
    expectErrors(r, makeBanks(), /groupBlueprint totals 2 but examQuestionCount is 3/);
  });

  test('rejects withdrawing all questions in a blueprint group (now impossible)', () => {
    const r = makeRegistry({
      technician: { withdrawnIds: ['T1A01', 'T1A02', 'T1A03'], groupBlueprint: { T1A: 1 }, examQuestionCount: 1 }
    });
    expectErrors(r, makeBanks(),
      /groupBlueprint\["T1A"\] needs 1 question\(s\) but the technician bank has only 0 available \(after withdrawals\)/);
  });
});

describe('scope labels (Stage 6A1)', () => {
  test('accepts custom, still-valid labels for the fixture group/subelement', () => {
    const r = makeRegistry({
      technician: {
        scopeLabels: {
          subelements: { T1: 'Commission’s Rules' },
          groups: { T1A: 'Purpose and permissible use' }
        }
      }
    });
    assert.deepEqual(pr.validatePoolRegistry(r, makeBanks()).errors, []);
  });

  test('rejects a missing scopeLabels entirely', () => {
    const r = makeRegistry();
    delete r.pools.technician.scopeLabels;
    expectErrors(r, makeBanks(), /scopeLabels must be an object with "subelements" and "groups"/);
  });

  test('rejects a non-object scopeLabels', () => {
    const r = makeRegistry({ technician: { scopeLabels: ['T1A'] } });
    expectErrors(r, makeBanks(), /scopeLabels must be an object with "subelements" and "groups"/);
  });

  test('rejects an unknown key inside scopeLabels', () => {
    const r = makeRegistry({
      technician: {
        scopeLabels: {
          subelements: { T1: 'Commission’s Rules' },
          groups: { T1A: 'Purpose and permissible use' },
          questions: {}
        }
      }
    });
    expectErrors(r, makeBanks(), /scopeLabels: unknown key\(s\): questions/);
  });

  test('rejects a non-object subelements/groups collection', () => {
    const r = makeRegistry({
      technician: { scopeLabels: { subelements: 'T1', groups: { T1A: 'Purpose and permissible use' } } }
    });
    expectErrors(r, makeBanks(), /scopeLabels\.subelements must be an object mapping code to title/);
  });

  test('rejects a code not present in this pool\'s groupBlueprint', () => {
    const r = makeRegistry({
      technician: {
        scopeLabels: {
          subelements: { T1: 'Commission’s Rules', T2: 'Operating Procedures' },
          groups: { T1A: 'Purpose and permissible use' }
        }
      }
    });
    expectErrors(r, makeBanks(), /scopeLabels\.subelements\["T2"\]: unknown code \(not in this pool's groupBlueprint\)/);
  });

  test('rejects a group code from another pool\'s prefix', () => {
    const r = makeRegistry({
      technician: {
        scopeLabels: {
          subelements: { T1: 'Commission’s Rules' },
          groups: { T1A: 'Purpose and permissible use', G1A: 'Borrowed from General' }
        }
      }
    });
    expectErrors(r, makeBanks(), /scopeLabels\.groups\["G1A"\]: unknown code/);
  });

  test('rejects a missing subelement label', () => {
    const r = makeRegistry({
      technician: { scopeLabels: { subelements: {}, groups: { T1A: 'Purpose and permissible use' } } }
    });
    expectErrors(r, makeBanks(), /scopeLabels\.subelements is missing a title for "T1"/);
  });

  test('rejects a missing group label', () => {
    const r = makeRegistry({
      technician: { scopeLabels: { subelements: { T1: 'Commission’s Rules' }, groups: {} } }
    });
    expectErrors(r, makeBanks(), /scopeLabels\.groups is missing a title for "T1A"/);
  });

  test('rejects a blank group label', () => {
    const r = makeRegistry({
      technician: {
        scopeLabels: { subelements: { T1: 'Commission’s Rules' }, groups: { T1A: '   ' } }
      }
    });
    expectErrors(r, makeBanks(), /scopeLabels\.groups\["T1A"\] must be a non-blank string/);
  });

  test('rejects a non-string label', () => {
    const r = makeRegistry({
      technician: {
        scopeLabels: { subelements: { T1: 'Commission’s Rules' }, groups: { T1A: 42 } }
      }
    });
    expectErrors(r, makeBanks(), /scopeLabels\.groups\["T1A"\] must be a non-blank string/);
  });

  test('rejects a label with leading or trailing whitespace', () => {
    const r = makeRegistry({
      technician: {
        scopeLabels: { subelements: { T1: 'Commission’s Rules' }, groups: { T1A: ' Purpose and permissible use ' } }
      }
    });
    expectErrors(r, makeBanks(), /scopeLabels\.groups\["T1A"\] must not have leading or trailing whitespace/);
  });

  test('rejects a label over the documented maximum length', () => {
    const overlong = 'x'.repeat(pr.MAX_SCOPE_LABEL_LENGTH + 1);
    const r = makeRegistry({
      technician: { scopeLabels: { subelements: { T1: 'Commission’s Rules' }, groups: { T1A: overlong } } }
    });
    expectErrors(r, makeBanks(), /scopeLabels\.groups\["T1A"\] exceeds the \d+-character limit/);
  });

  test('accepts a label at exactly the documented maximum length', () => {
    const exact = 'x'.repeat(pr.MAX_SCOPE_LABEL_LENGTH);
    const r = makeRegistry({
      technician: { scopeLabels: { subelements: { T1: 'Commission’s Rules' }, groups: { T1A: exact } } }
    });
    assert.deepEqual(pr.validatePoolRegistry(r, makeBanks()).errors, []);
  });

  test('rejects malformed metadata: scopeLabels as an array, groups as a string', () => {
    const r1 = makeRegistry({ technician: { scopeLabels: [] } });
    expectErrors(r1, makeBanks(), /scopeLabels must be an object with "subelements" and "groups"/);

    const r2 = makeRegistry({
      technician: { scopeLabels: { subelements: { T1: 'Commission’s Rules' }, groups: 'T1A' } }
    });
    expectErrors(r2, makeBanks(), /scopeLabels\.groups must be an object mapping code to title/);
  });

  test('validateScopeLabels is exported, pure, and deterministic', () => {
    const labels = Object.freeze({
      subelements: Object.freeze({ T1: 'Commission’s Rules' }),
      groups: Object.freeze({ T1A: 'Purpose and permissible use' })
    });
    const errorsA = [];
    const errorsB = [];
    pr.validateScopeLabels(labels, 'registry.pools["technician"]', ['T1'], ['T1A'], (m) => errorsA.push(m));
    pr.validateScopeLabels(labels, 'registry.pools["technician"]', ['T1'], ['T1A'], (m) => errorsB.push(m));
    assert.deepEqual(errorsA, []);
    assert.deepEqual(errorsA, errorsB);
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
        assert.ok(err.message.indexOf('- registry: schemaVersion must be 3') !== -1);
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
    assert.equal(pr.SCHEMA_VERSION, 3);
    assert.deepEqual(pr.POOL_KEYS, ['technician', 'general', 'extra']);
    assert.deepEqual(pr.POOL_ID_PREFIX, { technician: 'T', general: 'G', extra: 'E' });
    assert.ok(pr.QUESTION_ID_RE.test('T1A01'));
    assert.ok(!pr.QUESTION_ID_RE.test('T1A1'));
    assert.ok(!pr.QUESTION_ID_RE.test('T1A00'));
    assert.ok(pr.QUESTION_ID_RE.test('T0A01'));
    assert.ok(pr.isValidIsoDate('2024-02-29'));
    assert.ok(!pr.isValidIsoDate('2023-02-29'));
    assert.ok(pr.GROUP_ID_RE.test('T1A'));
    assert.ok(!pr.GROUP_ID_RE.test('T1A01'));
    assert.equal(typeof pr.MAX_DEFAULT_TIME_LIMIT_SECONDS, 'number');
    assert.equal(typeof pr.MAX_SCOPE_LABEL_LENGTH, 'number');
    assert.deepEqual(pr.SCOPE_LABELS_KEYS, new Set(['subelements', 'groups']));
  });
});
