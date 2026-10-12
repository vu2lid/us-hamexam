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
//
// Stage 7D adds a SECOND, separate validator: `validateEditionRuntimeConfig`/
// `assertEditionRuntimeConfig` check the shape of the small, allowlisted
// runtime PROJECTION scripts/build.js derives from an already-validated
// profile and embeds as window.HAM_EXAM_EDITION_CONFIG (poolKeys,
// defaultPoolKey, referenceLabelPrefix, elementLabelPrefix, sourceLabelText,
// examTimerSecondsValues, displayName -- every field has a real read site in
// src/app.js; see docs/EDITIONS.md). This is defense in depth: the
// projection's inputs are already guaranteed well-formed by
// assertEditionProfile(), so a derivation bug is the only way this second
// gate could ever fire, but validating the OUTPUT explicitly (rather than
// trusting the derivation code) is cheap, testable, and catches exactly that
// class of future mistake before any dist/ mutation.

// Stage 8A2 adds two explicit policy seams for the multi-edition build
// experiment (docs/EDITION_BUILDS_DESIGN.md), both defaulting to today's
// exact US behavior: validateEditionProfile()/assertEditionProfile() accept
// an options object whose optional `poolKeys` array substitutes another
// pool-key set for the identity cross-checks (absent == poolRegistry.POOL_KEYS
// as before), and namespacePolicy gains an optional `probeKey` plus a
// positional legacyKeys contract (exactly four entries: legacy pool key,
// legacy theme key, per-pool index template, per-pool bookmarks template).
// The runtime projection's allowlist gains exactly one field, namespacePolicy.

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
  "manifestDescription",
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

// Stage 8C: namespacePolicy.cachePrefix is substituted directly into
// src/pwa/sw.js as JS SOURCE TEXT (scripts/build.js), not through
// asInlineScript()'s JSON-safe embedding used for every other projected
// field -- a service worker runs in its own global scope with no access to
// window.HAM_EXAM_EDITION_CONFIG, so the build must bake the prefix in as a
// literal at build time. An unconstrained string here is therefore a
// JS-injection vector into the shipped service worker (a cachePrefix
// containing `"; `-shaped text breaks out of its string literal and runs
// arbitrary code in every installed PWA) -- confirmed exploitable before
// this pattern existed. Same lowercase/hyphen discipline as EDITION_KEY_RE,
// plus a REQUIRED trailing hyphen: cache names are formed as
// `<cachePrefix><12-hex-char version hash>` with no separator, and both of
// today's real values ("ham-exam-", "synthetic-exam-") already end in one,
// so requiring it keeps the two halves visually distinct and leaves no
// character outside `[a-z0-9-]` that could ever need escaping.
const CACHE_PREFIX_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*-$/;

const AUTHORITY_KEYS = new Set([
  "regulatorName",
  "regulatorAbbreviation",
  "poolSourceName",
  "poolSourceAbbreviation"
]);

const LABEL_KEYS = new Set([
  "referenceLabelTemplate",
  "sourceLabelTemplate",
  "elementLabelTemplate",
  "elementTermLabel"
]);
// The three LABEL_KEYS entries above that are TEMPLATES (require a
// placeholder, validated below). elementTermLabel (Stage 8A2 review-fix) is
// a plain standalone term -- no placeholder -- for the Mock Exam Setup
// metadata row src/app.js's updateExamSetupMeta() previously hardcoded as
// the literal "FCC element". The US profile declares "FCC element" so its
// output is unchanged.
const TEMPLATE_LABEL_KEYS = new Set([
  "referenceLabelTemplate",
  "sourceLabelTemplate",
  "elementLabelTemplate"
]);
// Each template must actually interpolate the field it names exactly once --
// a template with no placeholder is indistinguishable from forgetting to
// template it, and a SECOND occurrence can never be resolved: build.js's
// derivation reads/resolves each placeholder exactly once (see
// buildEditionRuntimeConfig's own comment), so a duplicate placeholder would
// silently leave a second, unresolved "{ref}"-shaped literal in shipped text.
const LABEL_PLACEHOLDERS = {
  referenceLabelTemplate: "{ref}",
  sourceLabelTemplate: "{poolSourceAbbreviation}",
  elementLabelTemplate: "{element}"
};
// referenceLabelTemplate/elementLabelTemplate are converted to a PREFIX
// (the text before the placeholder; see buildEditionRuntimeConfig's
// `.split(placeholder)[0]`) because the runtime only ever concatenates that
// prefix directly before a dynamic value (REF_LABEL_PREFIX + x.ref, etc.) --
// it never re-inserts anything that followed the placeholder in the
// template. So the placeholder must be the template's FINAL token, or any
// suffix text (e.g. "Reference: {ref} (official)") would be silently
// dropped. sourceLabelTemplate has no such requirement: it is fully resolved
// at build time via a single `.replace()`, which preserves suffix text
// correctly as long as the placeholder occurs exactly once.
const LABEL_PLACEHOLDER_MUST_BE_FINAL = new Set(["referenceLabelTemplate", "elementLabelTemplate"]);

const FIGURE_POLICY_KEYS = new Set(["manifestRequired", "provenanceScheme"]);
// The only provenance scheme this repository's build actually implements
// today ("checksum-pdf", see scripts/figure-manifest.js) plus "none" for an
// edition with no figures at all. Not an invitation to add a new scheme
// without also implementing it -- see docs/EDITIONS.md's staged sequence.
const PROVENANCE_SCHEMES = new Set(["checksum-pdf", "none"]);

const NAMESPACE_POLICY_KEYS = new Set(["storageKey", "legacyKeys", "cachePrefix", "probeKey"]);

// Stage 8A2 review-fix: helpContent/gettingStartedContent are optional
// per-edition overrides of the shared template's long-form Help & About /
// Getting Started prose (src/index.html's __HELP_CONTENT__/
// __GETTING_STARTED_CONTENT__ placeholders). Absent -- as for the US
// profile -- scripts/build.js falls back to src/help-content.html /
// src/getting-started-content.html, an exact byte-for-byte extract of the
// content these placeholders replaced, so these two placeholders still
// resolve to unchanged US text. A non-US edition declares its OWN HTML
// fragment file instead of shipping US-specific FCC/NCVEC copy verbatim.
// Stage 8D3A: provenanceSidecars is an optional, per-pool mapping (same
// shape as questionBanks) to an authoring/provenance metadata file
// (scripts/question-provenance.js), consumed by scripts/build.js as an
// additional pre-mutation gate. A pool with no entry here declares no
// sidecar and is validated exactly as before -- this is an edition-
// agnostic, additive seam (today only editions/india/ declares one; US and
// the synthetic fixture are completely unaffected), not an India-only
// special case in build.js itself.
const BUILD_KEYS = new Set([
  "poolRegistry", "questionBanks", "figureManifest", "guideImage",
  "helpContent", "gettingStartedContent", "provenanceSidecars"
]);
// The one non-JSON build input: the Getting Started guide photo. Restricted to
// raster image extensions the build can inline with a correct media type.
const GUIDE_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

// Stage 7D: the exact, allowlisted runtime projection -- every key here has a
// real read site in src/app.js or src/storage.js (docs/EDITIONS.md). Stage
// 8A2 adds one allowlisted field, namespacePolicy, consumed by
// src/storage.js's resolveNamespace(). It is REQUIRED (unlike the profile's
// own figurePolicy): namespacePolicy is itself a required profile root key
// (every valid profile has one), and scripts/build.js's derivation now
// always projects it -- so a projection missing it can only mean a
// derivation bug, exactly the class of mistake this second gate exists to
// catch (see this file's header comment on defense in depth).
const RUNTIME_CONFIG_KEYS = new Set([
  "poolKeys",
  "defaultPoolKey",
  "referenceLabelPrefix",
  "elementLabelPrefix",
  "sourceLabelText",
  "examTimerSecondsValues",
  "displayName",
  "namespacePolicy",
  "elementTermLabel"
]);
const RUNTIME_CONFIG_REQUIRED_KEYS = [
  "poolKeys",
  "defaultPoolKey",
  "referenceLabelPrefix",
  "elementLabelPrefix",
  "sourceLabelText",
  "examTimerSecondsValues",
  "displayName",
  "namespacePolicy",
  "elementTermLabel"
];

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
// namespacePolicy shape (shared by the profile and the runtime projection)
// ---------------------------------------------------------------------------

// legacyKeys is a POSITIONAL contract (Stage 8A2): exactly four entries --
// [0] the legacy active-pool key (never per-pool), [1] the legacy theme key
// (never per-pool), [2] the per-pool index template (must interpolate
// "{poolKey}"), [3] the per-pool bookmarks template (must interpolate
// "{poolKey}"). `at` is the diagnostic prefix ("profile.namespacePolicy" or
// "runtimeConfig.namespacePolicy").
function validateNamespacePolicy(policy, at, push) {
  if (!isPlainObject(policy)) {
    push(`${at} must be an object`);
    return;
  }
  const extra = unknownKeys(policy, NAMESPACE_POLICY_KEYS);
  if (extra.length) push(`${at}: unknown key(s): ${extra.join(", ")}`);

  if (!isNonBlankString(policy.storageKey)) {
    push(`${at}.storageKey must be a non-blank string`);
  }

  const legacyKeys = policy.legacyKeys;
  if (!Array.isArray(legacyKeys) || legacyKeys.length === 0) {
    push(`${at}.legacyKeys must be a non-empty array`);
  } else {
    if (legacyKeys.length !== 4) {
      push(`${at}.legacyKeys must have exactly 4 entries -- [legacy pool key, legacy theme key, per-pool index template, per-pool bookmarks template] -- got ${legacyKeys.length}`);
    }
    const seenLegacy = new Set();
    legacyKeys.forEach((key, i) => {
      if (!isNonBlankString(key)) {
        push(`${at}.legacyKeys[${i}] must be a non-blank string`);
        return;
      }
      if (seenLegacy.has(key)) push(`${at}.legacyKeys: duplicate entry "${key}"`);
      seenLegacy.add(key);
    });
    // Per-slot placeholder contract: slots 0/1 are global keys and must NOT
    // interpolate "{poolKey}"; slots 2/3 are per-pool templates and MUST.
    const slots = [
      { i: 0, role: "legacy pool key", mustContain: false },
      { i: 1, role: "legacy theme key", mustContain: false },
      { i: 2, role: "per-pool index template", mustContain: true },
      { i: 3, role: "per-pool bookmarks template", mustContain: true }
    ];
    for (const slot of slots) {
      const key = legacyKeys[slot.i];
      if (typeof key !== "string") continue; // already reported above
      const hasPlaceholder = key.indexOf("{poolKey}") !== -1;
      if (slot.mustContain && !hasPlaceholder) {
        push(`${at}.legacyKeys[${slot.i}] (the ${slot.role}) must contain the "{poolKey}" placeholder`);
      } else if (!slot.mustContain && hasPlaceholder) {
        push(`${at}.legacyKeys[${slot.i}] (the ${slot.role}) must not contain the "{poolKey}" placeholder`);
      }
    }
  }

  if (!isNonBlankString(policy.cachePrefix)) {
    push(`${at}.cachePrefix must be a non-blank string`);
  } else if (!CACHE_PREFIX_RE.test(policy.cachePrefix)) {
    push(`${at}.cachePrefix must be lowercase letters/digits, hyphen-separated, ending in a hyphen (e.g. "ham-exam-"), got ${JSON.stringify(policy.cachePrefix)}`);
  }

  // probeKey (Stage 8A2) is OPTIONAL: the storage availability probe key an
  // edition reserves. Present-but-blank is rejected; absent is valid.
  if (Object.prototype.hasOwnProperty.call(policy, "probeKey") &&
      !isNonBlankString(policy.probeKey)) {
    push(`${at}.probeKey must be a non-blank string when present`);
  }
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
// `options.poolKeys` (Stage 8A2 seam) optionally substitutes another key set
// (a non-US edition's own pools) for that cross-check; when absent, the
// registry's POOL_KEYS is used, byte-for-byte as before.
function validateEditionProfile(profile, options) {
  const errors = [];
  const push = (m) => errors.push(m);

  // The pool-key set every identity cross-check runs against: the caller's
  // explicit seam option when provided, else the registry's US source of truth.
  const registryPoolKeys = (options && Array.isArray(options.poolKeys) && options.poolKeys.length)
    ? options.poolKeys
    : poolRegistry.POOL_KEYS;

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

  // manifestDescription (Stage 8A2): the PWA manifest's "description" field.
  // Optional -- an edition that doesn't declare one reuses `subtitle` (see
  // scripts/build.js's manifest-slot resolution), so this is a genuine
  // override, not a second required branding field.
  if (Object.prototype.hasOwnProperty.call(profile, "manifestDescription") &&
      !isNonBlankString(profile.manifestDescription)) {
    push("profile.manifestDescription must be a non-blank string when present");
  }

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
        const expected = new Set(registryPoolKeys);
        registryPoolKeys.forEach((key) => {
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
      if (!isNonBlankString(profile.labels.elementTermLabel)) {
        push("profile.labels.elementTermLabel must be a non-blank string");
      }
      TEMPLATE_LABEL_KEYS.forEach((field) => {
        const value = profile.labels[field];
        const placeholder = LABEL_PLACEHOLDERS[field];
        if (!isNonBlankString(value)) {
          push(`profile.labels.${field} must be a non-blank string`);
          return;
        }
        // Occurrence count via split(): the placeholder is a fixed literal
        // (no regex metacharacters), so split() cannot mis-segment on a
        // partial/overlapping match -- occurrences = parts.length - 1.
        const occurrences = value.split(placeholder).length - 1;
        if (occurrences === 0) {
          push(`profile.labels.${field} must contain the "${placeholder}" placeholder`);
        } else if (occurrences > 1) {
          push(`profile.labels.${field} must contain the "${placeholder}" placeholder exactly once, found ${occurrences}`);
        } else if (LABEL_PLACEHOLDER_MUST_BE_FINAL.has(field) && !value.endsWith(placeholder)) {
          push(`profile.labels.${field} must end with the "${placeholder}" placeholder, with no text after it`);
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
    validateNamespacePolicy(profile.namespacePolicy, "profile.namespacePolicy", push);
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
      const requireHtmlExt = (where, value) => {
        if (!value.endsWith(".html")) {
          push(`${where} must name an .html file, got ${JSON.stringify(value)}`);
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
        const extra = unknownKeys(build.questionBanks, new Set(registryPoolKeys));
        if (extra.length) {
          push(`profile.build.questionBanks: unknown pool key(s): ${extra.join(", ")} (not in the pool registry)`);
        }
        registryPoolKeys.forEach((key) => {
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
      // helpContent/gettingStartedContent: optional per-edition overrides of
      // the shared Help & About / Getting Started prose (see BUILD_KEYS's
      // comment). Absent means "use the US default content files".
      if (Object.prototype.hasOwnProperty.call(build, "helpContent")) {
        checkPath("helpContent", build.helpContent, requireHtmlExt);
      }
      if (Object.prototype.hasOwnProperty.call(build, "gettingStartedContent")) {
        checkPath("gettingStartedContent", build.gettingStartedContent, requireHtmlExt);
      }
      // provenanceSidecars (Stage 8D3A): optional, and optional PER POOL
      // (unlike questionBanks, which every pool must have) -- a pool with
      // no entry declares no sidecar and scripts/build.js validates it
      // exactly as before. Present entries still only name pools that
      // actually exist and must each be a safe, existing-later-checked
      // .json path.
      if (Object.prototype.hasOwnProperty.call(build, "provenanceSidecars")) {
        if (!isPlainObject(build.provenanceSidecars)) {
          push("profile.build.provenanceSidecars must be an object keyed by pool key");
        } else {
          const extra = unknownKeys(build.provenanceSidecars, new Set(registryPoolKeys));
          if (extra.length) {
            push(`profile.build.provenanceSidecars: unknown pool key(s): ${extra.join(", ")} (not in the pool registry)`);
          }
          Object.keys(build.provenanceSidecars).forEach((key) => {
            checkPath(`provenanceSidecars.${key}`, build.provenanceSidecars[key], requireJsonExt);
          });
        }
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
function assertEditionProfile(profile, options) {
  const { errors } = validateEditionProfile(profile, options);
  if (errors.length) {
    throw new Error(
      `Edition profile validation failed (${errors.length} error${errors.length === 1 ? "" : "s"}):\n- ` +
      errors.join("\n- ")
    );
  }
}

// ---------------------------------------------------------------------------
// Runtime-projection validation (Stage 7D, pure)
// ---------------------------------------------------------------------------

// Validate the SHAPE of the small runtime projection scripts/build.js embeds
// as window.HAM_EXAM_EDITION_CONFIG. Pure and independent of the full profile
// schema above: it does not re-check pool identity against
// poolRegistry.POOL_KEYS (the profile-level check already owns that), only
// that defaultPoolKey is one of the config's own poolKeys, and that every
// field is present, exactly allowlisted, and well-typed.
function validateEditionRuntimeConfig(config) {
  const errors = [];
  const push = (m) => errors.push(m);

  if (!isPlainObject(config)) {
    return { errors: ["runtimeConfig: root must be an object"] };
  }

  const extra = unknownKeys(config, RUNTIME_CONFIG_KEYS);
  if (extra.length) push(`runtimeConfig: unknown key(s): ${extra.join(", ")}`);
  RUNTIME_CONFIG_REQUIRED_KEYS.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(config, key)) {
      push(`runtimeConfig: missing required field "${key}"`);
    }
  });

  let poolKeysOk = false;
  if (Object.prototype.hasOwnProperty.call(config, "poolKeys")) {
    if (!Array.isArray(config.poolKeys) || config.poolKeys.length === 0) {
      push("runtimeConfig.poolKeys must be a non-empty array");
    } else {
      const seen = new Set();
      let allStrings = true;
      config.poolKeys.forEach((key, i) => {
        if (!isNonBlankString(key)) {
          allStrings = false;
          push(`runtimeConfig.poolKeys[${i}] must be a non-blank string`);
          return;
        }
        if (seen.has(key)) push(`runtimeConfig.poolKeys: duplicate pool key "${key}"`);
        seen.add(key);
      });
      poolKeysOk = allStrings;
    }
  }

  if (Object.prototype.hasOwnProperty.call(config, "defaultPoolKey")) {
    if (!isNonBlankString(config.defaultPoolKey)) {
      push("runtimeConfig.defaultPoolKey must be a non-blank string");
    } else if (poolKeysOk && config.poolKeys.indexOf(config.defaultPoolKey) === -1) {
      push(`runtimeConfig.defaultPoolKey "${config.defaultPoolKey}" must be one of runtimeConfig.poolKeys`);
    }
  }

  ["referenceLabelPrefix", "elementLabelPrefix", "sourceLabelText", "displayName", "elementTermLabel"].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(config, field) && !isNonBlankString(config[field])) {
      push(`runtimeConfig.${field} must be a non-blank string`);
    }
  });

  if (Object.prototype.hasOwnProperty.call(config, "examTimerSecondsValues")) {
    if (!Array.isArray(config.examTimerSecondsValues) || config.examTimerSecondsValues.length === 0) {
      push("runtimeConfig.examTimerSecondsValues must be a non-empty array");
    } else {
      let prev = -1;
      config.examTimerSecondsValues.forEach((value, i) => {
        if (!Number.isInteger(value) || value < 0) {
          push(`runtimeConfig.examTimerSecondsValues[${i}] must be a non-negative integer, got ${JSON.stringify(value)}`);
        } else if (value <= prev) {
          push(`runtimeConfig.examTimerSecondsValues must be strictly ascending with no duplicates (index ${i})`);
        } else {
          prev = value;
        }
      });
    }
  }

  // Stage 8A2: namespacePolicy is allowlisted AND required in the runtime
  // projection (RUNTIME_CONFIG_REQUIRED_KEYS above), fully validated when
  // present (same contract as the profile's own namespacePolicy, including
  // the positional legacyKeys rules) -- its absence is already reported by
  // the missing-required-field loop above, so only shape is checked here.
  if (Object.prototype.hasOwnProperty.call(config, "namespacePolicy")) {
    validateNamespacePolicy(config.namespacePolicy, "runtimeConfig.namespacePolicy", push);
  }

  errors.sort();
  return { errors };
}

// Throw a single Error listing every validation error. Never mutates inputs.
function assertEditionRuntimeConfig(config) {  const { errors } = validateEditionRuntimeConfig(config);
  if (errors.length) {
    throw new Error(
      `Edition runtime config validation failed (${errors.length} error${errors.length === 1 ? "" : "s"}):\n- ` +
      errors.join("\n- ")
    );
  }
}

module.exports = {
  SCHEMA_VERSION,
  ROOT_KEYS,
  REQUIRED_ROOT_KEYS,
  EDITION_KEY_RE,
  CACHE_PREFIX_RE,
  AUTHORITY_KEYS,
  LABEL_KEYS,
  TEMPLATE_LABEL_KEYS,
  LABEL_PLACEHOLDERS,
  LABEL_PLACEHOLDER_MUST_BE_FINAL,
  FIGURE_POLICY_KEYS,
  PROVENANCE_SCHEMES,
  NAMESPACE_POLICY_KEYS,
  BUILD_KEYS,
  GUIDE_IMAGE_EXTENSIONS,
  RUNTIME_CONFIG_KEYS,
  RUNTIME_CONFIG_REQUIRED_KEYS,
  validateBuildRelPath,
  validateNamespacePolicy,
  validateEditionProfile,
  assertEditionProfile,
  validateEditionRuntimeConfig,
  assertEditionRuntimeConfig
};
