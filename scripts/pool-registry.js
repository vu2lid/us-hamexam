"use strict";

// Dependency-free CommonJS validator for the canonical pool identity registry
// (Stage 4A0). It defines and enforces the schema for `data/pools.json` and
// cross-checks every registry entry against the real question banks loaded at
// build time.
//
// This module is pure library code: requiring it runs no CLI and touches no
// files. Both exported functions work entirely on in-memory values and never
// mutate their inputs, so unit tests can pass frozen synthetic fixtures.
//
// revisionId slugs are deterministic: "errata-YYYY-MM-DD" from the NCVEC
// errata date, suffixed with "-N" when the edition numbers its errata
// (General 6th, Extra 4th; the current Technician errata is unnumbered).

// ---------------------------------------------------------------------------
// Contract constants
// ---------------------------------------------------------------------------

// v1 (Stage 4A0): pool identity only. v2 (Stage 5A): adds the mock-exam
// configuration fields (examQuestionCount, passingScore,
// defaultTimeLimitSeconds, withdrawnIds, groupBlueprint) and their allowlist
// entries below -- a v1 registry no longer validates, by design, since those
// fields are now required. v3 (Stage 6A1): adds scopeLabels (human-readable
// subelement/group titles for scoped study) -- a v2 registry no longer
// validates, for the same reason. This is unrelated to the persisted
// `ham-exam-state` storage schema (src/storage.js), which stays at its own
// schemaVersion 1.
const SCHEMA_VERSION = 3;

// The complete set of pools the application ships, in canonical order.
const POOL_KEYS = Object.freeze(["technician", "general", "extra"]);

// The single question-ID prefix letter each pool must use.
const POOL_ID_PREFIX = Object.freeze({
  technician: "T",
  general: "G",
  extra: "E"
});

// Exact field allowlists. Unknown keys at either level are rejected.
const REGISTRY_ROOT_KEYS = new Set(["schemaVersion", "pools"]);
const POOL_ENTRY_KEYS = new Set([
  "poolKey",
  "displayName",
  "editionId",
  "revisionId",
  "element",
  "effectiveStart",
  "effectiveEnd",
  "expectedCount",
  "questionIdPrefix",
  "sourceUrl",
  "errataLabel",
  // Stage 5A: mock-exam configuration, consolidated here from the former
  // src/exam-engine.js EXAM_CONFIG global so it has exactly one source of
  // truth. examQuestionCount is the mock-exam session size (35/35/50) and is
  // NOT the same number as expectedCount (the full bank size, 409/423/599).
  "examQuestionCount",
  "passingScore",
  "defaultTimeLimitSeconds",
  "withdrawnIds",
  "groupBlueprint",
  // Stage 6A1: human-readable titles for scoped study's subelement/group
  // options, sourced from the tracked NCVEC pool text under
  // data/pool-sources/ -- see docs/SCOPED_STUDY_PLAN.md for provenance.
  "scopeLabels"
]);

// scopeLabels has exactly two child collections; unknown keys are rejected
// the same way as every other object in this registry.
const SCOPE_LABELS_KEYS = new Set(["subelements", "groups"]);

// Upper bound for a scope-selector option label. Labels target ~48
// characters (a concise first clause of the official NCVEC group text,
// mobile-readable in a native <select>); a few extend further only where
// needed -- a first clause just over target stays whole rather than losing
// its key word to an ellipsis cut, and two same-pool group pairs
// (Extra E2D/E2E, E7E/E8B) that would otherwise share an identical short
// label carry one more official clause to stay distinguishable. 72
// comfortably covers the longest real label today (70 characters, Extra
// E7E) while still catching a data-entry mistake such as pasting an entire
// NCVEC paragraph instead of a short title.
const MAX_SCOPE_LABEL_LENGTH = 72;

// Sensible upper bound for a configured mock-exam duration: 6 hours
// comfortably covers any real amateur-radio exam session (the longest
// configured pool today is 50 minutes) while still catching a data-entry
// mistake such as minutes typed where seconds were expected.
const MAX_DEFAULT_TIME_LIMIT_SECONDS = 21600;

// A blueprint/withdrawn-ID group identifier: pool letter, subelement digit,
// group letter (e.g. "T1A", "E9H") -- the question-ID prefix without its
// trailing two-digit question number.
const GROUP_ID_RE = /^[TGE][0-9][A-Z]$/;

// Canonical NCVEC question ID shape: pool letter, subelement digit, group
// letter, two-digit question number (e.g. T1A01, G7B12, E9H03). Subelement 0
// is legitimate (T0/G0/E0), but official numbering starts at 01, so "00"
// question numbers are rejected.
const QUESTION_ID_RE = /^[TGE][0-9][A-Z](?!00)[0-9]{2}$/;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Edition identity contract: "<poolKey>-<startYear>-<endYear>", where the
// years must agree with the effective date range. Anything else (swapped pool
// editions, unrelated strings, whitespace, display text) fails the build.
const EDITION_ID_RE = /^(technician|general|extra)-(\d{4})-(\d{4})$/;

// Revision identity contract: a stable "errata-YYYY-MM-DD" slug, optionally
// suffixed "-N" when the edition numbers its errata (General 6th, Extra 4th).
// The date must be a real calendar date. It is NOT required to fall inside the
// effective range: NCVEC publishes errata before the edition takes effect.
const REVISION_ID_RE = /^errata-(\d{4})-(\d{2})-(\d{2})(-\d+)?$/;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNonBlankString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function unknownKeys(object, allowed) {
  return Object.keys(object).filter((k) => !allowed.has(k));
}

// Strict YYYY-MM-DD that must be a real calendar date (no 2026-02-30).
function isValidIsoDate(value) {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

// Normalize banks to { poolKey: questions[] }, accepting either a bare array
// or the build's `{ key: { questions } }` shape. Missing entries become empty
// arrays so the count check reports a mismatch rather than throwing.
function normalizeBanks(banks) {
  const out = {};
  for (const key of POOL_KEYS) {
    const entry = banks && banks[key];
    if (Array.isArray(entry)) out[key] = entry;
    else if (entry && Array.isArray(entry.questions)) out[key] = entry.questions;
    else out[key] = [];
  }
  return out;
}

// Validate one pool entry's scopeLabels against the group/subelement codes
// derived from its own groupBlueprint (`expectedSubelements`/`expectedGroups`).
// Pure: reads `entry`/its lists, never mutates them; every finding is
// appended to `errors` via `push`. Deterministic -- same input, same output,
// independent of key insertion order (iteration always runs over the sorted
// expected lists, not `Object.keys(labels)`).
function validateScopeLabels(labels, at, expectedSubelements, expectedGroups, push) {
  if (!isPlainObject(labels)) {
    push(`${at}.scopeLabels must be an object with "subelements" and "groups"`);
    return;
  }
  const extra = unknownKeys(labels, SCOPE_LABELS_KEYS);
  if (extra.length) push(`${at}.scopeLabels: unknown key(s): ${extra.join(", ")}`);

  function checkGroup(groupName, labelsObj, expectedCodes) {
    const label = `${at}.scopeLabels.${groupName}`;
    if (!isPlainObject(labelsObj)) {
      push(`${label} must be an object mapping code to title`);
      return;
    }
    const presentCodes = Object.keys(labelsObj);
    const expectedSet = new Set(expectedCodes);
    presentCodes.forEach((code) => {
      if (!expectedSet.has(code)) push(`${label}["${code}"]: unknown code (not in this pool's groupBlueprint)`);
    });
    expectedCodes.forEach((code) => {
      if (!Object.prototype.hasOwnProperty.call(labelsObj, code)) {
        push(`${label} is missing a title for "${code}"`);
        return;
      }
      const title = labelsObj[code];
      if (!isNonBlankString(title)) {
        push(`${label}["${code}"] must be a non-blank string`);
      } else if (title.trim().length > MAX_SCOPE_LABEL_LENGTH) {
        push(`${label}["${code}"] exceeds the ${MAX_SCOPE_LABEL_LENGTH}-character limit (${title.trim().length})`);
      } else if (title !== title.trim()) {
        push(`${label}["${code}"] must not have leading or trailing whitespace`);
      }
    });
  }

  checkGroup("subelements", labels.subelements, expectedSubelements);
  checkGroup("groups", labels.groups, expectedGroups);
}

// ---------------------------------------------------------------------------
// Registry validation (pure)
// ---------------------------------------------------------------------------

// Validate the registry object and cross-check it against the question banks.
// Returns { errors: string[] } (empty === valid), sorted for determinism.
function validatePoolRegistry(registry, banks) {
  const errors = [];
  const push = (m) => errors.push(m);

  if (!isPlainObject(registry)) {
    return { errors: ["registry: root must be a JSON object"] };
  }
  const extraRoot = unknownKeys(registry, REGISTRY_ROOT_KEYS);
  if (extraRoot.length) push(`registry: unknown top-level key(s): ${extraRoot.join(", ")}`);
  if (registry.schemaVersion !== SCHEMA_VERSION) {
    push(`registry: schemaVersion must be ${SCHEMA_VERSION}, got ${JSON.stringify(registry.schemaVersion)}`);
  }
  if (!isPlainObject(registry.pools)) {
    errors.sort();
    return { errors: errors.concat(['registry: "pools" must be an object keyed by pool key']).sort() };
  }

  // Exact pool-key set: no missing, no extra.
  const registryKeys = Object.keys(registry.pools);
  for (const key of POOL_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(registry.pools, key)) {
      push(`registry.pools: missing required pool "${key}"`);
    }
  }
  for (const key of registryKeys) {
    if (POOL_KEYS.indexOf(key) === -1) {
      push(`registry.pools: unknown pool key "${key}"`);
    }
  }

  const bankQuestions = normalizeBanks(banks);
  const editionIds = new Map();   // editionId -> pool key
  const identityPairs = new Map(); // editionId|revisionId -> pool key

  for (const key of POOL_KEYS) {
    const entry = registry.pools[key];
    const at = `registry.pools["${key}"]`;
    if (!isPlainObject(entry)) {
      if (Object.prototype.hasOwnProperty.call(registry.pools, key)) {
        push(`${at}: entry must be an object`);
      }
      continue;
    }

    const extra = unknownKeys(entry, POOL_ENTRY_KEYS);
    if (extra.length) push(`${at}: unknown key(s): ${extra.join(", ")}`);

    if (entry.poolKey !== key) {
      push(`${at}.poolKey must equal its registry key "${key}", got ${JSON.stringify(entry.poolKey)}`);
    }
    if (!isNonBlankString(entry.displayName)) {
      push(`${at}.displayName must be a non-blank string`);
    }

    // Effective range is computed first: strict real ISO dates, start before
    // end. The identity checks below also reference the parsed date validity.
    const startOk = isValidIsoDate(entry.effectiveStart);
    const endOk = isValidIsoDate(entry.effectiveEnd);
    if (!startOk) push(`${at}.effectiveStart must be a real ISO date (YYYY-MM-DD)`);
    if (!endOk) push(`${at}.effectiveEnd must be a real ISO date (YYYY-MM-DD)`);
    if (startOk && endOk && !(entry.effectiveStart < entry.effectiveEnd)) {
      push(`${at}: effectiveStart must be before effectiveEnd`);
    }

    // Identity: editionId follows "<poolKey>-<startYear>-<endYear>", its pool
    // prefix matches the registry key, and its years agree with the effective
    // range; revisionId is a stable errata slug. Uniqueness rules apply on top.
    const editionMatch = typeof entry.editionId === "string" && entry.editionId.match(EDITION_ID_RE);
    if (!editionMatch) {
      push(`${at}.editionId must match "<poolKey>-<startYear>-<endYear>" (e.g. "${key}-2026-2030"), got ${JSON.stringify(entry.editionId)}`);
    } else {
      if (editionMatch[1] !== key) {
        push(`${at}.editionId "${entry.editionId}" is a "${editionMatch[1]}" edition, not "${key}"`);
      }
      if (startOk && endOk &&
          (editionMatch[2] !== entry.effectiveStart.slice(0, 4) ||
           editionMatch[3] !== entry.effectiveEnd.slice(0, 4))) {
        push(`${at}.editionId "${entry.editionId}" does not agree with the effective range ${entry.effectiveStart}..${entry.effectiveEnd}`);
      }
      const prev = editionIds.get(entry.editionId);
      if (prev !== undefined) {
        push(`${at}.editionId "${entry.editionId}" is also used by pool "${prev}"`);
      } else {
        editionIds.set(entry.editionId, key);
      }
    }
    const revisionMatch = typeof entry.revisionId === "string" && entry.revisionId.match(REVISION_ID_RE);
    if (!revisionMatch) {
      push(`${at}.revisionId must match "errata-YYYY-MM-DD" with an optional "-N" suffix, got ${JSON.stringify(entry.revisionId)}`);
    } else if (!isValidIsoDate(`${revisionMatch[1]}-${revisionMatch[2]}-${revisionMatch[3]}`)) {
      push(`${at}.revisionId "${entry.revisionId}" does not contain a real calendar date`);
    }
    if (editionMatch && revisionMatch) {
      const pair = entry.editionId + "|" + entry.revisionId;
      const prevPair = identityPairs.get(pair);
      if (prevPair !== undefined) {
        push(`${at}: identity pair "${entry.editionId}" / "${entry.revisionId}" is also used by pool "${prevPair}"`);
      } else {
        identityPairs.set(pair, key);
      }
    }

    if (!Number.isInteger(entry.element) || entry.element < 1) {
      push(`${at}.element must be a positive integer`);
    }
    if (!Number.isInteger(entry.expectedCount) || entry.expectedCount < 1) {
      push(`${at}.expectedCount must be a positive integer`);
    } else if (entry.expectedCount !== bankQuestions[key].length) {
      push(`${at}.expectedCount is ${entry.expectedCount} but the ${key} bank has ${bankQuestions[key].length} questions`);
    }

    // Effective range already validated above.

    // Mock-exam configuration (Stage 5A). examQuestionCount is the exam
    // session size, distinct from expectedCount (the full bank size).
    const examCountOk = Number.isInteger(entry.examQuestionCount) && entry.examQuestionCount >= 1;
    if (!examCountOk) {
      push(`${at}.examQuestionCount must be a positive integer`);
    }

    if (!Number.isInteger(entry.passingScore) || entry.passingScore < 1) {
      push(`${at}.passingScore must be a positive integer`);
    } else if (examCountOk && entry.passingScore > entry.examQuestionCount) {
      push(`${at}.passingScore (${entry.passingScore}) must not exceed examQuestionCount (${entry.examQuestionCount})`);
    }

    if (!Number.isInteger(entry.defaultTimeLimitSeconds) ||
        entry.defaultTimeLimitSeconds < 0 ||
        entry.defaultTimeLimitSeconds > MAX_DEFAULT_TIME_LIMIT_SECONDS) {
      push(`${at}.defaultTimeLimitSeconds must be an integer between 0 and ${MAX_DEFAULT_TIME_LIMIT_SECONDS} (inclusive)`);
    }

    // withdrawnIds: question IDs NCVEC has removed via errata that may still
    // linger in an as-yet-unupdated bank file. Format-checked only -- by
    // definition a withdrawn ID may already be absent from the bank, so no
    // presence cross-check is performed here (unlike groupBlueprint below).
    let withdrawnIds = [];
    if (!Array.isArray(entry.withdrawnIds)) {
      push(`${at}.withdrawnIds must be an array`);
    } else {
      withdrawnIds = entry.withdrawnIds;
      const seenWithdrawn = new Set();
      withdrawnIds.forEach((id, i) => {
        const label = `${at}.withdrawnIds[${i}]`;
        if (typeof id !== "string" || !QUESTION_ID_RE.test(id)) {
          push(`${label} must be a valid question ID (expected ${QUESTION_ID_RE})`);
        } else {
          if (id[0] !== POOL_ID_PREFIX[key]) {
            push(`${label} "${id}" does not start with the ${key} pool prefix "${POOL_ID_PREFIX[key]}"`);
          }
          if (seenWithdrawn.has(id)) push(`${label} "${id}" is a duplicate withdrawn ID`);
          seenWithdrawn.add(id);
        }
      });
    }

    // groupBlueprint: one entry per NCVEC group the mock exam draws from.
    // Keys must be valid group IDs using this pool's own prefix and must
    // correspond to groups that actually have enough real (non-withdrawn)
    // questions in the bank; values must be positive integers summing to
    // examQuestionCount. (A literal duplicate key cannot survive JSON
    // parsing -- the object shape itself rules that case out.)
    if (!isPlainObject(entry.groupBlueprint)) {
      push(`${at}.groupBlueprint must be an object mapping group IDs to positive integers`);
    } else {
      const groupKeysList = Object.keys(entry.groupBlueprint);
      if (groupKeysList.length === 0) {
        push(`${at}.groupBlueprint must not be empty`);
      }

      const groupCounts = {};
      bankQuestions[key].forEach((q) => {
        const id = q && q.id;
        if (typeof id !== "string" || id.length < 3) return;
        if (withdrawnIds.indexOf(id) !== -1) return;
        const g = id.slice(0, 3);
        groupCounts[g] = (groupCounts[g] || 0) + 1;
      });

      let blueprintTotal = 0;
      groupKeysList.forEach((g) => {
        const need = entry.groupBlueprint[g];
        const label = `${at}.groupBlueprint["${g}"]`;
        if (!GROUP_ID_RE.test(g)) {
          push(`${label}: key must be a 3-character group ID (pool letter + digit + letter)`);
        } else if (g[0] !== POOL_ID_PREFIX[key]) {
          push(`${label}: group "${g}" does not start with the ${key} pool prefix "${POOL_ID_PREFIX[key]}"`);
        }
        if (!Number.isInteger(need) || need < 1) {
          push(`${label} must be a positive integer, got ${JSON.stringify(need)}`);
          return;
        }
        blueprintTotal += need;
        const available = groupCounts[g] || 0;
        if (available < need) {
          push(`${label} needs ${need} question(s) but the ${key} bank has only ${available} available (after withdrawals)`);
        }
      });

      if (examCountOk && blueprintTotal !== entry.examQuestionCount) {
        push(`${at}.groupBlueprint totals ${blueprintTotal} but examQuestionCount is ${entry.examQuestionCount}`);
      }

      // scopeLabels: human-readable titles for study-scope's subelement/group
      // options (Stage 6A1). Identity is derived entirely from this pool's own
      // groupBlueprint keys -- never a second, independently-maintained list --
      // so a group can never exist in one without a corresponding entry in the
      // other. Only validated when groupBlueprint itself is well-formed enough
      // to derive an expected key set from.
      const expectedGroups = groupKeysList.filter((g) => GROUP_ID_RE.test(g) && g[0] === POOL_ID_PREFIX[key]);
      const expectedSubelements = Array.from(new Set(expectedGroups.map((g) => g.slice(0, 2))));
      validateScopeLabels(entry.scopeLabels, at, expectedSubelements, expectedGroups, push);
    }

    if (entry.questionIdPrefix !== POOL_ID_PREFIX[key]) {
      push(`${at}.questionIdPrefix must be "${POOL_ID_PREFIX[key]}", got ${JSON.stringify(entry.questionIdPrefix)}`);
    }

    // sourceUrl must parse as a URL with an exact "https:" protocol and a
    // non-empty hostname. Parsing is guarded so malformed input adds a
    // diagnostic instead of throwing.
    let urlOk = false;
    if (typeof entry.sourceUrl === "string") {
      try {
        const parsed = new URL(entry.sourceUrl);
        urlOk = parsed.protocol === "https:" && parsed.hostname.length > 0;
      } catch (error) {
        urlOk = false;
      }
    }
    if (!urlOk) {
      push(`${at}.sourceUrl must be a valid "https://" URL with a hostname`);
    }
    if (!isNonBlankString(entry.errataLabel)) {
      push(`${at}.errataLabel must be a non-blank string`);
    }

    // Cross-check the entry against the bank's question IDs and subelements.
    const seen = new Set();
    bankQuestions[key].forEach((question, index) => {
      const id = question && question.id;
      const label = `${at}: question ${typeof id === "string" ? `"${id}"` : `at index ${index}`}`;
      if (typeof id !== "string" || !QUESTION_ID_RE.test(id)) {
        push(`${label} has an invalid question ID (expected ${QUESTION_ID_RE})`);
      } else {
        if (id[0] !== POOL_ID_PREFIX[key]) {
          push(`${label} does not start with the ${key} pool prefix "${POOL_ID_PREFIX[key]}"`);
        }
        if (seen.has(id)) push(`${label} has a duplicate question ID`);
        seen.add(id);
        // Structural consistency: subelement [prefix][digit] and group
        // [prefix][digit][A-Z] prefixes are derived from the ID itself.
        if (question.sub !== id.slice(0, 2)) {
          push(`${label} has sub ${JSON.stringify(question.sub)}, expected "${id.slice(0, 2)}"`);
        }
      }
    });
  }

  errors.sort();
  return { errors };
}

// Throw a single Error listing every validation error. Never mutates inputs.
function assertPoolRegistry(registry, banks) {
  const { errors } = validatePoolRegistry(registry, banks);
  if (errors.length) {
    throw new Error(
      `Pool registry validation failed (${errors.length} error${errors.length === 1 ? "" : "s"}):\n- ` +
      errors.join("\n- ")
    );
  }
}

module.exports = {
  SCHEMA_VERSION,
  POOL_KEYS,
  POOL_ID_PREFIX,
  REGISTRY_ROOT_KEYS,
  POOL_ENTRY_KEYS,
  QUESTION_ID_RE,
  GROUP_ID_RE,
  MAX_DEFAULT_TIME_LIMIT_SECONDS,
  SCOPE_LABELS_KEYS,
  MAX_SCOPE_LABEL_LENGTH,
  isValidIsoDate,
  validateScopeLabels,
  validatePoolRegistry,
  assertPoolRegistry
};
