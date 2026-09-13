#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const figureReferences = require("./figure-references");
const figureManifest = require("./figure-manifest");
const poolRegistry = require("./pool-registry");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const DATA = path.join(ROOT, "data");
const FIGURES_MANIFEST_REL = "data/figures.json";
const FIGURES_MANIFEST_FILE = path.join(ROOT, FIGURES_MANIFEST_REL);
const POOLS_REGISTRY_REL = "data/pools.json";
const POOLS_REGISTRY_FILE = path.join(ROOT, POOLS_REGISTRY_REL);
const PWA_SRC = path.join(SRC, "pwa");
const OUT_DIR = path.join(ROOT, "dist");
const OUT_FILE = path.join(OUT_DIR, "index.html");
const PWA_OUT_DIR = path.join(OUT_DIR, "pwa");
const PWA_OUT_FILE = path.join(PWA_OUT_DIR, "index.html");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function validateBank(bank) {
  const required = ["id", "sub", "q", "choices", "correct", "correctText", "ref"];
  const ids = new Set();

  if (!Array.isArray(bank) || bank.length === 0) {
    throw new Error("Question bank must be a non-empty array");
  }

  bank.forEach((question, index) => {
    const label = question && question.id ? question.id : `question ${index + 1}`;
    const missing = required.filter(field =>
      !Object.prototype.hasOwnProperty.call(question || {}, field)
    );
    if (missing.length) {
      throw new Error(`${label} is missing required fields: ${missing.join(", ")}`);
    }
    if (ids.has(question.id)) {
      throw new Error(`Duplicate question id: ${question.id}`);
    }
    ids.add(question.id);

    if (!question.choices || !["A", "B", "C", "D"].every(letter =>
      typeof question.choices[letter] === "string"
    )) {
      throw new Error(`${label} must have string values for A, B, C, and D choices`);
    }
    if (!["A", "B", "C", "D"].includes(question.correct)) {
      throw new Error(`${label} has an invalid correct answer`);
    }
    if (question.correctText !== question.choices[question.correct]) {
      throw new Error(`${label} correctText does not match its correct choice`);
    }
  });
}

function loadPool(key, title, fileName) {
  const raw = read(path.join(DATA, fileName));
  const questions = JSON.parse(raw);
  validateBank(questions);
  // Fail the build before any artifact is written if a question's textual
  // "figure <id>" reference is missing an explicit `figure` mapping, or the
  // mapping is malformed, cross-pool, or does not match the reference.
  figureReferences.assertPoolFigureReferences(questions, key);
  return { key, title, questions };
}

// Stage 2D build gate. Fully validate the figure manifest -- schema, the
// question-to-figure cross-check against every pool, on-disk asset content and
// exact checksums, safe paths, unlisted assets, and every checksum-pinned
// source PDF (a missing PDF is an error: it is now a committed input) -- and
// throw before the build writes, copies, or removes anything under dist/.
// Reuses scripts/figure-manifest.js; no skip flags, fallbacks, network, or
// figure extraction.
function assertFigureManifest(banks) {
  let rawManifest;
  try {
    rawManifest = read(FIGURES_MANIFEST_FILE);
  } catch (error) {
    throw new Error(
      `Figure manifest ${FIGURES_MANIFEST_REL} could not be read: ${error.message}`
    );
  }
  let manifest;
  try {
    manifest = JSON.parse(rawManifest);
  } catch (error) {
    throw new Error(
      `Figure manifest ${FIGURES_MANIFEST_REL} is not valid JSON: ${error.message}`
    );
  }
  figureManifest.assertFigurePipeline(manifest, { banks, repoRoot: ROOT, fs });
  return manifest;
}

// Stage 4A0 build gate. Read, parse, and fully validate the canonical pool
// identity registry against the already-loaded banks -- schema, exact pool-key
// set, unique edition/revision identities, dates, counts, ID format/prefix/
// uniqueness, and sub consistency -- and throw before the build writes, copies,
// or removes anything under dist/. No skip flags, fallbacks, or network.
function assertPoolsRegistry(banks) {
  let raw;
  try {
    raw = read(POOLS_REGISTRY_FILE);
  } catch (error) {
    throw new Error(
      `Pool registry ${POOLS_REGISTRY_REL} could not be read: ${error.message}`
    );
  }
  let registry;
  try {
    registry = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Pool registry ${POOLS_REGISTRY_REL} is not valid JSON: ${error.message}`
    );
  }
  poolRegistry.assertPoolRegistry(registry, banks);
  return registry;
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
      errataLabel: entry.errataLabel
    };
  }
  return out;
}

const FIGURE_MEDIA_TYPES = { ".png": "image/png", ".svg": "image/svg+xml" };

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
    output = output.replace(placeholder, replacements[placeholder]);
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
  const template = read(path.join(SRC, "index.html"));
  const css = read(path.join(SRC, "style.css"));
  const examEngineJs = read(path.join(SRC, "exam-engine.js"));
  const js = read(path.join(SRC, "app.js"));

  // Load and validate all license-class question pools.
  const pools = [
    loadPool("technician", "Technician", "technician.json"),
    loadPool("general", "General", "general.json"),
    loadPool("extra", "Extra", "extra.json")
  ];
  const banks = {};
  pools.forEach(pool => {
    banks[pool.key] = { title: pool.title, questions: pool.questions };
  });

  // Mandatory pool-registry gate (Stage 4A0): runs after the banks are loaded
  // (which already runs the Stage 2A per-pool reference gate inside loadPool)
  // and BEFORE the figure gate and the first output mutation below
  // (fs.mkdirSync(OUT_DIR) / writeFileSync / rmSync(PWA_OUT_DIR) / copies).
  const poolsRegistry = assertPoolsRegistry(banks);
  const publicPoolsRegistry = buildPublicPoolsRegistry(poolsRegistry);
  const poolsRegistryLiteral =
    "window.HAM_EXAM_POOLS = " + asInlineScript(publicPoolsRegistry) + ";";

  // Mandatory figure-pipeline gate: runs after the Stage 2A per-pool reference
  // check (inside loadPool) and BEFORE the first output mutation below
  // (fs.mkdirSync(OUT_DIR) / writeFileSync / rmSync(PWA_OUT_DIR) / copies).
  const figuresManifest = assertFigureManifest(banks);
  const figureRegistry = buildFigureRegistry(figuresManifest);
  const figureRegistryLiteral =
    "window.HAM_EXAM_FIGURES = " + asInlineScript(figureRegistry) + ";";

  const totalQuestions = pools.reduce((sum, pool) => sum + pool.questions.length, 0);

  // Embed the pools as a JS object literal. This avoids JSON.parse on the
  // textContent of a script tag, which can fail on some mobile Safari/WebKit
  // versions due to UTF-8 decoding bugs.
  const bankLiteral =
    "window.HAM_EXAM_VERSION = " + asInlineScript(appVersion) + ";\n" +
    "window.HAM_EXAM_BANKS = " + asInlineScript(banks) + ";";

  const shared = {
    "__CSS__": css.trim(),
    "__BANK__": bankLiteral,
    "__POOLS__": poolsRegistryLiteral,
    "__FIGURES__": figureRegistryLiteral,
    "__ENGINE__": examEngineJs.trim(),
    "__JS__": js.trim(),
    "__APP_VERSION__": appVersion
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
  console.log(`  Figures: ${figuresManifest.figures.length} inline (registry ${Buffer.byteLength(figureRegistryLiteral, "utf8")} bytes)`);
  console.log(`  Size: ${stats.size} bytes / ${figureManifest.STANDALONE_BUDGET_BYTES} budget ` +
    `(${figureManifest.STANDALONE_BUDGET_BYTES - stats.size} bytes free)`);
  console.log(`Built ${PWA_OUT_DIR}`);
  console.log(`  App shell: ${pwaStats.size} bytes`);
  console.log(`  Cache version: ${cacheVersion}`);
}

main();
