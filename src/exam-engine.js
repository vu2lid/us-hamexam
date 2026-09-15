(function(global) {
  "use strict";

  // Mock-exam question selection per FCC Part 97.503/97.507 and the NCVEC
  // question pool documents. This selection algorithm is an NCVEC-balanced
  // practice approximation; it is not an FCC-mandated algorithm.
  //
  // Stage 5A: this module no longer owns a duplicated EXAM_CONFIG. Pool
  // identity, exam question count, passing score, default timer, withdrawn
  // IDs, and the group blueprint all live once in the canonical registry
  // (data/pools.json, embedded at build time as window.HAM_EXAM_POOLS -- see
  // scripts/pool-registry.js and docs/POOL_STORAGE_PLAN.md). selectExamQuestions
  // is a pure function: the caller passes that pool's registry entry in
  // explicitly rather than the engine reading a hidden module-level global.

  // Linear Congruential Generator seeded with a 32-bit unsigned integer.
  // Knuth coefficients; >>> 0 keeps the accumulator as uint32.
  function seededRng(seed) {
    var s = (seed >>> 0) || 1;
    return function() {
      s = ((s * 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // Extract the three-character NCVEC group identifier from a question ID
  // (e.g. "T1A" from "T1A05", "E9H" from "E9H11").
  function groupKey(id) {
    var m = (typeof id === "string") ? id.match(/^[A-Z]\d[A-Z]/) : null;
    return m ? m[0] : null;
  }

  // selectExamQuestions(poolKey, banks, rng, poolConfig)
  //
  // Returns an array of unique question objects drawn from banks[poolKey]
  // using poolConfig.groupBlueprint. Exactly one question is selected per
  // blueprint group, for a total equal to poolConfig.examQuestionCount.
  //
  // poolConfig — the caller's canonical registry entry for poolKey (e.g.
  //              window.HAM_EXAM_POOLS[poolKey]), providing poolKey,
  //              examQuestionCount, groupBlueprint, and withdrawnIds. Passed
  //              explicitly; this module never reads a global for it.
  // rng        — optional function returning a float in [0, 1). Defaults to
  //              Math.random. Pass seededRng(n) for deterministic results.
  //
  // Throws a descriptive Error for:
  //   - missing pool key
  //   - missing or mismatched poolConfig
  //   - missing or malformed banks argument
  //   - blueprint whose sum does not match examQuestionCount
  //   - any group with fewer available questions than required
  function selectExamQuestions(poolKey, banks, rng, poolConfig) {
    if (typeof poolKey !== "string" || !poolKey) {
      throw new Error("Pool key must be a non-empty string");
    }
    if (!poolConfig || typeof poolConfig !== "object") {
      throw new Error("Pool configuration must be an object for pool key: \"" + poolKey + "\"");
    }
    if (poolConfig.poolKey !== poolKey) {
      throw new Error(
        "Pool configuration poolKey \"" + poolConfig.poolKey +
        "\" does not match requested pool key \"" + poolKey + "\""
      );
    }
    if (!banks || typeof banks !== "object") {
      throw new Error("Banks must be an object");
    }
    var bank = banks[poolKey];
    if (!bank || !Array.isArray(bank.questions)) {
      throw new Error("No questions found for pool: " + poolKey);
    }
    if (typeof rng !== "function") {
      rng = Math.random;
    }

    var withdrawnIds = Array.isArray(poolConfig.withdrawnIds) ? poolConfig.withdrawnIds : [];
    var withdrawnSet = {};
    withdrawnIds.forEach(function(id) { withdrawnSet[id] = true; });

    // Index available (non-withdrawn) questions by group key.
    var grouped = {};
    bank.questions.forEach(function(q) {
      if (!q || !q.id || withdrawnSet[q.id]) return;
      var g = groupKey(q.id);
      if (!g) return;
      if (!grouped[g]) grouped[g] = [];
      grouped[g].push(q);
    });

    // Validate that the blueprint sums to the configured question count.
    var groupBlueprint = poolConfig.groupBlueprint || {};
    var blueprintGroups = Object.keys(groupBlueprint);
    var totalNeeded = 0;
    blueprintGroups.forEach(function(g) { totalNeeded += groupBlueprint[g]; });
    if (totalNeeded !== poolConfig.examQuestionCount) {
      throw new Error(
        "Blueprint total " + totalNeeded +
        " does not match configured exam question count " + poolConfig.examQuestionCount +
        " for pool \"" + poolKey + "\""
      );
    }

    var selected = [];
    var usedIds = {};

    blueprintGroups.forEach(function(g) {
      var needed = groupBlueprint[g];
      var available = grouped[g] || [];
      if (available.length < needed) {
        throw new Error(
          "Group " + g + " needs " + needed +
          " question(s) but only " + available.length + " are available after withdrawals"
        );
      }

      // Partial Fisher-Yates: swap `needed` random positions to the front of a
      // shallow copy so that the original array is never mutated.
      var pool = available.slice();
      for (var i = 0; i < needed; i++) {
        var j = i + Math.floor(rng() * (pool.length - i));
        var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
        var q = pool[i];
        if (usedIds[q.id]) {
          throw new Error("Duplicate question id during selection: " + q.id);
        }
        usedIds[q.id] = true;
        selected.push(q);
      }
    });

    return selected;
  }

  global.HAM_EXAM_ENGINE = {
    selectExamQuestions: selectExamQuestions,
    seededRng: seededRng
  };

})(typeof window !== "undefined" ? window : this);
