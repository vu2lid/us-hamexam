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

// --------------------------------------------------------------------------
// Stage 5B4: the base question-bank schema gate (scripts/question-bank.js),
// the first gate loadPool() runs -- before the Stage 2A figure-reference
// gate, the pool-registry gate, and the figure-manifest gate, and therefore
// before every one of those and before any dist/ mutation.
// --------------------------------------------------------------------------

function bankPath(repoDir, poolKey) {
  return path.join(repoDir, 'data', `${poolKey}.json`);
}
function readBank(repoDir, poolKey) {
  return JSON.parse(fs.readFileSync(bankPath(repoDir, poolKey), 'utf8'));
}
function writeBank(repoDir, poolKey, bank) {
  fs.writeFileSync(bankPath(repoDir, poolKey), JSON.stringify(bank));
}

describe('build question-bank gate (Stage 5B4)', () => {
  test('a missing required field aborts the build, naming the field, before any dist/ mutation', () => {
    const repo = freshRepo();
    const bank = readBank(repo, 'technician');
    delete bank[0].q;
    writeBank(repo, 'technician', bank);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /technician: question "T1A01".*missing required field\(s\): q/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
  });

  test('a wrong `q` type aborts the build', () => {
    const repo = freshRepo();
    const bank = readBank(repo, 'technician');
    bank[0].q = 12345;
    writeBank(repo, 'technician', bank);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /`q` must be a non-empty string/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
  });

  test('a wrong `ref` type aborts the build (empty string ref remains valid elsewhere in the same bank)', () => {
    const repo = freshRepo();
    const bank = readBank(repo, 'technician');
    assert.ok(bank.some((q) => q.ref === ''), 'sanity: the real bank has an empty-string ref elsewhere');
    bank[0].ref = null;
    writeBank(repo, 'technician', bank);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /`ref` must be a string/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
  });

  test('malformed, missing, and extra `choices` each abort the build with a distinct diagnostic', () => {
    const mutations = [
      { name: 'missing key', apply: (q) => { delete q.choices.B; }, expect: /`choices` is missing key\(s\): B/ },
      { name: 'extra key', apply: (q) => { q.choices.E = 'unexpected'; }, expect: /`choices` has unexpected key\(s\): E/ },
      { name: 'non-string value', apply: (q) => { q.choices.C = 42; }, expect: /`choices\.C` must be a non-empty string/ },
      { name: 'null choices', apply: (q) => { q.choices = null; }, expect: /`choices` must be a plain object/ },
    ];
    for (const { name, apply, expect } of mutations) {
      const repo = freshRepo();
      const bank = readBank(repo, 'technician');
      apply(bank[0]);
      writeBank(repo, 'technician', bank);
      const r = runBuild(repo);
      assert.notEqual(r.status, 0, `expected a build failure for: ${name}`);
      assert.match(r.stderr, expect, `expected diagnostic for: ${name}`);
      assert.ok(!fs.existsSync(path.join(repo, 'dist')), `no dist/ for: ${name}`);
    }
  });

  test('a duplicate question ID aborts the build, naming it', () => {
    const repo = freshRepo();
    const bank = readBank(repo, 'technician');
    bank[1].id = bank[0].id;
    writeBank(repo, 'technician', bank);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, new RegExp(`duplicate question id "${bank[0].id}"`));
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
  });

  test('an invalid `correct` value aborts the build', () => {
    const repo = freshRepo();
    const bank = readBank(repo, 'technician');
    bank[0].correct = 'E';
    writeBank(repo, 'technician', bank);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /`correct` must be exactly one of "A", "B", "C", or "D"/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
  });

  test('a mismatched `correctText` aborts the build', () => {
    const repo = freshRepo();
    const bank = readBank(repo, 'technician');
    bank[0].correctText = 'this does not match any choice text';
    writeBank(repo, 'technician', bank);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /`correctText`.*does not match `choices\./);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
  });

  test('an empty bank aborts the build at the question-bank gate, before the pool-registry gate runs', () => {
    const repo = freshRepo();
    writeBank(repo, 'technician', []);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /technician: question bank must be a non-empty array/);
    // Confirms gate ORDER: the question-bank gate fires first, not a
    // pool-registry expectedCount mismatch (which would also be true here).
    assert.doesNotMatch(r.stderr, /expectedCount/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
  });

  test('an unknown top-level question field aborts the build, naming it', () => {
    const repo = freshRepo();
    const bank = readBank(repo, 'technician');
    bank[0].unexpectedField = 'nope';
    writeBank(repo, 'technician', bank);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /unknown field\(s\): unexpectedField/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
  });

  test('a question-bank gate failure leaves a pre-existing output tree byte-identical, sentinels included', () => {
    const repo = freshRepo();
    const dist = path.join(repo, 'dist');
    fs.mkdirSync(path.join(dist, 'pwa/icons'), { recursive: true });
    fs.writeFileSync(path.join(dist, 'index.html'), 'STALE STANDALONE OUTPUT');
    fs.writeFileSync(path.join(dist, 'SENTINEL.txt'), 'do not touch me');
    fs.writeFileSync(path.join(dist, 'pwa/index.html'), 'STALE PWA OUTPUT');
    fs.writeFileSync(path.join(dist, 'pwa/keep.txt'), 'keep');
    fs.writeFileSync(path.join(dist, 'pwa/icons/favicon.png'), 'not-a-real-icon');
    const before = hashTree(dist);

    const bank = readBank(repo, 'general');
    delete bank[0].sub;
    writeBank(repo, 'general', bank);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.deepEqual(hashTree(dist), before, 'dist/ must be untouched when the question-bank gate fails');
  });
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

  // Stage 4A1/4A2: the versioned-storage module (src/storage.js) is inlined into
  // both generated documents. This test only checks the BUILD-INTEGRATION
  // boundary: exactly one inclusion per document, and exactly one adapter
  // construction call site (src/app.js), with no direct localStorage access
  // anywhere outside the adapter's own injected storageLike boundary.
  test('the storage module is inlined exactly once per document and is used through a single adapter boundary', () => {
    const repo = freshRepo();
    const r = runBuild(repo);
    assert.equal(r.status, 0, r.out);

    const standalone = fs.readFileSync(path.join(repo, 'dist/index.html'), 'utf8');
    const pwa = fs.readFileSync(path.join(repo, 'dist/pwa/index.html'), 'utf8');

    for (const [name, html] of [['standalone', standalone], ['pwa', pwa]]) {
      // The source literally assigns "global.HAM_EXAM_STORAGE" (global is the
      // IIFE's parameter, bound to window in a browser -- see src/storage.js).
      const assignments = html.match(/global\.HAM_EXAM_STORAGE\s*=/g) || [];
      assert.equal(assignments.length, 1, `${name}: HAM_EXAM_STORAGE must be assigned exactly once`);
      // A unique function name from src/storage.js, present exactly once,
      // confirms the whole module is inlined exactly once (not zero, not
      // duplicated) rather than merely that its one assignment line survived.
      const marker = (html.match(/function probeAvailability/g) || []).length;
      assert.equal(marker, 1, `${name}: storage module body must appear exactly once`);
      // Exactly one adapter construction call site (src/app.js's
      // loadAppState); src/storage.js only DEFINES createStorageAdapter.
      // Doc-comment prose mentions the factory, so line comments are
      // stripped first to avoid a false positive on those.
      const withoutComments = html.replace(/\/\/[^\n]*/g, '');
      const constructions = withoutComments.match(/\.createStorageAdapter\(/g) || [];
      assert.equal(constructions.length, 1, `${name}: exactly one adapter construction call site`);
      // No direct localStorage access anywhere: src/app.js goes exclusively
      // through the adapter, and src/storage.js reaches storage only via its
      // injected storageLike argument.
      assert.ok(!/\blocalStorage\.(getItem|setItem|removeItem)\s*\(/.test(withoutComments),
        `${name}: no direct localStorage access outside the adapter boundary`);
    }
  });

  // Regression test for a P1 review finding: render()'s placeholder
  // substitution used String.replace(placeholder, replacementString), and a
  // STRING second argument to replace() specially interprets $&/$`/$'/$$
  // sequences -- if any inlined source (CSS, JS, a registry, or question-
  // bank content) ever happens to contain one, large chunks of the template
  // get silently duplicated or garbled instead of the literal source text
  // being inserted. This happened twice with hand-written comments in
  // src/storage.js before being caught by chance (the build itself failed
  // outright both times). Fixed by using a replacement CALLBACK instead
  // (whose return value is always inserted literally); this test proves it
  // holds for the real build, not just for one previously-affected file.
  // It plants all four special sequences in a real inlined source file
  // (src/app.js, which becomes the __JS__ placeholder) and asserts the
  // built output contains them completely unchanged.
  test('all four special String.replace() sequences ($&, $`, $\', $$) survive literally through render()', () => {
    const repo = freshRepo();
    const appJsPath = path.join(repo, 'src/app.js');
    const sentinel = '/* RENDER_SENTINEL $& $`END $\'END $$END RENDER_SENTINEL_END */';
    fs.appendFileSync(appJsPath, '\n' + sentinel + '\n');

    const r = runBuild(repo);
    assert.equal(r.status, 0, r.out);

    const standalone = fs.readFileSync(path.join(repo, 'dist/index.html'), 'utf8');
    const pwa = fs.readFileSync(path.join(repo, 'dist/pwa/index.html'), 'utf8');
    for (const [name, html] of [['standalone', standalone], ['pwa', pwa]]) {
      const count = html.split(sentinel).length - 1;
      assert.equal(count, 1, `${name}: the sentinel (with all special sequences intact) must appear exactly once, unmangled`);
    }
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

// --------------------------------------------------------------------------
// Stage 3A: inline figure packaging + the standalone byte budget.
// --------------------------------------------------------------------------

const STANDALONE_BUDGET_BYTES =
  require('../../scripts/figure-manifest.js').STANDALONE_BUDGET_BYTES;

// Extract `window.HAM_EXAM_FIGURES = { ... };` from a built HTML document.
// asInlineScript() is JSON.stringify + `<`->`<`, so the object literal is
// still valid JSON.
function extractRegistry(html) {
  const marker = 'window.HAM_EXAM_FIGURES = ';
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, 'HAM_EXAM_FIGURES assignment not found');
  const objText = html.slice(start + marker.length).split(';</script>')[0];
  return JSON.parse(objText);
}

function pngDims(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

describe('inline figure packaging + standalone budget (Stage 3A)', () => {
  test('the registry covers all 14 figures once, matching validated asset bytes and alt text', () => {
    const repo = freshRepo();
    const r = runBuild(repo);
    assert.equal(r.status, 0, r.out);

    const html = fs.readFileSync(path.join(repo, 'dist/index.html'), 'utf8');
    assert.equal((html.match(/window\.HAM_EXAM_FIGURES = /g) || []).length, 1,
      'registry must be assigned exactly once');

    const manifest = readManifest(repo);
    const registry = extractRegistry(html);
    assert.deepEqual(Object.keys(registry).sort(), manifest.figures.map((f) => f.id).sort());

    for (const fig of manifest.figures) {
      const entry = registry[fig.id];
      assert.deepEqual(Object.keys(entry).sort(), ['alt', 'h', 'src', 'w'],
        `${fig.id} registry entry carries only src/alt/w/h`);
      assert.equal(entry.alt, fig.alt, `${fig.id} alt matches manifest`);

      const m = /^data:image\/png;base64,(.+)$/.exec(entry.src);
      assert.ok(m, `${fig.id} src is a base64 PNG data URL`);
      const bytes = Buffer.from(m[1], 'base64');
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), fig.sha256,
        `${fig.id} embedded bytes match the validated asset checksum`);
      assert.deepEqual(bytes, fs.readFileSync(path.join(repo, fig.file)),
        `${fig.id} embedded bytes are exactly the on-disk asset`);

      const dims = pngDims(bytes);
      assert.equal(entry.w, dims.w, `${fig.id} width`);
      assert.equal(entry.h, dims.h, `${fig.id} height`);

      // Each asset appears exactly once per document -- never once per question.
      assert.equal(html.split(entry.src).length - 1, 1,
        `${fig.id} data URL must appear exactly once in the standalone HTML`);
    }
  });

  test('both release targets embed all 14 figure data URLs (once each)', () => {
    const repo = freshRepo();
    assert.equal(runBuild(repo).status, 0);
    const standalone = fs.readFileSync(path.join(repo, 'dist/index.html'), 'utf8');
    const pwa = fs.readFileSync(path.join(repo, 'dist/pwa/index.html'), 'utf8');
    const registry = extractRegistry(standalone);
    const pwaRegistry = extractRegistry(pwa);
    assert.deepEqual(pwaRegistry, registry, 'both documents share one identical registry');
    for (const id of Object.keys(registry)) {
      assert.equal(standalone.split(registry[id].src).length - 1, 1, `${id} once in standalone`);
      assert.equal(pwa.split(registry[id].src).length - 1, 1, `${id} once in PWA`);
    }
    // No separate PWA figure files were introduced.
    const pwaFiles = fs.readdirSync(path.join(repo, 'dist/pwa'), { recursive: true })
      .filter((f) => typeof f === 'string');
    assert.ok(!pwaFiles.some((f) => /figure/i.test(f)), 'no separate PWA figure files');
  });

  test('the real standalone build is within STANDALONE_BUDGET_BYTES', () => {
    const repo = freshRepo();
    assert.equal(runBuild(repo).status, 0);
    const size = fs.statSync(path.join(repo, 'dist/index.html')).size;
    assert.ok(size <= STANDALONE_BUDGET_BYTES,
      `dist/index.html is ${size} bytes, over the ${STANDALONE_BUDGET_BYTES}-byte budget`);
  });

  // Enlarge an otherwise-valid input (a CSS comment) so the *budget* check --
  // not asset validation -- is what fails the build.
  function inflateCss(repo, extraBytes) {
    const p = path.join(repo, 'src/style.css');
    fs.appendFileSync(p, `\n/* ${'x'.repeat(extraBytes)} */\n`);
  }

  test('an oversized final HTML fails through the real build entry point, before any output', () => {
    const repo = freshRepo();
    inflateCss(repo, STANDALONE_BUDGET_BYTES); // pushes the standalone well over budget
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Standalone dist\/index\.html is \d+ bytes, over the 1048576-byte budget/);
    assert.match(r.stderr, /STANDALONE_BUDGET_BYTES/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')), 'no dist/ created by an over-budget build');
  });

  test('an over-budget build leaves a pre-existing output tree byte-identical', () => {
    const repo = freshRepo();
    const dist = path.join(repo, 'dist');
    fs.mkdirSync(path.join(dist, 'pwa'), { recursive: true });
    fs.writeFileSync(path.join(dist, 'index.html'), 'PREVIOUS GOOD STANDALONE');
    fs.writeFileSync(path.join(dist, 'SENTINEL.txt'), 'keep me');
    fs.writeFileSync(path.join(dist, 'pwa/index.html'), 'PREVIOUS GOOD PWA');
    const before = hashTree(dist);

    inflateCss(repo, STANDALONE_BUDGET_BYTES);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /over the 1048576-byte budget/);
    assert.deepEqual(hashTree(dist), before, 'dist/ must be untouched when the budget check fails');
  });
});

// --------------------------------------------------------------------------
// Stage 4A0: the mandatory pool-registry gate + HAM_EXAM_POOLS embedding.
// --------------------------------------------------------------------------

const POOLS_REL = 'data/pools.json';

function poolsPath(repoDir) {
  return path.join(repoDir, POOLS_REL);
}
function readPools(repoDir) {
  return JSON.parse(fs.readFileSync(poolsPath(repoDir), 'utf8'));
}
function writePools(repoDir, obj) {
  fs.writeFileSync(poolsPath(repoDir), JSON.stringify(obj, null, 2) + '\n');
}

// Extract `window.HAM_EXAM_POOLS = { ... };` from a built HTML document.
function extractPoolsRegistry(html) {
  const marker = 'window.HAM_EXAM_POOLS = ';
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, 'HAM_EXAM_POOLS assignment not found');
  const objText = html.slice(start + marker.length).split(';</script>')[0];
  return JSON.parse(objText);
}

describe('build pool-registry gate (Stage 4A0)', () => {
  test('a missing registry aborts the build, naming the file', () => {
    const repo = freshRepo();
    fs.rmSync(poolsPath(repo));
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /data\/pools\.json could not be read/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')), 'no dist/ should be created');
  });

  test('malformed registry JSON aborts the build, naming the file', () => {
    const repo = freshRepo();
    fs.writeFileSync(poolsPath(repo), '{ "schemaVersion": 1, "pools": {, ');
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /data\/pools\.json is not valid JSON/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
  });

  test('a tampered registry aborts the build, listing the validation error', () => {
    const repo = freshRepo();
    const p = readPools(repo);
    p.pools.technician.expectedCount = 410;
    writePools(repo, p);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Pool registry validation failed/);
    assert.match(r.stderr, /expectedCount is 410 but the technician bank has 409 questions/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
  });

  test('a failed registry gate leaves a pre-existing output tree byte-identical, sentinels included', () => {
    const repo = freshRepo();
    const dist = path.join(repo, 'dist');
    fs.mkdirSync(path.join(dist, 'pwa/icons'), { recursive: true });
    fs.writeFileSync(path.join(dist, 'index.html'), 'STALE STANDALONE OUTPUT');
    fs.writeFileSync(path.join(dist, 'SENTINEL.txt'), 'do not touch me');
    fs.writeFileSync(path.join(dist, 'pwa/index.html'), 'STALE PWA OUTPUT');
    fs.writeFileSync(path.join(dist, 'pwa/keep.txt'), 'keep');
    fs.writeFileSync(path.join(dist, 'pwa/icons/favicon.png'), 'not-a-real-icon');
    const before = hashTree(dist);

    fs.rmSync(poolsPath(repo)); // make the gate fail
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.deepEqual(hashTree(dist), before, 'dist/ must be untouched when the gate fails');
  });

  test('a failed registry gate creates no output when there is no output directory', () => {
    const repo = freshRepo();
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
    const p = readPools(repo);
    p.pools.extra.revisionId = p.pools.general.revisionId.replace(/^/, 'dup-');
    p.pools.extra.editionId = p.pools.general.editionId;
    writePools(repo, p);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')), 'no dist/ may be created by a failed build');
  });

  test('both release targets embed the public registry exactly once, with no build internals', () => {
    const repo = freshRepo();
    const r1 = runBuild(repo);
    assert.equal(r1.status, 0, r1.out);

    const standalone = fs.readFileSync(path.join(repo, 'dist/index.html'), 'utf8');
    const pwa = fs.readFileSync(path.join(repo, 'dist/pwa/index.html'), 'utf8');
    for (const html of [standalone, pwa]) {
      assert.equal((html.match(/window\.HAM_EXAM_POOLS = /g) || []).length, 1,
        'HAM_EXAM_POOLS must be assigned exactly once per document');
      assert.ok(html.includes('technician-2026-2030'), 'embeds the edition IDs');
      assert.ok(html.includes('errata-2026-02-19'), 'embeds the revision IDs');
      assert.ok(!html.includes(REPO_ROOT), 'no absolute paths embedded');
      assert.ok(!html.includes('data/pool-sources'), 'no source-PDF references embedded');
      const registry = extractPoolsRegistry(html);
      const literal = html.slice(html.indexOf('window.HAM_EXAM_POOLS = '));
      assert.ok(!/sha256/i.test(literal.slice(0, literal.indexOf(';</script>'))),
        'no checksums in the embedded registry');
      assert.deepEqual(Object.keys(registry).sort(), ['extra', 'general', 'technician']);
      for (const key of Object.keys(registry)) {
        assert.deepEqual(Object.keys(registry[key]).sort(), [
          'displayName', 'editionId', 'effectiveEnd', 'effectiveStart', 'element',
          'errataLabel', 'expectedCount', 'poolKey', 'questionIdPrefix', 'revisionId',
          'sourceUrl',
          // Stage 5A: mock-exam configuration, public and runtime-required
          // (see scripts/build.js#buildPublicPoolsRegistry).
          'examQuestionCount', 'passingScore', 'defaultTimeLimitSeconds',
          'withdrawnIds', 'groupBlueprint'
        ].sort(), `${key} carries exactly the public identity fields`);
      }
    }
    assert.deepEqual(extractPoolsRegistry(pwa), extractPoolsRegistry(standalone),
      'both documents share one identical embedded registry');

    // Repeat build is byte-identical.
    const first = hashTree(path.join(repo, 'dist'));
    const r2 = runBuild(repo);
    assert.equal(r2.status, 0, r2.out);
    assert.deepEqual(hashTree(path.join(repo, 'dist')), first, 'repeat build is not byte-identical');
  });
});

// --------------------------------------------------------------------------
// Stage 5B1: the release-status version label, derived once at build time
// (scripts/version-label.js) from package.json -- the single authority --
// and shared by both generated documents' footer and Help/About text.
// Direct unit tests for the derivation function itself live in
// tests/unit/version-label.test.js; these are the mandatory REAL-BUILD
// fixture cases proving it is actually wired into generated output, since
// the checked-in package.json version is currently only a beta.
// --------------------------------------------------------------------------

const versionLabel = require('../../scripts/version-label');

function packageJsonPath(repoDir) {
  return path.join(repoDir, 'package.json');
}
function readPackageJson(repoDir) {
  return JSON.parse(fs.readFileSync(packageJsonPath(repoDir), 'utf8'));
}
function writePackageJson(repoDir, obj) {
  fs.writeFileSync(packageJsonPath(repoDir), JSON.stringify(obj, null, 2) + '\n');
}

// Extract `window.HAM_EXAM_VERSION_DISPLAY = "...";` from a built document.
function extractVersionDisplayGlobal(html) {
  const m = html.match(/window\.HAM_EXAM_VERSION_DISPLAY = "([^"]*)";/);
  assert.ok(m, 'window.HAM_EXAM_VERSION_DISPLAY assignment not found in the built document');
  return m[1];
}

// Extract the "Version <label>" text from the static footer div.
function extractFooterVersion(html) {
  const m = html.match(/id="footer">Version ([^—]*) —/);
  assert.ok(m, 'footer "Version <label> —" text not found in the built document');
  return m[1];
}

describe('release version display (Stage 5B1)', () => {
  // Shared by all three fixture cases below: build with the given package
  // version and assert both generated documents display exactly `expected`
  // in the footer AND in the embedded window.HAM_EXAM_VERSION_DISPLAY global
  // -- proving the footer and Help text (which reads the same global; Help
  // text itself is only assembled by runtime JS, so it is not present in the
  // static HTML this test reads) genuinely share one derived value rather
  // than each independently deciding a suffix.
  function assertVersionDisplay(repo, expected) {
    const r = runBuild(repo);
    assert.equal(r.status, 0, r.out);
    const standalone = fs.readFileSync(path.join(repo, 'dist/index.html'), 'utf8');
    const pwa = fs.readFileSync(path.join(repo, 'dist/pwa/index.html'), 'utf8');
    for (const html of [standalone, pwa]) {
      assert.equal(extractVersionDisplayGlobal(html), expected);
      assert.equal(extractFooterVersion(html), expected);
    }
    // package.json is the only version authority: the raw (undecorated)
    // version embedded alongside it must be exactly what was set below.
    const rawVersion = readPackageJson(repo).version;
    for (const html of [standalone, pwa]) {
      const rawMatch = html.match(/window\.HAM_EXAM_VERSION = "([^"]*)";/);
      assert.ok(rawMatch);
      assert.equal(rawMatch[1], rawVersion);
    }
    return { standalone, pwa };
  }

  test('a beta fixture version renders "(beta)" in both documents', () => {
    const repo = freshRepo();
    const pkg = readPackageJson(repo);
    // Deliberately different from the real checked-in beta.2 version, so a
    // pass here cannot be coincidental agreement with the real version.
    pkg.version = '0.3.0-beta.2';
    writePackageJson(repo, pkg);
    // Expected value comes from the shared derivation function itself
    // (scripts/version-label.js, also covered directly by
    // tests/unit/version-label.test.js) rather than a hand-typed literal --
    // this proves the real build output and that function agree, not two
    // independently-maintained implementations that happen to match today.
    assertVersionDisplay(repo, versionLabel.deriveVersionDisplay('0.3.0-beta.2'));
  });

  test('a stable fixture version renders no beta suffix in either document', () => {
    const repo = freshRepo();
    const pkg = readPackageJson(repo);
    pkg.version = '0.3.0';
    writePackageJson(repo, pkg);
    const r = runBuild(repo);
    assert.equal(r.status, 0, r.out);
    const standalone = fs.readFileSync(path.join(repo, 'dist/index.html'), 'utf8');
    const pwa = fs.readFileSync(path.join(repo, 'dist/pwa/index.html'), 'utf8');
    for (const html of [standalone, pwa]) {
      assert.equal(extractVersionDisplayGlobal(html), '0.3.0');
      assert.equal(extractFooterVersion(html), '0.3.0');
      assert.ok(html.includes('Version 0.3.0 —'), 'footer shows the plain stable version');
      assert.ok(!html.includes('(beta)'), 'no stale hardcoded "(beta)" suffix anywhere in the document');
    }
  });

  test('a non-beta prerelease fixture (0.3.0-rc.1) follows the documented policy and is never called beta', () => {
    const repo = freshRepo();
    const pkg = readPackageJson(repo);
    pkg.version = '0.3.0-rc.1';
    writePackageJson(repo, pkg);
    // Matches the policy documented in scripts/version-label.js: a non-beta
    // prerelease displays "(prerelease)", never "(beta)".
    const { standalone } = assertVersionDisplay(repo, '0.3.0-rc.1 (prerelease)');
    assert.ok(!standalone.includes('0.3.0-rc.1 (beta)'), 'a non-beta prerelease must never be labeled beta');
    assert.ok(!standalone.includes('(beta)'), 'a non-beta prerelease document must not contain "(beta)" at all');
  });

  test('a malformed package version still aborts the build before any output, unchanged from before', () => {
    for (const bad of ['not-a-version', '1.2', '1.2.3.4', '']) {
      const repo = freshRepo();
      const pkg = readPackageJson(repo);
      pkg.version = bad;
      writePackageJson(repo, pkg);
      const r = runBuild(repo);
      assert.notEqual(r.status, 0, `expected failure for version ${JSON.stringify(bad)}`);
      assert.match(r.stderr, /valid semantic version/);
      assert.ok(!fs.existsSync(path.join(repo, 'dist')), 'no dist/ should be created');
    }
  });
});
