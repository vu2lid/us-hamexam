(function(global) {
  "use strict";

  // Transient scoped study: pure filter over one pool's bank, no I/O, no
  // persistence. Same require()/window pattern as exam-engine.js/storage.js.
  //
  // Stage 7E: group/subelement identity comes from the pool's validated
  // registry metadata, never from a hardcoded question-ID shape. Scope: { level: "all"|"subelement"|"group"|"question", id }. all: id
  // null. subelement: a configured scopeLabels.subelements key. group: a
  // configured groupBlueprint key. question: one stable ID. Mock Exam never
  // reads this.

  var LEVELS = ["all", "subelement", "group", "question"];

  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  // Longest configured key that `value` starts with (deterministic when
  // keys overlap). Object.keys yields strings, so no type guards here; an
  // empty key is ignored so it can never claim every ID.
  function longestKeyPrefix(value, keys) {
    var best = null;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k.length > 0 && value.indexOf(k) === 0 &&
          (best === null || k.length > best.length)) {
        best = k;
      }
    }
    return best;
  }

  // Group claiming `id`, from the pool's groupBlueprint keys; null when no
  // configured group claims it -- the filter then excludes it from group
  // scopes instead of guessing (fail closed).
  function groupOf(id, poolConfig) {
    var blueprint = poolConfig && isPlainObject(poolConfig.groupBlueprint)
      ? poolConfig.groupBlueprint
      : null;
    if (!blueprint || typeof id !== "string" || id === "") return null;
    return longestKeyPrefix(id, Object.keys(blueprint));
  }

  // Subelement: longest scopeLabels.subelements key prefixing the resolved
  // group; null without that registry metadata (fail closed, never guessed).
  function subelementOf(id, poolConfig) {
    var g = groupOf(id, poolConfig);
    if (!g) return null;
    var labels = poolConfig && isPlainObject(poolConfig.scopeLabels)
      ? poolConfig.scopeLabels
      : null;
    if (!labels || !isPlainObject(labels.subelements)) return null;
    return longestKeyPrefix(g, Object.keys(labels.subelements));
  }

  // Fresh object each call, so callers can never share (and mutate) one.
  function defaultScope() {
    return { level: "all", id: null };
  }

  // { subelements: [...], groups: [...] } for a pool, from validated registry
  // metadata alone -- groups from groupBlueprint's keys, subelements from
  // scopeLabels.subelements' keys -- sorted, deduplicated. A config without
  // that metadata yields empty lists (fail closed), never derived guesses.
  // Pure; never mutates `poolConfig`.
  function enumerateScopes(poolConfig) {
    var blueprint = poolConfig && isPlainObject(poolConfig.groupBlueprint)
      ? poolConfig.groupBlueprint
      : null;
    var labels = poolConfig && isPlainObject(poolConfig.scopeLabels)
      ? poolConfig.scopeLabels
      : null;
    // Object.keys returns fresh string arrays, so sorting in place never
    // mutates poolConfig.
    var groups = blueprint ? Object.keys(blueprint).sort() : [];
    var subelements = labels && isPlainObject(labels.subelements)
      ? Object.keys(labels.subelements).sort()
      : [];
    return { subelements: subelements, groups: groups };
  }

  // { valid, reason }. For subelement/group, checks the id against the
  // pool's registry; for question, checks bank membership. Does not
  // re-check question-ID syntax/prefix (pool-registry owns that).
  function validateScope(scope, poolConfig, bank) {
    if (!isPlainObject(scope)) {
      return { valid: false, reason: "scope must be an object" };
    }
    if (LEVELS.indexOf(scope.level) === -1) {
      return { valid: false, reason: "unknown scope level" };
    }
    if (scope.level === "all") {
      return scope.id === null
        ? { valid: true, reason: null }
        : { valid: false, reason: '"all" scope must have a null id' };
    }
    if (typeof scope.id !== "string" || scope.id === "") {
      return { valid: false, reason: "scope id must be a non-empty string" };
    }
    if (scope.level === "subelement") {
      var subs = enumerateScopes(poolConfig).subelements;
      return subs.indexOf(scope.id) !== -1
        ? { valid: true, reason: null }
        : { valid: false, reason: "unknown subelement for this pool" };
    }
    if (scope.level === "group") {
      var groups = enumerateScopes(poolConfig).groups;
      return groups.indexOf(scope.id) !== -1
        ? { valid: true, reason: null }
        : { valid: false, reason: "unknown group for this pool" };
    }
    var list = Array.isArray(bank) ? bank : [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === scope.id) return { valid: true, reason: null };
    }
    return { valid: false, reason: "unknown question id for this pool" };
  }

  // Filter `bank` by `scope`, preserving original order. Always a NEW array;
  // never mutates `bank`. Group/subelement membership resolves against
  // `poolConfig`'s registry metadata. An unrecognized/malformed scope behaves
  // like "all" -- call validateScope() first for an outright rejection.
  function filterBankByScope(bank, scope, poolConfig) {
    var list = Array.isArray(bank) ? bank : [];
    if (!isPlainObject(scope) || LEVELS.indexOf(scope.level) === -1 || scope.level === "all") {
      return list.slice();
    }
    if (scope.level === "subelement") {
      return list.filter(function(q) { return !!q && subelementOf(q.id, poolConfig) === scope.id; });
    }
    if (scope.level === "group") {
      return list.filter(function(q) { return !!q && groupOf(q.id, poolConfig) === scope.id; });
    }
    return list.filter(function(q) { return !!q && q.id === scope.id; });
  }

  // { scope, list }: the requested scope + filtered list when valid and
  // non-empty, else "all" + the complete bank. Also how a stale scope after
  // a pool change is handled -- just an invalid scope against the new pool.
  function resolveScope(scope, poolConfig, bank) {
    var check = validateScope(scope, poolConfig, bank);
    if (check.valid) {
      var list = filterBankByScope(bank, scope, poolConfig);
      if (list.length > 0) return { scope: scope, list: list };
    }
    return { scope: defaultScope(), list: Array.isArray(bank) ? bank.slice() : [] };
  }

  // Human-readable summary: "All questions", or the subelement/group/
  // question id. Does not validate.
  function describeScope(scope) {
    if (!isPlainObject(scope) || scope.level === "all" || LEVELS.indexOf(scope.level) === -1) {
      return "All questions";
    }
    return typeof scope.id === "string" ? scope.id : "All questions";
  }

  global.HAM_EXAM_STUDY_SCOPE = {
    LEVELS: LEVELS,
    groupOf: groupOf,
    subelementOf: subelementOf,
    defaultScope: defaultScope,
    enumerateScopes: enumerateScopes,
    validateScope: validateScope,
    filterBankByScope: filterBankByScope,
    resolveScope: resolveScope,
    describeScope: describeScope
  };

})(typeof window !== "undefined" ? window : this);
