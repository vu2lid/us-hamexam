"use strict";

// Dependency-free CommonJS validator for the minimal edition profile
// (Stage 7B). It defines and enforces the schema for `data/edition.json` --
// the first step toward letting a future regional edition reuse this
// repository's build and runtime boundaries (see docs/EDITIONS.md).
//
// This module is pure library code: requiring it runs no CLI and touches no
// files. `validateEditionProfile`/`assertEditionProfile` work entirely on
// in-memory values and never mutate their inputs, so unit tests can pass
// frozen synthetic fixtures.
//
// Scope (Stage 7B, "minimal profile"): identity, pool ordering/default,
// label *templates*, allowed exam-timer values, optional figure policy, and
// namespace policy. Pool-specific counts, scoring, timers, hierarchy,
// question IDs, and display labels stay owned by data/pools.json
// (scripts/pool-registry.js) and are never duplicated here -- this module
// only cross-checks pool KEY identity (poolKeys/defaultPoolKey) against
// pool-registry.js's own POOL_KEYS, the single source of truth for that set.
//
// This module does not parameterize src/app.js, src/storage.js, the figure
// validators, or PWA behavior -- it only validates and, in scripts/build.js,
// embeds the profile as inert runtime metadata (window.HAM_EXAM_EDITION),
// unread by any current runtime code. That wiring is explicitly deferred to
// a later stage per docs/EDITIONS.md's staged implementation sequence.
//
// Stage 7C extends the schema with `build`: repository-relative input paths
// (pool registry, per-pool question banks, optional figure manifest, optional
// guide image) consumed by scripts/build.js. Path validation is pure and
// syntactic (relative, no traversal/absolute/backslash); existence and
// on-disk containment are enforced by the build at read time. No runtime
// metadata gains these paths -- they are build-only inputs.

const poolRegistry = require("./pool-registry");

// ---------------------------------------------------------------------------
// Contract constants
// ---------------------------------------------------------------------------

const SCHEMA_VERSION = 1;

// figurePolicy is the one explicitly OPTIONAL top-level field (an edition
// with no figures at all need not carry one); every other key is required.
const ROOT_KEYS = new Set([
  "schemaVersion",
  "editionKey",
  "displayName",
  "subtitle",
  "jurisdiction",
  "authority",
  "poolKeys",
  "defaultPoolKey",
  "labels",
  "examTimerSecondsValues",
  "figurePolicy",
  "namespacePolicy",
  "build"
]);
const REQUIRED_ROOT_KEYS = [
  "schemaVersion",
  "editionKey",
  "displayName",
  "subtitle",
  "jurisdiction",
  "authority",
  "poolKeys",
  "defaultPoolKey",
  "labels",
  "examTimerSecondsValues",
  "namespacePolicy",
  "build"
];

// Stable, URL/CSS/id-safe edition identifier: lowercase letters/digits,
// hyphen-separated, no leading/trailing/double hyphen. "us-fcc" is the
// documented preferred value for this repository's own profile
// (docs/EDITIONS.md), but the shape itself does not hardcode "us".
const EDITION_KEY_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

const AUTHORITY_KEYS = new Set([
  "regulatorName",
  "regulatorAbbreviation",
  "poolSourceName",
  "poolSourceAbbreviation"
]);

const LABEL_KEYS = new Set([
  "referenceLabelTemplate",
  "sourceLabelTemplate",
  "elementLabelTemplate"
]);
// Each template must actually interpolate the field it names -- a template
// with no placeholder is indistinguishable from forgetting to template it.
const LABEL_PLACEHOLDERS = {
  referenceLabelTemplate: "{ref}",
  sourceLabelTemplate: "{poolSourceAbbreviation}",
  elementLabelTemplate: "{element}"
};

const FIGURE_POLICY_KEYS = new Set(["manifestRequired", "provenanceScheme"]);
// The only provenance scheme this repository's build actually implements
// today ("checksum-pdf", see scripts/figure-manifest.js) plus "none" for an
// edition with no figures at all. Not an invitation to add a new scheme
// without also implementing it -- see docs/EDITIONS.md's staged sequence.
const PROVENANCE_SCHEMES = new Set(["checksum-pdf", "none"]);

const NAMESPACE_POLICY_KEYS = new Set(["storageKey", "legacyKeys", "cachePrefix"]);

const BUILD_KEYS = new Set(["poolRegistry", "questionBanks", "figureManifest", "guideImage"]);
// The one non-JSON build input: the Getting Started guide photo. Restricted to
// raster image extensions the build can inline with a correct media type.
const GUIDE_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

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

// ---------------------------------------------------------------------------
// Build-input relative-path safety (Stage 7C, pure)
// ---------------------------------------------------------------------------

// A build input must be a repository-relative POSIX path that stays inside
// the project: no absolute paths ("/...", "C:\..."), no Windows separators,
// no empty/"."/".." segments (so no traversal), no NUL. Pure string check --
// filesystem existence and containment-on-disk are the build's job, but a
// syntactically safe relative path resolved against the repo root cannot
// escape it. Returns an error string, or null when the path is safe.
function validateBuildRelPath(value) {
  if (!isNonBlankString(value)) return "must be a non-blank string";
  if (value.indexOf("\0") !== -1) return "must not contain NUL";
  if (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) {
    return "must be a relative path, not absolute";
  }
  if (value.indexOf("\\") !== -1) {
    return "must use forward slashes (no backslashes)";
  }
  const segments = value.split("/");
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === "..") {
      return `contains an unsafe segment "${seg}" (no traversal or empty segments)`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Profile validation (pure)
// ---------------------------------------------------------------------------

// Validate the profile object. Returns { errors: string[] } (empty === valid),
// sorted for determinism. Pool identity (poolKeys/defaultPoolKey) is
// cross-checked against poolRegistry.POOL_KEYS -- the same set data/pools.json
// itself is validated against -- so the two can never silently disagree.
function validateEditionProfile(profile) {
  const errors = [];
  const push = (m) => errors.push(m);

  if (!isPlainObject(profile)) {
    return { errors: ["profile: root must be a JSON object"] };
  }

  const extraRoot = unknownKeys(profile, ROOT_KEYS);
  if (extraRoot.length) push(`profile: unknown top-level key(s): ${extraRoot.join(", ")}`);
  for (const key of REQUIRED_ROOT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(profile, key)) {
      push(`profile: missing required field "${key}"`);
    }
  }

  if (profile.schemaVersion !== SCHEMA_VERSION) {
    push(`profile.schemaVersion must be ${SCHEMA_VERSION}, got ${JSON.stringify(profile.schemaVersion)}`);
  }

  if (Object.prototype.hasOwnProperty.call(profile, "editionKey")) {
    if (!isNonBlankString(profile.editionKey) || !EDITION_KEY_RE.test(profile.editionKey)) {
      push(`profile.editionKey must be a lowercase, hyphen-separated identifier (e.g. "us-fcc"), got ${JSON.stringify(profile.editionKey)}`);
    }
  }

  ["displayName", "subtitle", "jurisdiction"].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(profile, field) && !isNonBlankString(profile[field])) {
      push(`profile.${field} must be a non-blank string`);
    }
  });

  if (Object.prototype.hasOwnProperty.call(profile, "authority")) {
    if (!isPlainObject(profile.authority)) {
      push("profile.authority must be an object");
    } else {
      const extra = unknownKeys(profile.authority, AUTHORITY_KEYS);
      if (extra.length) push(`profile.authority: unknown key(s): ${extra.join(", ")}`);
      AUTHORITY_KEYS.forEach((field) => {
        if (!isNonBlankString(profile.authority[field])) {
          push(`profile.authority.${field} must be a non-blank string`);
        }
      });
    }
  }

  // Pool identity: an exact-set cross-check against pool-registry.js's own
  // POOL_KEYS, never a second, independently-maintained list. Order is
  // preserved as authored (it drives pool-picker ordering in a later stage)
  // but is not itself constrained beyond being a permutation of that set.
  let poolKeysOk = false;
  if (Object.prototype.hasOwnProperty.call(profile, "poolKeys")) {
    if (!Array.isArray(profile.poolKeys) || profile.poolKeys.length === 0) {
      push("profile.poolKeys must be a non-empty array");
    } else {
      const seen = new Set();
      let allStrings = true;
      profile.poolKeys.forEach((key, i) => {
        if (!isNonBlankString(key)) {
          allStrings = false;
          push(`profile.poolKeys[${i}] must be a non-blank string`);
          return;
        }
        if (seen.has(key)) push(`profile.poolKeys: duplicate pool key "${key}"`);
        seen.add(key);
      });
      if (allStrings) {
        const expected = new Set(poolRegistry.POOL_KEYS);
        poolRegistry.POOL_KEYS.forEach((key) => {
          if (!seen.has(key)) push(`profile.poolKeys: missing required pool "${key}"`);
        });
        seen.forEach((key) => {
          if (!expected.has(key)) push(`profile.poolKeys: unknown pool key "${key}" (not in the pool registry)`);
        });
        poolKeysOk = seen.size === expected.size &&
          Array.from(seen).every((key) => expected.has(key));
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(profile, "defaultPoolKey")) {
    if (!isNonBlankString(profile.defaultPoolKey)) {
      push("profile.defaultPoolKey must be a non-blank string");
    } else if (poolKeysOk && profile.poolKeys.indexOf(profile.defaultPoolKey) === -1) {
      push(`profile.defaultPoolKey "${profile.defaultPoolKey}" must be one of profile.poolKeys`);
    }
  }

  if (Object.prototype.hasOwnProperty.call(profile, "labels")) {
    if (!isPlainObject(profile.labels)) {
      push("profile.labels must be an object");
    } else {
      const extra = unknownKeys(profile.labels, LABEL_KEYS);
      if (extra.length) push(`profile.labels: unknown key(s): ${extra.join(", ")}`);
      LABEL_KEYS.forEach((field) => {
        const value = profile.labels[field];
        if (!isNonBlankString(value)) {
          push(`profile.labels.${field} must be a non-blank string`);
        } else if (value.indexOf(LABEL_PLACEHOLDERS[field]) === -1) {
          push(`profile.labels.${field} must contain the "${LABEL_PLACEHOLDERS[field]}" placeholder`);
        }
      });
    }
  }

  if (Object.prototype.hasOwnProperty.call(profile, "examTimerSecondsValues")) {
    if (!Array.isArray(profile.examTimerSecondsValues) || profile.examTimerSecondsValues.length === 0) {
      push("profile.examTimerSecondsValues must be a non-empty array");
    } else {
      let prev = -1;
      profile.examTimerSecondsValues.forEach((value, i) => {
        if (!Number.isInteger(value) || value < 0) {
          push(`profile.examTimerSecondsValues[${i}] must be a non-negative integer, got ${JSON.stringify(value)}`);
        } else if (value <= prev) {
          push(`profile.examTimerSecondsValues must be strictly ascending with no duplicates (index ${i})`);
        } else {
          prev = value;
        }
      });
    }
  }

  // figurePolicy is the one optional field. Absent entirely is valid (an
  // edition with no figures); present-but-malformed is not.
  if (Object.prototype.hasOwnProperty.call(profile, "figurePolicy")) {
    if (!isPlainObject(profile.figurePolicy)) {
      push("profile.figurePolicy must be an object when present");
    } else {
      const extra = unknownKeys(profile.figurePolicy, FIGURE_POLICY_KEYS);
      if (extra.length) push(`profile.figurePolicy: unknown key(s): ${extra.join(", ")}`);
      if (typeof profile.figurePolicy.manifestRequired !== "boolean") {
        push("profile.figurePolicy.manifestRequired must be a boolean");
      }
      if (!isNonBlankString(profile.figurePolicy.provenanceScheme) ||
          !PROVENANCE_SCHEMES.has(profile.figurePolicy.provenanceScheme)) {
        push(`profile.figurePolicy.provenanceScheme must be one of: ${Array.from(PROVENANCE_SCHEMES).join(", ")}`);
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(profile, "namespacePolicy")) {
    if (!isPlainObject(profile.namespacePolicy)) {
      push("profile.namespacePolicy must be an object");
    } else {
      const extra = unknownKeys(profile.namespacePolicy, NAMESPACE_POLICY_KEYS);
      if (extra.length) push(`profile.namespacePolicy: unknown key(s): ${extra.join(", ")}`);
      if (!isNonBlankString(profile.namespacePolicy.storageKey)) {
        push("profile.namespacePolicy.storageKey must be a non-blank string");
      }
      if (!Array.isArray(profile.namespacePolicy.legacyKeys) ||
          profile.namespacePolicy.legacyKeys.length === 0) {
        push("profile.namespacePolicy.legacyKeys must be a non-empty array");
      } else {
        const seenLegacy = new Set();
        profile.namespacePolicy.legacyKeys.forEach((key, i) => {
          if (!isNonBlankString(key)) {
            push(`profile.namespacePolicy.legacyKeys[${i}] must be a non-blank string`);
            return;
          }
          if (seenLegacy.has(key)) push(`profile.namespacePolicy.legacyKeys: duplicate entry "${key}"`);
          seenLegacy.add(key);
        });
      }
      if (!isNonBlankString(profile.namespacePolicy.cachePrefix)) {
        push("profile.namespacePolicy.cachePrefix must be a non-blank string");
      }
    }
  }

  // Build inputs (Stage 7C): repository-relative paths the build reads --
  // the pool registry, one question-bank path per pool, and the optional
  // figure manifest / guide image. Pure schema + path-safety validation
  // here; existence and on-disk containment are enforced by scripts/build.js
  // at read time, still before any dist/ mutation.
  if (Object.prototype.hasOwnProperty.call(profile, "build")) {
    if (!isPlainObject(profile.build)) {
      push("profile.build must be an object");
    } else {
      const extra = unknownKeys(profile.build, BUILD_KEYS);
      if (extra.length) push(`profile.build: unknown key(s): ${extra.join(", ")}`);
      const build = profile.build;

      const checkPath = (field, value, extensionCheck) => {
        const where = `profile.build.${field}`;
        const unsafe = validateBuildRelPath(value);
        if (unsafe) {
          push(`${where} ${unsafe} (got ${JSON.stringify(value)})`);
          return;
        }
        if (extensionCheck) extensionCheck(where, value);
      };
      const requireJsonExt = (where, value) => {
        if (!value.endsWith(".json")) {
          push(`${where} must name a .json file, got ${JSON.stringify(value)}`);
        }
      };
      const requireImageExt = (where, value) => {
        const lower = value.toLowerCase();
        const ok = Array.from(GUIDE_IMAGE_EXTENSIONS).some((ext) => lower.endsWith(ext));
        if (!ok) {
          push(`${where} must name an image file (${Array.from(GUIDE_IMAGE_EXTENSIONS).join(", ")}), got ${JSON.stringify(value)}`);
        }
      };

      if (!Object.prototype.hasOwnProperty.call(build, "poolRegistry")) {
        push('profile.build: missing required field "poolRegistry"');
      } else {
        checkPath("poolRegistry", build.poolRegistry, requireJsonExt);
      }

      if (!Object.prototype.hasOwnProperty.call(build, "questionBanks")) {
        push('profile.build: missing required field "questionBanks"');
      } else if (!isPlainObject(build.questionBanks)) {
        push("profile.build.questionBanks must be an object keyed by pool key");
      } else {
        const extra = unknownKeys(build.questionBanks, new Set(poolRegistry.POOL_KEYS));
        if (extra.length) {
          push(`profile.build.questionBanks: unknown pool key(s): ${extra.join(", ")} (not in the pool registry)`);
        }
        poolRegistry.POOL_KEYS.forEach((key) => {
          if (!Object.prototype.hasOwnProperty.call(build.questionBanks, key)) {
            push(`profile.build.questionBanks: missing required mapping for pool "${key}"`);
          }
        });
        Object.keys(build.questionBanks).forEach((key) => {
          checkPath(`questionBanks.${key}`, build.questionBanks[key], requireJsonExt);
        });
      }

      // figureManifest and guideImage are optional: an edition with no
      // official figures and no Getting Started photo need not carry them.
      // Present-but-malformed is still an error.
      if (Object.prototype.hasOwnProperty.call(build, "figureManifest")) {
        checkPath("figureManifest", build.figureManifest, requireJsonExt);
      }
      if (Object.prototype.hasOwnProperty.call(build, "guideImage")) {
        checkPath("guideImage", build.guideImage, requireImageExt);
      }

      // Cross-field consistency: a figure policy that REQUIRES a manifest
      // must actually be given one to read.
      if (profile.figurePolicy && profile.figurePolicy.manifestRequired === true &&
          !Object.prototype.hasOwnProperty.call(build, "figureManifest")) {
        push("profile.build.figureManifest is required because profile.figurePolicy.manifestRequired is true");
      }
    }
  }

  errors.sort();
  return { errors };
}

// Throw a single Error listing every validation error. Never mutates inputs.
function assertEditionProfile(profile) {
  const { errors } = validateEditionProfile(profile);
  if (errors.length) {
    throw new Error(
      `Edition profile validation failed (${errors.length} error${errors.length === 1 ? "" : "s"}):\n- ` +
      errors.join("\n- ")
    );
  }
}

module.exports = {
  SCHEMA_VERSION,
  ROOT_KEYS,
  REQUIRED_ROOT_KEYS,
  EDITION_KEY_RE,
  AUTHORITY_KEYS,
  LABEL_KEYS,
  LABEL_PLACEHOLDERS,
  FIGURE_POLICY_KEYS,
  PROVENANCE_SCHEMES,
  NAMESPACE_POLICY_KEYS,
  BUILD_KEYS,
  GUIDE_IMAGE_EXTENSIONS,
  validateBuildRelPath,
  validateEditionProfile,
  assertEditionProfile
};
