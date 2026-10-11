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

// ---------------------------------------------------------------------------
// ID policy seam (Stage 8A2, docs/EDITION_BUILDS_DESIGN.md)
// ---------------------------------------------------------------------------

// The two supported question-ID policies. "us" (the default) is byte-for-byte
// today's behavior: POOL_KEYS identity, T/G-E prefix pins, and the NCVEC
// ID/group shapes below. "generic" keeps every structural check (schema,
// dates, counts vs banks, blueprint sums, scoring fields, uniqueness,
// scopeLabels coverage, sub consistency) but replaces the US identity shapes
// with prefix- and metadata-driven rules, for a non-US edition whose keys and
// IDs follow no NCVEC convention. POOL_KEYS itself stays the US source of
// truth and is never redefined per policy.
const ID_POLICIES = Object.freeze(["us", "generic"]);

// Generic-policy pool-key shape: a stable, lowercase, hyphen-separated
// identifier, same shape discipline as the edition key.
const GENERIC_POOL_KEY_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

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
function normalizeBanks(banks, keys) {
  const out = {};
  for (const key of keys) {
    const entry = banks && banks[key];
    if (Array.isArray(entry)) out[key] = entry;
    else if (entry && Array.isArray(entry.questions)) out[key] = entry.questions;
    else out[key] = [];
  }
  return out;
}

// Longest configured key that `value` starts with (deterministic when keys
// overlap), mirroring src/study-scope.js's own group/subelement resolution
// rule -- the generic ID policy derives group and subelement identity from
// the registry metadata exactly the way the runtime does. Empty keys are
// ignored so they can never claim every ID. Returns null when nothing matches.
function longestKeyPrefix(value, keys) {
  let best = null;
  for (const k of keys) {
    if (typeof k === "string" && k.length > 0 && value.indexOf(k) === 0 &&
        (best === null || k.length > best.length)) {
      best = k;
    }
  }
  return best;
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
// `options.idPolicy` (Stage 8A2 seam) selects the question-ID identity rules:
// "us" (default) is byte-for-byte the historical behavior; "generic" keeps
// all structural validation but replaces the US identity shapes with
// prefix/metadata-driven rules (see ID_POLICIES above).
function validatePoolRegistry(registry, banks, options) {
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

  const requestedPolicy = options && Object.prototype.hasOwnProperty.call(options, "idPolicy")
    ? options.idPolicy
    : "us";
  if (ID_POLICIES.indexOf(requestedPolicy) === -1) {
    push(`registry: idPolicy must be one of: ${ID_POLICIES.join(", ")}, got ${JSON.stringify(requestedPolicy)}`);
  }
  const isGeneric = requestedPolicy === "generic";

  // Exact pool-key set: no missing, no extra. Under the "us" policy the set
  // is the hardcoded POOL_KEYS; under "generic" it is derived from the
  // registry/bank key union (each side must match the other exactly) and every
  // key must be a unique non-empty lowercase-hyphen string.
  const registryKeys = Object.keys(registry.pools);
  let poolKeys;
  if (isGeneric) {
    const bankKeys = isPlainObject(banks) ? Object.keys(banks) : [];
    poolKeys = Array.from(new Set(registryKeys.concat(bankKeys))).sort();
    for (const key of poolKeys) {
      if (!Object.prototype.hasOwnProperty.call(registry.pools, key)) {
        push(`registry.pools: unknown pool key "${key}" (present in the banks but not the registry)`);
      } else if (!GENERIC_POOL_KEY_RE.test(key)) {
        push(`registry.pools: pool key "${key}" must be a lowercase, hyphen-separated identifier`);
      }
      if (!isPlainObject(banks) || !Object.prototype.hasOwnProperty.call(banks, key)) {
        push(`registry.pools: pool "${key}" has no entry in the banks`);
      }
    }
  } else {
    poolKeys = POOL_KEYS;
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
  }

  const bankQuestions = normalizeBanks(banks, poolKeys);
  const editionIds = new Map();   // editionId -> pool key
  const identityPairs = new Map(); // editionId|revisionId -> pool key

  for (const key of poolKeys) {
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

    // Identity: under "us", editionId follows "<poolKey>-<startYear>-<endYear>",
    // its pool prefix matches the registry key, and its years agree with the
    // effective range; revisionId is a stable errata slug. Under "generic",
    // both are just non-blank strings -- but cross-pool uniqueness of each,
    // and of the identity pair, is structural and stays enforced under both
    // policies.
    let editionOk = false;
    let revisionOk = false;
    if (!isGeneric) {
      const editionMatch = typeof entry.editionId === "string" && entry.editionId.match(EDITION_ID_RE);
      if (!editionMatch) {
        push(`${at}.editionId must match "<poolKey>-<startYear>-<endYear>" (e.g. "${key}-2026-2030"), got ${JSON.stringify(entry.editionId)}`);
      } else {
        editionOk = true;
        if (editionMatch[1] !== key) {
          push(`${at}.editionId "${entry.editionId}" is a "${editionMatch[1]}" edition, not "${key}"`);
        }
        if (startOk && endOk &&
            (editionMatch[2] !== entry.effectiveStart.slice(0, 4) ||
             editionMatch[3] !== entry.effectiveEnd.slice(0, 4))) {
          push(`${at}.editionId "${entry.editionId}" does not agree with the effective range ${entry.effectiveStart}..${entry.effectiveEnd}`);
        }
      }
      const revisionMatch = typeof entry.revisionId === "string" && entry.revisionId.match(REVISION_ID_RE);
      if (!revisionMatch) {
        push(`${at}.revisionId must match "errata-YYYY-MM-DD" with an optional "-N" suffix, got ${JSON.stringify(entry.revisionId)}`);
      } else {
        revisionOk = true;
        if (!isValidIsoDate(`${revisionMatch[1]}-${revisionMatch[2]}-${revisionMatch[3]}`)) {
          push(`${at}.revisionId "${entry.revisionId}" does not contain a real calendar date`);
        }
      }
    } else {
      if (!isNonBlankString(entry.editionId)) {
        push(`${at}.editionId must be a non-blank string, got ${JSON.stringify(entry.editionId)}`);
      } else {
        editionOk = true;
      }
      if (!isNonBlankString(entry.revisionId)) {
        push(`${at}.revisionId must be a non-blank string, got ${JSON.stringify(entry.revisionId)}`);
      } else {
        revisionOk = true;
      }
    }
    if (editionOk) {
      const prev = editionIds.get(entry.editionId);
      if (prev !== undefined) {
        push(`${at}.editionId "${entry.editionId}" is also used by pool "${prev}"`);
      } else {
        editionIds.set(entry.editionId, key);
      }
    }
    if (editionOk && revisionOk) {
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
    // "us" pins the NCVEC ID shape and pool letter; "generic" requires a
    // non-empty string under this pool's own questionIdPrefix.
    let withdrawnIds = [];
    if (!Array.isArray(entry.withdrawnIds)) {
      push(`${at}.withdrawnIds must be an array`);
    } else {
      withdrawnIds = entry.withdrawnIds;
      const seenWithdrawn = new Set();
      withdrawnIds.forEach((id, i) => {
        const label = `${at}.withdrawnIds[${i}]`;
        if (!isGeneric) {
          if (typeof id !== "string" || !QUESTION_ID_RE.test(id)) {
            push(`${label} must be a valid question ID (expected ${QUESTION_ID_RE})`);
          } else {
            if (id[0] !== POOL_ID_PREFIX[key]) {
              push(`${label} "${id}" does not start with the ${key} pool prefix "${POOL_ID_PREFIX[key]}"`);
            }
            if (seenWithdrawn.has(id)) push(`${label} "${id}" is a duplicate withdrawn ID`);
            seenWithdrawn.add(id);
          }
        } else {
          if (typeof id !== "string" || id.length === 0) {
            push(`${label} must be a non-empty string, got ${JSON.stringify(id)}`);
          } else {
            if (id.indexOf(entry.questionIdPrefix) !== 0) {
              push(`${label} "${id}" does not start with the ${key} pool prefix ${JSON.stringify(entry.questionIdPrefix)}`);
            }
            if (seenWithdrawn.has(id)) push(`${label} "${id}" is a duplicate withdrawn ID`);
            seenWithdrawn.add(id);
          }
        }
      });
    }

    // groupBlueprint: one entry per group the mock exam draws from. Values
    // must be positive integers summing to examQuestionCount. "us" pins keys
    // to the NCVEC 3-character group-ID shape with this pool's prefix;
    // "generic" accepts any non-empty string, resolving bank questions to
    // their group by longest-prefix match -- the runtime's own rule. Keys
    // must correspond to groups that actually have enough real (non-withdrawn)
    // questions in the bank either way. (A literal duplicate key cannot
    // survive JSON parsing -- the object shape itself rules that case out.)
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
        if (typeof id !== "string" || id.length < (isGeneric ? 1 : 3)) return;
        if (withdrawnIds.indexOf(id) !== -1) return;
        let g;
        if (isGeneric) {
          // Count only questions this pool claims (prefix + group resolution);
          // wrong-prefix and unclaimed IDs are reported by the cross-check
          // below, not here.
          if (id.indexOf(entry.questionIdPrefix) !== 0) return;
          g = longestKeyPrefix(id, groupKeysList);
          if (g === null) return;
        } else {
          g = id.slice(0, 3);
        }
        groupCounts[g] = (groupCounts[g] || 0) + 1;
      });

      let blueprintTotal = 0;
      groupKeysList.forEach((g) => {
        const need = entry.groupBlueprint[g];
        const label = `${at}.groupBlueprint["${g}"]`;
        if (!isGeneric) {
          if (!GROUP_ID_RE.test(g)) {
            push(`${label}: key must be a 3-character group ID (pool letter + digit + letter)`);
          } else if (g[0] !== POOL_ID_PREFIX[key]) {
            push(`${label}: group "${g}" does not start with the ${key} pool prefix "${POOL_ID_PREFIX[key]}"`);
          }
        } else if (!isNonBlankString(g)) {
          push(`${label}: key must be a non-empty string, got ${JSON.stringify(g)}`);
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
      // to derive an expected key set from. Under "us" the subelement set is
      // the groups' [prefix][digit] slice; under "generic" it is the
      // longest-prefix subelement each group resolves to (mirroring
      // src/study-scope.js).
      const expectedGroups = isGeneric
        ? groupKeysList.filter((g) => isNonBlankString(g))
        : groupKeysList.filter((g) => GROUP_ID_RE.test(g) && g[0] === POOL_ID_PREFIX[key]);
      let expectedSubelements;
      if (isGeneric) {
        const subLabelKeys = isPlainObject(entry.scopeLabels) &&
          isPlainObject(entry.scopeLabels.subelements)
          ? Object.keys(entry.scopeLabels.subelements)
          : [];
        expectedSubelements = Array.from(new Set(
          expectedGroups.map((g) => longestKeyPrefix(g, subLabelKeys)).filter((s) => s !== null)
        ));
      } else {
        expectedSubelements = Array.from(new Set(expectedGroups.map((g) => g.slice(0, 2))));
      }
      validateScopeLabels(entry.scopeLabels, at, expectedSubelements, expectedGroups, push);
    }

    if (!isGeneric) {
      if (entry.questionIdPrefix !== POOL_ID_PREFIX[key]) {
        push(`${at}.questionIdPrefix must be "${POOL_ID_PREFIX[key]}", got ${JSON.stringify(entry.questionIdPrefix)}`);
      }
    } else if (!isNonBlankString(entry.questionIdPrefix)) {
      push(`${at}.questionIdPrefix must be a non-blank string, got ${JSON.stringify(entry.questionIdPrefix)}`);
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
    // "us" pins the NCVEC ID shape and derives sub/group from the ID itself;
    // "generic" requires unique non-empty IDs under this pool's prefix, every
    // ID claimed by some groupBlueprint key (longest-prefix, the runtime's
    // resolution rule), and a sub equal to the longest matching
    // scopeLabels.subelements key of the resolved group.
    const seen = new Set();
    bankQuestions[key].forEach((question, index) => {
      const id = question && question.id;
      const label = `${at}: question ${typeof id === "string" ? `"${id}"` : `at index ${index}`}`;
      if (!isGeneric) {
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
      } else {
        if (typeof id !== "string" || id.length === 0) {
          push(`${label} has an invalid question ID (must be a non-empty string)`);
          return;
        }
        if (id.indexOf(entry.questionIdPrefix) !== 0) {
          push(`${label} does not start with the ${key} pool prefix ${JSON.stringify(entry.questionIdPrefix)}`);
        }
        if (seen.has(id)) push(`${label} has a duplicate question ID`);
        seen.add(id);
        const blueprint = isPlainObject(entry.groupBlueprint) ? entry.groupBlueprint : null;
        const group = blueprint ? longestKeyPrefix(id, Object.keys(blueprint)) : null;
        if (group === null) {
          push(`${label} is not claimed by any groupBlueprint key of pool "${key}"`);
          return;
        }
        const subKeys = isPlainObject(entry.scopeLabels) &&
          isPlainObject(entry.scopeLabels.subelements)
          ? Object.keys(entry.scopeLabels.subelements)
          : [];
        const expectedSub = longestKeyPrefix(group, subKeys);
        if (expectedSub === null) {
          push(`${label} resolves to group "${group}" but no scopeLabels.subelements key claims that group`);
        } else if (question.sub !== expectedSub) {
          push(`${label} has sub ${JSON.stringify(question.sub)}, expected "${expectedSub}" (longest matching subelement for group "${group}")`);
        }
      }
    });
  }

  errors.sort();
  return { errors };
}

// Throw a single Error listing every validation error. Never mutates inputs.
function assertPoolRegistry(registry, banks, options) {
  const { errors } = validatePoolRegistry(registry, banks, options);
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
  ID_POLICIES,
  GENERIC_POOL_KEY_RE,
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
