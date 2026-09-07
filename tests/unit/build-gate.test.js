'use strict';

// Stage 2D: the mandatory figure-pipeline gate in scripts/build.js.
//
// Every test drives the REAL build entry point (`node scripts/build.js`) inside
// an isolated temporary copy of the repository. The real question banks, source
// PDFs, figure assets, and dist/ are never renamed, deleted, or modified -- only
// per-test fixture copies are mutated. Deterministic and offline: the build
// performs no network or extraction work.

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.join(__dirname, '../..');
const MANIFEST_REL = 'data/figures.json';

// Paths that a build needs. Everything else (node_modules, .git, dist, tests,
// docs, data/crosscheck, data/pool-sources/*.txt, assets/app-icon-master.png) is
// left out of the fixture.
function includeInFixture(abs) {
  const rel = path.relative(REPO_ROOT, abs);
  if (rel === '') return true;
  if (rel === 'package.json') return true;
  if (rel === 'scripts' || rel.startsWith('scripts' + path.sep)) return true;
  if (rel === 'src' || rel.startsWith('src' + path.sep)) return true;
  if (rel === 'data' || rel === path.join('data', 'pool-sources')) return true;
  if (rel === 'assets' || rel === path.join('assets', 'figures')) return true;
  if (rel.startsWith('assets' + path.sep + 'figures' + path.sep)) return true;
  if (rel.startsWith('data' + path.sep) && rel.endsWith('.json')) return true;
  if (rel.startsWith('data' + path.sep + 'pool-sources' + path.sep) && rel.endsWith('.pdf')) return true;
  return false;
}

let TEMPLATE;
const scratch = [];

function freshRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hamexam-buildgate-'));
  scratch.push(dir);
  fs.cpSync(TEMPLATE, dir, { recursive: true });
  return dir;
}

function runBuild(repoDir) {
  const res = spawnSync(process.execPath, [path.join(repoDir, 'scripts', 'build.js')], {
    cwd: repoDir,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '', out: `${res.stdout || ''}\n${res.stderr || ''}` };
}

function manifestPath(repoDir) {
  return path.join(repoDir, MANIFEST_REL);
}
function readManifest(repoDir) {
  return JSON.parse(fs.readFileSync(manifestPath(repoDir), 'utf8'));
}
function writeManifest(repoDir, obj) {
  fs.writeFileSync(manifestPath(repoDir), JSON.stringify(obj, null, 2) + '\n');
}
function figureEntry(manifest, id) {
  const f = manifest.figures.find((x) => x.id === id);
  assert.ok(f, `fixture manifest is missing figure ${id}`);
  return f;
}
function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}
function hashTree(dir) {
  const out = {};
  if (!fs.existsSync(dir)) return out;
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(d, ent.name);
      if (ent.isDirectory()) walk(abs);
      else out[path.relative(dir, abs)] = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
    }
  };
  walk(dir);
  return out;
}

before(() => {
  TEMPLATE = fs.mkdtempSync(path.join(os.tmpdir(), 'hamexam-buildgate-template-'));
  fs.cpSync(REPO_ROOT, TEMPLATE, { recursive: true, filter: includeInFixture });
  // Sanity: the template must be a buildable repo.
  assert.ok(fs.existsSync(path.join(TEMPLATE, 'scripts/build.js')));
  assert.ok(fs.existsSync(path.join(TEMPLATE, MANIFEST_REL)));
  assert.ok(fs.existsSync(path.join(TEMPLATE, 'data/pool-sources/technician.pdf')));
  assert.ok(fs.existsSync(path.join(TEMPLATE, 'assets/figures/technician/t-1.png')));
});

after(() => {
  for (const d of scratch) fs.rmSync(d, { recursive: true, force: true });
  if (TEMPLATE) fs.rmSync(TEMPLATE, { recursive: true, force: true });
});

describe('build figure-manifest gate (Stage 2D)', () => {
  test('a valid repository builds successfully and deterministically', () => {
    const repo = freshRepo();
    const r1 = runBuild(repo);
    assert.equal(r1.status, 0, `expected success, got:\n${r1.out}`);
    for (const rel of [
      'dist/index.html',
      'dist/pwa/index.html',
      'dist/pwa/sw.js',
      'dist/pwa/manifest.webmanifest',
      'dist/pwa/icons/favicon.png'
    ]) {
      assert.ok(fs.existsSync(path.join(repo, rel)), `missing generated ${rel}`);
    }
    const first = hashTree(path.join(repo, 'dist'));
    const r2 = runBuild(repo);
    assert.equal(r2.status, 0, r2.out);
    assert.deepEqual(hashTree(path.join(repo, 'dist')), first, 'repeat build is not byte-identical');
  });

  // ---- negative fixtures: each is otherwise valid so it reaches its layer ----

  test('missing manifest aborts the build', () => {
    const repo = freshRepo();
    fs.rmSync(manifestPath(repo));
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /data\/figures\.json could not be read/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')), 'no dist/ should be created');
  });

  test('malformed manifest JSON aborts the build', () => {
    const repo = freshRepo();
    fs.writeFileSync(manifestPath(repo), '{ "schemaVersion": 1, "sources": {, ');
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /data\/figures\.json is not valid JSON/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
  });

  test('a missing asset file aborts the build', () => {
    const repo = freshRepo();
    fs.rmSync(path.join(repo, 'assets/figures/technician/t-1.png'));
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /figure T-1:.*asset file "assets\/figures\/technician\/t-1\.png" is missing/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
  });

  test('an asset checksum mismatch aborts the build', () => {
    const repo = freshRepo();
    const m = readManifest(repo);
    figureEntry(m, 'T-1').sha256 = '0'.repeat(64);
    writeManifest(repo, m);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /figure T-1: sha256 mismatch/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
  });

  test('a missing source PDF aborts the build (committed input)', () => {
    const repo = freshRepo();
    fs.rmSync(path.join(repo, 'data/pool-sources/technician.pdf'));
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /source PDF "data\/pool-sources\/technician\.pdf" is missing/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
  });

  test('a source-PDF checksum mismatch aborts the build', () => {
    const repo = freshRepo();
    const m = readManifest(repo);
    m.sources['technician-2026-2030'].sha256 = '0'.repeat(64);
    writeManifest(repo, m);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /source "technician-2026-2030" sha256 does not match "data\/pool-sources\/technician\.pdf"/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
  });

  test('a duplicate figure entry aborts the build', () => {
    const repo = freshRepo();
    const m = readManifest(repo);
    m.figures.push(JSON.parse(JSON.stringify(figureEntry(m, 'T-1'))));
    writeManifest(repo, m);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /duplicate figure id "T-1"/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
  });

  test('an unused figure entry aborts the build', () => {
    const repo = freshRepo();
    const realPng = path.join(repo, 'assets/figures/technician/t-1.png');
    const extraPng = path.join(repo, 'assets/figures/technician/t-9.png');
    fs.copyFileSync(realPng, extraPng);
    const m = readManifest(repo);
    m.figures.push({
      id: 'T-9',
      pool: 'technician',
      file: 'assets/figures/technician/t-9.png',
      source: 'technician-2026-2030',
      sourcePage: 78,
      extractionMethod: 'raster-export',
      alt: 'A synthetic unreferenced figure entry used only by the build-gate regression test.',
      sha256: sha256File(extraPng)
    });
    writeManifest(repo, m);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /manifest figure T-9 \(technician\) is not referenced by any question/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
  });

  test('a cross-pool figure entry aborts the build', () => {
    const repo = freshRepo();
    const m = readManifest(repo);
    figureEntry(m, 'G7-1').pool = 'extra';
    writeManifest(repo, m);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /id "G7-1" does not match pool "extra"/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
  });

  test('an unsafe SVG with a matching checksum aborts the build (content, not just checksum, is validated)', () => {
    const repo = freshRepo();
    const svgRel = 'assets/figures/technician/t-1.svg';
    const svgAbs = path.join(repo, svgRel);
    const NS = 'http://www.w3.org/2000/svg';
    const evil = Buffer.from(`<svg xmlns="${NS}"><script>fetch("https://evil.test")</script></svg>`, 'utf8');
    fs.writeFileSync(svgAbs, evil);
    fs.rmSync(path.join(repo, 'assets/figures/technician/t-1.png')); // keep the asset tree consistent
    const m = readManifest(repo);
    const t1 = figureEntry(m, 'T-1');
    t1.file = svgRel;
    t1.sha256 = crypto.createHash('sha256').update(evil).digest('hex'); // checksum DOES match
    writeManifest(repo, m);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.doesNotMatch(r.stderr, /sha256 mismatch/, 'checksum must pass so content validation is what fails');
    assert.match(r.stderr, /figure T-1: SVG: <script> is not in the allowed element subset/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
  });

  // ---- output preservation on a failed build ----

  test('a failed build leaves a pre-existing output tree byte-identical, sentinels included', () => {
    const repo = freshRepo();
    const dist = path.join(repo, 'dist');
    fs.mkdirSync(path.join(dist, 'pwa/icons'), { recursive: true });
    fs.writeFileSync(path.join(dist, 'index.html'), 'STALE STANDALONE OUTPUT');
    fs.writeFileSync(path.join(dist, 'SENTINEL.txt'), 'do not touch me');
    fs.writeFileSync(path.join(dist, 'pwa/index.html'), 'STALE PWA OUTPUT');
    fs.writeFileSync(path.join(dist, 'pwa/keep.txt'), 'keep');
    fs.writeFileSync(path.join(dist, 'pwa/icons/favicon.png'), 'not-a-real-icon');
    const before = hashTree(dist);

    fs.rmSync(manifestPath(repo)); // make the gate fail
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.deepEqual(hashTree(dist), before, 'dist/ must be untouched when the gate fails');
  });

  test('a failed build creates no output when there is no output directory', () => {
    const repo = freshRepo();
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
    const m = readManifest(repo);
    figureEntry(m, 'T-1').sha256 = '0'.repeat(64);
    writeManifest(repo, m);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')), 'no dist/ may be created by a failed build');
  });

  test('the Stage 2A per-pool figure-reference gate still runs (not replaced by the manifest gate)', () => {
    const repo = freshRepo();
    // Break a real textual mapping: strip the `figure` field from a mapped question.
    const bankPath = path.join(repo, 'data/technician.json');
    const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
    const mapped = bank.find((q) => Object.prototype.hasOwnProperty.call(q, 'figure'));
    delete mapped.figure;
    fs.writeFileSync(bankPath, JSON.stringify(bank));
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Figure-reference validation failed for the technician pool/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
  });
});
