#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const figureReferences = require("./figure-references");
const figureManifest = require("./figure-manifest");
const poolRegistry = require("./pool-registry");
const editionProfile = require("./edition-profile");
const versionLabel = require("./version-label");
const questionBank = require("./question-bank");
const { optimizeCss } = require("./css-optimizer");
const { stripJsComments } = require("./strip-js-comments");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const PWA_SRC = path.join(SRC, "pwa");
// Stage 8A2 review-fix: the US default content files for the two
// overridable long-form template placeholders (see loadContentOverride).
const DEFAULT_HELP_CONTENT_FILE = path.join(SRC, "help-content.html");
const DEFAULT_GETTING_STARTED_CONTENT_FILE = path.join(SRC, "getting-started-content.html");

// ---------------------------------------------------------------------------
// Stage 8A2 build-selection seam (docs/EDITION_BUILDS_DESIGN.md)
// ---------------------------------------------------------------------------
//
// `npm run build` (no flag) and `npm run build -- --edition us` both build
// the US edition, UNCHANGED, from its existing `data/edition.json` +
// `data/*.json` + `assets/` layout to `dist/` -- today's exact command,
// paths, and behavior. `npm run build -- --edition <key>` with any other
// `<key>` builds `editions/<key>/edition.json` (and the pool registry/banks/
// optional figures it declares) to its OWN output root,
// `dist-editions/<key>/`, so one edition's build can never overwrite
// another's artifacts -- each edition has a distinct, never-shared OUT_DIR.
// Resolution (parsing the flag, checking the key's shape, confirming its
// edition.json exists and is readable) happens here, FIRST, before any file
// is read for content or any output directory is created, written, or
// removed.

// Parses a single optional `--edition <key>` or `--edition=<key>` flag from
// argv. Returns the given value, or null when the flag is absent (meaning
// "us", the default). Throws on a missing value or conflicting repeats --
// before any mutation, like every other gate in this file.
function parseEditionArg(argv) {
  let selected = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let value;
    if (arg === "--edition") {
      value = argv[i + 1];
      i++;
      if (value === undefined) {
        throw new Error("--edition requires a value, e.g. --edition us");
      }
    } else if (arg.startsWith("--edition=")) {
      value = arg.slice("--edition=".length);
    } else {
      continue;
    }
    if (selected !== null && selected !== value) {
      throw new Error(`--edition was given more than once with different values ("${selected}", "${value}")`);
    }
    selected = value;
  }
  return selected;
}

// Resolves the selected edition's input profile path and output root. "us"
// (or no flag) is special-cased to the existing, unchanged `data/` layout
// and `dist/` output -- never routed through `editions/us/`, which does not
// exist. Any other key must be a safe identifier (the same shape
// EDITION_KEY_RE enforces for editionKey itself -- lowercase/hyphen only, so
// it cannot be used for path traversal) naming a directory under `editions/`
// that actually has a readable edition.json; anything else throws here,
// before main() reads or writes anything else.
function resolveEditionTarget(argv) {
  const requested = parseEditionArg(argv);
  const key = requested === null ? "us" : requested;

  if (key === "us") {
    return {
      key: "us",
      isUsDefault: true,
      profileRel: "data/edition.json",
      profileFile: path.join(ROOT, "data/edition.json"),
      outDir: path.join(ROOT, "dist")
    };
  }

  if (!editionProfile.EDITION_KEY_RE.test(key)) {
    throw new Error(
      `Unknown --edition "${key}": must be "us" or a lowercase, hyphen-separated identifier (e.g. "synthetic")`
    );
  }
  const editionDirRel = path.join("editions", key);
  const editionDir = path.join(ROOT, editionDirRel);
  if (!fs.existsSync(editionDir) || !fs.statSync(editionDir).isDirectory()) {
    throw new Error(`Unknown --edition "${key}": no such directory "${editionDirRel}"`);
  }
  const profileRel = path.join(editionDirRel, "edition.json");
  const profileFile = path.join(ROOT, profileRel);
  if (!fs.existsSync(profileFile)) {
    throw new Error(`Unknown --edition "${key}": ${profileRel} does not exist`);
  }
  return {
    key,
    isUsDefault: false,
    profileRel,
    profileFile,
    outDir: path.join(ROOT, "dist-editions", key)
  };
}

// Stage 7C: a build-input path declared by the edition profile is validated
// syntactically by scripts/edition-profile.js (relative, no traversal). This
// second, build-side check resolves it against the repo root and verifies
// the result stays inside the repository -- belt and braces before any read.
function resolveBuildInput(field, relPath) {
  const resolved = path.resolve(ROOT, relPath);
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
    throw new Error(
      `Edition profile build input ${field} (${JSON.stringify(relPath)}) resolves outside the repository`
    );
  }
  return resolved;
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

// Stage 8A2 review-fix: an optional per-edition HTML-fragment override for
// one of the shared template's long-form content placeholders
// (__HELP_CONTENT__/__GETTING_STARTED_CONTENT__ in src/index.html). `field`
// is the profile.build key ("helpContent"/"gettingStartedContent");
// `defaultFile` is the US default content file (an exact byte-for-byte
// extract of the content these placeholders replaced), read verbatim when
// the profile declares no override -- so these two placeholders still
// resolve to the same text for the US build. A declared override goes
// through the same resolveBuildInput() containment check as every other
// build input.
function loadContentOverride(buildInputs, field, defaultFile) {
  if (Object.prototype.hasOwnProperty.call(buildInputs, field)) {
    const relPath = buildInputs[field];
    const file = resolveBuildInput(`build.${field}`, relPath);
    try {
      return read(file);
    } catch (error) {
      throw new Error(
        `Content override ${relPath} (profile build.${field}) could not be read: ${error.message}`
      );
    }
  }
  return read(defaultFile);
}

function loadPool(key, relPath) {
  // Stage 7C: the bank's path comes from the edition profile's validated
  // build inputs, never a hardcoded per-pool constant.
  const file = resolveBuildInput(`build.questionBanks.${key}`, relPath);
  let raw;
  try {
    raw = read(file);
  } catch (error) {
    throw new Error(
      `Question bank ${relPath} (profile build.questionBanks.${key}) could not be read: ${error.message}`
    );
  }
  const questions = JSON.parse(raw);
  // Stage 5B4 build gate. Validate the base question-bank schema -- required/
  // optional top-level fields (unknown fields rejected), scalar types and
  // non-emptiness, unique IDs, and the choices/correct/correctText shape --
  // before the registry/figure gates and any dist/ mutation. (The one gate
  // that now runs earlier is the Stage 7C edition-profile gate itself, whose
  // validated build inputs supply this bank's path -- a strictly required
  // reordering, documented in docs/EDITIONS.md.) Question-ID syntax/prefix,
  // sub-consistency, figure semantics, expected counts, and blueprint
  // coverage are validated separately (see scripts/pool-registry.js and
  // scripts/figure-references.js/figure-manifest.js); this gate owns only
  // the base per-question shape.
  questionBank.assertQuestionBank(questions, { poolKey: key });
  // Stage 7E size-recovery: `correctText` byte-for-byte duplicates
  // `choices[correct]` -- the bank gate above already enforces that invariant
  // for every question -- and no shipped runtime code reads it (src/app.js
  // renders the revealed answer from `choices[correct]` directly). Drop the
  // dead duplicate field from the EMBEDDED copy only; data/*.json keeps the
  // full documented schema, the bank gate still validates the invariant, and
  // every downstream gate (registry, figure) operates on fields it owns.
  for (const question of questions) delete question.correctText;
  // Stage 7E: the per-pool figure-reference gate moved OUT of loadPool to
  // AFTER the pool-registry gate below, so the expected figure prefix comes
  // from the VALIDATED registry metadata (questionIdPrefix) instead of a
  // hardcoded pool-key map -- still before any dist/ mutation.
  //
  // Stage 8A2: `title` is deliberately NOT set here (it used to come from a
  // hardcoded US pool-key map, POOL_TITLES). The embedded HAM_EXAM_BANKS
  // title now comes from the validated pool registry's own `displayName`
  // (see main()'s banks-finalization step below, right after the registry
  // gate) -- the one source already shown identical to the old hardcoded
  // values for every US pool, and the only source that exists at all for a
  // non-US edition's own pool keys.
  return { key, questions };
}

// Stage 2D build gate. Fully validate the figure manifest -- schema, the
// question-to-figure cross-check against every pool, on-disk asset content and
// exact checksums, safe paths, unlisted assets, and every checksum-pinned
// source PDF (a missing PDF is an error: it is now a committed input) -- and
// throw before the build writes, copies, or removes anything under dist/.
// Reuses scripts/figure-manifest.js; no skip flags, fallbacks, network, or
// figure extraction. Stage 7C: the manifest's path comes from the edition
// profile's validated build inputs (absent => the edition has no figures).
function assertFigureManifest(banks, relPath, figurePrefixes) {
  const file = resolveBuildInput("build.figureManifest", relPath);
  let rawManifest;
  try {
    rawManifest = read(file);
  } catch (error) {
    throw new Error(
      `Figure manifest ${relPath} (profile build.figureManifest) could not be read: ${error.message}`
    );
  }
  let manifest;
  try {
    manifest = JSON.parse(rawManifest);
  } catch (error) {
    throw new Error(
      `Figure manifest ${relPath} (profile build.figureManifest) is not valid JSON: ${error.message}`
    );
  }
  figureManifest.assertFigurePipeline(manifest, { banks, repoRoot: ROOT, fs, figurePrefixes });
  return manifest;
}

// Stage 4A0 build gate (extended in Stage 5A with mock-exam configuration).
// Read, parse, and fully validate the canonical pool registry against the
// already-loaded banks -- schema, exact pool-key set, unique edition/revision
// identities, dates, counts, ID format/prefix/uniqueness, sub consistency,
// passing score, default timer, withdrawn IDs, and group blueprint -- and
// throw before the build writes, copies, or removes anything under dist/.
// No skip flags, fallbacks, or network. Stage 7C: the registry's path comes
// from the edition profile's validated build inputs. Stage 8A2: `idPolicy`
// ("us", the default, or "generic") selects the question-ID identity rules
// (scripts/pool-registry.js); the US build always passes "us" explicitly.
function assertPoolsRegistry(banks, relPath, idPolicy) {
  const file = resolveBuildInput("build.poolRegistry", relPath);
  let raw;
  try {
    raw = read(file);
  } catch (error) {
    throw new Error(
      `Pool registry ${relPath} (profile build.poolRegistry) could not be read: ${error.message}`
    );
  }
  let registry;
  try {
    registry = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Pool registry ${relPath} (profile build.poolRegistry) is not valid JSON: ${error.message}`
    );
  }
  poolRegistry.assertPoolRegistry(registry, banks, { idPolicy });
  return registry;
}

// Stage 7B build gate. Read, parse, and fully validate the minimal edition
// profile -- schema, editionKey shape, pool-key identity, label-template
// placeholders, exam-timer values, optional figure policy, and namespace
// policy -- and throw before the build writes, copies, or removes anything
// under dist/. No skip flags, fallbacks, or network. Stage 8A2: `target`
// (from resolveEditionTarget) supplies which profile file to read and
// requires its editionKey to equal the selected non-US key (the US default
// carries no such constraint -- the US profile's own editionKey, "us-fcc",
// is unrelated to the "us" selector). `poolKeysOption`, when given,
// substitutes the selected edition's own declared pool-key identity for the
// cross-checks that otherwise default to poolRegistry.POOL_KEYS (see
// scripts/edition-profile.js's validateEditionProfile). There is no
// external registry constant to compare a non-US edition's pool-key
// identity against, so a non-US build uses the profile's OWN declared
// poolKeys as that reference -- meaningful for the real cross-check this
// enables (profile.build.questionBanks's keys must agree with it), even
// though poolKeys-vs-itself is trivially consistent.
function assertEditionProfile(target) {
  let raw;
  try {
    raw = read(target.profileFile);
  } catch (error) {
    throw new Error(
      `Edition profile ${target.profileRel} could not be read: ${error.message}`
    );
  }
  let profile;
  try {
    profile = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Edition profile ${target.profileRel} is not valid JSON: ${error.message}`
    );
  }
  if (!target.isUsDefault && profile.editionKey !== target.key) {
    throw new Error(
      `Edition profile ${target.profileRel} declares editionKey ${JSON.stringify(profile.editionKey)}, ` +
      `but "--edition ${target.key}" was requested`
    );
  }
  const poolKeysOption = (!target.isUsDefault && Array.isArray(profile.poolKeys))
    ? { poolKeys: profile.poolKeys }
    : undefined;
  editionProfile.assertEditionProfile(profile, poolKeysOption);
  return profile;
}

// Build the MINIMAL runtime metadata embedded from the ALREADY-VALIDATED
// edition profile. This is inert (Stage 7B): no current runtime code reads
// window.HAM_EXAM_EDITION yet -- parameterizing src/app.js/src/storage.js/
// figure validators/PWA behavior/labels/pool defaults is explicitly deferred
// to a later stage (docs/EDITIONS.md).
//
// Deliberately just the one field: editionKey is the only value with no
// existing runtime source at all (a stable "which edition is this build"
// signal). Every other profile field stays validated in data/edition.json
// but is not yet embedded -- poolKeys/defaultPoolKey (pool identity/
// defaults), displayName/subtitle/jurisdiction/authority/labels (branding,
// currently static src/index.html text), examTimerSecondsValues (already
// enforced by src/storage.js), and figurePolicy/namespacePolicy all carry no
// runtime consumer today, so embedding them now would only spend
// standalone-budget bytes (the 16 KiB safety target left very little room)
// on data nothing reads. A later stage that actually parameterizes pool
// defaults, labels, timers, or branding embeds those fields then, re-deriving
// them from this same validated file. Returns the bare editionKey string
// (not an object -- see the embedding call site's comment).
function buildPublicEditionProfile(profile) {
  return profile.editionKey;
}

// Stage 7D: derive the small, allowlisted runtime PROJECTION actually
// consumed by src/app.js (window.HAM_EXAM_EDITION_CONFIG) from the same
// already-validated profile. Every field here has a real read site in
// src/app.js (see docs/EDITIONS.md); pool-specific data (counts, scoring,
// hierarchy, question IDs/prefixes, per-pool labels, exam defaults) is never
// duplicated here -- it stays exclusively in HAM_EXAM_POOLS. Build-only data
// (paths, provenance, the rest of the profile) is never included either.
//
// referenceLabelPrefix/elementLabelPrefix are the literal text BEFORE each
// template's own placeholder (guaranteed present by assertEditionProfile's
// own LABEL_PLACEHOLDERS check) -- both real src/app.js call sites only ever
// concatenate a prefix before a per-question/per-pool dynamic value, so this
// avoids shipping a general-purpose runtime templating helper for one
// trailing substitution. sourceLabelText is fully resolved at build time
// (authority.poolSourceAbbreviation is itself static profile data), so no
// runtime substitution is needed for it at all.
// Stage 8A2: the projection gains exactly one field, namespacePolicy, passed
// through verbatim from the already-validated profile (same object shape;
// assertEditionProfile already fully validated it, and
// assertEditionRuntimeConfig below validates it again on the derived
// output -- defense in depth, not a second independent source of truth).
// src/storage.js resolves it into concrete storage/cache namespace values,
// falling back to its own US literals when a build predates this field (it
// never will for a build going through this function, but storage.js is
// also embedded, unmodified, in any output produced by an older build.js).
function buildEditionRuntimeConfig(profile) {
  const refPlaceholder = editionProfile.LABEL_PLACEHOLDERS.referenceLabelTemplate;
  const elementPlaceholder = editionProfile.LABEL_PLACEHOLDERS.elementLabelTemplate;
  const sourcePlaceholder = editionProfile.LABEL_PLACEHOLDERS.sourceLabelTemplate;
  return {
    poolKeys: profile.poolKeys,
    defaultPoolKey: profile.defaultPoolKey,
    referenceLabelPrefix: profile.labels.referenceLabelTemplate.split(refPlaceholder)[0],
    elementLabelPrefix: profile.labels.elementLabelTemplate.split(elementPlaceholder)[0],
    sourceLabelText: profile.labels.sourceLabelTemplate.replace(
      sourcePlaceholder, profile.authority.poolSourceAbbreviation
    ),
    examTimerSecondsValues: profile.examTimerSecondsValues,
    displayName: profile.displayName,
    namespacePolicy: profile.namespacePolicy,
    elementTermLabel: profile.labels.elementTermLabel
  };
}

// Build the minimal PUBLIC registry embedded in each generated HTML document
// from the ALREADY-VALIDATED registry. Only the public identity fields -- no
// build-only data, file paths, checksums, or source-PDF references.
// Stage 8A2: `poolKeys` is the selected edition's own pool-key list (the US
// build passes poolRegistry.POOL_KEYS, as before; a non-US build passes its
// own profile's poolKeys) -- never a hardcoded US-only constant.
function buildPublicPoolsRegistry(registry, poolKeys) {
  const out = {};
  for (const key of poolKeys) {
    const entry = registry.pools[key];
    out[key] = {
      poolKey: entry.poolKey,
      displayName: entry.displayName,
      editionId: entry.editionId,
      revisionId: entry.revisionId,
      element: entry.element,
      effectiveStart: entry.effectiveStart,
      effectiveEnd: entry.effectiveEnd,
      expectedCount: entry.expectedCount,
      questionIdPrefix: entry.questionIdPrefix,
      sourceUrl: entry.sourceUrl,
      errataLabel: entry.errataLabel,
      // Stage 5A mock-exam configuration: public and runtime-required (the
      // exam engine and setup UI read these directly), unlike build-only
      // data such as file paths, checksums, or PDF provenance.
      examQuestionCount: entry.examQuestionCount,
      passingScore: entry.passingScore,
      defaultTimeLimitSeconds: entry.defaultTimeLimitSeconds,
      withdrawnIds: entry.withdrawnIds,
      groupBlueprint: entry.groupBlueprint,
      // Stage 6A1: validated human-readable subelement/group titles for the
      // scoped-study selector. Public and runtime-required, unlike build-only
      // provenance (source PDF paths, checksums) which is never embedded.
      scopeLabels: entry.scopeLabels
    };
  }
  return out;
}

const FIGURE_MEDIA_TYPES = { ".png": "image/png", ".svg": "image/svg+xml" };
// Stage 7C: the Getting Started guide photo's media type is derived from the
// profile-declared file extension (the US profile declares .jpg). A 1x1
// transparent GIF is inlined when an edition declares no guide image, so the
// template's __GUIDE_IMAGE__ placeholder always resolves (editions without a
// photo are expected to adjust the template's alt text in their own src/).
const GUIDE_IMAGE_MEDIA_TYPES = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp"
};
// A valid, minimal 1x1 GIF that is ACTUALLY transparent -- a Graphic Control
// Extension marks color index 0 as transparent, and the single pixel uses
// that index -- used when an edition declares no guide image, so the
// template's __GUIDE_IMAGE__ placeholder always resolves as an invisible
// spacer rather than a solid-color box. A prior literal here decoded to a
// structurally valid but fully OPAQUE white pixel (no Graphic Control
// Extension at all); a build-gate test now parses the GIF's block structure
// and asserts the transparency flag and transparent color index directly,
// so "transparent" is verified, not assumed.
const GUIDE_IMAGE_PLACEHOLDER = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";

// Build the minimal runtime figure registry from the ALREADY-VALIDATED manifest
// and asset bytes (assertFigureManifest has verified every checksum, path, and
// PNG/SVG structure). One entry per figure ID, embedded once per generated HTML
// document -- never once per referencing question. Only the fields the study
// container needs: data URL, alt text, and intrinsic dimensions for layout.
// Source PDFs, provenance, and other manifest fields are not embedded.
function buildFigureRegistry(manifest) {
  const registry = {};
  for (const fig of manifest.figures) {
    const ext = path.extname(fig.file).toLowerCase();
    const media = FIGURE_MEDIA_TYPES[ext];
    if (!media) {
      throw new Error(`Figure ${fig.id}: unsupported asset extension "${ext}" for inline packaging`);
    }
    const bytes = fs.readFileSync(path.join(ROOT, fig.file));
    const entry = {
      src: `data:${media};base64,${bytes.toString("base64")}`,
      alt: fig.alt
    };
    if (ext === ".png" && bytes.length >= 24 &&
        bytes.readUInt32BE(0) === 0x89504e47) {
      entry.w = bytes.readUInt32BE(16);
      entry.h = bytes.readUInt32BE(20);
    }
    registry[fig.id] = entry;
  }
  return registry;
}

// Stage 8A2 branding slots are substituted directly into HTML text content
// (not a <script>/JSON context, where asInlineScript already handles
// escaping) and into manifest.webmanifest's JSON. Both profile fields are
// trusted, committed build input (schema-validated non-blank strings, not
// runtime/user data), but every current value (US included) happens to need
// no escaping -- these exist so a future profile value containing
// HTML-significant or JSON-significant characters fails safe instead of
// corrupting the generated document's markup or manifest JSON.
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// The escaped CONTENTS of a JSON string literal, without its surrounding
// quotes (the manifest template already supplies those around each
// placeholder) -- e.g. for substituting into `"name": "__PLACEHOLDER__"`.
function jsonStringContent(value) {
  return JSON.stringify(String(value)).slice(1, -1);
}

function asInlineScript(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function render(template, replacements) {
  let output = template;
  Object.keys(replacements).forEach(placeholder => {
    // A replacement CALLBACK, not a plain string: String.replace() only
    // interprets $&/$`/$'/$$-style patterns in a string second argument. A
    // callback's return value is always inserted literally, so inlined CSS,
    // JS, registry, or question-bank content can never be misread as one of
    // those patterns, however it happens to be worded.
    output = output.replace(placeholder, () => replacements[placeholder]);
  });
  const unresolved = output.match(/__[A-Z_]+__/g);
  if (unresolved) {
    throw new Error(`Template still contains unresolved placeholders: ${unresolved.join(", ")}`);
  }
  return output;
}

function copy(file, destination) {
  fs.copyFileSync(file, destination);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("base64");
}

function applyContentSecurityPolicy(html, isPwa) {
  const hashes = [];
  const scripts = /<script>([\s\S]*?)<\/script>/g;
  let match;
  while ((match = scripts.exec(html)) !== null) {
    hashes.push(`'sha256-${sha256(match[1])}'`);
  }

  const policy = [
    `default-src ${isPwa ? "'self'" : "'none'"}`,
    `script-src ${isPwa ? "'self' " : ""}${hashes.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${isPwa ? "'self' " : ""}data:`,
    `connect-src ${isPwa ? "'self'" : "'none'"}`,
    `worker-src ${isPwa ? "'self'" : "'none'"}`,
    `manifest-src ${isPwa ? "'self'" : "'none'"}`,
    "font-src 'none'",
    "media-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join("; ");
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
  return html.replace("<!-- CONTENT_SECURITY_POLICY -->", meta);
}

function main() {
  // Stage 8A2: resolve the selected edition FIRST -- before reading
  // package.json, the template, or any other input -- so an unknown
  // --edition value, a missing editions/<key>/ directory, or a missing
  // edition.json fails immediately and cannot mutate either dist/ or
  // dist-editions/.
  const target = resolveEditionTarget(process.argv.slice(2));

  const packageJson = JSON.parse(read(path.join(ROOT, "package.json")));
  const appVersion = packageJson.version;
  if (typeof appVersion !== "string" ||
      !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(appVersion)) {
    throw new Error("package.json must contain a valid semantic version");
  }
  // Stage 5B1: package.json's version is the ONLY authority. The displayed
  // release-status label ("(beta)"/"(prerelease)"/plain) is derived here,
  // ONCE, by scripts/version-label.js -- the same function this module's own
  // unit tests exercise directly (tests/unit/version-label.test.js). Both
  // generated documents' footer and Help/About text read the single embedded
  // result (window.HAM_EXAM_VERSION_DISPLAY, below) instead of each deciding
  // the suffix themselves.
  const appVersionDisplay = versionLabel.deriveVersionDisplay(appVersion);
  const template = read(path.join(SRC, "index.html"));
  // Optimize only the generated inline copies; keep source CSS/JS readable.
  const css = optimizeCss(read(path.join(SRC, "style.css")));
  const examEngineJs = stripJsComments(read(path.join(SRC, "exam-engine.js")));
  const storageJs = stripJsComments(read(path.join(SRC, "storage.js")));
  const studyScopeJs = stripJsComments(read(path.join(SRC, "study-scope.js")));
  const js = stripJsComments(read(path.join(SRC, "app.js")));

  // Mandatory edition-profile gate (Stages 7B/7C): pure schema/identity/path
  // validation, no dependency on banks. Runs FIRST among the data gates
  // because its validated build inputs supply every other data path below
  // (question banks, pool registry, figure manifest, guide image) -- a
  // strictly required reordering from Stage 7B, where the profile owned no
  // build inputs. Still before the first output mutation (fs.mkdirSync /
  // writeFileSync / rmSync / copies).
  const editionProfileData = assertEditionProfile(target);
  const buildInputs = editionProfileData.build;
  const editionKey = buildPublicEditionProfile(editionProfileData);

  // Stage 8C: derive and re-check namespacePolicy.cachePrefix here, right
  // alongside the other mandatory gates and still before the first output
  // mutation, even though assertEditionProfile() above already enforced
  // CACHE_PREFIX_RE as part of the full profile validation. cachePrefix is
  // substituted directly into src/pwa/sw.js as JS SOURCE TEXT (below in
  // main()) rather than through asInlineScript()'s JSON-safe embedding --
  // a service worker has no access to window.HAM_EXAM_EDITION_CONFIG, so
  // the build must bake the literal in -- which made an unconstrained value
  // here a confirmed JS-injection vector into the shipped service worker
  // before this pattern existed (a cachePrefix containing `"; <script>`
  // broke out of its string literal). This explicit re-check is cheap
  // defense in depth against that one gate ever silently regressing, named
  // at the point its guarantee is actually load-bearing, not relied on
  // implicitly from several hundred lines away.
  const cachePrefix = editionProfileData.namespacePolicy.cachePrefix;
  if (!editionProfile.CACHE_PREFIX_RE.test(cachePrefix)) {
    throw new Error(
      `Edition profile namespacePolicy.cachePrefix ${JSON.stringify(cachePrefix)} does not match ` +
      `${editionProfile.CACHE_PREFIX_RE} -- this should have been rejected by the earlier profile gate`
    );
  }
  // A bare string, matching window.HAM_EXAM_VERSION's own convention for a
  // single stable identity value -- not an object, since editionKey is
  // (deliberately, for now) the only field embedded. See
  // buildPublicEditionProfile's comment for what stays validated-only.
  const editionProfileLiteral =
    "window.HAM_EXAM_EDITION = " + asInlineScript(editionKey) + ";";

  // Stage 7D: derive and validate the small runtime projection BEFORE any
  // dist/ mutation, alongside the other mandatory gates. Defense in depth --
  // see scripts/edition-profile.js's own comment on why this can only ever
  // fire for a derivation bug, not a data problem (assertEditionProfile()
  // above already guarantees every input field here is well-formed).
  const editionRuntimeConfig = buildEditionRuntimeConfig(editionProfileData);
  editionProfile.assertEditionRuntimeConfig(editionRuntimeConfig);
  const editionRuntimeConfigLiteral =
    "window.HAM_EXAM_EDITION_CONFIG = " + asInlineScript(editionRuntimeConfig) + ";";

  // Load and validate all of this edition's question pools. The US build
  // keeps iterating poolRegistry.POOL_KEYS -- its own canonical order,
  // independent of however data/edition.json's poolKeys happens to be
  // authored (Stage 7C behavior, unchanged: HAM_EXAM_BANKS's key order never
  // moves just because someone reorders the profile). A non-US edition has
  // no such external canonical-order constant, so it uses its own profile's
  // declared poolKeys order instead -- the only ordering source that exists
  // for it.
  const poolIterationKeys = target.isUsDefault ? poolRegistry.POOL_KEYS : editionProfileData.poolKeys;
  const pools = poolIterationKeys.map((key) =>
    loadPool(key, buildInputs.questionBanks[key])
  );
  const banks = {};
  pools.forEach(pool => {
    banks[pool.key] = { questions: pool.questions };
  });

  // Mandatory pool-registry gate (Stage 4A0): runs after the banks are loaded
  // (which already runs the Stage 2A per-pool reference gate inside loadPool)
  // and BEFORE the figure gate and the first output mutation below
  // (fs.mkdirSync(OUT_DIR) / writeFileSync / rmSync(PWA_OUT_DIR) / copies).
  // Stage 8A2: "us" pins the historical NCVEC identity shapes; a non-US
  // edition uses "generic" (structural validation only -- see
  // scripts/pool-registry.js).
  const poolsRegistry = assertPoolsRegistry(
    banks, buildInputs.poolRegistry, target.isUsDefault ? "us" : "generic"
  );
  // Stage 8A2: HAM_EXAM_BANKS titles now come from the validated registry's
  // own displayName (identical to the old hardcoded POOL_TITLES map for
  // every US pool; see loadPool's comment) instead of a US-only constant --
  // the only source that exists at all for a non-US edition's pool keys.
  pools.forEach(pool => {
    banks[pool.key].title = poolsRegistry.pools[pool.key].displayName;
  });
  const publicPoolsRegistry = buildPublicPoolsRegistry(poolsRegistry, poolIterationKeys);
  const poolsRegistryLiteral =
    "window.HAM_EXAM_POOLS = " + asInlineScript(publicPoolsRegistry) + ";";

  // Stage 7E figure-reference gate (was inside loadPool in Stages 2A-7D): runs
  // after the registry gate so each pool's expected figure-ID prefix is the
  // VALIDATED registry metadata (questionIdPrefix) instead of a hardcoded
  // pool-key map -- and before the first dist/ mutation below. A pool whose
  // registry entry is missing here cannot happen: the registry gate above
  // validates the exact pool-key set, so this fails closed by construction;
  // assertPoolFigureReferences still rejects a malformed prefix policy itself.
  const figurePrefixes = {};
  for (const key of poolIterationKeys) {
    figurePrefixes[key] = poolsRegistry.pools[key].questionIdPrefix;
  }
  for (const pool of pools) {
    figureReferences.assertPoolFigureReferences(pool.questions, pool.key, figurePrefixes[pool.key]);
  }

  // Mandatory figure-pipeline gate: runs after the Stage 7E per-pool
  // reference check above and BEFORE the first output mutation below
  // (fs.mkdirSync(OUT_DIR) / writeFileSync / rmSync(PWA_OUT_DIR) / copies).
  // Stage 7C: an edition without a declared figure manifest has no figures --
  // the embedded registry is the empty object and the gate is skipped, but
  // ONLY when no loaded bank question actually references a figure (the
  // per-pool figure-reference gate above already guarantees every textual
  // "figure <id>" reference carries a `figure` mapping, so checking
  // the mapping's presence is equivalent to checking for references).
  // Review fix: banks WITH figure references must never build against an
  // omitted manifest, even when the profile also omits figurePolicy (which
  // would bypass the pure validator's manifestRequired cross-check) -- the
  // data itself forces the manifest here.
  const anyFigureReferences = pools.some(pool =>
    pool.questions.some(question => Object.prototype.hasOwnProperty.call(question, "figure"))
  );
  const hasDeclaredManifest = Object.prototype.hasOwnProperty.call(buildInputs, "figureManifest");
  if (anyFigureReferences && !hasDeclaredManifest) {
    throw new Error(
      "Edition profile build.figureManifest is required: the loaded question banks " +
      "contain figure references, but no figure manifest is declared (and the " +
      "figure-pipeline validation cannot run without one)"
    );
  }
  if (anyFigureReferences && !editionProfileData.figurePolicy) {
    throw new Error(
      "Edition profile figurePolicy is required: the loaded question banks contain " +
      "figure references, so a figure policy (manifestRequired: true) must be declared"
    );
  }
  if (anyFigureReferences && editionProfileData.figurePolicy.manifestRequired !== true) {
    throw new Error(
      "Edition profile figurePolicy.manifestRequired must be true: the loaded " +
      "question banks contain figure references"
    );
  }
  const figuresManifest = hasDeclaredManifest
    ? assertFigureManifest(banks, buildInputs.figureManifest, figurePrefixes)
    : null;
  const figureRegistry = figuresManifest ? buildFigureRegistry(figuresManifest) : {};
  const figureRegistryLiteral =
    "window.HAM_EXAM_FIGURES = " + asInlineScript(figureRegistry) + ";";

  // Stage 8A2 review-fix: the long-form Help & About / Getting Started
  // prose is an edition-overridable build input (see loadContentOverride's
  // comment) -- read before any output mutation, like every other build
  // input. Absent override -> today's exact US content, read verbatim.
  const helpContentHtml = loadContentOverride(buildInputs, "helpContent", DEFAULT_HELP_CONTENT_FILE).trim();
  const gettingStartedContentHtml =
    loadContentOverride(buildInputs, "gettingStartedContent", DEFAULT_GETTING_STARTED_CONTENT_FILE).trim();

  // Stage 6A5 / Stage 7C: the Getting Started guide image is a single static,
  // non-question-linked photo -- no manifest or checksum is warranted for one
  // static asset. Read from the profile-declared path when present; otherwise
  // inline a 1x1 transparent placeholder (see GUIDE_IMAGE_PLACEHOLDER).
  let guideImageRel = null;
  let guideImageDataUri = GUIDE_IMAGE_PLACEHOLDER;
  if (Object.prototype.hasOwnProperty.call(buildInputs, "guideImage")) {
    guideImageRel = buildInputs.guideImage;
    const guideImageFile = resolveBuildInput("build.guideImage", guideImageRel);
    const guideImageBytes = fs.readFileSync(guideImageFile);
    const media = GUIDE_IMAGE_MEDIA_TYPES[path.extname(guideImageRel).toLowerCase()];
    if (!media) {
      throw new Error(`Guide image ${guideImageRel} has an unsupported extension for inline packaging`);
    }
    guideImageDataUri = `data:${media};base64,${guideImageBytes.toString("base64")}`;
  }

  const totalQuestions = pools.reduce((sum, pool) => sum + pool.questions.length, 0);

  // Stage 8A2 branding slots (docs/EDITION_BUILDS_DESIGN.md "Shared vs.
  // edition-specific files"): the document <title>, the <h1> app name and
  // tagline, and the static About app name are resolved here from the
  // already-validated profile and substituted into the shared template.
  // The US profile's displayName/subtitle resolve to today's exact literals
  // ("US Ham Exam" / "FCC Amateur Radio License Study"), so these four
  // slots render identical text to before -- the US build overall is
  // deterministic and behaviorally compatible with the pre-Stage-8A2
  // baseline, not byte-identical to it (namespacePolicy/elementTermLabel
  // projection and the storage.js identity/namespace code add measured
  // bytes; see docs/EDITION_BUILDS_DESIGN.md "Rollback and risks"). The
  // long-form Help/Getting Started prose around these slots IS templated
  // (loadContentOverride() below, __HELP_CONTENT__/__GETTING_STARTED_CONTENT__)
  // -- it is no longer hardcoded shared chrome for every edition.
  const editionTitle = escapeHtml(`${editionProfileData.displayName} — ${editionProfileData.subtitle}`);
  const editionAppName = escapeHtml(editionProfileData.displayName);
  const editionTagline = escapeHtml(editionProfileData.subtitle);
  const editionAboutName = escapeHtml(editionProfileData.displayName);
  // manifestDescription defaults to subtitle (docs/EDITION_BUILDS_DESIGN.md);
  // the US profile declares its current literal explicitly so the shipped
  // manifest.webmanifest stays byte-identical (subtitle alone differs from
  // today's description text).
  const manifestDescription = editionProfileData.manifestDescription || editionProfileData.subtitle;
  // Stage 8C: src/pwa/head.html's apple-mobile-web-app-title and meta
  // description were the last two hardcoded US strings in PWA metadata
  // (manifest.webmanifest and the branding slots were already templated in
  // Stage 8A2). No new profile field: these reuse the SAME already-resolved
  // displayName/manifestDescription values the manifest itself uses, so a
  // synthetic edition's PWA head and manifest describe the app identically,
  // and the US profile's declared manifestDescription keeps head.html's meta
  // description byte-identical to before this field existed.
  const editionHeadTitle = editionAppName;
  const editionHeadDescription = escapeHtml(manifestDescription);

  // Embed the pools as a JS object literal. This avoids JSON.parse on the
  // textContent of a script tag, which can fail on some mobile Safari/WebKit
  // versions due to UTF-8 decoding bugs.
  const bankLiteral =
    "window.HAM_EXAM_VERSION = " + asInlineScript(appVersion) + ";\n" +
    "window.HAM_EXAM_VERSION_DISPLAY = " + asInlineScript(appVersionDisplay) + ";\n" +
    "window.HAM_EXAM_BANKS = " + asInlineScript(banks) + ";";

  const shared = {
    "__CSS__": css.trim(),
    "__BANK__": bankLiteral,
    // Stage 7B/7D: the inert edition identity (window.HAM_EXAM_EDITION) and
    // the small runtime projection (window.HAM_EXAM_EDITION_CONFIG, Stage 7D)
    // share this placeholder's <script> tag with the pool registry rather
    // than getting their own -- same technique __BANK__ already uses for
    // HAM_EXAM_VERSION/HAM_EXAM_VERSION_DISPLAY/HAM_EXAM_BANKS -- since every
    // byte here counts against the standalone budget. Both are ordered
    // BEFORE poolsRegistryLiteral so the pools JSON literal remains the last
    // statement in the tag, immediately followed by ";</script>" -- existing
    // test/tooling code that extracts HAM_EXAM_POOLS by scanning forward to
    // the next ";</script>" keeps working unchanged.
    "__POOLS__": editionProfileLiteral + editionRuntimeConfigLiteral + poolsRegistryLiteral,
    "__FIGURES__": figureRegistryLiteral,
    // Must be substituted BEFORE __GUIDE_IMAGE__/__EDITION_ABOUT_NAME__:
    // the default US content files themselves still contain those two
    // placeholders verbatim (the Getting Started photo and the About app
    // name sit inside this long-form prose) -- render()'s per-placeholder
    // String.replace() only fires once per key, in this object's OWN
    // iteration order, so whichever of a pair of nested placeholders is
    // substituted first must be the OUTER one.
    "__HELP_CONTENT__": helpContentHtml,
    "__GETTING_STARTED_CONTENT__": gettingStartedContentHtml,
    "__GUIDE_IMAGE__": guideImageDataUri,
    "__ENGINE__": examEngineJs.trim(),
    // Stage 4A1: inert versioned-storage module (window.HAM_EXAM_STORAGE).
    // Placed after the embedded banks/pool registry and before __JS__
    // (src/app.js), which does not call it yet -- see docs/POOL_STORAGE_PLAN.md.
    "__STORAGE__": storageJs.trim(),
    // Stage 6A: pure, transient scoped-study filtering module
    // (window.HAM_EXAM_STUDY_SCOPE). Never touches storage; placed after the
    // storage module and before __JS__ (src/app.js), which is its only caller.
    "__SCOPE__": studyScopeJs.trim(),
    "__JS__": js.trim(),
    // Stage 5B1: the pre-derived release-status label for the static
    // pre-JS-load fallback footer in src/index.html (see appVersionDisplay
    // above; the runtime footer and Help text read the same value from
    // window.HAM_EXAM_VERSION_DISPLAY instead of re-deriving it).
    "__APP_VERSION_DISPLAY__": appVersionDisplay,
    "__EDITION_TITLE__": editionTitle,
    "__EDITION_APP_NAME__": editionAppName,
    "__EDITION_TAGLINE__": editionTagline,
    "__EDITION_ABOUT_NAME__": editionAboutName
  };
  const standaloneDraft = render(template, {
    ...shared,
    "__PWA_HEAD__": "",
    "__PWA_UI__": "",
    "__PWA_JS__": ""
  });
  const pwaDraft = render(template, {
    ...shared,
    // __EDITION_HEAD_TITLE__/__EDITION_HEAD_DESCRIPTION__ are placeholders
    // INSIDE head.html's own text, spliced into `output` by the __PWA_HEAD__
    // substitution immediately above -- they must be keyed AFTER __PWA_HEAD__
    // in this object (render() resolves one key at a time, in insertion
    // order; a placeholder that doesn't exist in `output` yet when its OWN
    // key is processed is never revisited) so they resolve the newly-spliced
    // text, not nothing. Distinct placeholder names from __EDITION_APP_NAME__
    // (used once already, in the document <h1>) because render()'s
    // single-occurrence String.replace() would otherwise leave this file's
    // copy unresolved and fail the build's own unresolved-placeholder check.
    "__PWA_HEAD__": read(path.join(PWA_SRC, "head.html")).trim(),
    "__EDITION_HEAD_TITLE__": editionHeadTitle,
    "__EDITION_HEAD_DESCRIPTION__": editionHeadDescription,
    "__PWA_UI__": read(path.join(PWA_SRC, "install.html")).trim(),
    "__PWA_JS__": read(path.join(PWA_SRC, "register.js")).trim()
  });
  const standalone = applyContentSecurityPolicy(standaloneDraft, false);
  const pwa = applyContentSecurityPolicy(pwaDraft, true);

  // Stage 8A2: every path below is derived from target.outDir, resolved
  // before any file in this function was even read (resolveEditionTarget,
  // called at the top of main()). The US build's target.outDir is `dist/`,
  // unchanged; any other edition's is its own `dist-editions/<key>/`, so
  // this build can only ever create, write, or remove files under the ONE
  // output root it resolved -- never the other edition's. Computing these
  // path STRINGS is not itself a mutation -- no fs call happens here.
  const outDir = target.outDir;
  const outFile = path.join(outDir, "index.html");
  const pwaOutDir = path.join(outDir, "pwa");
  const pwaOutFile = path.join(pwaOutDir, "index.html");
  const outFileRel = path.relative(ROOT, outFile).split(path.sep).join("/");

  // Enforce the standalone size contract on the FINAL rendered + CSP-processed
  // HTML, before any directory or file under dist/ (or dist-editions/<key>/)
  // is created, written, copied, or removed. No skip flag; the assets are
  // not silently omitted.
  const standaloneBytes = Buffer.byteLength(standalone, "utf8");
  if (standaloneBytes > figureManifest.STANDALONE_BUDGET_BYTES) {
    throw new Error(
      `Standalone ${outFileRel} is ${standaloneBytes} bytes, over the ` +
      `${figureManifest.STANDALONE_BUDGET_BYTES}-byte budget ` +
      `(STANDALONE_BUDGET_BYTES) by ${standaloneBytes - figureManifest.STANDALONE_BUDGET_BYTES} bytes.`
    );
  }

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(outFile, standalone, "utf8");

  fs.rmSync(pwaOutDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(pwaOutDir, "icons"), { recursive: true });
  fs.writeFileSync(pwaOutFile, pwa, "utf8");

  // Stage 8A2: manifest.webmanifest's name/short_name/description slots are
  // resolved the same way the HTML branding slots above are; `id`/
  // `start_url`/`scope` stay the template's own "./" (relative to wherever
  // this manifest is served from), which already gives dist/ and each
  // dist-editions/<key>/ a distinct PWA identity/scope with no templating
  // needed -- see docs/EDITION_BUILDS_DESIGN.md's service-worker scope rules.
  const manifestTemplate = read(path.join(PWA_SRC, "manifest.webmanifest"));
  const manifestOut = render(manifestTemplate, {
    "__EDITION_MANIFEST_NAME__": jsonStringContent(editionProfileData.displayName),
    "__EDITION_MANIFEST_SHORT_NAME__": jsonStringContent(editionProfileData.displayName),
    "__EDITION_MANIFEST_DESCRIPTION__": jsonStringContent(manifestDescription)
  });
  JSON.parse(manifestOut); // fail loudly here, before any further mutation, if escaping ever produced invalid JSON
  fs.writeFileSync(path.join(pwaOutDir, "manifest.webmanifest"), manifestOut, "utf8");

  [
    "app-icon-192.png",
    "app-icon-512.png",
    "app-icon-maskable-512.png",
    "apple-touch-icon.png",
    "favicon.png"
  ].forEach(icon => copy(
    path.join(PWA_SRC, "icons", icon),
    path.join(pwaOutDir, "icons", icon)
  ));

  const cacheVersion = crypto.createHash("sha256").update(pwa).digest("hex").slice(0, 12);
  // Stage 8A2: the service-worker cache name and activation-cleanup prefix
  // come from this edition's own namespacePolicy.cachePrefix, so one
  // edition's activation can never delete another's caches even if both
  // were ever (incorrectly) served from the same origin/path -- distinct
  // output roots already prevent that in this build, see
  // docs/EDITION_BUILDS_DESIGN.md's storage/cache namespace rules.
  // cachePrefix itself was derived and re-validated immediately after the
  // profile gate, well before this function's first output mutation -- see
  // that comment for why.
  // jsonStringContent(), not a bare value: the SAME escaped-JSON-string-
  // content technique the manifest slots above use, so even a future
  // relaxation of CACHE_PREFIX_RE could never reopen the injection this
  // pattern closes. Replacement CALLBACKS, not plain string arguments --
  // same reason render() above uses one: a literal "$&"/"$`"/"$'"/"$$"-shaped
  // substring could otherwise be misread by String.replace()'s special
  // replacement-pattern syntax.
  const serviceWorker = read(path.join(PWA_SRC, "sw.js"))
    .replace(/__CACHE_PREFIX__/g, () => jsonStringContent(cachePrefix))
    .replace("__CACHE_VERSION__", () => cacheVersion);
  fs.writeFileSync(path.join(pwaOutDir, "sw.js"), serviceWorker, "utf8");

  const stats = fs.statSync(outFile);
  const pwaStats = fs.statSync(pwaOutFile);
  console.log(`Built ${outFile} (edition: ${target.key})`);
  console.log(`  Version: ${appVersion}`);
  pools.forEach(pool => {
    console.log(`  ${banks[pool.key].title}: ${pool.questions.length} questions`);
  });
  console.log(`  Total: ${totalQuestions} questions`);
  console.log(`  Figures: ${figuresManifest ? figuresManifest.figures.length : 0} inline (registry ${Buffer.byteLength(figureRegistryLiteral, "utf8")} bytes)`);
  console.log(`  Guide image: ${guideImageRel || "(none declared; transparent placeholder)"}`);
  console.log(`  Size: ${stats.size} bytes / ${figureManifest.STANDALONE_BUDGET_BYTES} budget ` +
    `(${figureManifest.STANDALONE_BUDGET_BYTES - stats.size} bytes free)`);
  console.log(`Built ${pwaOutDir}`);
  console.log(`  App shell: ${pwaStats.size} bytes`);
  console.log(`  Cache version: ${cacheVersion}`);
  console.log(`  Cache prefix: ${cachePrefix}`);
}

main();
