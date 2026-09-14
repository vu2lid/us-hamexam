(function(global) {
  "use strict";

  // Stage 4A1 pure versioned-storage module. Full rationale/API narration:
  // docs/POOL_STORAGE_PLAN.md "Stage 4A1 outcome".
  //
  // Same browser/Node pattern as src/exam-engine.js (plain ES5 script;
  // `require()` in Node returns { HAM_EXAM_STORAGE }, a browser gets
  // `window.HAM_EXAM_STORAGE`). Loading this file does no I/O and touches no
  // storage -- real access only happens via an explicit createStorageAdapter()
  // load()/save() call. NOT wired into src/app.js yet (Stage 4A2). ES5 only:
  // no arrow functions/let/const/template literals/Object.assign/Set/Map/
  // Number.isFinite, matching exam-engine.js/app.js's target browsers.

  // ---------------------------------------------------------------------------
  // Contract constants
  // ---------------------------------------------------------------------------

  var SCHEMA_VERSION = 1;
  var STORAGE_KEY = "ham-exam-state";

  // Matches scripts/pool-registry.js's hardcoded POOL_KEYS. A registry/banks
  // pair missing any of these is a caller error (assertRegistryAndBanks),
  // not adversarial data -- unlike storage content, registry/banks are
  // build-time trusted inputs already Stage-4A0-validated.
  var POOL_KEYS = ["technician", "general", "extra"];
  var DEFAULT_POOL_KEY = "technician";

  var THEMES = ["light", "dark", "night"];
  var DEFAULT_THEME = "light";

  var RECALL_SECONDS_VALUES = [0, 5, 10, 15, 20, 30, 60];
  var DEFAULT_RECALL_SECONDS = 10;

  // null means "use the pool's default"; 0 explicitly means no timer.
  var EXAM_TIMER_SECONDS_VALUES = [0, 900, 1800, 2100, 3000, 3600];
  var DEFAULT_EXAM_TIMER_SECONDS = null;

  // Existing src/app.js localStorage keys -- read-only here; never rewritten.
  var LEGACY_POOL_KEY = "ham-exam-pool";
  var LEGACY_THEME_KEY = "ham-exam-theme";
  function legacyIndexKey(poolKey) { return "ham-exam-index-" + poolKey; }
  function legacyBookmarksKey(poolKey) { return "ham-exam-bookmarks-" + poolKey; }

  // Bounds every array/map/string parsed from storage, so a corrupted or
  // adversarial value cannot force unbounded work: max raw JSON string
  // length (canonical value / one legacy bookmarks value / a write), max
  // editionId/revisionId/question-ID string length, max bookmark list
  // length (also how many raw entries are scanned before the rest are
  // ignored -- above the largest current pool, 599), max legacy index
  // digit-string length before numeric conversion.
  var BOUNDS = {
    MAX_STORAGE_VALUE_LENGTH: 65536,
    MAX_ID_LENGTH: 40,
    MAX_BOOKMARKS_PER_POOL: 1000,
    MAX_LEGACY_INDEX_DIGITS: 10
  };

  // Stable, documented status values -- always one of these, never an
  // ambiguous boolean.
  var STATUS = {
    VALID: "valid",
    RECONCILED: "reconciled",
    MIGRATED: "migrated",
    FUTURE_SCHEMA: "future-schema",
    UNSUPPORTED_SCHEMA: "unsupported-schema",
    UNAVAILABLE: "storage-unavailable",
    // getItem() of the canonical key threw (distinct from "absent" null):
    // load()/save() fail closed rather than risk treating a hidden value
    // (possibly a future schema) as if nothing were there.
    READ_ERROR: "read-error",
    OK: "ok",
    INVALID: "invalid",
    SERIALIZE_ERROR: "serialize-error",
    WRITE_ERROR: "write-error",
    READ_BACK_ERROR: "read-back-error",
    READ_BACK_MISMATCH: "read-back-mismatch"
  };

  var ROOT_KEYS = { schemaVersion: true, preferences: true, study: true };
  var PREFERENCES_KEYS = { theme: true, recallSeconds: true, examTimerSeconds: true };
  var STUDY_KEYS = { activePool: true, pools: true };
  var POOL_ENTRY_KEYS = {
    editionId: true, revisionId: true, currentQuestionId: true,
    bookmarks: true, scope: true, positions: true
  };
  var SCOPE_KEYS = { level: true, id: true };
  var POSITIONS_KEYS = { all: true };

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------

  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function unknownKeys(obj, allowed) {
    var out = [];
    for (var k in obj) {
      if (hasOwn(obj, k) && !hasOwn(allowed, k)) out.push(k);
    }
    return out;
  }

  function indexOf(list, value) {
    for (var i = 0; i < list.length; i++) {
      if (list[i] === value) return i;
    }
    return -1;
  }

  function isBoundedString(value) {
    return typeof value === "string" && value.length > 0 && value.length <= BOUNDS.MAX_ID_LENGTH;
  }

  // Object.assign equivalent (ES5).
  function extend(base, overrides) {
    var out = {};
    var k;
    for (k in base) { if (hasOwn(base, k)) out[k] = base[k]; }
    for (k in overrides) { if (hasOwn(overrides, k)) out[k] = overrides[k]; }
    return out;
  }

  // Accepts a bare question array or `{ questions: [...] }` (matches
  // pool-registry.js's normalizeBanks). Null if nothing usable.
  function bankQuestionsArray(entry) {
    if (Array.isArray(entry)) return entry.length > 0 ? entry : null;
    if (entry && Array.isArray(entry.questions) && entry.questions.length > 0) return entry.questions;
    return null;
  }

  function bankIdList(banks, poolKey) {
    var questions = bankQuestionsArray(banks[poolKey]) || [];
    var out = [];
    for (var i = 0; i < questions.length; i++) {
      var q = questions[i];
      if (q && typeof q.id === "string") out.push(q.id);
    }
    return out;
  }

  function bankIdSet(banks, poolKey) {
    var ids = bankIdList(banks, poolKey);
    var set = {};
    for (var i = 0; i < ids.length; i++) set[ids[i]] = true;
    return set;
  }

  function firstQuestionId(banks, poolKey) {
    var ids = bankIdList(banks, poolKey);
    return ids.length > 0 ? ids[0] : null;
  }

  // registry/banks are trusted build-time inputs; a malformed pair is a
  // caller bug, so this throws a clear Error rather than failing obscurely.
  function assertRegistryAndBanks(registry, banks) {
    if (!isPlainObject(registry) || !isPlainObject(registry.pools)) {
      throw new TypeError('storage: registry must be an object with a "pools" map');
    }
    if (!isPlainObject(banks)) {
      throw new TypeError("storage: banks must be an object keyed by pool");
    }
    for (var i = 0; i < POOL_KEYS.length; i++) {
      var key = POOL_KEYS[i];
      var entry = registry.pools[key];
      if (!isPlainObject(entry) || typeof entry.editionId !== "string" || typeof entry.revisionId !== "string") {
        throw new TypeError('storage: registry.pools["' + key + '"] must have string editionId/revisionId');
      }
      if (!bankQuestionsArray(banks[key])) {
        throw new TypeError('storage: banks["' + key + '"] must provide a non-empty questions array');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Safe parse / serialize
  // ---------------------------------------------------------------------------

  // Never throws; undefined for absent/wrong-type/oversized/malformed input.
  function safeParseJson(raw) {
    if (typeof raw !== "string" || raw.length === 0 || raw.length > BOUNDS.MAX_STORAGE_VALUE_LENGTH) {
      return undefined;
    }
    try {
      return JSON.parse(raw);
    } catch (e) {
      return undefined;
    }
  }

  // Never throws; undefined for unserializable (e.g. cyclic) or oversized input.
  function safeSerialize(value) {
    var json;
    try {
      json = JSON.stringify(value);
    } catch (e) {
      return undefined;
    }
    if (typeof json !== "string" || json.length > BOUNDS.MAX_STORAGE_VALUE_LENGTH) {
      return undefined;
    }
    return json;
  }

  // Strict decimal-integer-string parser: only ASCII digits, no sign/decimal/
  // exponent/whitespace, bounded length (rejects "2junk", "-1", "1.5", "1e3",
  // " 1", etc.). An explicit char scan, not an anchored regex -- a regex end
  // anchor also matches just before a trailing newline, which would wrongly
  // accept "123\n".
  function parseStrictLegacyIndex(raw) {
    if (typeof raw !== "string" || raw.length === 0 || raw.length > BOUNDS.MAX_LEGACY_INDEX_DIGITS) {
      return null;
    }
    for (var i = 0; i < raw.length; i++) {
      var c = raw.charCodeAt(i);
      if (c < 48 || c > 57) return null; // not '0'-'9'
    }
    var n = Number(raw); // defense-in-depth; an all-digit bounded string is always a finite integer
    if (!isFinite(n) || Math.floor(n) !== n) return null;
    return n;
  }

  // Parses a legacy bookmarks JSON array, bounded. Null (not []) means
  // "nothing usable", distinct from "present but legitimately empty".
  function parseStrictLegacyBookmarks(raw) {
    var parsed = safeParseJson(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.length > BOUNDS.MAX_BOOKMARKS_PER_POOL
      ? parsed.slice(0, BOUNDS.MAX_BOOKMARKS_PER_POOL)
      : parsed;
  }

  // Bounded, deduplicated, first-seen-order valid IDs from a raw array.
  function filterValidIds(rawArray, idSet) {
    var bounded = rawArray.length > BOUNDS.MAX_BOOKMARKS_PER_POOL
      ? rawArray.slice(0, BOUNDS.MAX_BOOKMARKS_PER_POOL)
      : rawArray;
    var seen = {};
    var out = [];
    for (var i = 0; i < bounded.length && out.length < BOUNDS.MAX_BOOKMARKS_PER_POOL; i++) {
      var id = bounded[i];
      if (isBoundedString(id) && idSet[id] && !hasOwn(seen, id)) {
        seen[id] = true;
        out.push(id);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Default state
  // ---------------------------------------------------------------------------

  // A fresh pool entry: current registry edition/revision, first question,
  // no bookmarks, default (only supported) scope.
  function freshPoolState(poolKey, registryEntry, banks) {
    var firstId = firstQuestionId(banks, poolKey);
    if (firstId === null) {
      throw new TypeError('storage: bank for "' + poolKey + '" has no usable question IDs');
    }
    return {
      editionId: registryEntry.editionId,
      revisionId: registryEntry.revisionId,
      currentQuestionId: firstId,
      bookmarks: [],
      scope: { level: "all", id: null },
      positions: { all: firstId }
    };
  }

  // Fresh, fully valid canonical state: default preferences, Technician
  // active, all pools at their first question with no bookmarks. Does not
  // mutate registry/banks.
  function createDefaultState(registry, banks) {
    assertRegistryAndBanks(registry, banks);
    var pools = {};
    for (var i = 0; i < POOL_KEYS.length; i++) {
      var key = POOL_KEYS[i];
      pools[key] = freshPoolState(key, registry.pools[key], banks);
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      preferences: {
        theme: DEFAULT_THEME,
        recallSeconds: DEFAULT_RECALL_SECONDS,
        examTimerSeconds: DEFAULT_EXAM_TIMER_SECONDS
      },
      study: {
        activePool: DEFAULT_POOL_KEY,
        pools: pools
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Strict validation (pure)
  // ---------------------------------------------------------------------------

  // Strictly validates state against the CURRENT registry/banks: exact
  // schemaVersion; exact key sets at every level (root/preferences/study/
  // pool-entry/scope/positions); allowed preference values; the three pools,
  // each with editionId/revisionId EQUAL to the registry's current values
  // (a drifted identity is "not yet reconciled", not "invalid" -- see
  // reconcileState); currentQuestionId/positions.all/bookmarks present in
  // that pool's bank, bounded and deduplicated. Returns { errors } (empty =
  // valid), sorted. Never mutates its inputs.
  function validateState(state, registry, banks) {
    assertRegistryAndBanks(registry, banks);
    var errors = [];
    var push = function(m) { errors.push(m); };

    if (!isPlainObject(state)) {
      return { errors: ["state: root must be an object"] };
    }
    var rootExtra = unknownKeys(state, ROOT_KEYS);
    if (rootExtra.length) push("state: unknown key(s): " + rootExtra.join(", "));
    if (state.schemaVersion !== SCHEMA_VERSION) {
      push("state.schemaVersion must be " + SCHEMA_VERSION + ", got " + JSON.stringify(state.schemaVersion));
    }

    if (!isPlainObject(state.preferences)) {
      push("state.preferences must be an object");
    } else {
      var prefs = state.preferences;
      var prefExtra = unknownKeys(prefs, PREFERENCES_KEYS);
      if (prefExtra.length) push("state.preferences: unknown key(s): " + prefExtra.join(", "));
      if (indexOf(THEMES, prefs.theme) === -1) {
        push("state.preferences.theme must be one of " + THEMES.join(", ") + ", got " + JSON.stringify(prefs.theme));
      }
      if (indexOf(RECALL_SECONDS_VALUES, prefs.recallSeconds) === -1) {
        push("state.preferences.recallSeconds must be one of " + RECALL_SECONDS_VALUES.join(", ") +
          ", got " + JSON.stringify(prefs.recallSeconds));
      }
      if (prefs.examTimerSeconds !== null && indexOf(EXAM_TIMER_SECONDS_VALUES, prefs.examTimerSeconds) === -1) {
        push("state.preferences.examTimerSeconds must be null or one of " +
          EXAM_TIMER_SECONDS_VALUES.join(", ") + ", got " + JSON.stringify(prefs.examTimerSeconds));
      }
    }

    if (!isPlainObject(state.study)) {
      push("state.study must be an object");
    } else {
      var study = state.study;
      var studyExtra = unknownKeys(study, STUDY_KEYS);
      if (studyExtra.length) push("state.study: unknown key(s): " + studyExtra.join(", "));
      if (indexOf(POOL_KEYS, study.activePool) === -1) {
        push("state.study.activePool must be one of " + POOL_KEYS.join(", ") + ", got " + JSON.stringify(study.activePool));
      }
      if (!isPlainObject(study.pools)) {
        push("state.study.pools must be an object");
      } else {
        var present = Object.keys(study.pools);
        var i, key;
        for (i = 0; i < POOL_KEYS.length; i++) {
          if (indexOf(present, POOL_KEYS[i]) === -1) {
            push('state.study.pools: missing required pool "' + POOL_KEYS[i] + '"');
          }
        }
        for (i = 0; i < present.length; i++) {
          if (indexOf(POOL_KEYS, present[i]) === -1) {
            push('state.study.pools: unknown pool key "' + present[i] + '"');
          }
        }
        for (i = 0; i < POOL_KEYS.length; i++) {
          key = POOL_KEYS[i];
          if (indexOf(present, key) === -1) continue;
          validatePoolEntry(key, study.pools[key], registry.pools[key], banks, push);
        }
      }
    }

    errors.sort();
    return { errors: errors };
  }

  function validatePoolEntry(poolKey, entry, registryEntry, banks, push) {
    var at = 'state.study.pools["' + poolKey + '"]';
    if (!isPlainObject(entry)) { push(at + " must be an object"); return; }

    var extra = unknownKeys(entry, POOL_ENTRY_KEYS);
    if (extra.length) push(at + ": unknown key(s): " + extra.join(", "));

    if (entry.editionId !== registryEntry.editionId) {
      push(at + '.editionId must equal the registry edition "' + registryEntry.editionId +
        '", got ' + JSON.stringify(entry.editionId));
    }
    if (entry.revisionId !== registryEntry.revisionId) {
      push(at + '.revisionId must equal the registry revision "' + registryEntry.revisionId +
        '", got ' + JSON.stringify(entry.revisionId));
    }

    var ids = bankIdSet(banks, poolKey);

    if (!isBoundedString(entry.currentQuestionId) || !hasOwn(ids, entry.currentQuestionId)) {
      push(at + ".currentQuestionId must be a question ID in the " + poolKey + " bank");
    }

    if (!Array.isArray(entry.bookmarks)) {
      push(at + ".bookmarks must be an array");
    } else if (entry.bookmarks.length > BOUNDS.MAX_BOOKMARKS_PER_POOL) {
      push(at + ".bookmarks exceeds the maximum of " + BOUNDS.MAX_BOOKMARKS_PER_POOL + " entries");
    } else {
      var seen = {};
      for (var i = 0; i < entry.bookmarks.length; i++) {
        var id = entry.bookmarks[i];
        if (!isBoundedString(id) || !hasOwn(ids, id)) {
          push(at + ".bookmarks[" + i + "] must be a question ID in the " + poolKey + " bank");
        } else if (hasOwn(seen, id)) {
          push(at + ".bookmarks[" + i + '] duplicates "' + id + '"');
        }
        if (typeof id === "string") seen[id] = true;
      }
    }

    if (!isPlainObject(entry.scope)) {
      push(at + ".scope must be an object");
    } else {
      var scopeExtra = unknownKeys(entry.scope, SCOPE_KEYS);
      if (scopeExtra.length) push(at + ".scope: unknown key(s): " + scopeExtra.join(", "));
      // Only "all" is supported until scoped study ships (SCOPED_STUDY_PLAN.md).
      if (entry.scope.level !== "all") push(at + '.scope.level must be "all"');
      if (entry.scope.id !== null) push(at + ".scope.id must be null");
    }

    if (!isPlainObject(entry.positions)) {
      push(at + ".positions must be an object");
    } else {
      var posExtra = unknownKeys(entry.positions, POSITIONS_KEYS);
      if (posExtra.length) push(at + ".positions: unknown key(s): " + posExtra.join(", "));
      if (!isBoundedString(entry.positions.all) || !hasOwn(ids, entry.positions.all)) {
        push(at + ".positions.all must be a question ID in the " + poolKey + " bank");
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Normalization (pure, lenient, never fails)
  // ---------------------------------------------------------------------------

  // Repairs arbitrary/garbage input into a fully valid schema-1 state, field
  // by field, using the CURRENT registry/banks as defaults: bad preferences
  // and activePool fall back to defaults, a missing pool is reconstructed,
  // a missing/invalid editionId/revisionId falls back to the registry's
  // current value (does NOT compare a present editionId to decide same-vs-
  // replaced edition -- that's reconcileState's job, layered on top), an
  // invalid current question/position falls back to the first question, and
  // bookmarks are filtered/bounded/deduplicated. Unknown fields are dropped.
  // Never throws for bad `state`; never mutates its inputs. Returns { state }.
  function normalizeState(state, registry, banks) {
    assertRegistryAndBanks(registry, banks);
    var src = isPlainObject(state) ? state : {};
    var srcPrefs = isPlainObject(src.preferences) ? src.preferences : {};
    var srcStudy = isPlainObject(src.study) ? src.study : {};
    var srcPools = isPlainObject(srcStudy.pools) ? srcStudy.pools : {};

    var theme = (typeof srcPrefs.theme === "string" && indexOf(THEMES, srcPrefs.theme) !== -1)
      ? srcPrefs.theme : DEFAULT_THEME;
    var recallSeconds = (indexOf(RECALL_SECONDS_VALUES, srcPrefs.recallSeconds) !== -1)
      ? srcPrefs.recallSeconds : DEFAULT_RECALL_SECONDS;
    var examTimerSeconds = (srcPrefs.examTimerSeconds === null ||
        indexOf(EXAM_TIMER_SECONDS_VALUES, srcPrefs.examTimerSeconds) !== -1)
      ? srcPrefs.examTimerSeconds : DEFAULT_EXAM_TIMER_SECONDS;

    var activePool = (indexOf(POOL_KEYS, srcStudy.activePool) !== -1) ? srcStudy.activePool : DEFAULT_POOL_KEY;

    var pools = {};
    for (var i = 0; i < POOL_KEYS.length; i++) {
      var key = POOL_KEYS[i];
      pools[key] = normalizePoolEntry(srcPools[key], registry.pools[key], banks, key);
    }

    return {
      state: {
        schemaVersion: SCHEMA_VERSION,
        preferences: { theme: theme, recallSeconds: recallSeconds, examTimerSeconds: examTimerSeconds },
        study: { activePool: activePool, pools: pools }
      }
    };
  }

  function normalizePoolEntry(entry, registryEntry, banks, poolKey) {
    var src = isPlainObject(entry) ? entry : {};
    var idSet = bankIdSet(banks, poolKey);
    var firstId = firstQuestionId(banks, poolKey);
    if (firstId === null) {
      throw new TypeError('storage: bank for "' + poolKey + '" has no usable question IDs');
    }

    var editionId = isBoundedString(src.editionId) ? src.editionId : registryEntry.editionId;
    var revisionId = isBoundedString(src.revisionId) ? src.revisionId : registryEntry.revisionId;

    var currentQuestionId = (isBoundedString(src.currentQuestionId) && hasOwn(idSet, src.currentQuestionId))
      ? src.currentQuestionId : firstId;

    var rawBookmarks = Array.isArray(src.bookmarks) ? src.bookmarks : [];
    var bookmarks = filterValidIds(rawBookmarks, idSet);

    var scope = { level: "all", id: null }; // only supported scope for now

    var positionsAll = (isPlainObject(src.positions) && isBoundedString(src.positions.all) &&
        hasOwn(idSet, src.positions.all))
      ? src.positions.all : firstId;

    return {
      editionId: editionId,
      revisionId: revisionId,
      currentQuestionId: currentQuestionId,
      bookmarks: bookmarks,
      scope: scope,
      positions: { all: positionsAll }
    };
  }

  // ---------------------------------------------------------------------------
  // Legacy migration (pure, deterministic, idempotent)
  // ---------------------------------------------------------------------------

  // legacySnapshot is a plain object keyed by the exact legacy localStorage
  // key strings (LEGACY_POOL_KEY/LEGACY_THEME_KEY/legacyIndexKey(pool)/
  // legacyBookmarksKey(pool)) -> raw string or null/undefined, exactly what
  // an adapter assembles from real getItem() calls.
  //
  // Starts from createDefaultState (attributes every pool to the registry's
  // CURRENT edition/revision, as required) and applies each legacy field
  // independently -- one malformed field never affects another. Indexes via
  // parseStrictLegacyIndex (out-of-range falls back to the first question);
  // bookmarks via parseStrictLegacyBookmarks then filterValidIds (bounded,
  // deduplicated, cross-pool/unknown IDs dropped). Pure, deterministic,
  // idempotent; never mutates its inputs or touches real storage. Returns
  // { state }.
  function migrateLegacy(legacySnapshot, registry, banks) {
    assertRegistryAndBanks(registry, banks);
    var snap = isPlainObject(legacySnapshot) ? legacySnapshot : {};
    var base = createDefaultState(registry, banks);

    var theme = snap[LEGACY_THEME_KEY];
    if (isBoundedString(theme) && indexOf(THEMES, theme) !== -1) {
      base.preferences.theme = theme;
    }

    var pool = snap[LEGACY_POOL_KEY];
    if (isBoundedString(pool) && indexOf(POOL_KEYS, pool) !== -1) {
      base.study.activePool = pool;
    }

    for (var i = 0; i < POOL_KEYS.length; i++) {
      var key = POOL_KEYS[i];
      var poolState = base.study.pools[key];
      var idList = bankIdList(banks, key);

      var rawIndex = snap[legacyIndexKey(key)];
      var parsedIndex = parseStrictLegacyIndex(rawIndex);
      if (parsedIndex !== null && idList.length > 0) {
        var clamped = (parsedIndex >= 0 && parsedIndex < idList.length) ? parsedIndex : 0;
        poolState.currentQuestionId = idList[clamped];
        poolState.positions.all = idList[clamped];
      }

      var rawBookmarks = snap[legacyBookmarksKey(key)];
      var parsedBookmarks = parseStrictLegacyBookmarks(rawBookmarks);
      if (parsedBookmarks !== null) {
        poolState.bookmarks = filterValidIds(parsedBookmarks, bankIdSet(banks, key));
      }
    }

    return { state: base };
  }

  // ---------------------------------------------------------------------------
  // Pool-update reconciliation (pure)
  // ---------------------------------------------------------------------------

  // Runs normalizeState first, then reconciles each pool's identity against
  // the CURRENT registry using the pool's ORIGINAL (pre-normalization)
  // editionId -- NOT the normalized one, which normalizeState backfills from
  // the registry when missing/malformed. A missing editionId gives no
  // trustworthy basis for believing its IDs belong to any edition, so it
  // must never look like "same edition" merely because normalization
  // supplied a default afterward:
  //   - Same edition (original editionId === registry's current value): bank
  //     is unchanged, so normalized IDs stay as-is; only revisionId bumps.
  //   - Missing/malformed/different edition (replacement, rollback mismatch,
  //     or no recorded edition): current question, bookmarks, scope, and
  //     positions hard-reset to a fresh default, even if the new bank reuses
  //     the same ID strings -- content may have changed, or was never
  //     attributable to begin with.
  // Preferences and unaffected pools pass through unchanged; never mutates
  // its inputs. Returns { state, resetPools } (hard-reset pool keys, empty
  // if only revisions bumped or nothing changed).
  function reconcileState(state, registry, banks) {
    assertRegistryAndBanks(registry, banks);
    var normalized = normalizeState(state, registry, banks).state;
    var srcStudy = (isPlainObject(state) && isPlainObject(state.study)) ? state.study : {};
    var srcPools = isPlainObject(srcStudy.pools) ? srcStudy.pools : {};
    var resetPools = [];
    var pools = {};

    for (var i = 0; i < POOL_KEYS.length; i++) {
      var key = POOL_KEYS[i];
      var registryEntry = registry.pools[key];
      var originalEntry = isPlainObject(srcPools[key]) ? srcPools[key] : {};
      var originalEditionId = isBoundedString(originalEntry.editionId) ? originalEntry.editionId : null;

      if (originalEditionId === registryEntry.editionId) {
        var poolState = normalized.study.pools[key];
        pools[key] = (poolState.revisionId === registryEntry.revisionId)
          ? poolState
          : extend(poolState, { revisionId: registryEntry.revisionId });
      } else {
        pools[key] = freshPoolState(key, registryEntry, banks);
        resetPools.push(key);
      }
    }

    return {
      state: extend(normalized, { study: extend(normalized.study, { pools: pools }) }),
      resetPools: resetPools
    };
  }

  // ---------------------------------------------------------------------------
  // State precedence (pure orchestration of the policy above)
  // ---------------------------------------------------------------------------

  // Implements the state-precedence policy (docs/POOL_STORAGE_PLAN.md "State
  // precedence and recovery") as one pure function:
  //   1. Absent/unparseable/non-numeric schemaVersion -> migrate legacy.
  //   2. schemaVersion > SCHEMA_VERSION -> safe default, read-only
  //      ("future-schema", writable:false); the raw value is never modified.
  //   3. schemaVersion < SCHEMA_VERSION -> same read-only treatment
  //      ("unsupported-schema"); no schema before 1 is guessed at.
  //   4. schemaVersion === SCHEMA_VERSION and otherwise strictly valid EXCEPT
  //      per-pool edition/revision identity (isValidExceptEditionDrift) ->
  //      reconcileState (resets a pool whose ORIGINAL edition doesn't match,
  //      bumps revision otherwise), then validateState as a final check;
  //      passing means "reconciled" (something changed) or "valid" (already
  //      current). Anything that fails isValidExceptEditionDrift -- an
  //      invalid preference/activePool/unknown key/malformed field -- is the
  //      literal "invalid schema 1" case: NOT selectively repaired (which
  //      would keep some fields while discarding legacy data valid for the
  //      very field that made it invalid); the whole object is set aside and
  //      legacySnapshot is migrated instead. Reconciliation is only ever for
  //      an otherwise-valid object with drifted pool identity.
  // Returns { state, status, errors, writable }. Never throws for bad
  // canonicalRaw/legacySnapshot; never mutates its inputs.
  function resolveState(canonicalRaw, legacySnapshot, registry, banks) {
    assertRegistryAndBanks(registry, banks);
    var parsed = safeParseJson(canonicalRaw);

    if (!isPlainObject(parsed) || typeof parsed.schemaVersion !== "number" || !isFinite(parsed.schemaVersion)) {
      return migratedResult(legacySnapshot, registry, banks);
    }
    if (parsed.schemaVersion > SCHEMA_VERSION) {
      return {
        state: createDefaultState(registry, banks),
        status: STATUS.FUTURE_SCHEMA,
        errors: ["stored schemaVersion " + parsed.schemaVersion + " is newer than the supported " + SCHEMA_VERSION],
        writable: false
      };
    }
    if (parsed.schemaVersion < SCHEMA_VERSION) {
      return {
        state: createDefaultState(registry, banks),
        status: STATUS.UNSUPPORTED_SCHEMA,
        errors: ["stored schemaVersion " + parsed.schemaVersion + " predates any supported migration"],
        writable: false
      };
    }
    if (!isValidExceptEditionDrift(parsed)) {
      return migratedResult(legacySnapshot, registry, banks);
    }

    var reconciled = reconcileState(parsed, registry, banks);
    var check = validateState(reconciled.state, registry, banks);
    if (check.errors.length === 0) {
      var changed = safeSerialize(reconciled.state) !== safeSerialize(parsed);
      return {
        state: reconciled.state,
        status: changed ? STATUS.RECONCILED : STATUS.VALID,
        errors: [],
        writable: true
      };
    }
    return migratedResult(legacySnapshot, registry, banks);
  }

  // As strict as validateState EXCEPT per-pool editionId/revisionId equality
  // and bank membership of currentQuestionId/positions.all/bookmarks (both
  // depend on which edition is in play, decided by reconcileState, not
  // here -- an unchecked/non-matching editionId there is just treated as
  // "unknown edition" and reset). This is the gate between "otherwise valid,
  // at most needing edition reconciliation" and "invalid schema 1": an
  // object invalid for any other reason (bad theme/activePool, unknown key,
  // malformed field) is never selectively rescued by reconciliation -- it's
  // set aside for legacy data instead.
  function isValidExceptEditionDrift(state) {
    if (!isPlainObject(state) || state.schemaVersion !== SCHEMA_VERSION) return false;
    if (unknownKeys(state, ROOT_KEYS).length) return false;

    if (!isPlainObject(state.preferences)) return false;
    if (unknownKeys(state.preferences, PREFERENCES_KEYS).length) return false;
    if (indexOf(THEMES, state.preferences.theme) === -1) return false;
    if (indexOf(RECALL_SECONDS_VALUES, state.preferences.recallSeconds) === -1) return false;
    if (state.preferences.examTimerSeconds !== null &&
        indexOf(EXAM_TIMER_SECONDS_VALUES, state.preferences.examTimerSeconds) === -1) return false;

    if (!isPlainObject(state.study)) return false;
    if (unknownKeys(state.study, STUDY_KEYS).length) return false;
    if (indexOf(POOL_KEYS, state.study.activePool) === -1) return false;
    if (!isPlainObject(state.study.pools)) return false;
    var present = Object.keys(state.study.pools);
    if (present.length !== POOL_KEYS.length) return false;
    for (var i = 0; i < POOL_KEYS.length; i++) {
      if (indexOf(present, POOL_KEYS[i]) === -1) return false;
    }
    for (var j = 0; j < POOL_KEYS.length; j++) {
      if (!isValidPoolEntryExceptEdition(state.study.pools[POOL_KEYS[j]])) return false;
    }
    return true;
  }

  function isValidPoolEntryExceptEdition(entry) {
    if (!isPlainObject(entry)) return false;
    if (unknownKeys(entry, POOL_ENTRY_KEYS).length) return false;
    // editionId/revisionId deliberately not checked here -- see above.
    if (!isBoundedString(entry.currentQuestionId)) return false;
    if (!Array.isArray(entry.bookmarks) || entry.bookmarks.length > BOUNDS.MAX_BOOKMARKS_PER_POOL) return false;
    for (var i = 0; i < entry.bookmarks.length; i++) {
      if (!isBoundedString(entry.bookmarks[i])) return false;
    }
    if (!isPlainObject(entry.scope)) return false;
    if (unknownKeys(entry.scope, SCOPE_KEYS).length) return false;
    if (entry.scope.level !== "all" || entry.scope.id !== null) return false;
    if (!isPlainObject(entry.positions)) return false;
    if (unknownKeys(entry.positions, POSITIONS_KEYS).length) return false;
    if (!isBoundedString(entry.positions.all)) return false;
    return true;
  }

  function migratedResult(legacySnapshot, registry, banks) {
    var migrated = migrateLegacy(legacySnapshot, registry, banks);
    return { state: migrated.state, status: STATUS.MIGRATED, errors: [], writable: true };
  }

  // ---------------------------------------------------------------------------
  // Injected storage adapter
  // ---------------------------------------------------------------------------

  // Dedicated, never-real key used only to probe whether storageLike
  // actually persists values (some browser modes expose a working-looking
  // but no-op/throwing Storage object).
  var PROBE_KEY = "__ham_exam_storage_probe__";
  var PROBE_VALUE = "1";

  // Probes once (callers cache the result). Never writes to the probe key if
  // it already holds a value -- restoring a saved-off value could itself
  // throw and permanently clobber it, so an occupied key is left alone
  // entirely and a successful read is treated as sufficient evidence of
  // availability (every real write elsewhere is separately guarded anyway).
  // Any exception anywhere means "unavailable".
  function probeAvailability(storageLike) {
    try {
      var existing;
      try {
        existing = storageLike.getItem(PROBE_KEY);
      } catch (e) {
        return false;
      }
      if (existing !== null && existing !== undefined) {
        return true;
      }
      storageLike.setItem(PROBE_KEY, PROBE_VALUE);
      var readBack = storageLike.getItem(PROBE_KEY);
      storageLike.removeItem(PROBE_KEY);
      return readBack === PROBE_VALUE;
    } catch (e) {
      return false;
    }
  }

  // storageLike must provide getItem/setItem/removeItem; core code never
  // reaches for a global `localStorage` directly. Availability is probed at
  // most once per instance and cached.
  //
  //   isAvailable() -> cached boolean.
  //   load() -> resolveState(...)'s result from the canonical + legacy keys.
  //     A throwing legacy read is tolerated as "absent"; a throwing
  //     CANONICAL read fails closed (status "read-error", writable:false)
  //     rather than risk treating a hidden value as absent. Storage
  //     unavailable -> status "storage-unavailable", writable:false. Never
  //     throws.
  //   save(newState) -> exactly one setItem() of the complete canonical
  //     JSON, gated on: storage available; the existing value could actually
  //     be read (else "read-error", no write); it is not a future or
  //     older-unsupported schema (both are read-only, never overwritten);
  //     newState passes validateState(). Reads the value back and
  //     re-validates it -- success only if the read-back matches exactly, so
  //     silent corruption is never reported as success. Every storageLike
  //     call is try/catch-guarded into a structured { ok:false, status,
  //     errors } result. Legacy keys are never touched by save().
  //
  // Atomicity: localStorage has no multi-key transaction -- "atomic" here
  // means one read-back-verified setItem() of the canonical JSON; legacy
  // keys stay available and untouched regardless of this write's outcome.
  function createStorageAdapter(storageLike, registry, banks) {
    if (!storageLike || typeof storageLike.getItem !== "function" ||
        typeof storageLike.setItem !== "function" || typeof storageLike.removeItem !== "function") {
      throw new TypeError("storage: storageLike must provide getItem/setItem/removeItem functions");
    }
    assertRegistryAndBanks(registry, banks);

    var cachedAvailable = null;

    function isAvailable() {
      if (cachedAvailable === null) {
        cachedAvailable = probeAvailability(storageLike);
      }
      return cachedAvailable;
    }

    // No future-schema concern for legacy keys, so a throwing read is
    // tolerated as "absent" -- matches migrateLegacy's independent-field philosophy.
    function safeGetLegacy(key) {
      try {
        return storageLike.getItem(key);
      } catch (e) {
        return null;
      }
    }

    // Canonical reads are different: a throw might hide a real (possibly
    // future-schema) value, so callers get { ok, value, error } and must
    // fail closed on ok:false rather than treat it as "absent".
    function safeGetCanonical() {
      try {
        return { ok: true, value: storageLike.getItem(STORAGE_KEY), error: null };
      } catch (e) {
        return { ok: false, value: null, error: e };
      }
    }

    function readLegacySnapshot() {
      var snap = {};
      snap[LEGACY_POOL_KEY] = safeGetLegacy(LEGACY_POOL_KEY);
      snap[LEGACY_THEME_KEY] = safeGetLegacy(LEGACY_THEME_KEY);
      for (var i = 0; i < POOL_KEYS.length; i++) {
        var key = POOL_KEYS[i];
        snap[legacyIndexKey(key)] = safeGetLegacy(legacyIndexKey(key));
        snap[legacyBookmarksKey(key)] = safeGetLegacy(legacyBookmarksKey(key));
      }
      return snap;
    }

    function readErrorMessage(prefix, error) {
      return prefix + ": " + String((error && error.message) || error);
    }

    function load() {
      if (!isAvailable()) {
        return {
          state: createDefaultState(registry, banks),
          status: STATUS.UNAVAILABLE,
          errors: ["storage is not available"],
          writable: false
        };
      }
      var canonicalRead = safeGetCanonical();
      if (!canonicalRead.ok) {
        // Fail closed rather than "absent -> migrate from legacy".
        return {
          state: createDefaultState(registry, banks),
          status: STATUS.READ_ERROR,
          errors: [readErrorMessage("reading the canonical key failed", canonicalRead.error)],
          writable: false
        };
      }
      var legacySnapshot = readLegacySnapshot();
      return resolveState(canonicalRead.value, legacySnapshot, registry, banks);
    }

    function save(newState) {
      if (!isAvailable()) {
        return { ok: false, status: STATUS.UNAVAILABLE, errors: ["storage is not available"] };
      }

      var preflight = safeGetCanonical();
      if (!preflight.ok) {
        // Fail closed: refuse to write blind over an unknown existing value.
        return {
          ok: false,
          status: STATUS.READ_ERROR,
          errors: [readErrorMessage("reading the existing canonical value failed; refusing to write over it blind", preflight.error)]
        };
      }
      var existing = safeParseJson(preflight.value);
      if (isPlainObject(existing) && typeof existing.schemaVersion === "number" && isFinite(existing.schemaVersion)) {
        if (existing.schemaVersion > SCHEMA_VERSION) {
          return {
            ok: false,
            status: STATUS.FUTURE_SCHEMA,
            errors: ["a newer schema is already stored; refusing to overwrite it"]
          };
        }
        if (existing.schemaVersion < SCHEMA_VERSION) {
          return {
            ok: false,
            status: STATUS.UNSUPPORTED_SCHEMA,
            errors: ["an older, unsupported schema is already stored; refusing to overwrite it"]
          };
        }
      }

      var check = validateState(newState, registry, banks);
      if (check.errors.length > 0) {
        return { ok: false, status: STATUS.INVALID, errors: check.errors };
      }

      var serialized = safeSerialize(newState);
      if (serialized === undefined) {
        return { ok: false, status: STATUS.SERIALIZE_ERROR, errors: ["state could not be serialized"] };
      }

      try {
        storageLike.setItem(STORAGE_KEY, serialized);
      } catch (e) {
        return { ok: false, status: STATUS.WRITE_ERROR, errors: [String((e && e.message) || e)] };
      }

      var readBack;
      try {
        readBack = storageLike.getItem(STORAGE_KEY);
      } catch (e) {
        return { ok: false, status: STATUS.READ_BACK_ERROR, errors: [String((e && e.message) || e)] };
      }
      if (readBack !== serialized) {
        return {
          ok: false,
          status: STATUS.READ_BACK_MISMATCH,
          errors: ["read-back value did not match what was written"]
        };
      }
      var readBackCheck = validateState(safeParseJson(readBack), registry, banks);
      if (readBackCheck.errors.length > 0) {
        return { ok: false, status: STATUS.READ_BACK_MISMATCH, errors: readBackCheck.errors };
      }

      return { ok: true, status: STATUS.OK, errors: [] };
    }

    return { isAvailable: isAvailable, load: load, save: save };
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  global.HAM_EXAM_STORAGE = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    STORAGE_KEY: STORAGE_KEY,
    POOL_KEYS: POOL_KEYS,
    DEFAULT_POOL_KEY: DEFAULT_POOL_KEY,
    THEMES: THEMES,
    DEFAULT_THEME: DEFAULT_THEME,
    RECALL_SECONDS_VALUES: RECALL_SECONDS_VALUES,
    DEFAULT_RECALL_SECONDS: DEFAULT_RECALL_SECONDS,
    EXAM_TIMER_SECONDS_VALUES: EXAM_TIMER_SECONDS_VALUES,
    DEFAULT_EXAM_TIMER_SECONDS: DEFAULT_EXAM_TIMER_SECONDS,
    LEGACY_POOL_KEY: LEGACY_POOL_KEY,
    LEGACY_THEME_KEY: LEGACY_THEME_KEY,
    legacyIndexKey: legacyIndexKey,
    legacyBookmarksKey: legacyBookmarksKey,
    BOUNDS: BOUNDS,
    STATUS: STATUS,

    createDefaultState: createDefaultState,
    validateState: validateState,
    normalizeState: normalizeState,
    migrateLegacy: migrateLegacy,
    reconcileState: reconcileState,
    resolveState: resolveState,

    safeParseJson: safeParseJson,
    safeSerialize: safeSerialize,
    parseStrictLegacyIndex: parseStrictLegacyIndex,
    parseStrictLegacyBookmarks: parseStrictLegacyBookmarks,

    createStorageAdapter: createStorageAdapter
  };

})(typeof window !== "undefined" ? window : this);
