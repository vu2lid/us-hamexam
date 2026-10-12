'use strict';

// Stage 8D3A: unit tests for scripts/question-provenance.js -- the
// dependency-free, build-time provenance-sidecar validator
// (docs/INDIA_CONTENT_CONTRACT.md §2, §6). Pure in-memory fixtures only;
// the real editions/india/ files are covered by build-gate integration
// tests (tests/unit/build-gate.test.js), which drive the real --edition CLI.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const qp = require('../../scripts/question-provenance.js');

function makeBank() {
  return [
    { id: 'R1A01', sub: 'R1', q: 'Q1?', choices: { A: 'a', B: 'b', C: 'c', D: 'd' }, correct: 'A', correctText: 'a', ref: 'x' },
    { id: 'R1A02', sub: 'R1', q: 'Q2?', choices: { A: 'a', B: 'b', C: 'c', D: 'd' }, correct: 'B', correctText: 'b', ref: 'x' }
  ];
}

function makeEntry(overrides) {
  return Object.assign({
    syllabusCode: 'ASOC-R-SecA-ACTheory',
    syllabusTopic: 'Section A: AC theory',
    provenanceClass: 'india-original',
    sourceCitation: 'docs/INDIA_ASOC_REQUIREMENTS.md §3',
    author: 'Test Author',
    reviewer: 'Test Reviewer',
    reviewStatus: 'approved',
    rightsStatus: 'cleared',
    rationale: 'Tests a basic fact.',
    figureStatus: 'none'
  }, overrides || {});
}

function makeSidecar(overrides) {
  return Object.assign({
    R1A01: makeEntry(),
    R1A02: makeEntry()
  }, overrides || {});
}

describe('validateProvenanceSidecar: shape and build-readiness (Stage 8D3A)', () => {
  test('a fully valid, build-ready sidecar validates clean', () => {
    assert.deepEqual(qp.validateProvenanceSidecar(makeSidecar(), makeBank()), { errors: [] });
  });

  test('root/bank type checks', () => {
    assert.deepEqual(qp.validateProvenanceSidecar('not an object', makeBank()).errors,
      ['provenance sidecar: root must be a JSON object keyed by question id']);
    assert.deepEqual(qp.validateProvenanceSidecar(makeSidecar(), 'not an array').errors,
      ['provenance sidecar: bank must be an array of questions']);
  });

  test('missing IDs: a bank question with no sidecar entry is rejected', () => {
    const sidecar = makeSidecar();
    delete sidecar.R1A02;
    const { errors } = qp.validateProvenanceSidecar(sidecar, makeBank());
    assert.ok(errors.some((e) => /missing entry for bank question id "R1A02"/.test(e)));
  });

  test('sidecar/bank ID mismatches: an orphan sidecar entry naming no real bank question is rejected', () => {
    const sidecar = makeSidecar({ R9Z99: makeEntry() });
    const { errors } = qp.validateProvenanceSidecar(sidecar, makeBank());
    assert.ok(errors.some((e) => /provenance sidecar\["R9Z99"\]: does not correspond to any bank question id/.test(e)));
  });

  // A literal duplicate key cannot survive JSON-object parsing (same
  // reasoning scripts/pool-registry.js relies on elsewhere); this proves
  // the END-TO-END duplicate-id case the task names is still caught --
  // here via the two real question objects sharing one id, which collapses
  // to a single bank entry this module must still handle without crashing,
  // and which scripts/question-bank.js's own duplicate-id gate (not this
  // module) is responsible for rejecting in the real build pipeline.
  test('a bank with a duplicate question id does not crash this module (question-bank.js owns rejecting it)', () => {
    const bank = [
      { id: 'R1A01', sub: 'R1', q: 'Q1?', choices: { A: 'a', B: 'b', C: 'c', D: 'd' }, correct: 'A', correctText: 'a', ref: 'x' },
      { id: 'R1A01', sub: 'R1', q: 'Q1 again?', choices: { A: 'a', B: 'b', C: 'c', D: 'd' }, correct: 'A', correctText: 'a', ref: 'x' }
    ];
    const { errors } = qp.validateProvenanceSidecar(makeSidecar(), bank);
    // Only R1A02 (never seen in this 2-question, 1-unique-id bank) is now
    // an orphan; R1A01 itself validates fine against the one (collapsed)
    // bank entry it corresponds to.
    assert.deepEqual(errors, ['provenance sidecar["R1A02"]: does not correspond to any bank question id']);
  });

  test('missing syllabus mappings', () => {
    for (const field of ['syllabusCode', 'syllabusTopic']) {
      const sidecar = makeSidecar({ R1A01: makeEntry({ [field]: '' }) });
      const { errors } = qp.validateProvenanceSidecar(sidecar, makeBank());
      assert.ok(errors.some((e) => new RegExp(`${field} must be a non-blank string \\(missing syllabus mapping\\)`).test(e)),
        `expected a missing-syllabus-mapping error for ${field}, got:\n${errors.join('\n')}`);
    }
  });

  test('unsupported provenance classes', () => {
    for (const bad of ['fcc-pool', 'ai-generated', '', undefined]) {
      const sidecar = makeSidecar({ R1A01: makeEntry({ provenanceClass: bad }) });
      const { errors } = qp.validateProvenanceSidecar(sidecar, makeBank());
      assert.ok(errors.some((e) => /provenanceClass must be one of/.test(e)),
        `expected an unsupported-provenance-class error for ${JSON.stringify(bad)}, got:\n${errors.join('\n')}`);
    }
  });

  test('all four contract provenance classes are individually accepted', () => {
    for (const cls of qp.PROVENANCE_CLASSES) {
      const sidecar = makeSidecar({ R1A01: makeEntry({ provenanceClass: cls }) });
      const { errors } = qp.validateProvenanceSidecar(sidecar, makeBank());
      assert.deepEqual(errors, [], `expected ${cls} to validate clean, got:\n${errors.join('\n')}`);
    }
    assert.deepEqual([...qp.PROVENANCE_CLASSES].sort(),
      ['india-original', 'ncvec-adapted', 'reference-informed', 'rule-derived']);
  });

  test('missing citations', () => {
    const sidecar = makeSidecar({ R1A01: makeEntry({ sourceCitation: '   ' }) });
    const { errors } = qp.validateProvenanceSidecar(sidecar, makeBank());
    assert.ok(errors.some((e) => /sourceCitation must be a non-blank string \(missing citation\)/.test(e)));
  });

  test('missing author/reviewer/rationale', () => {
    for (const field of ['author', 'reviewer', 'rationale']) {
      const sidecar = makeSidecar({ R1A01: makeEntry({ [field]: '' }) });
      const { errors } = qp.validateProvenanceSidecar(sidecar, makeBank());
      assert.ok(errors.some((e) => new RegExp(`${field} must be a non-blank string`).test(e)));
    }
  });

  test('incomplete review status: a recognized but non-approved status fails the build-ready check by default', () => {
    for (const status of ['draft', 'syllabus-mapped', 'technical-review', 'rights-review', 'fact-review']) {
      const sidecar = makeSidecar({ R1A01: makeEntry({ reviewStatus: status }) });
      const { errors } = qp.validateProvenanceSidecar(sidecar, makeBank());
      assert.ok(errors.some((e) => /review status incomplete, this item cannot build yet/.test(e)),
        `expected reviewStatus ${JSON.stringify(status)} to be reported incomplete, got:\n${errors.join('\n')}`);
    }
  });

  test('an unrecognized review status string gets its own diagnostic, distinct from "incomplete"', () => {
    const sidecar = makeSidecar({ R1A01: makeEntry({ reviewStatus: 'rubber-stamped' }) });
    const { errors } = qp.validateProvenanceSidecar(sidecar, makeBank());
    assert.ok(errors.some((e) => /reviewStatus must be one of:.*got "rubber-stamped"/.test(e)));
    assert.ok(!errors.some((e) => /review status incomplete/.test(e)),
      'an unrecognized value should not ALSO be reported as "incomplete" -- that phrasing is reserved for a recognized, non-approved status');
  });

  test('unresolved rights status', () => {
    for (const status of ['unresolved', 'pending-rights-review', 'blocked']) {
      const sidecar = makeSidecar({ R1A01: makeEntry({ rightsStatus: status }) });
      const { errors } = qp.validateProvenanceSidecar(sidecar, makeBank());
      assert.ok(errors.some((e) => /unresolved rights status, this item cannot build yet/.test(e)),
        `expected rightsStatus ${JSON.stringify(status)} to fail the build-ready check, got:\n${errors.join('\n')}`);
    }
    const badEnum = makeSidecar({ R1A01: makeEntry({ rightsStatus: 'not-a-real-status' }) });
    const { errors } = qp.validateProvenanceSidecar(badEnum, makeBank());
    assert.ok(errors.some((e) => /rightsStatus must be one of/.test(e)));
  });

  test('figureStatus other than "none" fails this figureless slice', () => {
    const sidecar = makeSidecar({ R1A01: makeEntry({ figureStatus: 'pending-review' }) });
    const { errors } = qp.validateProvenanceSidecar(sidecar, makeBank());
    assert.ok(errors.some((e) => /this slice is figureless/.test(e)));
  });

  test('unknown sidecar entry keys are rejected', () => {
    const sidecar = makeSidecar({ R1A01: makeEntry({ unexpectedField: 'x' }) });
    const { errors } = qp.validateProvenanceSidecar(sidecar, makeBank());
    assert.ok(errors.some((e) => /unknown key\(s\): unexpectedField/.test(e)));
  });

  test('requireBuildReady: false tolerates a legitimate work-in-progress review/rights state but still enforces shape', () => {
    const sidecar = makeSidecar({
      R1A01: makeEntry({ reviewStatus: 'syllabus-mapped', rightsStatus: 'pending-rights-review' })
    });
    assert.deepEqual(
      qp.validateProvenanceSidecar(sidecar, makeBank(), { requireBuildReady: false }),
      { errors: [] }
    );
    // Shape is still enforced even with requireBuildReady: false.
    const badShape = makeSidecar({ R1A01: makeEntry({ reviewStatus: 'not-a-real-status' }) });
    const { errors } = qp.validateProvenanceSidecar(badShape, makeBank(), { requireBuildReady: false });
    assert.ok(errors.some((e) => /reviewStatus must be one of/.test(e)));
  });

  test('assertProvenanceSidecar throws one Error listing every finding', () => {
    const sidecar = makeSidecar({ R1A01: makeEntry({ sourceCitation: '', author: '' }) });
    assert.throws(() => qp.assertProvenanceSidecar(sidecar, makeBank()), (err) => {
      assert.match(err.message, /Provenance sidecar validation failed \(2 errors\)/);
      assert.match(err.message, /sourceCitation must be a non-blank string/);
      assert.match(err.message, /author must be a non-blank string/);
      return true;
    });
  });
});
