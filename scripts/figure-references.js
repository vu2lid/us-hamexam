"use strict";

// Dependency-free CommonJS helpers for validating question-to-figure mappings.
//
// Imported by both scripts/build.js (as a hard build gate) and
// tests/unit/figure-references.test.js. Stage 2A covers figure *references* and
// the question data model only: this module never acquires, creates, embeds, or
// renders figure assets, and it never mutates the question objects it inspects.

// Pool key -> figure-ID prefix. Figure IDs are namespaced by license class so a
// mapping can be checked against the pool that owns the question.
const POOL_PREFIX = Object.freeze({
  technician: "T",
  general: "G",
  extra: "E"
});

// A supported, normalized figure ID: one uppercase pool letter, optional group
// digits, a hyphen, then one or more sequence digits. Examples: T-1, G7-1, E9-3.
const FIGURE_ID_RE = /^[A-Z][0-9]*-[0-9]+$/;

// A textual figure reference in user-visible content: the word "figure" (any
// case) followed by whitespace and a complete figure-ID-shaped token. The
// leading `\b` and the required `\s+` keep this from matching "figures" (as in
// the Baudot "letters/figures shift code") or "figure-eight".
//
// The trailing `(?![A-Za-z0-9_-])` makes the ID token a maximal unit: a letter,
// digit, underscore, or hyphen immediately after the digits is treated as a
// continuation of the token, so "figure T-1a", "figure T-1-2", "figure
// T-1_extra", and "figure E9-12a" match nothing rather than yielding a shorter
// valid ID. Because a shorter `[0-9]+` still leaves a digit in that lookahead
// class, backtracking cannot rescue a numeric prefix either.
const TEXT_REF_RE = /\bfigure\s+([A-Za-z][0-9]*-[0-9]+)(?![A-Za-z0-9_-])/gi;

// The user-visible fields inspected for references. At minimum the prompt and
// the four answer choices, per the Stage 2 plan.
const TEXT_FIELDS = ["A", "B", "C", "D"];

function normalizeFigureId(value) {
  return String(value).trim().toUpperCase();
}

function isValidFigureId(value) {
  return typeof value === "string" && FIGURE_ID_RE.test(value);
}

function poolPrefix(poolKey) {
  return POOL_PREFIX[poolKey];
}

// Join a question's prompt and answer choices into one block of text without
// altering the question object.
function questionText(question) {
  if (!question || typeof question !== "object") return "";
  const parts = [];
  if (typeof question.q === "string") parts.push(question.q);
  if (question.choices && typeof question.choices === "object") {
    for (const letter of TEXT_FIELDS) {
      if (typeof question.choices[letter] === "string") {
        parts.push(question.choices[letter]);
      }
    }
  }
  return parts.join("\n");
}

// Extract unique, normalized figure IDs mentioned in a block of text, in
// first-seen order. Repeated or differently-cased mentions collapse to one ID.
function extractFigureIds(text) {
  const source = String(text);
  const seen = new Set();
  const out = [];
  let match;
  TEXT_REF_RE.lastIndex = 0;
  while ((match = TEXT_REF_RE.exec(source)) !== null) {
    const id = normalizeFigureId(match[1]);
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

// Extract unique, normalized figure IDs referenced by a question's prompt and
// answer choices.
function extractQuestionFigureIds(question) {
  return extractFigureIds(questionText(question));
}

// Validate one question's optional `figure` field against its textual
// references. Returns an array of deterministic, actionable error strings;
// an empty array means the mapping is consistent. Never mutates `question`.
//
// Rules enforced:
//   - a textual "figure <id>" reference requires an explicit `figure` field;
//   - a `figure` field requires exactly one unique textual reference that
//     matches it;
//   - `figure` must already be stored normalized (uppercase, trimmed);
//   - `figure` must match the supported ID format;
//   - the `figure` prefix must match the question's pool;
//   - a question with no textual reference must not carry a `figure` field.
function validateQuestionFigure(question, poolKey) {
  const id = question && question.id ? question.id : "<unknown id>";
  const where = `[${poolKey}] ${id}`;
  const prefix = poolPrefix(poolKey);
  if (!prefix) {
    return [`${where}: unknown pool key ${JSON.stringify(poolKey)}`];
  }

  const errors = [];
  const textualIds = extractQuestionFigureIds(question);
  const hasField = !!question &&
    Object.prototype.hasOwnProperty.call(question, "figure");

  if (!hasField) {
    if (textualIds.length > 0) {
      errors.push(
        `${where}: text references figure ${textualIds.join(", ")} ` +
        `but the record has no "figure" field`
      );
    }
    return errors;
  }

  const raw = question.figure;
  if (typeof raw !== "string" || raw.length === 0) {
    errors.push(
      `${where}: "figure" must be a non-empty string, got ${JSON.stringify(raw)}`
    );
    return errors;
  }

  const normalized = normalizeFigureId(raw);
  if (raw !== normalized) {
    errors.push(
      `${where}: "figure" must be stored normalized as "${normalized}", got "${raw}"`
    );
  }
  if (!isValidFigureId(normalized)) {
    errors.push(
      `${where}: "figure" value "${raw}" is not a supported figure ID ` +
      `(expected e.g. ${prefix}-1)`
    );
    return errors;
  }
  if (normalized[0] !== prefix) {
    errors.push(
      `${where}: "figure" ${normalized} has prefix "${normalized[0]}" but ` +
      `${poolKey} questions must map to ${prefix}-* figures`
    );
  }
  if (textualIds.length === 0) {
    errors.push(
      `${where}: has "figure" ${normalized} but no textual figure reference ` +
      `in the prompt or choices`
    );
  } else if (textualIds.length > 1) {
    errors.push(
      `${where}: text references multiple figures (${textualIds.join(", ")}); ` +
      `a mapped question must reference exactly one`
    );
  } else if (textualIds[0] !== normalized) {
    errors.push(
      `${where}: "figure" ${normalized} does not match the textual ` +
      `reference ${textualIds[0]}`
    );
  }
  return errors;
}

// Validate every question in a pool. Returns:
//   { errors:   string[]  (sorted, deterministic),
//     mapped:   Array<{ id, figure }>  (input order),
//     figureIds: Set<string>  (unique normalized IDs actually mapped) }
function validatePoolFigures(questions, poolKey) {
  if (!Array.isArray(questions)) {
    throw new TypeError(
      `validatePoolFigures: questions for ${JSON.stringify(poolKey)} must be an array`
    );
  }
  const errors = [];
  const mapped = [];
  const figureIds = new Set();

  questions.forEach(question => {
    for (const err of validateQuestionFigure(question, poolKey)) {
      errors.push(err);
    }
    if (question &&
        Object.prototype.hasOwnProperty.call(question, "figure") &&
        typeof question.figure === "string" &&
        question.figure.length > 0) {
      const norm = normalizeFigureId(question.figure);
      mapped.push({ id: question.id, figure: norm });
      figureIds.add(norm);
    }
  });

  errors.sort();
  return { errors, mapped, figureIds };
}

// Build gate: throw a single deterministic Error listing every problem in the
// pool, or return silently when all mappings are consistent.
function assertPoolFigureReferences(questions, poolKey) {
  const { errors } = validatePoolFigures(questions, poolKey);
  if (errors.length > 0) {
    throw new Error(
      `Figure-reference validation failed for the ${poolKey} pool:\n  ` +
      errors.join("\n  ")
    );
  }
}

module.exports = {
  POOL_PREFIX,
  FIGURE_ID_RE,
  normalizeFigureId,
  isValidFigureId,
  poolPrefix,
  questionText,
  extractFigureIds,
  extractQuestionFigureIds,
  validateQuestionFigure,
  validatePoolFigures,
  assertPoolFigureReferences
};
