'use strict';

// Stage 5B4: unit tests for scripts/question-bank.js -- the dependency-free,
// build-time base question-bank schema validator.
//
// The first block validates the REAL three question banks (read-only).
// Everything else uses SYNTHETIC in-memory fixtures. No test mutates
// tracked data.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const qb = require('../../scripts/question-bank.js');

const REPO_ROOT = path.join(__dirname, '../..');

function loadRealBank(poolKey) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', `${poolKey}.json`), 'utf8'));
}

// A minimal, fully valid question. Callers override individual fields.
function makeQuestion(overrides) {
  return Object.assign({
    id: 'T1A01',
    sub: 'T1',
    q: 'What does the question ask?',
    choices: { A: 'Choice A', B: 'Choice B', C: 'Choice C', D: 'Choice D' },
    correct: 'A',
    correctText: 'Choice A',
    ref: '',
  }, overrides || {});
}

function expectErrors(bank, pattern, options) {
  const { errors } = qb.validateQuestionBank(bank, options);
  const matched = errors.filter((e) => pattern.test(e));
  assert.ok(matched.length > 0,
    `expected an error matching ${pattern}, got:\n${errors.join('\n') || '(no errors)'}`);
  return errors;
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// --------------------------------------------------------------------------
// real banks
// --------------------------------------------------------------------------

describe('real question banks', () => {
  for (const poolKey of ['technician', 'general', 'extra']) {
    test(`the real ${poolKey}.json bank validates with zero errors`, () => {
      const bank = loadRealBank(poolKey);
      assert.deepEqual(qb.validateQuestionBank(bank, { poolKey }), { errors: [] });
      assert.doesNotThrow(() => qb.assertQuestionBank(bank, { poolKey }));
    });
  }
});

// --------------------------------------------------------------------------
// positive cases
// --------------------------------------------------------------------------

describe('positive cases', () => {
  test('a valid minimal synthetic bank passes', () => {
    assert.deepEqual(qb.validateQuestionBank([makeQuestion()]), { errors: [] });
  });

  test('an empty string ref is accepted', () => {
    assert.deepEqual(qb.validateQuestionBank([makeQuestion({ ref: '' })]), { errors: [] });
  });

  test('a non-empty ref is accepted', () => {
    assert.deepEqual(qb.validateQuestionBank([makeQuestion({ ref: '97.1' })]), { errors: [] });
  });

  test('a valid optional figure field is accepted', () => {
    assert.deepEqual(qb.validateQuestionBank([makeQuestion({ figure: 'T-1' })]), { errors: [] });
  });

  test('validation does not mutate its input, including a deeply frozen bank', () => {
    const bank = deepFreeze([makeQuestion(), makeQuestion({ id: 'T1A02' })]);
    assert.deepEqual(qb.validateQuestionBank(bank), { errors: [] });
    // deepFreeze already guarantees no mutation occurred (a mutation attempt
    // would throw in strict mode); re-assert shape for clarity.
    assert.equal(bank.length, 2);
  });

  test('validation is deterministic across repeated calls', () => {
    const bank = [makeQuestion({ id: 'bad', q: 123 }), makeQuestion({ id: 'bad' })];
    const first = qb.validateQuestionBank(bank);
    const second = qb.validateQuestionBank(bank);
    assert.deepEqual(first, second);
  });
});

// --------------------------------------------------------------------------
// bank-level negative cases
// --------------------------------------------------------------------------

describe('bank-level shape', () => {
  test('rejects a null bank', () => {
    expectErrors(null, /question bank must be an array/);
  });
  test('rejects an object bank', () => {
    expectErrors({}, /question bank must be an array/);
  });
  test('rejects a string bank', () => {
    expectErrors('not-a-bank', /question bank must be an array/);
  });
  test('rejects an empty array bank', () => {
    expectErrors([], /question bank must be a non-empty array/);
  });
});

// --------------------------------------------------------------------------
// question-entry shape
// --------------------------------------------------------------------------

describe('question-entry shape', () => {
  test('rejects a null question', () => {
    expectErrors([null], /question at index 0: must be a plain object/);
  });
  test('rejects an array question', () => {
    expectErrors([['A', 'B']], /question at index 0: must be a plain object/);
  });
  test('rejects a primitive (string) question', () => {
    expectErrors(['nope'], /question at index 0: must be a plain object/);
  });
  test('rejects a primitive (number) question', () => {
    expectErrors([42], /question at index 0: must be a plain object/);
  });
  test('accepts a null-prototype question object (chosen plain-object policy)', () => {
    const q = Object.assign(Object.create(null), makeQuestion());
    assert.deepEqual(qb.validateQuestionBank([q]), { errors: [] });
  });
  test('rejects an object with a custom (non-Object.prototype, non-null) prototype', () => {
    // Chosen policy: "plain" means Object.prototype or null only -- an
    // object one step further up a custom prototype chain (e.g. a class
    // instance) is not treated as plain, even though `typeof` is "object".
    const q = Object.create(makeQuestion());
    assert.equal(qb.isPlainObject(q), false);
    expectErrors([q], /question at index 0: must be a plain object/);
  });
  test('inherited properties do not satisfy required question fields', () => {
    // Object.create(customProto) already fails isPlainObject outright (its
    // own prototype policy test above), so it can't exercise "inherited
    // property ignored on an otherwise-plain object". The only way to build
    // a genuinely plain object (prototype === Object.prototype) that still
    // has properties reachable via `.foo` but NOT own is to put them ON
    // Object.prototype itself -- a real, if unusual, way an "inherited but
    // not own" property can exist. Cleaned up in `finally` so no pollution
    // leaks to any other test.
    const pollutedKeys = ['id', 'sub', 'q', 'correct', 'correctText', 'ref'];
    try {
      pollutedKeys.forEach((k) => { Object.prototype[k] = 'inherited-not-own'; });
      const q = { choices: { A: 'Choice A', B: 'b', C: 'c', D: 'd' } }; // only `choices` is own
      assert.ok(qb.isPlainObject(q), 'a plain {} literal must still pass isPlainObject');
      assert.equal(q.id, 'inherited-not-own', 'sanity check: the property really is reachable, just not own');
      const { errors } = qb.validateQuestionBank([q]);
      assert.match(errors.join('\n'), /missing required field\(s\): id, sub, q, correct, correctText, ref/);
    } finally {
      pollutedKeys.forEach((k) => { delete Object.prototype[k]; });
    }
  });
});

// --------------------------------------------------------------------------
// required/unknown top-level fields
// --------------------------------------------------------------------------

describe('top-level field policy', () => {
  for (const field of qb.REQUIRED_FIELDS) {
    test(`reports a missing required field: ${field}`, () => {
      const q = makeQuestion();
      delete q[field];
      expectErrors([q], new RegExp(`missing required field\\(s\\): ${field}`));
    });
  }

  test('reports all missing required fields in one message, deterministically', () => {
    const q = makeQuestion();
    delete q.q;
    delete q.ref;
    delete q.choices;
    const { errors } = qb.validateQuestionBank([q]);
    assert.match(errors.join('\n'), /missing required field\(s\): q, choices, ref/);
  });

  test('rejects an unknown top-level field', () => {
    const q = makeQuestion({ extra: 'nope' });
    expectErrors([q], /unknown field\(s\): extra/);
  });

  test('reports multiple unknown fields sorted alphabetically', () => {
    const q = makeQuestion({ zeta: 1, alpha: 2 });
    expectErrors([q], /unknown field\(s\): alpha, zeta/);
  });

  test('accepts the optional figure field without flagging it unknown', () => {
    assert.deepEqual(qb.validateQuestionBank([makeQuestion({ figure: 'T-1' })]), { errors: [] });
  });
});

// --------------------------------------------------------------------------
// scalar field types
// --------------------------------------------------------------------------

describe('scalar field types', () => {
  test('rejects a non-string id', () => {
    expectErrors([makeQuestion({ id: 123 })], /`id` must be a non-empty string/);
  });
  test('rejects a blank id', () => {
    expectErrors([makeQuestion({ id: '' })], /`id` must be a non-empty string/);
  });
  test('rejects a whitespace-only id', () => {
    expectErrors([makeQuestion({ id: '   ' })], /`id` must be a non-empty string/);
  });
  test('rejects a non-string sub', () => {
    expectErrors([makeQuestion({ sub: null })], /`sub` must be a non-empty string/);
  });
  test('rejects a blank sub', () => {
    expectErrors([makeQuestion({ sub: '' })], /`sub` must be a non-empty string/);
  });
  test('rejects a non-string q', () => {
    expectErrors([makeQuestion({ q: 42 })], /`q` must be a non-empty string/);
  });
  test('rejects a blank q', () => {
    expectErrors([makeQuestion({ q: '  ' })], /`q` must be a non-empty string/);
  });
  test('rejects a non-string ref', () => {
    expectErrors([makeQuestion({ ref: 42 })], /`ref` must be a string/);
  });
  test('rejects a null ref', () => {
    expectErrors([makeQuestion({ ref: null })], /`ref` must be a string/);
  });
  test('rejects a non-string figure', () => {
    expectErrors([makeQuestion({ figure: 42 })], /`figure` must be a non-empty string/);
  });
  test('rejects a blank figure', () => {
    expectErrors([makeQuestion({ figure: '' })], /`figure` must be a non-empty string/);
  });

  test('rejects a duplicate question id', () => {
    const bank = [makeQuestion({ id: 'T1A01' }), makeQuestion({ id: 'T1A01' })];
    expectErrors(bank, /duplicate question id "T1A01"/);
  });
});

// --------------------------------------------------------------------------
// choices
// --------------------------------------------------------------------------

describe('choices', () => {
  test('rejects a null choices', () => {
    expectErrors([makeQuestion({ choices: null })], /`choices` must be a plain object/);
  });
  test('rejects an array choices', () => {
    expectErrors([makeQuestion({ choices: ['a', 'b', 'c', 'd'] })], /`choices` must be a plain object/);
  });
  test('rejects a primitive choices', () => {
    expectErrors([makeQuestion({ choices: 'ABCD' })], /`choices` must be a plain object/);
  });

  for (const letter of qb.CHOICE_LETTERS) {
    test(`reports a missing choice key: ${letter}`, () => {
      const q = makeQuestion();
      delete q.choices[letter];
      expectErrors([q], new RegExp(`\`choices\` is missing key\\(s\\): ${letter}`));
    });
  }

  test('rejects an unexpected choice key', () => {
    const q = makeQuestion({ choices: { A: 'a', B: 'b', C: 'c', D: 'd', E: 'e' } });
    expectErrors([q], /`choices` has unexpected key\(s\): E/);
  });

  test('rejects a non-string A-D value', () => {
    const q = makeQuestion({ choices: { A: 1, B: 'b', C: 'c', D: 'd' } });
    expectErrors([q], /`choices\.A` must be a non-empty string/);
  });

  test('rejects a blank A-D value', () => {
    const q = makeQuestion({ choices: { A: '', B: 'b', C: 'c', D: 'd' } });
    expectErrors([q], /`choices\.A` must be a non-empty string/);
  });

  test('rejects a whitespace-only A-D value (real-data-verified policy: no real bank has one)', () => {
    const q = makeQuestion({ choices: { A: '   ', B: 'b', C: 'c', D: 'd' } });
    expectErrors([q], /`choices\.A` must be a non-empty string/);
  });

  test('inherited properties do not satisfy A-D choice keys', () => {
    // Same reasoning as the question-level inherited-property test above:
    // Object.create(customProto) already fails isPlainObject on its own, so
    // exercising "inherited doesn't count" on an otherwise-plain `choices`
    // object requires polluting Object.prototype itself. Cleaned up in
    // `finally`.
    try {
      ['A', 'B', 'C', 'D'].forEach((k) => { Object.prototype[k] = 'inherited-not-own'; });
      const choices = {}; // no own A-D keys at all
      assert.ok(qb.isPlainObject(choices), 'a plain {} literal must still pass isPlainObject');
      const q = makeQuestion({ choices });
      const { errors } = qb.validateQuestionBank([q]);
      assert.match(errors.join('\n'), /`choices` is missing key\(s\): A, B, C, D/);
    } finally {
      ['A', 'B', 'C', 'D'].forEach((k) => { delete Object.prototype[k]; });
    }
  });

  test('accepts a null-prototype choices object (chosen plain-object policy)', () => {
    const choices = Object.assign(Object.create(null), { A: 'a', B: 'b', C: 'c', D: 'd' });
    assert.deepEqual(
      qb.validateQuestionBank([makeQuestion({ choices, correct: 'A', correctText: 'a' })]),
      { errors: [] }
    );
  });
});

// --------------------------------------------------------------------------
// correct / correctText
// --------------------------------------------------------------------------

describe('correct and correctText', () => {
  test('rejects an invalid correct letter', () => {
    expectErrors([makeQuestion({ correct: 'E' })], /`correct` must be exactly one of "A", "B", "C", or "D"/);
  });
  test('rejects a lowercase correct letter', () => {
    expectErrors([makeQuestion({ correct: 'a' })], /`correct` must be exactly one of/);
  });
  test('rejects a blank correct', () => {
    expectErrors([makeQuestion({ correct: '' })], /`correct` must be exactly one of/);
  });
  test('rejects a non-string correct', () => {
    expectErrors([makeQuestion({ correct: 1 })], /`correct` must be exactly one of/);
  });

  test('rejects a blank correctText', () => {
    expectErrors([makeQuestion({ correctText: '' })], /`correctText` must be a non-empty string/);
  });
  test('rejects a non-string correctText', () => {
    expectErrors([makeQuestion({ correctText: 42 })], /`correctText` must be a non-empty string/);
  });
  test('rejects correctText that does not byte-for-byte match choices[correct]', () => {
    const q = makeQuestion({ correct: 'B', correctText: 'Choice A' });
    expectErrors([q], /`correctText` \("Choice A"\) does not match `choices\.B` \("Choice B"\)/);
  });
  test('does not double-report a correctText mismatch when correct itself is invalid', () => {
    const q = makeQuestion({ correct: 'Z', correctText: 'anything' });
    const { errors } = qb.validateQuestionBank([q]);
    assert.ok(!errors.some((e) => /does not match/.test(e)),
      'no "does not match" message should fire when `correct` cannot be resolved to a real choice');
  });
});

// --------------------------------------------------------------------------
// validateQuestionBank vs. assertQuestionBank
// --------------------------------------------------------------------------

describe('validateQuestionBank vs. assertQuestionBank', () => {
  test('validateQuestionBank returns structured errors and never throws', () => {
    assert.doesNotThrow(() => {
      const { errors } = qb.validateQuestionBank([{ }]);
      assert.ok(errors.length > 0);
    });
  });

  test('assertQuestionBank throws one Error listing every error', () => {
    const q = makeQuestion({ correct: 'Z' });
    delete q.ref;
    assert.throws(
      () => qb.assertQuestionBank([q]),
      (err) => {
        assert.match(err.message, /Question bank validation failed \(2 errors\):/);
        assert.ok(err.message.includes('missing required field(s): ref'));
        assert.ok(err.message.includes('`correct` must be exactly one of'));
        return true;
      }
    );
  });

  test('assertQuestionBank does not throw for a valid bank', () => {
    assert.doesNotThrow(() => qb.assertQuestionBank([makeQuestion()]));
  });

  test('poolKey option prefixes every diagnostic', () => {
    const { errors } = qb.validateQuestionBank([{}], { poolKey: 'technician' });
    assert.ok(errors.every((e) => e.startsWith('technician: ')));
  });
});
