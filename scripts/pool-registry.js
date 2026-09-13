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

const SCHEMA_VERSION = 1;

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
  "errataLabel"
]);

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
  isValidIsoDate,
  validatePoolRegistry,
  assertPoolRegistry
};
