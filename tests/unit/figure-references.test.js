'use strict';

// Unit tests for scripts/figure-references.js (Stage 2A).
// Covers textual detection, normalization, the optional `figure` field rules,
// no-mutation guarantees, and a regression lock on the current-data inventory.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const fr = require('../../scripts/figure-references.js');

const DATA_DIR = path.join(__dirname, '../../data');
function loadPool(file) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
}

// A minimal well-formed question with controllable text and optional figure.
function makeQuestion(overrides) {
  return Object.assign(
    {
      id: 'Q1',
      sub: 'X1',
      q: 'Placeholder prompt with no diagram reference.',
      choices: { A: 'a', B: 'b', C: 'c', D: 'd' },
      correct: 'A',
      correctText: 'a',
      ref: ''
    },
    overrides || {}
  );
}

describe('extractFigureIds — textual detection', () => {
  test('detects a lowercase "figure T-1" reference', () => {
    assert.deepEqual(
      fr.extractFigureIds('What is component 1 in figure T-1?'),
      ['T-1']
    );
  });

  test('detects a capitalized "Figure E9-3" reference', () => {
    assert.deepEqual(
      fr.extractFigureIds('On the Smith chart shown in Figure E9-3, what is the outer circle?'),
      ['E9-3']
    );
  });

  test('detects a "figure G7-1" reference with a group digit', () => {
    assert.deepEqual(
      fr.extractFigureIds('Which symbol in figure G7-1 represents a Zener diode?'),
      ['G7-1']
    );
  });

  test('detection is case-insensitive on the word and normalizes the ID', () => {
    assert.deepEqual(fr.extractFigureIds('see FIGURE t-2 here'), ['T-2']);
    assert.deepEqual(fr.extractFigureIds('see fIgUrE e6-1 here'), ['E6-1']);
  });

  test('duplicate and differently-cased mentions collapse to one unique ID', () => {
    const text = 'figure T-2 ... later Figure T-2 ... and again figure t-2';
    assert.deepEqual(fr.extractFigureIds(text), ['T-2']);
  });

  test('multiple distinct references are returned in first-seen order', () => {
    assert.deepEqual(
      fr.extractFigureIds('compare figure E7-1 with Figure E6-3'),
      ['E7-1', 'E6-3']
    );
  });

  test('does not match incidental uses of the word "figure"', () => {
    assert.deepEqual(fr.extractFigureIds('What is the noise figure of a receiver?'), []);
    assert.deepEqual(fr.extractFigureIds('It is a figure-eight at right angles to the antenna'), []);
    assert.deepEqual(
      fr.extractFigureIds('Baudot uses 2 characters as letters/figures shift codes'),
      []
    );
    assert.deepEqual(fr.extractFigureIds('See figure 8 on the next page'), []);
  });
});

describe('extractFigureIds — token boundary (no partial-prefix matches)', () => {
  // A letter, digit, underscore, or hyphen immediately after the ID digits is a
  // continuation of the token: the whole reference is malformed and yields
  // nothing, never a shorter valid ID.
  test('a trailing letter suffix ("figure T-1a") matches nothing', () => {
    assert.deepEqual(fr.extractFigureIds('See figure T-1a'), []);
  });

  test('a trailing "-<digits>" suffix ("figure T-1-2") matches nothing', () => {
    assert.deepEqual(fr.extractFigureIds('See figure T-1-2'), []);
  });

  test('a trailing underscore suffix ("figure T-1_extra") matches nothing', () => {
    assert.deepEqual(fr.extractFigureIds('See figure T-1_extra'), []);
  });

  test('a multi-digit malformed token ("figure E9-12a") matches nothing', () => {
    // Backtracking must not fall back to a shorter numeric prefix (E9-1 / E9-12).
    assert.deepEqual(fr.extractFigureIds('See figure E9-12a'), []);
  });

  test('valid IDs followed by ordinary punctuation are still detected', () => {
    assert.deepEqual(fr.extractFigureIds('as shown in figure T-1.'), ['T-1']);
    assert.deepEqual(fr.extractFigureIds('as shown in figure T-1,'), ['T-1']);
    assert.deepEqual(fr.extractFigureIds('(Figure E9-3)'), ['E9-3']);
    assert.deepEqual(fr.extractFigureIds('Which symbol in figure G7-1?'), ['G7-1']);
    assert.deepEqual(fr.extractFigureIds('trailing figure E6-2'), ['E6-2']);
    assert.deepEqual(fr.extractFigureIds('figure E7-3; then figure E7-1'), ['E7-3', 'E7-1']);
  });

  test('a malformed reference does not suppress a separate valid one', () => {
    assert.deepEqual(
      fr.extractFigureIds('ignore figure E9-3-alt but keep figure E9-3'),
      ['E9-3']
    );
  });

  test('a malformed reference inside an answer choice is not counted', () => {
    const q = makeQuestion({
      id: 'T6C02',
      q: 'What is component 1 in figure T-1?',
      choices: { A: 'see figure T-1a', B: 'b', C: 'c', D: 'd' }
    });
    // Only the prompt's complete "figure T-1" is a real reference.
    assert.deepEqual(fr.extractQuestionFigureIds(q), ['T-1']);

    const onlyMalformed = makeQuestion({
      id: 'T6C02',
      q: 'Which component is shown?',
      choices: { A: 'refer to figure T-1-2', B: 'b', C: 'c', D: 'd' }
    });
    assert.deepEqual(fr.extractQuestionFigureIds(onlyMalformed), []);
  });
});

describe('normalizeFigureId / isValidFigureId', () => {
  test('normalizeFigureId trims and uppercases', () => {
    assert.equal(fr.normalizeFigureId('  t-1 '), 'T-1');
    assert.equal(fr.normalizeFigureId('g7-1'), 'G7-1');
    assert.equal(fr.normalizeFigureId('E9-3'), 'E9-3');
  });

  test('isValidFigureId accepts the supported forms only', () => {
    for (const ok of ['T-1', 'G7-1', 'E9-3', 'E10-2']) {
      assert.equal(fr.isValidFigureId(ok), true, ok);
    }
    for (const bad of ['t-1', 'T1', 'T-', '-1', 'TG-1', '1-1', 'T_1', 'T-1a', 'T-1-2', '']) {
      assert.equal(fr.isValidFigureId(bad), false, bad);
    }
    assert.equal(fr.isValidFigureId(null), false);
    assert.equal(fr.isValidFigureId(7), false);
  });
});

describe('validateQuestionFigure — mapping rules', () => {
  test('accepts a correct mapping with exactly one matching reference', () => {
    const q = makeQuestion({ id: 'T6C02', q: 'What is component 1 in figure T-1?', figure: 'T-1' });
    assert.deepEqual(fr.validateQuestionFigure(q, 'technician'), []);
  });

  test('accepts a question with no reference and no figure field', () => {
    const q = makeQuestion({ id: 'T1A01' });
    assert.deepEqual(fr.validateQuestionFigure(q, 'technician'), []);
  });

  test('flags a textual reference with no explicit figure field', () => {
    const q = makeQuestion({ id: 'T6C02', q: 'What is component 1 in figure T-1?' });
    const errs = fr.validateQuestionFigure(q, 'technician');
    assert.equal(errs.length, 1);
    assert.match(errs[0], /\[technician\] T6C02/);
    assert.match(errs[0], /no "figure" field/);
  });

  test('flags an explicit field that does not match the textual reference', () => {
    const q = makeQuestion({ id: 'T6C02', q: 'What is component 1 in figure T-1?', figure: 'T-2' });
    const errs = fr.validateQuestionFigure(q, 'technician');
    assert.match(errs.join('\n'), /does not match the textual reference T-1/);
  });

  test('flags an invalid figure ID format', () => {
    const q = makeQuestion({ id: 'T6C02', q: 'What is component 1 in figure T-1?', figure: 'T1' });
    const errs = fr.validateQuestionFigure(q, 'technician');
    assert.match(errs.join('\n'), /not a supported figure ID/);
  });

  test('flags a non-normalized (lowercase) figure field', () => {
    const q = makeQuestion({ id: 'T6C02', q: 'What is component 1 in figure T-1?', figure: 't-1' });
    const errs = fr.validateQuestionFigure(q, 'technician');
    assert.match(errs.join('\n'), /must be stored normalized as "T-1"/);
  });

  test('flags a cross-pool mapping (Extra figure on a Technician question)', () => {
    const q = makeQuestion({ id: 'T6C02', q: 'see figure E5-1', figure: 'E5-1' });
    const errs = fr.validateQuestionFigure(q, 'technician');
    assert.match(errs.join('\n'), /technician questions must map to T-\* figures/);
  });

  test('a matching-prefix mapping does not rescue a malformed reference', () => {
    // "figure T-1a" must not be read as "figure T-1"; the record then has a
    // figure field but no genuine textual reference.
    for (const prompt of [
      'What is component 1 in figure T-1a?',
      'What is component 1 in figure T-1-2?',
      'What is component 1 in figure T-1_extra?'
    ]) {
      const q = makeQuestion({ id: 'T6C02', q: prompt, figure: 'T-1' });
      const errs = fr.validateQuestionFigure(q, 'technician');
      assert.match(errs.join('\n'), /no textual figure reference/, prompt);
    }
  });

  test('a multi-digit malformed reference is not accepted as a shorter ID', () => {
    const q = makeQuestion({ id: 'E9B01', q: 'pattern shown in Figure E9-12a', figure: 'E9-1' });
    const errs = fr.validateQuestionFigure(q, 'extra');
    assert.match(errs.join('\n'), /no textual figure reference/);
  });

  test('a malformed reference in a choice with a matching-prefix field fails', () => {
    const q = makeQuestion({
      id: 'E7G07',
      q: 'What voltage gain can be expected from the circuit?',
      choices: { A: 'as drawn in figure E7-3x', B: 'b', C: 'c', D: 'd' },
      figure: 'E7-3'
    });
    const errs = fr.validateQuestionFigure(q, 'extra');
    assert.match(errs.join('\n'), /\[extra\] E7G07: /);
    assert.match(errs.join('\n'), /no textual figure reference/);
  });

  test('flags a figure field on a question with no textual reference', () => {
    const q = makeQuestion({ id: 'T1A01', q: 'What is Ohm’s law?', figure: 'T-1' });
    const errs = fr.validateQuestionFigure(q, 'technician');
    assert.match(errs.join('\n'), /no textual figure reference/);
  });

  test('flags a mapped question that references more than one distinct figure', () => {
    const q = makeQuestion({
      id: 'E7X99',
      q: 'compare figure E7-1 with figure E7-2',
      figure: 'E7-1'
    });
    const errs = fr.validateQuestionFigure(q, 'extra');
    assert.match(errs.join('\n'), /references multiple figures \(E7-1, E7-2\)/);
  });

  test('every error names the pool and question id', () => {
    const q = makeQuestion({ id: 'G7A09', q: 'figure G7-1', figure: 'G9-9' });
    for (const err of fr.validateQuestionFigure(q, 'general')) {
      assert.match(err, /^\[general\] G7A09: /);
    }
  });
});

describe('no mutation of inputs', () => {
  test('validateQuestionFigure does not add or change fields', () => {
    const withRef = makeQuestion({ id: 'T6C02', q: 'component 1 in figure T-1?' });
    const snapshot = JSON.parse(JSON.stringify(withRef));
    fr.validateQuestionFigure(withRef, 'technician');
    assert.deepEqual(withRef, snapshot);
    assert.equal(Object.prototype.hasOwnProperty.call(withRef, 'figure'), false);

    const mapped = makeQuestion({ id: 'T6C02', q: 'component 1 in figure T-1?', figure: 'T-1' });
    const mappedSnapshot = JSON.parse(JSON.stringify(mapped));
    fr.validateQuestionFigure(mapped, 'technician');
    assert.deepEqual(mapped, mappedSnapshot);
  });

  test('validatePoolFigures does not mutate the array or its questions', () => {
    const pool = [
      makeQuestion({ id: 'T6C02', q: 'component 1 in figure T-1?', figure: 'T-1' }),
      makeQuestion({ id: 'T1A01' })
    ];
    const snapshot = JSON.parse(JSON.stringify(pool));
    fr.validatePoolFigures(pool, 'technician');
    assert.deepEqual(pool, snapshot);
  });
});

describe('current-data inventory (regression lock)', () => {
  const pools = {
    technician: loadPool('technician.json'),
    general: loadPool('general.json'),
    extra: loadPool('extra.json')
  };

  test('every pool validates with zero figure-reference errors', () => {
    for (const [key, questions] of Object.entries(pools)) {
      const { errors } = fr.validatePoolFigures(questions, key);
      assert.deepEqual(errors, [], `${key}: ${errors.join(' | ')}`);
    }
  });

  test('affected-question counts are 12 / 5 / 27 and 44 total', () => {
    const tech = fr.validatePoolFigures(pools.technician, 'technician').mapped;
    const gen = fr.validatePoolFigures(pools.general, 'general').mapped;
    const ext = fr.validatePoolFigures(pools.extra, 'extra').mapped;
    assert.equal(tech.length, 12);
    assert.equal(gen.length, 5);
    assert.equal(ext.length, 27);
    assert.equal(tech.length + gen.length + ext.length, 44);
  });

  test('exactly the 14 expected unique figure IDs are mapped', () => {
    const all = new Set();
    for (const [key, questions] of Object.entries(pools)) {
      for (const id of fr.validatePoolFigures(questions, key).figureIds) all.add(id);
    }
    assert.deepEqual(
      [...all].sort(),
      [
        'E5-1', 'E6-1', 'E6-2', 'E6-3', 'E7-1', 'E7-2', 'E7-3',
        'E9-1', 'E9-2', 'E9-3', 'G7-1', 'T-1', 'T-2', 'T-3'
      ]
    );
  });

  test('per-pool figure sets match the expected inventory', () => {
    const set = key =>
      [...fr.validatePoolFigures(pools[key], key).figureIds].sort();
    assert.deepEqual(set('technician'), ['T-1', 'T-2', 'T-3']);
    assert.deepEqual(set('general'), ['G7-1']);
    assert.deepEqual(set('extra'), [
      'E5-1', 'E6-1', 'E6-2', 'E6-3', 'E7-1', 'E7-2', 'E7-3', 'E9-1', 'E9-2', 'E9-3'
    ]);
  });

  test('every mapped record still carries all required question fields', () => {
    const required = ['id', 'sub', 'q', 'choices', 'correct', 'correctText', 'ref'];
    for (const [key, questions] of Object.entries(pools)) {
      for (const q of questions) {
        if (!Object.prototype.hasOwnProperty.call(q, 'figure')) continue;
        for (const field of required) {
          assert.ok(
            Object.prototype.hasOwnProperty.call(q, field),
            `${key} ${q.id} missing ${field}`
          );
        }
        assert.equal(q.figure, fr.normalizeFigureId(q.figure), `${key} ${q.id} figure not normalized`);
      }
    }
  });

  test('no unmapped question contains a textual figure reference', () => {
    for (const [key, questions] of Object.entries(pools)) {
      for (const q of questions) {
        if (Object.prototype.hasOwnProperty.call(q, 'figure')) continue;
        assert.deepEqual(
          fr.extractQuestionFigureIds(q),
          [],
          `${key} ${q.id} has an unmapped textual figure reference`
        );
      }
    }
  });
});
