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
const EDITION_PROFILE_REL = "data/edition.json";
const EDITION_PROFILE_FILE = path.join(ROOT, EDITION_PROFILE_REL);
const PWA_SRC = path.join(SRC, "pwa");
const OUT_DIR = path.join(ROOT, "dist");
const OUT_FILE = path.join(OUT_DIR, "index.html");
const PWA_OUT_DIR = path.join(OUT_DIR, "pwa");
const PWA_OUT_FILE = path.join(PWA_OUT_DIR, "index.html");

// HAM_EXAM_BANKS titles (build data; the runtime pool picker reads
// displayName from the embedded pool registry instead).
const POOL_TITLES = { technician: "Technician", general: "General", extra: "Extra" };

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
  // Fail the build before any artifact is written if a question's textual
  // "figure <id>" reference is missing an explicit `figure` mapping, or the
  // mapping is malformed, cross-pool, or does not match the reference.
  figureReferences.assertPoolFigureReferences(questions, key);
  return { key, title: POOL_TITLES[key], questions };
}

// Stage 2D build gate. Fully validate the figure manifest -- schema, the
// question-to-figure cross-check against every pool, on-disk asset content and
// exact checksums, safe paths, unlisted assets, and every checksum-pinned
// source PDF (a missing PDF is an error: it is now a committed input) -- and
// throw before the build writes, copies, or removes anything under dist/.
// Reuses scripts/figure-manifest.js; no skip flags, fallbacks, network, or
// figure extraction. Stage 7C: the manifest's path comes from the edition
// profile's validated build inputs (absent => the edition has no figures).
function assertFigureManifest(banks, relPath) {
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
  figureManifest.assertFigurePipeline(manifest, { banks, repoRoot: ROOT, fs });
  return manifest;
}

// Stage 4A0 build gate (extended in Stage 5A with mock-exam configuration).
// Read, parse, and fully validate the canonical pool registry against the
// already-loaded banks -- schema, exact pool-key set, unique edition/revision
// identities, dates, counts, ID format/prefix/uniqueness, sub consistency,
// passing score, default timer, withdrawn IDs, and group blueprint -- and
// throw before the build writes, copies, or removes anything under dist/.
// No skip flags, fallbacks, or network. Stage 7C: the registry's path comes
// from the edition profile's validated build inputs.
function assertPoolsRegistry(banks, relPath) {
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
  poolRegistry.assertPoolRegistry(registry, banks);
  return registry;
}

// Stage 7B build gate. Read, parse, and fully validate the minimal edition
// profile -- schema, editionKey shape, pool-key identity against
// poolRegistry.POOL_KEYS, label-template placeholders, exam-timer values,
// optional figure policy, and namespace policy -- and throw before the build
// writes, copies, or removes anything under dist/. No skip flags, fallbacks,
// or network.
function assertEditionProfile() {
  let raw;
  try {
    raw = read(EDITION_PROFILE_FILE);
  } catch (error) {
    throw new Error(
      `Edition profile ${EDITION_PROFILE_REL} could not be read: ${error.message}`
    );
  }
  let profile;
  try {
    profile = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Edition profile ${EDITION_PROFILE_REL} is not valid JSON: ${error.message}`
    );
  }
  editionProfile.assertEditionProfile(profile);
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

// Build the minimal PUBLIC registry embedded in each generated HTML document
// from the ALREADY-VALIDATED registry. Only the public identity fields -- no
// build-only data, file paths, checksums, or source-PDF references.
function buildPublicPoolsRegistry(registry) {
  const out = {};
  for (const key of poolRegistry.POOL_KEYS) {
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
  const editionProfileData = assertEditionProfile();
  const buildInputs = editionProfileData.build;
  const editionKey = buildPublicEditionProfile(editionProfileData);
  // A bare string, matching window.HAM_EXAM_VERSION's own convention for a
  // single stable identity value -- not an object, since editionKey is
  // (deliberately, for now) the only field embedded. See
  // buildPublicEditionProfile's comment for what stays validated-only.
  const editionProfileLiteral =
    "window.HAM_EXAM_EDITION = " + asInlineScript(editionKey) + ";";

  // Load and validate all license-class question pools, in the pool
  // registry's canonical order (preserves the existing HAM_EXAM_BANKS key
  // order), each from the path the edition profile declares for it.
  const pools = poolRegistry.POOL_KEYS.map((key) =>
    loadPool(key, buildInputs.questionBanks[key])
  );
  const banks = {};
  pools.forEach(pool => {
    banks[pool.key] = { title: pool.title, questions: pool.questions };
  });

  // Mandatory pool-registry gate (Stage 4A0): runs after the banks are loaded
  // (which already runs the Stage 2A per-pool reference gate inside loadPool)
  // and BEFORE the figure gate and the first output mutation below
  // (fs.mkdirSync(OUT_DIR) / writeFileSync / rmSync(PWA_OUT_DIR) / copies).
  const poolsRegistry = assertPoolsRegistry(banks, buildInputs.poolRegistry);
  const publicPoolsRegistry = buildPublicPoolsRegistry(poolsRegistry);
  const poolsRegistryLiteral =
    "window.HAM_EXAM_POOLS = " + asInlineScript(publicPoolsRegistry) + ";";

  // Mandatory figure-pipeline gate: runs after the Stage 2A per-pool reference
  // check (inside loadPool) and BEFORE the first output mutation below
  // (fs.mkdirSync(OUT_DIR) / writeFileSync / rmSync(PWA_OUT_DIR) / copies).
  // Stage 7C: an edition without a declared figure manifest has no figures --
  // the embedded registry is the empty object and the gate is skipped, but
  // ONLY when no loaded bank question actually references a figure (the
  // per-pool figure-reference gate inside loadPool already guarantees every
  // textual "figure <id>" reference carries a `figure` mapping, so checking
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
    ? assertFigureManifest(banks, buildInputs.figureManifest)
    : null;
  const figureRegistry = figuresManifest ? buildFigureRegistry(figuresManifest) : {};
  const figureRegistryLiteral =
    "window.HAM_EXAM_FIGURES = " + asInlineScript(figureRegistry) + ";";

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
    // Stage 7B: the inert minimal edition-profile metadata
    // (window.HAM_EXAM_EDITION) shares this placeholder's <script> tag with
    // the pool registry rather than getting its own -- same technique
    // __BANK__ already uses for HAM_EXAM_VERSION/HAM_EXAM_VERSION_DISPLAY/
    // HAM_EXAM_BANKS -- since every byte here counts against the standalone
    // budget and neither value is read by any current runtime code. Ordered
    // BEFORE poolsRegistryLiteral so the pools JSON literal remains the last
    // statement in the tag, immediately followed by ";</script>" -- existing
    // test/tooling code that extracts HAM_EXAM_POOLS by scanning forward to
    // the next ";</script>" keeps working unchanged.
    "__POOLS__": editionProfileLiteral + poolsRegistryLiteral,
    "__FIGURES__": figureRegistryLiteral,
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
    "__APP_VERSION_DISPLAY__": appVersionDisplay
  };
  const standaloneDraft = render(template, {
    ...shared,
    "__PWA_HEAD__": "",
    "__PWA_UI__": "",
    "__PWA_JS__": ""
  });
  const pwaDraft = render(template, {
    ...shared,
    "__PWA_HEAD__": read(path.join(PWA_SRC, "head.html")).trim(),
    "__PWA_UI__": read(path.join(PWA_SRC, "install.html")).trim(),
    "__PWA_JS__": read(path.join(PWA_SRC, "register.js")).trim()
  });
  const standalone = applyContentSecurityPolicy(standaloneDraft, false);
  const pwa = applyContentSecurityPolicy(pwaDraft, true);

  // Enforce the standalone size contract on the FINAL rendered + CSP-processed
  // HTML, before any directory or file under dist/ is created, written, copied,
  // or removed. No skip flag; the assets are not silently omitted.
  const standaloneBytes = Buffer.byteLength(standalone, "utf8");
  if (standaloneBytes > figureManifest.STANDALONE_BUDGET_BYTES) {
    throw new Error(
      `Standalone dist/index.html is ${standaloneBytes} bytes, over the ` +
      `${figureManifest.STANDALONE_BUDGET_BYTES}-byte budget ` +
      `(STANDALONE_BUDGET_BYTES) by ${standaloneBytes - figureManifest.STANDALONE_BUDGET_BYTES} bytes.`
    );
  }

  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  fs.writeFileSync(OUT_FILE, standalone, "utf8");

  fs.rmSync(PWA_OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(PWA_OUT_DIR, "icons"), { recursive: true });
  fs.writeFileSync(PWA_OUT_FILE, pwa, "utf8");
  copy(path.join(PWA_SRC, "manifest.webmanifest"), path.join(PWA_OUT_DIR, "manifest.webmanifest"));
  [
    "app-icon-192.png",
    "app-icon-512.png",
    "app-icon-maskable-512.png",
    "apple-touch-icon.png",
    "favicon.png"
  ].forEach(icon => copy(
    path.join(PWA_SRC, "icons", icon),
    path.join(PWA_OUT_DIR, "icons", icon)
  ));

  const cacheVersion = crypto.createHash("sha256").update(pwa).digest("hex").slice(0, 12);
  const serviceWorker = read(path.join(PWA_SRC, "sw.js"))
    .replace("__CACHE_VERSION__", cacheVersion);
  fs.writeFileSync(path.join(PWA_OUT_DIR, "sw.js"), serviceWorker, "utf8");

  const stats = fs.statSync(OUT_FILE);
  const pwaStats = fs.statSync(PWA_OUT_FILE);
  console.log(`Built ${OUT_FILE}`);
  console.log(`  Version: ${appVersion}`);
  pools.forEach(pool => {
    console.log(`  ${pool.title}: ${pool.questions.length} questions`);
  });
  console.log(`  Total: ${totalQuestions} questions`);
  console.log(`  Figures: ${figuresManifest ? figuresManifest.figures.length : 0} inline (registry ${Buffer.byteLength(figureRegistryLiteral, "utf8")} bytes)`);
  console.log(`  Guide image: ${guideImageRel || "(none declared; transparent placeholder)"}`);
  console.log(`  Size: ${stats.size} bytes / ${figureManifest.STANDALONE_BUDGET_BYTES} budget ` +
    `(${figureManifest.STANDALONE_BUDGET_BYTES - stats.size} bytes free)`);
  console.log(`Built ${PWA_OUT_DIR}`);
  console.log(`  App shell: ${pwaStats.size} bytes`);
  console.log(`  Cache version: ${cacheVersion}`);
}

main();
