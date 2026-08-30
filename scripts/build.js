#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const DATA = path.join(ROOT, "data");
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
  return { key, title, questions };
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
  console.log(`  Size: ${stats.size} bytes`);
  console.log(`Built ${PWA_OUT_DIR}`);
  console.log(`  App shell: ${pwaStats.size} bytes`);
  console.log(`  Cache version: ${cacheVersion}`);
}

main();
