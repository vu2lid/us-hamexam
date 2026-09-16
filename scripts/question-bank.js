"use strict";

// Stage 5B4: dependency-free, build-time question-bank schema validator.
//
// This module owns ONLY the base per-question shape: which top-level fields
// exist, their scalar types/non-emptiness, the `choices` object's exact
// A-D key set, and the `correct`/`correctText` relationship. It deliberately
// does NOT own (see scripts/pool-registry.js and scripts/figure-references.js
// / scripts/figure-manifest.js for those):
//   - question-ID syntax or pool-letter prefix;
//   - `sub === id.slice(0, 2)` consistency;
//   - figure-ID normalization, pool compatibility, textual figure
//     references, figure-manifest membership, or asset validation;
//   - expected per-pool bank counts or mock-exam blueprint coverage.
//
// Pure library code: requiring this module runs no CLI, touches no files,
// and never mutates its inputs -- callers may pass frozen fixtures.

const REQUIRED_FIELDS = Object.freeze(["id", "sub", "q", "choices", "correct", "correctText", "ref"]);
const OPTIONAL_FIELDS = Object.freeze(["figure"]);
const ALLOWED_FIELDS = new Set(REQUIRED_FIELDS.concat(OPTIONAL_FIELDS));
const CHOICE_LETTERS = Object.freeze(["A", "B", "C", "D"]);
const CHOICE_LETTER_SET = new Set(CHOICE_LETTERS);

// A "plain object" here is a non-null, non-array object whose prototype is
// either Object.prototype or null. JSON.parse -- the only source of real
// question data -- ever produces Object.prototype-based objects; a
// null-prototype object carries no inherited members either, so accepting
// it too costs nothing in this JSON-only pipeline and avoids an arbitrary
// extra rejection rule that could only ever fire on a hand-built test
// fixture, never on real data. Using `Object.getPrototypeOf` (not
// `instanceof Object` or a `constructor` check) means an object built with
// `Object.create(null)` -- which has no `.constructor` and fails
// `instanceof` -- is still correctly recognized as plain.
function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

// Validates a full question bank (the parsed contents of one pool's JSON
// file). Returns { errors: string[] } (empty === valid); never throws.
// Errors are collected in one deterministic forward pass -- fixed per-field
// check order, not dependent on a question's own key insertion order -- so
// the same input always produces the same error list in the same order.
//
// options.poolKey, if given, prefixes every diagnostic (e.g. "technician:
// question ...") so a caller validating several banks can tell them apart;
// omitted, diagnostics are still fully identifying via the question id/index.
function validateQuestionBank(bank, options) {
  const opts = options || {};
  const prefix = opts.poolKey ? `${opts.poolKey}: ` : "";
  const errors = [];
  const push = (message) => errors.push(prefix + message);

  if (!Array.isArray(bank)) {
    push("question bank must be an array");
    return { errors };
  }
  if (bank.length === 0) {
    push("question bank must be a non-empty array");
    return { errors };
  }

  const seenIds = new Set();

  bank.forEach((question, index) => {
    const idForLabel = isPlainObject(question) && isNonEmptyString(question.id) ? question.id : null;
    const label = idForLabel ? `question "${idForLabel}" (index ${index})` : `question at index ${index}`;
    const at = (message) => push(`${label}: ${message}`);

    if (!isPlainObject(question)) {
      at("must be a plain object");
      return; // no further property access is meaningful
    }

    const missing = REQUIRED_FIELDS.filter((field) => !hasOwn(question, field));
    if (missing.length) {
      at(`missing required field(s): ${missing.join(", ")}`);
    }
    const unknown = Object.keys(question).filter((key) => !ALLOWED_FIELDS.has(key)).sort();
    if (unknown.length) {
      at(`unknown field(s): ${unknown.join(", ")}`);
    }

    // Each field below is checked for shape ONLY when present, so a missing
    // field is reported exactly once (via the aggregate message above), not
    // also as a redundant "wrong type" error for the same absent value.

    if (hasOwn(question, "id")) {
      if (!isNonEmptyString(question.id)) {
        at("`id` must be a non-empty string");
      } else if (seenIds.has(question.id)) {
        at(`duplicate question id "${question.id}"`);
      } else {
        seenIds.add(question.id);
      }
    }
    if (hasOwn(question, "sub") && !isNonEmptyString(question.sub)) {
      at("`sub` must be a non-empty string");
    }
    if (hasOwn(question, "q") && !isNonEmptyString(question.q)) {
      at("`q` must be a non-empty string");
    }
    if (hasOwn(question, "ref") && typeof question.ref !== "string") {
      at("`ref` must be a string (the empty string is valid)");
    }
    if (hasOwn(question, "figure") && !isNonEmptyString(question.figure)) {
      at("`figure` must be a non-empty string when present");
    }

    let choicesOk = false;
    if (hasOwn(question, "choices")) {
      const choices = question.choices;
      if (!isPlainObject(choices)) {
        at("`choices` must be a plain object");
      } else {
        const choiceKeys = Object.keys(choices);
        const missingChoices = CHOICE_LETTERS.filter((letter) => !hasOwn(choices, letter));
        const unexpectedChoices = choiceKeys.filter((key) => !CHOICE_LETTER_SET.has(key)).sort();
        let lettersOk = true;
        if (missingChoices.length) {
          at(`\`choices\` is missing key(s): ${missingChoices.join(", ")}`);
          lettersOk = false;
        }
        if (unexpectedChoices.length) {
          at(`\`choices\` has unexpected key(s): ${unexpectedChoices.join(", ")}`);
          lettersOk = false;
        }
        CHOICE_LETTERS.forEach((letter) => {
          if (!hasOwn(choices, letter)) return;
          if (!isNonEmptyString(choices[letter])) {
            at(`\`choices.${letter}\` must be a non-empty string`);
            lettersOk = false;
          }
        });
        choicesOk = lettersOk;
      }
    }

    let correctOk = false;
    if (hasOwn(question, "correct")) {
      if (!isNonEmptyString(question.correct) || !CHOICE_LETTER_SET.has(question.correct)) {
        at('`correct` must be exactly one of "A", "B", "C", or "D"');
      } else {
        correctOk = true;
      }
    }

    if (hasOwn(question, "correctText")) {
      if (!isNonEmptyString(question.correctText)) {
        at("`correctText` must be a non-empty string");
      } else if (choicesOk && correctOk) {
        // Only meaningful once both choices and correct are themselves
        // well-formed -- otherwise "expected" text can't be computed, and
        // the choices/correct error above is already the actionable one.
        const expected = question.choices[question.correct];
        if (question.correctText !== expected) {
          at(
            `\`correctText\` (${JSON.stringify(question.correctText)}) does not match ` +
            `\`choices.${question.correct}\` (${JSON.stringify(expected)})`
          );
        }
      }
    }
  });

  return { errors };
}

// Throws one Error listing every validation error. Never mutates inputs.
function assertQuestionBank(bank, options) {
  const { errors } = validateQuestionBank(bank, options);
  if (errors.length) {
    throw new Error(
      `Question bank validation failed (${errors.length} error${errors.length === 1 ? "" : "s"}):\n- ` +
      errors.join("\n- ")
    );
  }
}

module.exports = {
  REQUIRED_FIELDS,
  OPTIONAL_FIELDS,
  CHOICE_LETTERS,
  isPlainObject,
  validateQuestionBank,
  assertQuestionBank,
};
