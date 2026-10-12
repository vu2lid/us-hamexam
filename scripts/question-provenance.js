"use strict";

// Stage 8D3A: dependency-free, build-time validator for a per-edition
// question-provenance SIDECAR (docs/INDIA_CONTENT_CONTRACT.md §2, §6).
//
// The sidecar is authoring/provenance metadata kept OUTSIDE the runtime
// question schema (scripts/question-bank.js's id/sub/q/choices/correct/
// correctText/ref, unchanged) -- a plain JSON object keyed by question id,
// one entry per bank question, never embedded in any generated document
// (scripts/build.js never reads this module's output into a runtime
// literal; it only gates the build on it). This module is pure library
// code: requiring it runs no CLI and touches no files; both exported
// functions work entirely on in-memory values and never mutate their
// inputs, so unit tests can pass frozen fixtures.
//
// This seam is edition-agnostic by construction, not an India-only
// special case: any edition may declare a per-pool sidecar path via the
// optional `profile.build.provenanceSidecars` field (scripts/
// edition-profile.js); scripts/build.js validates whichever pools declare
// one and leaves every other pool/edition (today, US and synthetic, which
// declare none) completely unaffected. There is no `if (india)` branch
// anywhere in this module or its build-time caller.

// The four provenance classes docs/INDIA_CONTENT_CONTRACT.md §3 defines.
// "ncvec-adapted" is a VALID class (not "unsupported") -- the contract
// permits it under its own §4 reuse terms -- but is deliberately unused by
// this repository's own India content so far; a future item claiming it
// needs the extra justification §3 describes, which this module does not
// itself adjudicate (that is a human review-workflow decision, not a shape
// check).
const PROVENANCE_CLASSES = Object.freeze([
  "india-original", "ncvec-adapted", "rule-derived", "reference-informed"
]);

// docs/INDIA_CONTENT_CONTRACT.md §5's six review stages, in order. Only
// "approved" (stage 6, independent technical AND fact review both complete)
// is build-ready; the other five are legitimate, honestly-recorded WORK-IN-
// PROGRESS states that still fail the build -- "incomplete review status"
// in this module's diagnostics always means "a recognized but non-approved
// status," never "an unrecognized string" (that gets its own diagnostic).
const REVIEW_STATUSES = Object.freeze([
  "draft", "syllabus-mapped", "technical-review", "rights-review", "fact-review", "approved"
]);
const BUILD_READY_REVIEW_STATUS = "approved";

// Rights status for the cited source material (docs/INDIA_CONTENT_CONTRACT.md
// §4). Only "cleared" is build-ready; "unresolved" is the literal state the
// task/contract names as a must-reject case, but any non-"cleared" value
// (including a legitimate "pending-rights-review" or an explicit "blocked")
// fails the build the same way -- an item ships only once its rights are
// affirmatively resolved, not merely "not yet flagged as a problem".
const RIGHTS_STATUSES = Object.freeze(["cleared", "pending-rights-review", "unresolved", "blocked"]);
const BUILD_READY_RIGHTS_STATUS = "cleared";

// This MVP slice is figureless by profile-level policy (figurePolicy.
// provenanceScheme: "none"); "none" is the only figure status that can be
// build-ready today. "pending-review"/"cleared" are recognized so a later,
// figure-bearing slice can record progress through its own separate figure
// rights review (docs/INDIA_CONTENT_CONTRACT.md §4) without redefining this
// enum, but they are not yet wired to actually permit a `figure` field.
const FIGURE_STATUSES = Object.freeze(["none", "pending-review", "cleared"]);
const BUILD_READY_FIGURE_STATUS = "none";

const SIDECAR_ENTRY_KEYS = Object.freeze([
  "syllabusCode", "syllabusTopic", "provenanceClass", "sourceCitation",
  "author", "reviewer", "reviewStatus", "rightsStatus", "rationale", "figureStatus"
]);

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNonBlankString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function unknownKeys(object, allowed) {
  const set = new Set(allowed);
  return Object.keys(object).filter((k) => !set.has(k));
}

// Validate a provenance sidecar against its bank's real question IDs.
// `bank` is the already-loaded, already-question-bank-schema-validated
// array of questions (scripts/question-bank.js owns id-shape/duplicate
// checks at the bank level; this module only cross-checks the sidecar
// against whatever IDs the bank actually has -- it never re-derives bank
// validity). `options.requireBuildReady` (default true) additionally
// requires every entry's reviewStatus/rightsStatus/figureStatus to be the
// specific build-ready value, not merely a recognized enum member --
// pass `{ requireBuildReady: false }` only for a pure shape/consistency
// check (e.g. authoring-time linting) that tolerates legitimate
// work-in-progress review states. Returns { errors } (empty === valid),
// sorted for determinism. Never mutates its inputs.
function validateProvenanceSidecar(sidecar, bank, options) {
  const opts = options || {};
  const requireBuildReady = opts.requireBuildReady !== false;
  const errors = [];
  const push = (m) => errors.push(m);

  if (!isPlainObject(sidecar)) {
    return { errors: ["provenance sidecar: root must be a JSON object keyed by question id"] };
  }
  if (!Array.isArray(bank)) {
    return { errors: ["provenance sidecar: bank must be an array of questions"] };
  }

  // Bank-side IDs: only non-empty-string ids are considered (a bank
  // question with a missing/malformed id is already a question-bank.js
  // schema failure, reported there, not duplicated here). A literal
  // duplicate id cannot survive the sidecar's own JSON-object-key parsing,
  // the same reasoning scripts/pool-registry.js relies on for its own
  // keyed structures; the BANK's duplicate-id check is question-bank.js's
  // job, not re-implemented here.
  const bankIds = new Set();
  for (const question of bank) {
    if (question && isNonBlankString(question.id)) bankIds.add(question.id);
  }

  const sidecarIds = Object.keys(sidecar);
  const sidecarIdSet = new Set(sidecarIds);

  // Mismatches, both directions: a bank question with no sidecar entry,
  // and a sidecar entry naming no real bank question (a stale or
  // misspelled id left behind after a bank edit).
  bankIds.forEach((id) => {
    if (!sidecarIdSet.has(id)) {
      push(`provenance sidecar: missing entry for bank question id "${id}"`);
    }
  });
  sidecarIds.forEach((id) => {
    if (!bankIds.has(id)) {
      push(`provenance sidecar["${id}"]: does not correspond to any bank question id`);
    }
  });

  sidecarIds.forEach((id) => {
    const entry = sidecar[id];
    const at = `provenance sidecar["${id}"]`;
    if (!isPlainObject(entry)) {
      push(`${at} must be an object`);
      return;
    }

    const extra = unknownKeys(entry, SIDECAR_ENTRY_KEYS);
    if (extra.length) push(`${at}: unknown key(s): ${extra.join(", ")}`);

    if (!isNonBlankString(entry.syllabusCode)) {
      push(`${at}.syllabusCode must be a non-blank string (missing syllabus mapping)`);
    }
    if (!isNonBlankString(entry.syllabusTopic)) {
      push(`${at}.syllabusTopic must be a non-blank string (missing syllabus mapping)`);
    }

    if (!isNonBlankString(entry.provenanceClass) || !PROVENANCE_CLASSES.includes(entry.provenanceClass)) {
      push(`${at}.provenanceClass must be one of: ${PROVENANCE_CLASSES.join(", ")}, got ${JSON.stringify(entry.provenanceClass)}`);
    }

    if (!isNonBlankString(entry.sourceCitation)) {
      push(`${at}.sourceCitation must be a non-blank string (missing citation)`);
    }
    if (!isNonBlankString(entry.author)) {
      push(`${at}.author must be a non-blank string`);
    }
    if (!isNonBlankString(entry.reviewer)) {
      push(`${at}.reviewer must be a non-blank string`);
    }
    if (!isNonBlankString(entry.rationale)) {
      push(`${at}.rationale must be a non-blank string`);
    }

    if (!isNonBlankString(entry.reviewStatus) || !REVIEW_STATUSES.includes(entry.reviewStatus)) {
      push(`${at}.reviewStatus must be one of: ${REVIEW_STATUSES.join(", ")}, got ${JSON.stringify(entry.reviewStatus)}`);
    } else if (requireBuildReady && entry.reviewStatus !== BUILD_READY_REVIEW_STATUS) {
      push(`${at}.reviewStatus is "${entry.reviewStatus}", not "${BUILD_READY_REVIEW_STATUS}" -- review status incomplete, this item cannot build yet`);
    }

    if (!isNonBlankString(entry.rightsStatus) || !RIGHTS_STATUSES.includes(entry.rightsStatus)) {
      push(`${at}.rightsStatus must be one of: ${RIGHTS_STATUSES.join(", ")}, got ${JSON.stringify(entry.rightsStatus)}`);
    } else if (requireBuildReady && entry.rightsStatus !== BUILD_READY_RIGHTS_STATUS) {
      push(`${at}.rightsStatus is "${entry.rightsStatus}" -- unresolved rights status, this item cannot build yet`);
    }

    if (!isNonBlankString(entry.figureStatus) || !FIGURE_STATUSES.includes(entry.figureStatus)) {
      push(`${at}.figureStatus must be one of: ${FIGURE_STATUSES.join(", ")}, got ${JSON.stringify(entry.figureStatus)}`);
    } else if (requireBuildReady && entry.figureStatus !== BUILD_READY_FIGURE_STATUS) {
      push(`${at}.figureStatus is "${entry.figureStatus}", not "${BUILD_READY_FIGURE_STATUS}" -- this slice is figureless`);
    }
  });

  errors.sort();
  return { errors };
}

// Throw a single Error listing every validation error. Never mutates inputs.
function assertProvenanceSidecar(sidecar, bank, options) {
  const { errors } = validateProvenanceSidecar(sidecar, bank, options);
  if (errors.length) {
    throw new Error(
      `Provenance sidecar validation failed (${errors.length} error${errors.length === 1 ? "" : "s"}):\n- ` +
      errors.join("\n- ")
    );
  }
}

module.exports = {
  PROVENANCE_CLASSES,
  REVIEW_STATUSES,
  BUILD_READY_REVIEW_STATUS,
  RIGHTS_STATUSES,
  BUILD_READY_RIGHTS_STATUS,
  FIGURE_STATUSES,
  BUILD_READY_FIGURE_STATUS,
  SIDECAR_ENTRY_KEYS,
  validateProvenanceSidecar,
  assertProvenanceSidecar
};
