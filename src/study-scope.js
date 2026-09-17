(function(global) {
  "use strict";

  // Transient scoped study: pure filter over one pool's bank, no I/O, no
  // persistence. Same require()/window pattern as exam-engine.js/storage.js.
  //
  // Scope: { level: "all"|"subelement"|"group"|"question", id }. all: id
  // null. subelement: 2-char code ("T1"). group: 3-char code ("T1A").
  // question: one stable ID ("T1A01"). Group/subelement come from a
  // question's stable ID; valid codes per pool come from the canonical
  // groupBlueprint, never duplicated metadata. Mock Exam never reads this.

  var LEVELS = ["all", "subelement", "group", "question"];

  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  // "T1A05" -> "T1A"; null if `id` isn't question-ID shaped.
  function groupOf(id) {
    var m = typeof id === "string" ? id.match(/^[A-Z]\d[A-Z]/) : null;
    return m ? m[0] : null;
  }

  // "T1A05" -> "T1".
  function subelementOf(id) {
    var g = groupOf(id);
    return g ? g.slice(0, 2) : null;
  }

  // Fresh object each call, so callers can never share (and mutate) one.
  function defaultScope() {
    return { level: "all", id: null };
  }

  // { subelements: [...], groups: [...] } for a pool, from groupBlueprint's
  // keys alone -- sorted, deduplicated. Pure.
  function enumerateScopes(poolConfig) {
    var groups = poolConfig && isPlainObject(poolConfig.groupBlueprint)
      ? Object.keys(poolConfig.groupBlueprint)
      : [];
    groups = groups.slice().sort();
    var seenSub = {};
    var subelements = [];
    groups.forEach(function(g) {
      var sub = g.slice(0, 2);
      if (!seenSub[sub]) {
        seenSub[sub] = true;
        subelements.push(sub);
      }
    });
    subelements.sort();
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
  // never mutates `bank`. An unrecognized/malformed scope behaves like
  // "all" -- call validateScope() first for an outright rejection.
  function filterBankByScope(bank, scope) {
    var list = Array.isArray(bank) ? bank : [];
    if (!isPlainObject(scope) || LEVELS.indexOf(scope.level) === -1 || scope.level === "all") {
      return list.slice();
    }
    if (scope.level === "subelement") {
      return list.filter(function(q) { return !!q && subelementOf(q.id) === scope.id; });
    }
    if (scope.level === "group") {
      return list.filter(function(q) { return !!q && groupOf(q.id) === scope.id; });
    }
    return list.filter(function(q) { return !!q && q.id === scope.id; });
  }

  // { scope, list }: the requested scope + filtered list when valid and
  // non-empty, else "all" + the complete bank. Also how a stale scope after
  // a pool change is handled -- just an invalid scope against the new pool.
  function resolveScope(scope, poolConfig, bank) {
    var check = validateScope(scope, poolConfig, bank);
    if (check.valid) {
      var list = filterBankByScope(bank, scope);
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
