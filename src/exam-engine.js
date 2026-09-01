(function(global) {
  "use strict";

  // Official exam configuration per FCC Part 97.503/97.507 and the NCVEC
  // question pool documents.  Question counts and passing scores are prescribed
  // by FCC regulation; group blueprints are derived from the NCVEC pool
  // structure (one question per group).  This selection algorithm is an
  // NCVEC-balanced practice approximation; it is not an FCC-mandated algorithm.
  var EXAM_CONFIG = {
    technician: {
      poolKey: "technician",
      displayName: "Technician",
      element: 2,
      questionCount: 35,
      passingScore: 26,
      defaultTimeLimitSeconds: 2100,
      effectiveDateRange: "July 1, 2026 – June 30, 2030",
      ncvecSource: "https://ncvec.org/index.php/2026-2030-technician-question-pool",
      // No withdrawn IDs: the pool file already reflects the February 19, 2026
      // errata; no questions from the prior pool remain in the JSON.
      withdrawnIds: [],
      // One question per group.  35 groups → 35 exam questions.
      // Source: NCVEC 2026-2030 Technician Question Pool (February 19, 2026 errata).
      groupBlueprint: {
        "T1A": 1, "T1B": 1, "T1C": 1, "T1D": 1, "T1E": 1, "T1F": 1,
        "T2A": 1, "T2B": 1, "T2C": 1,
        "T3A": 1, "T3B": 1, "T3C": 1,
        "T4A": 1, "T4B": 1,
        "T5A": 1, "T5B": 1, "T5C": 1, "T5D": 1,
        "T6A": 1, "T6B": 1, "T6C": 1, "T6D": 1,
        "T7A": 1, "T7B": 1, "T7C": 1, "T7D": 1,
        "T8A": 1, "T8B": 1, "T8C": 1, "T8D": 1,
        "T9A": 1, "T9B": 1,
        "T0A": 1, "T0B": 1, "T0C": 1
      }
    },
    general: {
      poolKey: "general",
      displayName: "General",
      element: 3,
      questionCount: 35,
      passingScore: 26,
      defaultTimeLimitSeconds: 2100,
      effectiveDateRange: "July 1, 2023 – June 30, 2027",
      ncvecSource: "https://ncvec.org/index.php/2023-2027-general-question-pool-release",
      // No withdrawn IDs: the pool file already reflects the 6th errata
      // (February 4, 2026).  G1A04 was removed before this pool was captured
      // and does not appear in the JSON.
      withdrawnIds: [],
      // One question per group.  35 groups → 35 exam questions.
      // Source: NCVEC 2023-2027 General Question Pool (6th errata February 4, 2026).
      groupBlueprint: {
        "G1A": 1, "G1B": 1, "G1C": 1, "G1D": 1, "G1E": 1,
        "G2A": 1, "G2B": 1, "G2C": 1, "G2D": 1, "G2E": 1,
        "G3A": 1, "G3B": 1, "G3C": 1,
        "G4A": 1, "G4B": 1, "G4C": 1, "G4D": 1, "G4E": 1,
        "G5A": 1, "G5B": 1, "G5C": 1,
        "G6A": 1, "G6B": 1,
        "G7A": 1, "G7B": 1, "G7C": 1,
        "G8A": 1, "G8B": 1, "G8C": 1,
        "G9A": 1, "G9B": 1, "G9C": 1, "G9D": 1,
        "G0A": 1, "G0B": 1
      }
    },
    extra: {
      poolKey: "extra",
      displayName: "Extra",
      element: 4,
      questionCount: 50,
      passingScore: 37,
      defaultTimeLimitSeconds: 3000,
      effectiveDateRange: "July 1, 2024 – June 30, 2028",
      ncvecSource: "https://ncvec.org/index.php/2024-2028-extra-class-question-pool-release",
      // No withdrawn IDs: the pool file already reflects the 4th errata
      // (February 4, 2026).
      withdrawnIds: [],
      // One question per group.  50 groups → 50 exam questions.
      // Source: NCVEC 2024-2028 Extra Class Question Pool (4th errata February 4, 2026).
      groupBlueprint: {
        "E1A": 1, "E1B": 1, "E1C": 1, "E1D": 1, "E1E": 1, "E1F": 1,
        "E2A": 1, "E2B": 1, "E2C": 1, "E2D": 1, "E2E": 1,
        "E3A": 1, "E3B": 1, "E3C": 1,
        "E4A": 1, "E4B": 1, "E4C": 1, "E4D": 1, "E4E": 1,
        "E5A": 1, "E5B": 1, "E5C": 1, "E5D": 1,
        "E6A": 1, "E6B": 1, "E6C": 1, "E6D": 1, "E6E": 1, "E6F": 1,
        "E7A": 1, "E7B": 1, "E7C": 1, "E7D": 1, "E7E": 1, "E7F": 1,
        "E7G": 1, "E7H": 1,
        "E8A": 1, "E8B": 1, "E8C": 1, "E8D": 1,
        "E9A": 1, "E9B": 1, "E9C": 1, "E9D": 1, "E9E": 1, "E9F": 1,
        "E9G": 1, "E9H": 1,
        "E0A": 1
      }
    }
  };

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

  // selectExamQuestions(poolKey, banks, rng)
  //
  // Returns an array of unique question objects drawn from banks[poolKey] using
  // the official group blueprint defined in EXAM_CONFIG.  Exactly one question
  // is selected per blueprint group, for a total equal to config.questionCount.
  //
  // rng  — optional function returning a float in [0, 1).  Defaults to
  //        Math.random.  Pass seededRng(n) for deterministic results.
  //
  // Throws a descriptive Error for:
  //   - unknown pool key
  //   - missing or malformed banks argument
  //   - blueprint whose sum does not match questionCount
  //   - any group with fewer available questions than required
  function selectExamQuestions(poolKey, banks, rng) {
    if (typeof poolKey !== "string" || !poolKey) {
      throw new Error("Pool key must be a non-empty string");
    }
    var config = EXAM_CONFIG[poolKey];
    if (!config) {
      throw new Error("Unknown pool key: \"" + poolKey + "\"");
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

    var withdrawnSet = {};
    config.withdrawnIds.forEach(function(id) { withdrawnSet[id] = true; });

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
    var blueprintGroups = Object.keys(config.groupBlueprint);
    var totalNeeded = 0;
    blueprintGroups.forEach(function(g) { totalNeeded += config.groupBlueprint[g]; });
    if (totalNeeded !== config.questionCount) {
      throw new Error(
        "Blueprint total " + totalNeeded +
        " does not match configured question count " + config.questionCount +
        " for pool \"" + poolKey + "\""
      );
    }

    var selected = [];
    var usedIds = {};

    blueprintGroups.forEach(function(g) {
      var needed = config.groupBlueprint[g];
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
    EXAM_CONFIG: EXAM_CONFIG,
    selectExamQuestions: selectExamQuestions,
    seededRng: seededRng
  };

})(typeof window !== "undefined" ? window : this);
