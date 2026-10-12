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
  // Stage 8A2: the synthetic fixture edition -- small and fully isolated
  // from the deployed US data set, used only by tests/fixtures.
  if (rel === 'editions' || rel.startsWith('editions' + path.sep)) return true;
  if (rel === 'assets' || rel === path.join('assets', 'figures')) return true;
  if (rel.startsWith('assets' + path.sep + 'figures' + path.sep)) return true;
  // Stage 6A5: the Getting Started guide's single static photo -- a real
  // build dependency (scripts/build.js reads it unconditionally), unlike the
  // excluded assets/app-icon-master.png, which no build script reads (kept
  // only as provenance for manually regenerating the PWA icon files).
  if (rel === path.join('assets', 'portable-radio-outdoors.jpg')) return true;
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

function runBuild(repoDir, extraArgs) {
  const res = spawnSync(process.execPath, [path.join(repoDir, 'scripts', 'build.js'), ...(extraArgs || [])], {
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
    // A string literal (not a comment): comments are stripped from the inline
    // bundle copy by scripts/strip-js-comments.js, while strings ship verbatim.
    const sentinel = '"RENDER_SENTINEL $& $`END $\'END $$END RENDER_SENTINEL_END"';
    fs.appendFileSync(appJsPath, '\nvar RENDER_SENTINEL = ' + sentinel + ';\n');

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
    assert.match(r.stderr, /data\/figures\.json \(profile build\.figureManifest\) could not be read/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')), 'no dist/ should be created');
  });

  test('malformed manifest JSON aborts the build', () => {
    const repo = freshRepo();
    fs.writeFileSync(manifestPath(repo), '{ "schemaVersion": 1, "sources": {, ');
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /data\/figures\.json \(profile build\.figureManifest\) is not valid JSON/);
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
    fs.appendFileSync(p, `\n.budget-inflate { content: \"${'x'.repeat(extraBytes)}\"; }\n`);
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
    assert.match(r.stderr, /data\/pools\.json \(profile build\.poolRegistry\) could not be read/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')), 'no dist/ should be created');
  });

  test('malformed registry JSON aborts the build, naming the file', () => {
    const repo = freshRepo();
    fs.writeFileSync(poolsPath(repo), '{ "schemaVersion": 1, "pools": {, ');
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /data\/pools\.json \(profile build\.poolRegistry\) is not valid JSON/);
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
          'withdrawnIds', 'groupBlueprint',
          // Stage 6A1: validated scope-selector titles, public and
          // runtime-required (the scoped-study UI reads these directly).
          'scopeLabels'
        ].sort(), `${key} carries exactly the public identity fields`);
      }
    }
    assert.deepEqual(extractPoolsRegistry(pwa), extractPoolsRegistry(standalone),
      'both documents share one identical embedded registry');

    // Stage 6A1: scopeLabels is embedded with real content, not stripped.
    const technicianLabels = extractPoolsRegistry(standalone).technician.scopeLabels;
    assert.equal(technicianLabels.subelements.T1, 'Commission’s Rules');
    assert.equal(technicianLabels.groups.T1A, 'Purpose and permissible use of the Amateur Radio Service');

    // Repeat build is byte-identical.
    const first = hashTree(path.join(repo, 'dist'));
    const r2 = runBuild(repo);
    assert.equal(r2.status, 0, r2.out);
    assert.deepEqual(hashTree(path.join(repo, 'dist')), first, 'repeat build is not byte-identical');
  });
});

describe('build scope-labels gate (Stage 6A1)', () => {
  test('a missing scopeLabels field aborts the build, listing the validation error', () => {
    const repo = freshRepo();
    const p = readPools(repo);
    delete p.pools.technician.scopeLabels;
    writePools(repo, p);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Pool registry validation failed/);
    assert.match(r.stderr, /scopeLabels must be an object with "subelements" and "groups"/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')), 'no dist/ should be created');
  });

  test('a scopeLabels entry for a code outside groupBlueprint aborts the build', () => {
    const repo = freshRepo();
    const p = readPools(repo);
    p.pools.technician.scopeLabels.groups.Z9Z = 'Not a real group';
    writePools(repo, p);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /scopeLabels\.groups\["Z9Z"\]: unknown code/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
  });

  test('a blank scopeLabels title aborts the build', () => {
    const repo = freshRepo();
    const p = readPools(repo);
    p.pools.general.scopeLabels.subelements.G1 = '   ';
    writePools(repo, p);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /scopeLabels\.subelements\["G1"\] must be a non-blank string/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
  });

  test('an overlong scopeLabels title aborts the build', () => {
    const repo = freshRepo();
    const p = readPools(repo);
    const poolRegistryModule = require('../../scripts/pool-registry.js');
    p.pools.extra.scopeLabels.groups.E1A = 'x'.repeat(poolRegistryModule.MAX_SCOPE_LABEL_LENGTH + 1);
    writePools(repo, p);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /scopeLabels\.groups\["E1A"\] exceeds the \d+-character limit/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
  });

  test('a failed scope-labels gate leaves a pre-existing output tree byte-identical', () => {
    const repo = freshRepo();
    const dist = path.join(repo, 'dist');
    fs.mkdirSync(dist, { recursive: true });
    fs.writeFileSync(path.join(dist, 'index.html'), 'STALE STANDALONE OUTPUT');
    const before = hashTree(dist);

    const p = readPools(repo);
    delete p.pools.technician.scopeLabels.groups.T1A;
    writePools(repo, p);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.deepEqual(hashTree(dist), before, 'dist/ must be untouched when the gate fails');
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

// --------------------------------------------------------------------------
// Stage 7B: the mandatory edition-profile gate + inert window.HAM_EXAM_EDITION
// embedding. Runs alongside (order-independent of) the pool-registry gate,
// both BEFORE the figure gate and the first output mutation.
// --------------------------------------------------------------------------

const EDITION_REL = 'data/edition.json';

function editionPath(repoDir) {
  return path.join(repoDir, EDITION_REL);
}
function readEdition(repoDir) {
  return JSON.parse(fs.readFileSync(editionPath(repoDir), 'utf8'));
}
function writeEdition(repoDir, obj) {
  fs.writeFileSync(editionPath(repoDir), JSON.stringify(obj, null, 2) + '\n');
}

// Extract `window.HAM_EXAM_EDITION = "...";` from a built HTML document.
function extractEditionGlobal(html) {
  const m = html.match(/window\.HAM_EXAM_EDITION = "([^"]*)";/);
  assert.ok(m, 'window.HAM_EXAM_EDITION assignment not found');
  return m[1];
}

describe('build edition-profile gate (Stage 7B)', () => {
  test('a missing profile aborts the build, naming the file', () => {
    const repo = freshRepo();
    fs.rmSync(editionPath(repo));
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /data\/edition\.json could not be read/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')), 'no dist/ should be created');
  });

  test('malformed profile JSON aborts the build, naming the file', () => {
    const repo = freshRepo();
    fs.writeFileSync(editionPath(repo), '{ "schemaVersion": 1, ');
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /data\/edition\.json is not valid JSON/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
  });

  test('a tampered profile aborts the build, listing the validation error', () => {
    const repo = freshRepo();
    const p = readEdition(repo);
    p.defaultPoolKey = 'novice';
    writeEdition(repo, p);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Edition profile validation failed/);
    assert.match(r.stderr, /defaultPoolKey "novice" must be one of profile\.poolKeys/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
  });

  test('missing required fields, an invalid edition key, a duplicate pool key, and an invalid optional figurePolicy each abort the build with a distinct diagnostic', () => {
    const mutations = [
      { name: 'missing displayName', apply: (p) => { delete p.displayName; }, expect: /missing required field "displayName"/ },
      { name: 'invalid edition key', apply: (p) => { p.editionKey = 'US_FCC'; }, expect: /editionKey must be a lowercase, hyphen-separated identifier/ },
      { name: 'duplicate pool key', apply: (p) => { p.poolKeys = ['technician', 'technician', 'general']; }, expect: /poolKeys: missing required pool "extra"/ },
      { name: 'invalid figurePolicy', apply: (p) => { p.figurePolicy.provenanceScheme = 'trust-me'; }, expect: /figurePolicy\.provenanceScheme must be one of/ },
    ];
    for (const { name, apply, expect } of mutations) {
      const repo = freshRepo();
      const p = readEdition(repo);
      apply(p);
      writeEdition(repo, p);
      const r = runBuild(repo);
      assert.notEqual(r.status, 0, `expected a build failure for: ${name}`);
      assert.match(r.stderr, expect, `expected diagnostic for: ${name}`);
      assert.ok(!fs.existsSync(path.join(repo, 'dist')), `no dist/ for: ${name}`);
    }
  });

  // Review finding: a duplicate label placeholder or suffix text after
  // {ref}/{element} previously passed the pure validator (which only checked
  // the placeholder appeared SOMEWHERE) and would have been silently
  // mis-derived by buildEditionRuntimeConfig's split()[0]/replace(). Driven
  // through the real build entry point to prove the gate, not just the
  // pure function, catches it before any dist/ mutation.
  test('a duplicate label placeholder or unsupported suffix text aborts the build, naming the field', () => {
    const mutations = [
      { name: 'duplicate {ref}', apply: (p) => { p.labels.referenceLabelTemplate = '{ref} / {ref}'; },
        expect: /labels\.referenceLabelTemplate must contain the "\{ref\}" placeholder exactly once, found 2/ },
      { name: 'suffix text after {ref}', apply: (p) => { p.labels.referenceLabelTemplate = 'Reference: {ref} (official)'; },
        expect: /labels\.referenceLabelTemplate must end with the "\{ref\}" placeholder/ },
      { name: 'suffix text after {element}', apply: (p) => { p.labels.elementLabelTemplate = 'Element {element} — details'; },
        expect: /labels\.elementLabelTemplate must end with the "\{element\}" placeholder/ },
      { name: 'duplicate {poolSourceAbbreviation}', apply: (p) => { p.labels.sourceLabelTemplate = '{poolSourceAbbreviation} / {poolSourceAbbreviation}'; },
        expect: /labels\.sourceLabelTemplate must contain the "\{poolSourceAbbreviation\}" placeholder exactly once, found 2/ },
    ];
    for (const { name, apply, expect } of mutations) {
      const repo = freshRepo();
      const p = readEdition(repo);
      apply(p);
      writeEdition(repo, p);
      const r = runBuild(repo);
      assert.notEqual(r.status, 0, `expected a build failure for: ${name}`);
      assert.match(r.stderr, /Edition profile validation failed/, `expected the profile gate for: ${name}`);
      assert.match(r.stderr, expect, `expected diagnostic for: ${name}`);
      assert.ok(!fs.existsSync(path.join(repo, 'dist')), `no dist/ for: ${name}`);
    }
  });

  test('a failed edition-profile gate leaves a pre-existing output tree byte-identical, sentinels included', () => {
    const repo = freshRepo();
    const dist = path.join(repo, 'dist');
    fs.mkdirSync(path.join(dist, 'pwa/icons'), { recursive: true });
    fs.writeFileSync(path.join(dist, 'index.html'), 'STALE STANDALONE OUTPUT');
    fs.writeFileSync(path.join(dist, 'SENTINEL.txt'), 'do not touch me');
    fs.writeFileSync(path.join(dist, 'pwa/index.html'), 'STALE PWA OUTPUT');
    fs.writeFileSync(path.join(dist, 'pwa/keep.txt'), 'keep');
    fs.writeFileSync(path.join(dist, 'pwa/icons/favicon.png'), 'not-a-real-icon');
    const before = hashTree(dist);

    fs.rmSync(editionPath(repo)); // make the gate fail
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.deepEqual(hashTree(dist), before, 'dist/ must be untouched when the gate fails');
  });

  test('a failed edition-profile gate creates no output when there is no output directory', () => {
    const repo = freshRepo();
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
    const p = readEdition(repo);
    p.editionKey = 'BAD KEY';
    writeEdition(repo, p);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')), 'no dist/ may be created by a failed build');
  });

  test('the real profile passes the build gate, and both release targets embed only the minimal editionKey, with no build internals', () => {
    const repo = freshRepo();
    const r1 = runBuild(repo);
    assert.equal(r1.status, 0, `expected success, got:\n${r1.out}`);

    const standalone = fs.readFileSync(path.join(repo, 'dist/index.html'), 'utf8');
    const pwa = fs.readFileSync(path.join(repo, 'dist/pwa/index.html'), 'utf8');
    for (const html of [standalone, pwa]) {
      assert.equal((html.match(/window\.HAM_EXAM_EDITION = /g) || []).length, 1,
        'HAM_EXAM_EDITION must be assigned exactly once per document');
      assert.equal(extractEditionGlobal(html), 'us-fcc');
      // Stage 7B deliberately embeds ONLY editionKey (see
      // scripts/build.js#buildPublicEditionProfile) -- none of the other
      // validated profile fields, and no build-only path/provenance data,
      // are present anywhere in the document. (displayName is NOT checked
      // here -- it legitimately appears already, once per pool, in the
      // unrelated HAM_EXAM_POOLS registry.)
      assert.ok(!html.includes('poolSourceAbbreviation'), 'no authority/labels embedded yet');
      assert.ok(!html.includes('regulatorAbbreviation'), 'no authority embedded yet');
      assert.ok(!html.includes(REPO_ROOT), 'no absolute paths embedded');
      // namespacePolicy itself IS now embedded (Stage 8A2, as the runtime
      // projection's own namespacePolicy field) -- see the dedicated Stage
      // 8A2 projection tests below for its exact shape/value. What stays
      // unembedded is everything ELSE build-only/validated-not-projected,
      // checked by the next test.
    }
    assert.equal(extractEditionGlobal(pwa), extractEditionGlobal(standalone),
      'both documents share one identical embedded edition key');

    // Existing HAM_EXAM_POOLS embedding is unaffected by sharing its
    // placeholder's <script> tag with the new edition literal.
    const poolsMatches = standalone.match(/window\.HAM_EXAM_POOLS = /g) || [];
    assert.equal(poolsMatches.length, 1, 'HAM_EXAM_POOLS must still be assigned exactly once');

    // Repeat build is byte-identical.
    const first = hashTree(path.join(repo, 'dist'));
    const r2 = runBuild(repo);
    assert.equal(r2.status, 0, r2.out);
    assert.deepEqual(hashTree(path.join(repo, 'dist')), first, 'repeat build is not byte-identical');
  });
});

// --------------------------------------------------------------------------
// Stage 7C: build integration -- the edition profile's `build` inputs supply
// the pool-registry path, the per-pool question-bank paths, and the optional
// figure-manifest / guide-image paths. Every failure below must name the
// offending profile field/path and abort before any dist/ mutation.
// --------------------------------------------------------------------------

describe('build edition-profile build inputs (Stage 7C)', () => {
  test('a missing required question-bank mapping aborts the build, naming the pool', () => {
    const repo = freshRepo();
    const p = readEdition(repo);
    delete p.build.questionBanks.extra;
    writeEdition(repo, p);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Edition profile validation failed/);
    assert.match(r.stderr, /build\.questionBanks: missing required mapping for pool "extra"/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')), 'no dist/ should be created');
  });

  test('an unknown pool in questionBanks aborts the build, naming the key', () => {
    const repo = freshRepo();
    const p = readEdition(repo);
    p.build.questionBanks.novice = 'data/technician.json';
    writeEdition(repo, p);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /build\.questionBanks: unknown pool key\(s\): novice/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
    // Note: a truly DUPLICATE mapping cannot survive JSON parsing (later
    // keys overwrite earlier ones), so duplicate coverage lives in the pure
    // validator's unknown/missing identity checks plus this build gate.
  });

  test('an absolute or traversing build-input path aborts the build, naming the field', () => {
    const mutations = [
      { name: 'absolute registry path', apply: (p) => { p.build.poolRegistry = '/etc/pools.json'; },
        expect: /build\.poolRegistry must be a relative path, not absolute/ },
      { name: 'traversal bank path', apply: (p) => { p.build.questionBanks.technician = '../technician.json'; },
        expect: /build\.questionBanks\.technician contains an unsafe segment/ },
      { name: 'backslash manifest path', apply: (p) => { p.build.figureManifest = 'data\\figures.json'; },
        expect: /build\.figureManifest must use forward slashes/ },
    ];
    for (const { name, apply, expect } of mutations) {
      const repo = freshRepo();
      const p = readEdition(repo);
      apply(p);
      writeEdition(repo, p);
      const r = runBuild(repo);
      assert.notEqual(r.status, 0, `expected a build failure for: ${name}`);
      assert.match(r.stderr, expect, `expected diagnostic for: ${name}`);
      assert.ok(!fs.existsSync(path.join(repo, 'dist')), `no dist/ for: ${name}`);
    }
  });

  test('a build-input path naming a missing file aborts the build, naming the path and field', () => {
    const repo = freshRepo();
    const p = readEdition(repo);
    p.build.poolRegistry = 'data/no-such-registry.json';
    writeEdition(repo, p);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /data\/no-such-registry\.json \(profile build\.poolRegistry\) could not be read/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
  });

  test('a failed build-input resolution leaves a pre-existing output tree byte-identical, sentinels included', () => {
    const repo = freshRepo();
    const dist = path.join(repo, 'dist');
    fs.mkdirSync(path.join(dist, 'pwa/icons'), { recursive: true });
    fs.writeFileSync(path.join(dist, 'index.html'), 'STALE STANDALONE OUTPUT');
    fs.writeFileSync(path.join(dist, 'SENTINEL.txt'), 'do not touch me');
    fs.writeFileSync(path.join(dist, 'pwa/index.html'), 'STALE PWA OUTPUT');
    const before = hashTree(dist);

    const p = readEdition(repo);
    p.build.questionBanks.general = 'data/no-such-bank.json'; // valid shape, missing file
    writeEdition(repo, p);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /profile build\.questionBanks\.general/);
    assert.deepEqual(hashTree(dist), before, 'dist/ must be untouched when a build input is missing');
  });

  // Review-fix helper (round 3): a prior placeholder GIF decoded successfully
  // (valid GIF89a magic + trailer) but was fully OPAQUE -- no Graphic Control
  // Extension at all -- so it painted a solid box instead of an invisible
  // spacer. Checking the two boundary bytes cannot catch that; this walks the
  // GIF's actual block structure (generically, not by hardcoded byte offset,
  // so it stays correct if the placeholder bytes ever change) to find a
  // Graphic Control Extension and read its transparency flag and transparent
  // color index directly, proving real transparency semantics rather than
  // mere GIF-shaped bytes.
  function parseGifTransparency(bytes) {
    assert.equal(bytes.toString('latin1', 0, 6), 'GIF89a', 'must carry the GIF89a magic');
    assert.equal(bytes[bytes.length - 1], 0x3b, 'must end with the GIF trailer byte');

    // Logical Screen Descriptor (7 bytes right after the header): width(2),
    // height(2), packed fields(1), background color index(1), pixel aspect
    // ratio(1). The packed byte's high bit flags a Global Color Table; its
    // low 3 bits encode that table's size as 2^(n+1) entries of 3 bytes each.
    const packed = bytes[10];
    const hasGlobalColorTable = (packed & 0x80) !== 0;
    const gctEntries = hasGlobalColorTable ? (1 << ((packed & 0x07) + 1)) : 0;
    let offset = 6 + 7 + gctEntries * 3;

    let gce = null;
    while (offset < bytes.length && bytes[offset] === 0x21) {
      const label = bytes[offset + 1];
      if (label === 0xf9) {
        // Graphic Control Extension: introducer(1) label(1) block size(1,
        // always 4) packed fields(1) delay time(2) transparent color
        // index(1) block terminator(1).
        assert.equal(bytes[offset + 2], 4, 'Graphic Control Extension block size must be 4');
        gce = {
          transparencyFlag: (bytes[offset + 3] & 0x01) !== 0,
          transparentColorIndex: bytes[offset + 6]
        };
      }
      // Skip this extension generically: label, then size-prefixed
      // sub-blocks terminated by a zero-length sub-block -- works for any
      // extension type, not just the Graphic Control Extension above.
      let cursor = offset + 2;
      let subSize = bytes[cursor];
      cursor += 1;
      while (subSize !== 0) {
        cursor += subSize;
        subSize = bytes[cursor];
        cursor += 1;
      }
      offset = cursor;
    }

    assert.ok(gce, 'must carry a Graphic Control Extension');
    assert.ok(gce.transparencyFlag, 'Graphic Control Extension transparency flag must be set');
    assert.equal(gce.transparentColorIndex, 0,
      'transparent color index must be 0, the placeholder\'s single meaningful palette entry');
  }

  // Review-fix helper: write bank copies with every figure reference scrubbed
  // (the exact `figure <ID>` textual mention removed from the prompt and all
  // choices, and the `figure` mapping deleted), so a fixture can exercise the
  // "edition without figures" path using otherwise-real data.
  function scrubBanksOfFigureReferences(repo) {
    for (const poolKey of ['technician', 'general', 'extra']) {
      const bankPath = path.join(repo, 'data', `${poolKey}.json`);
      const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
      for (const q of bank) {
        if (!q.figure) continue;
        const mentionRe = new RegExp('\\s*\\bfigure\\s+' + q.figure.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        q.q = q.q.replace(mentionRe, '');
        for (const letter of ['A', 'B', 'C', 'D']) {
          if (q.choices && typeof q.choices[letter] === 'string') {
            q.choices[letter] = q.choices[letter].replace(mentionRe, '');
          }
        }
        delete q.figure;
      }
      fs.writeFileSync(bankPath, JSON.stringify(bank));
    }
  }

  test('an edition without a figure manifest or guide image builds with an empty figure registry and a transparent placeholder', () => {
    const repo = freshRepo();
    scrubBanksOfFigureReferences(repo);
    const p = readEdition(repo);
    delete p.build.figureManifest;
    delete p.build.guideImage;
    delete p.figurePolicy; // manifestRequired could no longer be honored
    writeEdition(repo, p);
    const r = runBuild(repo);
    assert.equal(r.status, 0, `expected success, got:\n${r.out}`);
    const standalone = fs.readFileSync(path.join(repo, 'dist/index.html'), 'utf8');
    assert.ok(standalone.includes('window.HAM_EXAM_FIGURES = {};'),
      'no declared manifest and no figure references => empty embedded figure registry');

    // The fallback image must be ACTUALLY transparent, not just a
    // structurally valid GIF: parse its Graphic Control Extension and assert
    // the transparency flag and transparent color index directly, rather
    // than only checking the header/trailer bytes (which a fully opaque but
    // otherwise well-formed GIF would also satisfy -- see
    // parseGifTransparency's own comment for the exact prior defect this
    // closes).
    const m = standalone.match(/data:image\/gif;base64,([A-Za-z0-9+/=]+)/);
    assert.ok(m, 'fallback placeholder must be embedded as a GIF data URI');
    const bytes = Buffer.from(m[1], 'base64');
    parseGifTransparency(bytes);

    assert.ok(!standalone.includes('data:image/png;base64,iVBOR'), 'no figure bytes may be inlined');
    // The rest of the document is unaffected: banks, pools registry, and the
    // edition identity all still embed exactly once.
    assert.equal((standalone.match(/window\.HAM_EXAM_BANKS = /g) || []).length, 1);
    assert.equal((standalone.match(/window\.HAM_EXAM_POOLS = /g) || []).length, 1);
    assert.equal((standalone.match(/window\.HAM_EXAM_EDITION = "us-fcc";/g) || []).length, 1);
  });

  test('real banks WITH figure references never build against an omitted manifest, and the failure leaves a seeded dist/ byte-identical', () => {
    const repo = freshRepo();
    const dist = path.join(repo, 'dist');
    fs.mkdirSync(path.join(dist, 'pwa/icons'), { recursive: true });
    fs.writeFileSync(path.join(dist, 'index.html'), 'STALE STANDALONE OUTPUT');
    fs.writeFileSync(path.join(dist, 'SENTINEL.txt'), 'do not touch me');
    fs.writeFileSync(path.join(dist, 'pwa/index.html'), 'STALE PWA OUTPUT');
    const before = hashTree(dist);

    // Real banks (which reference figures) + manifest omitted AND figurePolicy
    // omitted, so the pure validator's manifestRequired cross-check cannot
    // catch it -- only the build-side data-driven check can.
    const p = readEdition(repo);
    delete p.build.figureManifest;
    delete p.figurePolicy;
    writeEdition(repo, p);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /build\.figureManifest is required: the loaded question banks contain figure references/);
    assert.deepEqual(hashTree(dist), before, 'dist/ must be untouched when figure-bearing banks lack a manifest');
  });

  test('figure-bearing banks also require a figurePolicy with manifestRequired true', () => {
    const mutations = [
      { name: 'figurePolicy omitted', apply: (p) => { delete p.figurePolicy; },
        expect: /figurePolicy is required: the loaded question banks contain figure references/ },
      { name: 'manifestRequired false', apply: (p) => { p.figurePolicy.manifestRequired = false; },
        expect: /figurePolicy\.manifestRequired must be true: the loaded question banks contain figure references/ },
    ];
    for (const { name, apply, expect } of mutations) {
      const repo = freshRepo();
      const p = readEdition(repo);
      apply(p); // build.figureManifest stays declared for the second mutation
      writeEdition(repo, p);
      const r = runBuild(repo);
      assert.notEqual(r.status, 0, `expected a build failure for: ${name}`);
      assert.match(r.stderr, expect, `expected diagnostic for: ${name}`);
      assert.ok(!fs.existsSync(path.join(repo, 'dist')), `no dist/ for: ${name}`);
    }
  });

  test('manifestRequired with no declared manifest aborts the build, naming the cross-field rule', () => {
    const repo = freshRepo();
    const p = readEdition(repo);
    delete p.build.figureManifest; // figurePolicy.manifestRequired stays true
    writeEdition(repo, p);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /build\.figureManifest is required because profile\.figurePolicy\.manifestRequired is true/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
  });

  test('the real US profile builds from its declared inputs with unchanged content and byte-identical repeats', () => {
    const repo = freshRepo();
    const r1 = runBuild(repo);
    assert.equal(r1.status, 0, `expected success, got:\n${r1.out}`);
    const standalone = fs.readFileSync(path.join(repo, 'dist/index.html'), 'utf8');

    // Existing HAM_EXAM_* globals remain, in canonical pool order.
    assert.equal((standalone.match(/window\.HAM_EXAM_BANKS = /g) || []).length, 1);
    const banksOrder = standalone.indexOf('"technician"');
    assert.ok(banksOrder !== -1 && banksOrder < standalone.indexOf('"general"'),
      'HAM_EXAM_BANKS preserves technician-first pool ordering');
    assert.equal((standalone.match(/window\.HAM_EXAM_POOLS = /g) || []).length, 1);
    assert.equal((standalone.match(/window\.HAM_EXAM_FIGURES = /g) || []).length, 1);
    assert.ok(!standalone.includes('window.HAM_EXAM_FIGURES = {};'), 'US build embeds its 14 figures');

    // Figures and guide image come from the declared paths.
    assert.ok(standalone.includes('data:image/jpeg;base64,'), 'guide photo inlined as JPEG');
    assert.ok(standalone.includes('"T-1"'), 'figure registry populated');

    // No build-only path data leaks into runtime metadata.
    assert.ok(!standalone.includes('data/pools.json'), 'no registry path embedded');
    assert.ok(!standalone.includes('data/figures.json'), 'no manifest path embedded');
    assert.ok(!standalone.includes('pool-sources'), 'no provenance paths embedded');
    assert.ok(!standalone.includes(REPO_ROOT), 'no absolute paths embedded');

    const first = hashTree(path.join(repo, 'dist'));
    const r2 = runBuild(repo);
    assert.equal(r2.status, 0, r2.out);
    assert.deepEqual(hashTree(path.join(repo, 'dist')), first, 'repeat build is not byte-identical');
  });
});

// --------------------------------------------------------------------------
// Stage 7D: the runtime projection (window.HAM_EXAM_EDITION_CONFIG) -- a
// small allowlisted object derived from the validated profile and consumed by
// src/app.js. The projection is validated before any dist/ mutation, and the
// pre-existing window.HAM_EXAM_EDITION identity string is unchanged.
// --------------------------------------------------------------------------

// Extract `window.HAM_EXAM_EDITION_CONFIG = {...};` from a built document.
// The literal is emitted before HAM_EXAM_POOLS in the same <script>, so this
// stops at the first ";window." rather than at ";</script>".
function extractRuntimeConfig(html) {
  const marker = 'window.HAM_EXAM_EDITION_CONFIG = ';
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, 'HAM_EXAM_EDITION_CONFIG assignment not found');
  const rest = html.slice(start + marker.length);
  const end = rest.indexOf(';window.');
  assert.notEqual(end, -1, 'could not find the end of the HAM_EXAM_EDITION_CONFIG literal');
  return JSON.parse(rest.slice(0, end));
}

// Inject a derivation bug into a fixture's scripts/build.js by replacing
// buildEditionRuntimeConfig's returned object with `badLiteral`. The profile
// itself stays valid, so ONLY the Stage 7D runtime-config gate can catch
// this -- which is exactly the defense-in-depth case being proven (a data
// problem is already impossible here; a derivation bug is not).
function injectRuntimeConfigBug(repoDir, badLiteral) {
  const buildPath = path.join(repoDir, 'scripts', 'build.js');
  const source = fs.readFileSync(buildPath, 'utf8');
  const anchor = 'function buildEditionRuntimeConfig(profile) {';
  assert.ok(source.includes(anchor), 'fixture build.js must define buildEditionRuntimeConfig');
  const patched = source.replace(anchor, `${anchor}\n  return ${badLiteral};`);
  assert.notEqual(patched, source, 'derivation-bug injection did not apply');
  fs.writeFileSync(buildPath, patched);
}

describe('build edition runtime projection (Stage 7D)', () => {
  test('the real profile embeds exactly the allowlisted projection, once per document', () => {
    const repo = freshRepo();
    const r1 = runBuild(repo);
    assert.equal(r1.status, 0, `expected success, got:\n${r1.out}`);

    const standalone = fs.readFileSync(path.join(repo, 'dist/index.html'), 'utf8');
    const pwa = fs.readFileSync(path.join(repo, 'dist/pwa/index.html'), 'utf8');

    for (const [name, html] of [['standalone', standalone], ['pwa', pwa]]) {
      assert.equal((html.match(/window\.HAM_EXAM_EDITION_CONFIG = /g) || []).length, 1,
        `${name}: HAM_EXAM_EDITION_CONFIG must be assigned exactly once`);

      const config = extractRuntimeConfig(html);
      // Exactly the allowlist -- no extra profile field leaked in. Stage
      // 8A2 adds namespacePolicy and elementTermLabel, both required (see
      // scripts/edition-profile.js's RUNTIME_CONFIG_REQUIRED_KEYS).
      assert.deepEqual(Object.keys(config).sort(), [
        'defaultPoolKey', 'displayName', 'elementLabelPrefix', 'elementTermLabel',
        'examTimerSecondsValues', 'namespacePolicy', 'poolKeys',
        'referenceLabelPrefix', 'sourceLabelText'
      ], `${name}: projection carries exactly the allowlisted runtime fields`);

      // The real US values -- these are what preserve current behavior.
      assert.deepEqual(config.poolKeys, ['technician', 'general', 'extra']);
      assert.equal(config.defaultPoolKey, 'technician');
      assert.equal(config.referenceLabelPrefix, 'FCC reference: ');
      assert.equal(config.elementLabelPrefix, 'Element ');
      assert.equal(config.sourceLabelText, 'NCVEC source');
      assert.deepEqual(config.examTimerSecondsValues, [0, 900, 1800, 2100, 3000, 3600]);
      assert.equal(config.displayName, 'US Ham Exam');
      assert.equal(config.elementTermLabel, 'FCC element');
      // Stage 8A2: namespacePolicy passes through verbatim from
      // data/edition.json (no probeKey declared -- src/storage.js falls
      // back to its own US literal; see the dedicated namespacePolicy
      // projection test below for that fallback's behavior).
      assert.deepEqual(config.namespacePolicy, {
        storageKey: 'ham-exam-state',
        legacyKeys: [
          'ham-exam-pool', 'ham-exam-theme',
          'ham-exam-index-{poolKey}', 'ham-exam-bookmarks-{poolKey}'
        ],
        cachePrefix: 'ham-exam-'
      });
    }

    assert.deepEqual(extractRuntimeConfig(pwa), extractRuntimeConfig(standalone),
      'both documents share one identical projection');

    // The Stage 7B identity global is unchanged and still separate.
    assert.equal(extractEditionGlobal(standalone), 'us-fcc');
    assert.equal((standalone.match(/window\.HAM_EXAM_EDITION = /g) || []).length, 1);

    // Two consecutive builds stay byte-identical.
    const first = hashTree(path.join(repo, 'dist'));
    const r2 = runBuild(repo);
    assert.equal(r2.status, 0, r2.out);
    assert.deepEqual(hashTree(path.join(repo, 'dist')), first, 'repeat build is not byte-identical');
  });

  test('no build-only path, provenance, or non-projected profile data reaches the generated documents', () => {
    const repo = freshRepo();
    const r = runBuild(repo);
    assert.equal(r.status, 0, r.out);

    for (const rel of ['dist/index.html', 'dist/pwa/index.html']) {
      const html = fs.readFileSync(path.join(repo, rel), 'utf8');
      // Build-only inputs (Stage 7C `build` object) and provenance.
      for (const forbidden of [
        'data/pools.json', 'data/technician.json', 'data/general.json', 'data/extra.json',
        'data/figures.json', 'assets/portable-radio-outdoors.jpg', 'pool-sources',
        'poolRegistry', 'questionBanks', 'figureManifest', 'guideImage'
      ]) {
        assert.ok(!html.includes(forbidden), `${rel} must not embed build-only value "${forbidden}"`);
      }
      // Validated-but-not-projected profile fields and their key names.
      // Only `poolSourceName`'s VALUE is checked among the authority display
      // strings: "Federal Communications Commission" (regulatorName) cannot be
      // asserted here because it legitimately appears in real question-bank
      // text (data/general.json), so its presence proves nothing either way.
      for (const forbidden of [
        'figurePolicy', 'provenanceScheme', 'manifestRequired',
        'regulatorName', 'regulatorAbbreviation', 'poolSourceName', 'poolSourceAbbreviation',
        'referenceLabelTemplate', 'sourceLabelTemplate', 'elementLabelTemplate',
        'National Conference of Volunteer Examiner Coordinators'
      ]) {
        assert.ok(!html.includes(forbidden), `${rel} must not embed non-projected profile value "${forbidden}"`);
      }
      // namespacePolicy is NOT in either forbidden list above: Stage 8A2
      // made it a required, allowlisted runtime-projection field (consumed
      // by src/storage.js), so it IS expected to appear -- its exact shape
      // and value are asserted by the dedicated Stage 8A2 projection tests
      // below, not here.
      assert.ok(!html.includes(REPO_ROOT), `${rel} must not embed absolute paths`);
    }
  });

  test('a malformed derived projection aborts the build before any dist/ mutation, naming the field', () => {
    const mutations = [
      {
        // namespacePolicy is NOT used here: Stage 8A2 allowlisted it in the
        // runtime projection (docs/EDITION_BUILDS_DESIGN.md), so it is no
        // longer an "unknown key" case -- see the dedicated Stage 8A2
        // projection tests below. A genuinely unallowlisted field name is
        // used instead to keep proving the same defense-in-depth gate.
        name: 'unknown key leaked into the projection',
        bad: '{ poolKeys: profile.poolKeys, defaultPoolKey: profile.defaultPoolKey, referenceLabelPrefix: "x", elementLabelPrefix: "y", sourceLabelText: "z", examTimerSecondsValues: profile.examTimerSecondsValues, displayName: "n", bogusInternalField: "leaked" }',
        expect: /runtimeConfig: unknown key\(s\): bogusInternalField/
      },
      {
        name: 'missing required field',
        bad: '{ poolKeys: profile.poolKeys, defaultPoolKey: profile.defaultPoolKey, referenceLabelPrefix: "x", elementLabelPrefix: "y", sourceLabelText: "z", examTimerSecondsValues: profile.examTimerSecondsValues }',
        expect: /runtimeConfig: missing required field "displayName"/
      },
      {
        name: 'defaultPoolKey outside poolKeys',
        bad: '{ poolKeys: profile.poolKeys, defaultPoolKey: "novice", referenceLabelPrefix: "x", elementLabelPrefix: "y", sourceLabelText: "z", examTimerSecondsValues: profile.examTimerSecondsValues, displayName: "n" }',
        expect: /runtimeConfig\.defaultPoolKey "novice" must be one of/
      },
      {
        name: 'blank label prefix',
        bad: '{ poolKeys: profile.poolKeys, defaultPoolKey: profile.defaultPoolKey, referenceLabelPrefix: "   ", elementLabelPrefix: "y", sourceLabelText: "z", examTimerSecondsValues: profile.examTimerSecondsValues, displayName: "n" }',
        expect: /runtimeConfig\.referenceLabelPrefix must be a non-blank string/
      },
      {
        name: 'non-ascending timer values',
        bad: '{ poolKeys: profile.poolKeys, defaultPoolKey: profile.defaultPoolKey, referenceLabelPrefix: "x", elementLabelPrefix: "y", sourceLabelText: "z", examTimerSecondsValues: [900, 0], displayName: "n" }',
        expect: /runtimeConfig\.examTimerSecondsValues must be strictly ascending/
      },
      {
        name: 'not an object at all',
        bad: '"us-fcc"',
        expect: /runtimeConfig: root must be an object/
      }
    ];

    for (const { name, bad, expect } of mutations) {
      const repo = freshRepo();
      injectRuntimeConfigBug(repo, bad);
      const r = runBuild(repo);
      assert.notEqual(r.status, 0, `expected a build failure for: ${name}`);
      assert.match(r.stderr, /Edition runtime config validation failed/, `gate must fire for: ${name}`);
      assert.match(r.stderr, expect, `expected diagnostic for: ${name}`);
      assert.ok(!fs.existsSync(path.join(repo, 'dist')), `no dist/ for: ${name}`);
    }
  });

  test('a failed runtime-projection gate leaves a seeded output tree byte-identical, sentinels included', () => {
    const repo = freshRepo();
    const dist = path.join(repo, 'dist');
    fs.mkdirSync(path.join(dist, 'pwa/icons'), { recursive: true });
    fs.writeFileSync(path.join(dist, 'index.html'), 'STALE STANDALONE OUTPUT');
    fs.writeFileSync(path.join(dist, 'SENTINEL.txt'), 'do not touch me');
    fs.writeFileSync(path.join(dist, 'pwa/index.html'), 'STALE PWA OUTPUT');
    fs.writeFileSync(path.join(dist, 'pwa/keep.txt'), 'keep');
    fs.writeFileSync(path.join(dist, 'pwa/icons/favicon.png'), 'not-a-real-icon');
    const before = hashTree(dist);

    injectRuntimeConfigBug(repo, '{ poolKeys: [], defaultPoolKey: "", referenceLabelPrefix: "", elementLabelPrefix: "", sourceLabelText: "", examTimerSecondsValues: [], displayName: "" }');
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Edition runtime config validation failed/);
    assert.deepEqual(hashTree(dist), before,
      'dist/ must be untouched when the runtime-projection gate fails');
  });

  test('a profile-level fault still fails at the profile gate, not the projection gate', () => {
    // Order check: the projection is derived from an ALREADY-validated
    // profile, so a bad profile must never reach the projection gate.
    const repo = freshRepo();
    const p = readEdition(repo);
    p.labels.referenceLabelTemplate = 'no placeholder here';
    writeEdition(repo, p);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Edition profile validation failed/);
    assert.match(r.stderr, /labels\.referenceLabelTemplate must contain the "\{ref\}" placeholder/);
    assert.doesNotMatch(r.stderr, /Edition runtime config validation failed/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
  });

  test('the projection follows the profile: a changed profile label changes the embedded runtime value', () => {
    // Proves the embedded values are genuinely DERIVED, not a second
    // hardcoded copy that happens to match the US profile today.
    const repo = freshRepo();
    const p = readEdition(repo);
    p.labels.referenceLabelTemplate = 'Rule {ref}';
    p.labels.elementLabelTemplate = 'Exam element {element}';
    p.defaultPoolKey = 'general';
    p.poolKeys = ['general', 'technician', 'extra'];
    p.displayName = 'Renamed Study App';
    writeEdition(repo, p);
    const r = runBuild(repo);
    assert.equal(r.status, 0, `expected success, got:\n${r.out}`);

    const config = extractRuntimeConfig(fs.readFileSync(path.join(repo, 'dist/index.html'), 'utf8'));
    assert.equal(config.referenceLabelPrefix, 'Rule ');
    assert.equal(config.elementLabelPrefix, 'Exam element ');
    assert.equal(config.defaultPoolKey, 'general');
    assert.deepEqual(config.poolKeys, ['general', 'technician', 'extra'],
      'authored pool ORDER is preserved in the projection');
    assert.equal(config.displayName, 'Renamed Study App');

    // HAM_EXAM_BANKS still uses the registry's canonical order, independent
    // of the profile's authored poolKeys order (Stage 7C behavior, unchanged).
    const standalone = fs.readFileSync(path.join(repo, 'dist/index.html'), 'utf8');
    const banksStart = standalone.indexOf('window.HAM_EXAM_BANKS = ');
    const technicianAt = standalone.indexOf('"technician"', banksStart);
    const generalAt = standalone.indexOf('"general"', banksStart);
    assert.ok(technicianAt !== -1 && technicianAt < generalAt,
      'HAM_EXAM_BANKS key order stays canonical regardless of profile poolKeys order');
  });
});

describe('build identifier and figure-policy seams (Stage 7E)', () => {
  function seedDist(repo) {
    const dist = path.join(repo, 'dist');
    fs.mkdirSync(path.join(dist, 'pwa/icons'), { recursive: true });
    fs.writeFileSync(path.join(dist, 'index.html'), 'STALE STANDALONE OUTPUT');
    fs.writeFileSync(path.join(dist, 'SENTINEL.txt'), 'do not touch me');
    fs.writeFileSync(path.join(dist, 'pwa/index.html'), 'STALE PWA OUTPUT');
    fs.writeFileSync(path.join(dist, 'pwa/keep.txt'), 'keep');
    fs.writeFileSync(path.join(dist, 'pwa/icons/favicon.png'), 'not-a-real-icon');
    return dist;
  }

  test('a corrupted figure mapping fails the moved figure-reference gate (after the registry gate) and leaves a seeded dist/ byte-identical', () => {
    const repo = freshRepo();
    const dist = seedDist(repo);
    const before = hashTree(dist);

    // Cross-pool mapping: a Technician question claiming an Extra figure.
    // Under Stages 2A-7D this failed inside loadPool; Stage 7E fails it after
    // the registry gate, with the registry-derived prefix policy -- same
    // diagnostic, same pre-mutation guarantee.
    const bank = readBank(repo, 'technician');
    const target = bank.find((q) => Object.prototype.hasOwnProperty.call(q, 'figure'));
    assert.ok(target, 'fixture technician bank has at least one mapped question');
    target.figure = 'E9-9';
    writeBank(repo, 'technician', bank);

    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Figure-reference validation failed for the technician pool/);
    assert.match(r.stderr, /prefix "E" but technician questions must map to T-\* figures/);
    assert.deepEqual(hashTree(dist), before, 'dist/ must be untouched when the figure-reference gate fails');
  });

  test('a registry prefix configuration that disagrees with the pool key fails the registry gate (the prefix-policy source) before any dist/ mutation', () => {
    const repo = freshRepo();
    const dist = seedDist(repo);
    const before = hashTree(dist);

    // The US registry validator pins questionIdPrefix to the pool key; a
    // derived edition replaces that validator seam. Either way the build must
    // fail before touching dist/, not silently derive a wrong policy.
    const registry = JSON.parse(fs.readFileSync(path.join(repo, POOLS_REL), 'utf8'));
    registry.pools.technician.questionIdPrefix = 'X';
    fs.writeFileSync(path.join(repo, POOLS_REL), JSON.stringify(registry));

    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /questionIdPrefix must be "T"/);
    assert.deepEqual(hashTree(dist), before, 'dist/ must be untouched when the registry gate fails');
  });

  test('the real US build derives figure prefixes from the registry: unchanged diagnostics, byte-identical output', () => {
    const repo = freshRepo();
    const r = runBuild(repo);
    assert.equal(r.status, 0, r.stderr);
    const standalone = fs.readFileSync(path.join(repo, 'dist', 'index.html'), 'utf8');
    // Spot-check that figure-bearing questions still embedded with their
    // registry-prefix-mapped figures (T-1 technician, E9-3 extra).
    assert.ok(standalone.includes('"T-1"'), 'technician figure registry embedded');
    assert.ok(standalone.includes('"E9-3"'), 'extra figure registry embedded');
  });
});

describe('build correctText dedup (Stage 7E size-recovery)', () => {
  test('the embedded banks carry no `correctText` duplication; the data files and the gate invariant keep it', () => {
    const repo = freshRepo();
    const r = runBuild(repo);
    assert.equal(r.status, 0, r.stderr);
    const standalone = fs.readFileSync(path.join(repo, 'dist', 'index.html'), 'utf8');
    const pwa = fs.readFileSync(path.join(repo, 'dist', 'pwa', 'index.html'), 'utf8');
    assert.ok(!standalone.includes('"correctText"'), 'standalone embeds no correctText');
    assert.ok(!pwa.includes('"correctText"'), 'PWA embeds no correctText');
    // The full documented schema (including correctText) stays in the data,
    // and the bank gate still enforces the correctText === choices[correct]
    // invariant that makes the embedded copy safe to drop.
    const bank = readBank(repo, 'technician');
    assert.ok(Object.prototype.hasOwnProperty.call(bank[0], 'correctText'),
      'data/*.json keeps the full schema');
    for (const q of bank) {
      assert.equal(q.correctText, q.choices[q.correct]);
    }
  });

  test('a mismatched `correctText` still aborts the build before any dist/ mutation (invariant intact)', () => {
    const repo = freshRepo();
    const bank = readBank(repo, 'general');
    bank[0].correctText = 'this does not match any choice text';
    writeBank(repo, 'general', bank);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /`correctText`.*does not match `choices\./);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')), 'no dist/ when the invariant fails');
  });
});

// --------------------------------------------------------------------------
// Stage 8A2: the --edition build-selection seam (docs/EDITION_BUILDS_DESIGN.md).
// `npm run build` / `npm run build -- --edition us` build the US edition,
// unchanged, to dist/; `npm run build -- --edition <key>` builds
// editions/<key>/ to dist-editions/<key>/. These tests drive the real
// editions/synthetic/ fixture (fictional, isolated, never part of the
// deployed US data set) through the real --edition CLI flag.
// --------------------------------------------------------------------------

function syntheticEditionPath(repoDir) {
  return path.join(repoDir, 'editions', 'synthetic', 'edition.json');
}
function readSyntheticEdition(repoDir) {
  return JSON.parse(fs.readFileSync(syntheticEditionPath(repoDir), 'utf8'));
}
function writeSyntheticEdition(repoDir, obj) {
  fs.writeFileSync(syntheticEditionPath(repoDir), JSON.stringify(obj, null, 2) + '\n');
}
function syntheticDist(repoDir) {
  return path.join(repoDir, 'dist-editions', 'synthetic');
}

describe('build-selection seam: --edition (Stage 8A2)', () => {
  test('the synthetic fixture builds to its own output root with only its own content embedded', () => {
    const repo = freshRepo();
    const r = runBuild(repo, ['--edition', 'synthetic']);
    assert.equal(r.status, 0, `expected success, got:\n${r.out}`);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')), 'the US dist/ must not be created by a synthetic build');

    const html = fs.readFileSync(path.join(syntheticDist(repo), 'index.html'), 'utf8');
    assert.equal(extractEditionGlobal(html), 'synthetic');
    const config = extractRuntimeConfig(html);
    assert.deepEqual(config.poolKeys, ['alpha', 'beta']);
    assert.equal(config.defaultPoolKey, 'alpha');
    assert.equal(config.displayName, 'Synthetic Fixture Edition');
    assert.deepEqual(config.namespacePolicy, {
      storageKey: 'synthetic-exam-state',
      legacyKeys: [
        'synthetic-exam-pool', 'synthetic-exam-theme',
        'synthetic-exam-index-{poolKey}', 'synthetic-exam-bookmarks-{poolKey}'
      ],
      cachePrefix: 'synthetic-exam-',
      probeKey: '__synthetic_exam_storage_probe__'
    });

    const pools = extractPoolsRegistry(html);
    assert.deepEqual(Object.keys(pools).sort(), ['alpha', 'beta']);
    // Only alpha/beta content reaches the SELECTED-CONTENT embeddings --
    // the edition identity, runtime projection, pools registry, and
    // question banks (already asserted above/below). This does NOT check
    // the whole document for the string "technician"/"US Ham Exam"/etc.:
    // the shared Help/Getting Started/Install prose in src/index.html is a
    // documented, accepted boundary (docs/EDITION_BUILDS_DESIGN.md "Known
    // boundary") that ships verbatim, US-specific wording, in EVERY
    // edition's output today, including this one.
    assert.equal((html.match(/window\.HAM_EXAM_BANKS = /g) || []).length, 1);
    const banksStart = html.indexOf('window.HAM_EXAM_BANKS = ');
    const banksEnd = html.indexOf(';</script>', banksStart);
    const banksSegment = html.slice(banksStart, banksEnd);
    assert.ok(!banksSegment.includes('"technician"') && !banksSegment.includes('"general"') && !banksSegment.includes('"extra"'),
      'HAM_EXAM_BANKS must not carry any US pool key for a synthetic build');
  });

  test('branding and manifest slots resolve to the synthetic profile\'s own values', () => {
    const repo = freshRepo();
    const r = runBuild(repo, ['--edition', 'synthetic']);
    assert.equal(r.status, 0, r.out);

    const html = fs.readFileSync(path.join(syntheticDist(repo), 'index.html'), 'utf8');
    assert.match(html, /<title>Synthetic Fixture Edition — Architecture-Test Widgeteer Practice \(Fictional\)<\/title>/);
    assert.match(html, /class="app-title">Synthetic Fixture Edition <span class="app-tagline">Architecture-Test Widgeteer Practice \(Fictional\)<\/span>/);
    assert.match(html, /id="help-app-name">Synthetic Fixture Edition</);

    const manifest = JSON.parse(fs.readFileSync(path.join(syntheticDist(repo), 'pwa', 'manifest.webmanifest'), 'utf8'));
    assert.equal(manifest.name, 'Synthetic Fixture Edition');
    assert.equal(manifest.short_name, 'Synthetic Fixture Edition');
    // manifestDescription was not declared -- falls back to subtitle.
    assert.equal(manifest.description, 'Architecture-Test Widgeteer Practice (Fictional)');
    // id/start_url/scope stay the template's own "./" -- no templating
    // needed; a relative scope already isolates dist/ from dist-editions/<key>/.
    assert.equal(manifest.id, './');
    assert.equal(manifest.start_url, './index.html');
    assert.equal(manifest.scope, './');
  });

  // Stage 8C: src/pwa/head.html's apple-mobile-web-app-title and meta
  // description were the last hardcoded US strings in PWA metadata (the
  // standalone document has no __PWA_HEAD__ content at all, so this only
  // ever appears in dist*/pwa/index.html).
  test('the PWA head metadata resolves to the synthetic profile\'s own values, with no US branding', () => {
    const repo = freshRepo();
    const r = runBuild(repo, ['--edition', 'synthetic']);
    assert.equal(r.status, 0, r.out);

    const html = fs.readFileSync(path.join(syntheticDist(repo), 'pwa', 'index.html'), 'utf8');
    assert.match(html, /<meta name="apple-mobile-web-app-title" content="Synthetic Fixture Edition">/);
    assert.match(html, /<meta name="description" content="Architecture-Test Widgeteer Practice \(Fictional\)">/);
    // Scoped to the <head> metadata itself (where src/pwa/head.html's
    // content lands), not the whole document: src/app.js's shared engine
    // code legitimately carries a few inert "FCC "-prefixed fallback
    // literals elsewhere in the document (documented, unreachable boundary,
    // see docs/EDITION_BUILDS_DESIGN.md), which a whole-document check would
    // wrongly flag.
    const headEnd = html.indexOf('</head>');
    assert.notEqual(headEnd, -1, '</head> not found');
    const head = html.slice(0, headEnd);
    for (const forbidden of ['US Ham Exam', 'FCC', 'NCVEC', 'Technician', 'General', 'Extra']) {
      assert.ok(!head.includes(forbidden), `synthetic PWA <head> must not embed US value "${forbidden}"`);
    }
    // The standalone document has no PWA head at all -- confirms the US
    // literal never leaks there either, for any edition.
    const standalone = fs.readFileSync(path.join(syntheticDist(repo), 'index.html'), 'utf8');
    assert.ok(!standalone.includes('apple-mobile-web-app-title'));
  });

  test('the US PWA head metadata is unchanged (no build.* override declared)', () => {
    const repo = freshRepo();
    const r = runBuild(repo);
    assert.equal(r.status, 0, r.out);
    const html = fs.readFileSync(path.join(repo, 'dist', 'pwa', 'index.html'), 'utf8');
    assert.match(html, /<meta name="apple-mobile-web-app-title" content="US Ham Exam">/);
    assert.match(html, /<meta name="description" content="Offline study app for the FCC Technician, General, and Extra amateur-radio exams">/);
  });

  // Review-fix: the synthetic profile's build.helpContent/
  // gettingStartedContent override the shared template's long-form
  // US-specific Help & About / Getting Started prose (previously shipped
  // verbatim in every edition's output). This proves the override actually
  // takes effect and that none of the US-specific wording it replaces
  // reaches the synthetic artifact.
  test('the synthetic edition\'s own Help/Getting Started content replaces the US prose, with no US-specific copy left', () => {
    const repo = freshRepo();
    const r = runBuild(repo, ['--edition', 'synthetic']);
    assert.equal(r.status, 0, r.out);

    const html = fs.readFileSync(path.join(syntheticDist(repo), 'index.html'), 'utf8');
    assert.match(html, /New to the Widgeteer fixture\?/);
    assert.match(html, /Start with Alpha</);

    // None of the long-form US-specific copy this override replaces reaches
    // the document (the Help & About / Getting Started panels, the Mock
    // Exam setup note, and the footer are all either templated or
    // edition-generic now).
    for (const forbidden of [
      'Amateur Radio', 'ARRL', 'vu2lid', 'amateur-radio', 'FCC Amateur Radio',
      'official NCVEC pool', 'FCC exam requirement', 'Getting Started guide',
      'Technician, General, and Extra question pools'
    ]) {
      assert.ok(!html.includes(forbidden), `synthetic output must not embed US-specific copy "${forbidden}"`);
    }
  });

  test('the US edition\'s own Help/Getting Started content is unaffected by the override seam (no build.helpContent declared)', () => {
    const repo = freshRepo();
    const r = runBuild(repo);
    assert.equal(r.status, 0, r.out);
    const html = fs.readFileSync(path.join(repo, 'dist', 'index.html'), 'utf8');
    assert.match(html, /New to Amateur Radio\?/);
    assert.match(html, /Start with Technician</);
  });

  test('the synthetic cache prefix appears in its own worker and never in the US worker, and vice versa', () => {
    const repo = freshRepo();
    const r1 = runBuild(repo);
    assert.equal(r1.status, 0, r1.out);
    const r2 = runBuild(repo, ['--edition', 'synthetic']);
    assert.equal(r2.status, 0, r2.out);

    const usSw = fs.readFileSync(path.join(repo, 'dist', 'pwa', 'sw.js'), 'utf8');
    const synSw = fs.readFileSync(path.join(syntheticDist(repo), 'pwa', 'sw.js'), 'utf8');
    assert.match(usSw, /CACHE_PREFIX = "ham-exam-"/);
    assert.ok(!usSw.includes('synthetic-exam-'), 'US worker must not carry the synthetic cache prefix');
    assert.match(synSw, /CACHE_PREFIX = "synthetic-exam-"/);
    // Checks the ASSIGNED value, not a bare substring search: the shared
    // sw.js template's own comment explaining the placeholder mentions
    // "ham-exam-" as prose in every edition's output (harmless -- it is
    // never executed), so the precise check is that CACHE_PREFIX itself is
    // never assigned the US literal.
    assert.ok(!synSw.includes('CACHE_PREFIX = "ham-exam-"'),
      'synthetic worker must not assign the literal US cache prefix to CACHE_PREFIX');
  });

  // Stage 8C: namespacePolicy.cachePrefix is substituted into src/pwa/sw.js
  // as JS SOURCE TEXT, not JSON-safe embedding, so it is a JS-injection
  // vector into the shipped service worker if left unconstrained. These
  // drive the real --edition CLI and inspect the real generated sw.js, the
  // same way every other build-gate test in this file does.
  test('a cachePrefix with quotes, newlines, or other unsafe characters fails the build before any output mutation', () => {
    const attacks = [
      'x"; fetch("https://evil.example"); //',
      "x'; fetch('https://evil.example'); //",
      'x\\"; alert(1); //',
      'ham-exam-\nself.foo = 1; //',
      'ham exam ',
      ''
    ];
    for (const attack of attacks) {
      const repo = freshRepo();
      const usBefore = (() => {
        const r0 = runBuild(repo);
        assert.equal(r0.status, 0, r0.out);
        return hashTree(path.join(repo, 'dist'));
      })();

      const profile = readSyntheticEdition(repo);
      profile.namespacePolicy.cachePrefix = attack;
      writeSyntheticEdition(repo, profile);
      const r = runBuild(repo, ['--edition', 'synthetic']);
      assert.notEqual(r.status, 0, `expected a build failure for cachePrefix ${JSON.stringify(attack)}`);
      assert.match(r.stderr, /namespacePolicy\.cachePrefix/);
      assert.ok(!fs.existsSync(syntheticDist(repo)), `no dist-editions/synthetic/ for ${JSON.stringify(attack)}`);
      // The unrelated US dist/ this test seeded is untouched too.
      assert.deepEqual(hashTree(path.join(repo, 'dist')), usBefore,
        `US dist/ must stay untouched when a synthetic cachePrefix attack is rejected: ${JSON.stringify(attack)}`);
    }
  });

  test('a malformed US cachePrefix fails the build before any output mutation, naming the field', () => {
    const repo = freshRepo();
    const p = readEdition(repo);
    p.namespacePolicy.cachePrefix = 'x"; fetch("https://evil.example"); //';
    writeEdition(repo, p);
    const r = runBuild(repo);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /namespacePolicy\.cachePrefix must be lowercase letters\/digits, hyphen-separated, ending in a hyphen/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')), 'no dist/ for a malformed US cachePrefix');
  });

  test('a valid custom cachePrefix still produces correct cache naming and a syntactically valid worker', () => {
    const repo = freshRepo();
    const profile = readSyntheticEdition(repo);
    profile.namespacePolicy.cachePrefix = 'fixture-widget-v2-';
    writeSyntheticEdition(repo, profile);
    const r = runBuild(repo, ['--edition', 'synthetic']);
    assert.equal(r.status, 0, r.out);

    const sw = fs.readFileSync(path.join(syntheticDist(repo), 'pwa', 'sw.js'), 'utf8');
    assert.match(sw, /CACHE_PREFIX = "fixture-widget-v2-"/);
    assert.match(sw, /CACHE_NAME = CACHE_PREFIX \+ "[0-9a-f]{12}"/);
    assert.match(sw, /key\.startsWith\(CACHE_PREFIX\) && key !== CACHE_NAME/);
    // The generated worker must still be syntactically valid JavaScript --
    // a Function constructor parse is a cheap, real syntax check (never
    // executed; service-worker globals like `self`/`caches` are undefined
    // here, so running it would throw for unrelated reasons).
    assert.doesNotThrow(() => new Function(sw), 'generated sw.js must be syntactically valid JavaScript');

    const html = fs.readFileSync(path.join(syntheticDist(repo), 'index.html'), 'utf8');
    const config = extractRuntimeConfig(html);
    assert.equal(config.namespacePolicy.cachePrefix, 'fixture-widget-v2-');
  });

  test('building the synthetic edition cannot overwrite the US dist/, and vice versa', () => {
    const repo = freshRepo();
    const r1 = runBuild(repo);
    assert.equal(r1.status, 0, r1.out);
    const usBefore = hashTree(path.join(repo, 'dist'));

    const r2 = runBuild(repo, ['--edition', 'synthetic']);
    assert.equal(r2.status, 0, r2.out);
    assert.deepEqual(hashTree(path.join(repo, 'dist')), usBefore,
      'building the synthetic edition must not change a single byte of the existing US dist/');

    const synBefore = hashTree(syntheticDist(repo));
    const r3 = runBuild(repo);
    assert.equal(r3.status, 0, r3.out);
    assert.deepEqual(hashTree(syntheticDist(repo)), synBefore,
      'rebuilding the US edition must not change a single byte of the existing dist-editions/synthetic/');
  });

  test('repeated synthetic builds are byte-identical', () => {
    const repo = freshRepo();
    const r1 = runBuild(repo, ['--edition', 'synthetic']);
    assert.equal(r1.status, 0, r1.out);
    const first = hashTree(syntheticDist(repo));
    const r2 = runBuild(repo, ['--edition', 'synthetic']);
    assert.equal(r2.status, 0, r2.out);
    assert.deepEqual(hashTree(syntheticDist(repo)), first, 'repeat synthetic build is not byte-identical');
  });

  test('"--edition us" is equivalent to the default build', () => {
    const repo = freshRepo();
    const r1 = runBuild(repo);
    assert.equal(r1.status, 0, r1.out);
    const defaultTree = hashTree(path.join(repo, 'dist'));

    fs.rmSync(path.join(repo, 'dist'), { recursive: true, force: true });
    const r2 = runBuild(repo, ['--edition', 'us']);
    assert.equal(r2.status, 0, r2.out);
    assert.deepEqual(hashTree(path.join(repo, 'dist')), defaultTree,
      '"--edition us" must produce byte-identical output to the no-flag default');
    assert.ok(!fs.existsSync(path.join(repo, 'dist-editions')),
      '"--edition us" must never create dist-editions/');
  });

  test('an unknown --edition value fails before any output mutation, naming the key', () => {
    const repo = freshRepo();
    const r1 = runBuild(repo);
    assert.equal(r1.status, 0, r1.out);
    const usBefore = hashTree(path.join(repo, 'dist'));

    const r2 = runBuild(repo, ['--edition', 'nonexistent']);
    assert.notEqual(r2.status, 0);
    assert.match(r2.stderr, /Unknown --edition "nonexistent"/);
    assert.deepEqual(hashTree(path.join(repo, 'dist')), usBefore, 'US dist/ must be untouched');
    assert.ok(!fs.existsSync(path.join(repo, 'dist-editions')), 'no dist-editions/ may be created');
  });

  test('a malformed --edition value (bad shape) fails before any output mutation', () => {
    const repo = freshRepo();
    const r = runBuild(repo, ['--edition', 'BAD KEY']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Unknown --edition "BAD KEY": must be "us" or a lowercase/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
    assert.ok(!fs.existsSync(path.join(repo, 'dist-editions')));
  });

  test('a missing --edition value fails clearly', () => {
    const repo = freshRepo();
    const r = runBuild(repo, ['--edition']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /--edition requires a value/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist')));
  });

  test('an editionKey mismatch fails before any output mutation, naming both values', () => {
    const repo = freshRepo();
    const profile = readSyntheticEdition(repo);
    profile.editionKey = 'not-synthetic';
    writeSyntheticEdition(repo, profile);
    const r = runBuild(repo, ['--edition', 'synthetic']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /declares editionKey "not-synthetic", but "--edition synthetic" was requested/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist-editions')), 'no dist-editions/ may be created');
  });

  test('a missing editions/<key>/edition.json fails before any output mutation', () => {
    const repo = freshRepo();
    fs.rmSync(syntheticEditionPath(repo));
    const r = runBuild(repo, ['--edition', 'synthetic']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /editions\/synthetic\/edition\.json does not exist/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist-editions')));
  });

  test('the synthetic registry uses the "generic" idPolicy: non-T\\/G\\/E IDs and overlapping group-key hierarchy validate', () => {
    const repo = freshRepo();
    const registry = JSON.parse(fs.readFileSync(path.join(repo, 'editions/synthetic/pools.json'), 'utf8'));
    // The fixture intentionally uses overlapping group-key prefixes within
    // alpha's subelement 1 (A1 the catch-all, A1A the more specific group)
    // to exercise the SAME longest-prefix-match rule src/study-scope.js
    // uses at runtime -- this only validates under "generic", never "us".
    assert.ok(registry.pools.alpha.groupBlueprint.A1 && registry.pools.alpha.groupBlueprint.A1A,
      'fixture must keep its overlapping A1/A1A group hierarchy');
    assert.deepEqual(registry.pools.alpha.withdrawnIds, ['A1A09'],
      'fixture must keep its withdrawn-ID coverage');

    const r = runBuild(repo, ['--edition', 'synthetic']);
    assert.equal(r.status, 0, `the generic idPolicy must accept this non-US shape:\n${r.out}`);
  });

  test('a structurally broken synthetic registry still fails under the "generic" idPolicy', () => {
    const repo = freshRepo();
    const registryPath = path.join(repo, 'editions/synthetic/pools.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    // Break a purely STRUCTURAL invariant ("generic" keeps these) rather
    // than a US identity shape ("generic" drops those): blueprint total
    // must still equal examQuestionCount.
    registry.pools.alpha.groupBlueprint.A1A = 999;
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n');
    const r = runBuild(repo, ['--edition', 'synthetic']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /groupBlueprint totals \d+ but examQuestionCount is 7/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist-editions')));
  });
});

// --------------------------------------------------------------------------
// Stage 8D2/8D3A: the India edition (editions/india/). Stage 8D2 shipped a
// schema-valid profile/pool registry with deliberately NO question bank.
// Stage 8D3A adds a real 15-question seed bank plus a provenance sidecar
// (docs/INDIA_CONTENT_CONTRACT.md) and the scripts/question-provenance.js
// build gate that enforces it. The approved seed bank is now buildable;
// negative cases below still verify fail-before-mutation for malformed
// provenance, while the real India build is covered for success and
// determinism.
// --------------------------------------------------------------------------

const editionProfileValidator = require(path.join(REPO_ROOT, 'scripts', 'edition-profile'));

function indiaEditionPath(repoDir) {
  return path.join(repoDir, 'editions', 'india', 'edition.json');
}
function readIndiaEdition(repoDir) {
  return JSON.parse(fs.readFileSync(indiaEditionPath(repoDir), 'utf8'));
}
function writeIndiaEdition(repoDir, obj) {
  fs.writeFileSync(indiaEditionPath(repoDir), JSON.stringify(obj, null, 2) + '\n');
}

describe('India edition scaffold (Stage 8D2)', () => {
  test('the India edition.json passes the profile validator (the template is well-formed authoring input)', () => {
    const repo = freshRepo();
    const profile = readIndiaEdition(repo);
    const { errors } = editionProfileValidator.validateEditionProfile(profile, { poolKeys: profile.poolKeys });
    assert.deepEqual(errors, [], `India profile must be schema-valid:\n- ${errors.join('\n- ')}`);
    // The India-specific namespace/branding choices the template exists to
    // pin down (docs/EDITION_BUILDS_DESIGN.md):
    assert.equal(profile.editionKey, 'india');
    assert.equal(profile.defaultPoolKey, 'restricted');
    assert.equal(profile.namespacePolicy.storageKey, 'india-asoc-practice-state');
    assert.equal(profile.namespacePolicy.cachePrefix, 'india-asoc-practice-');
    assert.equal(profile.namespacePolicy.probeKey, '__india_asoc_practice_storage_probe__');
    assert.equal(profile.figurePolicy.manifestRequired, false);
    assert.equal(profile.figurePolicy.provenanceScheme, 'none');
  });

  test('the India pools.json is a well-formed generic-policy practice registry (no bank-dependent claims)', () => {
    const repo = freshRepo();
    const registry = JSON.parse(fs.readFileSync(path.join(repo, 'editions', 'india', 'pools.json'), 'utf8'));
    assert.equal(registry.schemaVersion, 3);
    const entry = registry.pools.restricted;
    assert.ok(entry, 'the restricted pool entry must exist');
    assert.equal(entry.poolKey, 'restricted');
    assert.equal(entry.questionIdPrefix, 'R');
    assert.match(entry.sourceUrl, /^https:\/\//, 'sourceUrl must be an https URL shape');
    // Structural self-consistency that does not require a bank: the practice
    // blueprint sums to the practice exam size, every blueprint group has a
    // scopeLabels title, and counts are modest neutral practice values.
    const blueprintTotal = Object.values(entry.groupBlueprint).reduce((a, b) => a + b, 0);
    assert.equal(blueprintTotal, entry.examQuestionCount,
      'groupBlueprint must sum to examQuestionCount');
    assert.ok(entry.passingScore > 0 && entry.passingScore < entry.examQuestionCount,
      'passingScore must be a plausible practice value');
    for (const group of Object.keys(entry.groupBlueprint)) {
      assert.ok(entry.scopeLabels.groups[group], `group ${group} needs a scopeLabels.groups title`);
    }
    for (const sub of Object.keys(entry.scopeLabels.subelements)) {
      assert.ok(Object.keys(entry.groupBlueprint).some((g) => g === sub || g.startsWith(sub)),
        `subelement ${sub} must own at least one blueprint group`);
    }
  });

  test('--edition india builds successfully and does not touch the US dist/', () => {
    const repo = freshRepo();
    const r1 = runBuild(repo);
    assert.equal(r1.status, 0, r1.out);
    const usBefore = hashTree(path.join(repo, 'dist'));

    const r = runBuild(repo, ['--edition', 'india']);
    assert.equal(r.status, 0, r.out);
    assert.ok(fs.existsSync(path.join(repo, 'dist-editions', 'india', 'index.html')),
      'the approved India edition must produce its standalone artifact');
    assert.deepEqual(hashTree(path.join(repo, 'dist')), usBefore,
      'the India build must not modify the US dist/');
  });

  test('after the India build, the default US build and "--edition us" still succeed and agree', () => {
    const repo = freshRepo();
    const r1 = runBuild(repo, ['--edition', 'india']);
    assert.equal(r1.status, 0, r1.out);

    const r2 = runBuild(repo);
    assert.equal(r2.status, 0, r2.out);
    const defaultTree = hashTree(path.join(repo, 'dist'));

    fs.rmSync(path.join(repo, 'dist'), { recursive: true, force: true });
    const r3 = runBuild(repo, ['--edition', 'us']);
    assert.equal(r3.status, 0, r3.out);
    assert.deepEqual(hashTree(path.join(repo, 'dist')), defaultTree,
      'the India build must not affect the US build');
  });

  test('a malformed India edition.json fails profile validation with a field-specific diagnostic, before any output mutation', () => {
    const repo = freshRepo();
    const profile = readIndiaEdition(repo);
    delete profile.displayName;
    writeIndiaEdition(repo, profile);
    const r = runBuild(repo, ['--edition', 'india']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /missing required field "displayName"/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist-editions')),
      'no dist-editions/ may be created for a malformed India profile');
  });
});

// --------------------------------------------------------------------------
// Stage 8D3A: the first India seed bank (15 questions) and its provenance
// sidecar, driven through the real --edition CLI against the real
// editions/india/ files. Pure provenance-shape unit coverage (missing
// citations, bad enums, etc.) lives in tests/unit/question-provenance.test.js
// against synthetic fixtures; this file covers only the real-build
// integration: fail-before-mutation, exact diagnostics, determinism, and
// that the gate is a no-op for every edition that declares no sidecar.
// --------------------------------------------------------------------------

function indiaProvenancePath(repoDir) {
  return path.join(repoDir, 'editions', 'india', 'banks', 'restricted.provenance.json');
}
function readIndiaProvenance(repoDir) {
  return JSON.parse(fs.readFileSync(indiaProvenancePath(repoDir), 'utf8'));
}
function writeIndiaProvenance(repoDir, obj) {
  fs.writeFileSync(indiaProvenancePath(repoDir), JSON.stringify(obj, null, 2) + '\n');
}
function indiaBankPath(repoDir) {
  return path.join(repoDir, 'editions', 'india', 'banks', 'restricted.json');
}
function readIndiaBank(repoDir) {
  return JSON.parse(fs.readFileSync(indiaBankPath(repoDir), 'utf8'));
}
// Marks every sidecar entry build-ready (reviewStatus "approved"), the one
// mutation these tests need to prove the gate also PASSES real content,
// without ever doing this to the actually-committed, genuinely-unreviewed
// files.
function approveAll(sidecar) {
  const out = {};
  for (const id of Object.keys(sidecar)) {
    out[id] = Object.assign({}, sidecar[id], { reviewStatus: 'approved' });
  }
  return out;
}

describe('India seed bank and provenance sidecar (Stage 8D3A)', () => {
  test('the real seed bank has exactly 15 questions, all passing the base question-bank schema', () => {
    const repo = freshRepo();
    const bank = readIndiaBank(repo);
    assert.equal(bank.length, 15);
    const { errors } = require(path.join(REPO_ROOT, 'scripts', 'question-bank'))
      .validateQuestionBank(bank, { poolKey: 'restricted' });
    assert.deepEqual(errors, []);
  });

  test('the real provenance sidecar has exactly one approved entry per bank question and validates build-ready', () => {
    const repo = freshRepo();
    const bank = readIndiaBank(repo);
    const sidecar = readIndiaProvenance(repo);
    assert.deepEqual(Object.keys(sidecar).sort(), bank.map((q) => q.id).sort());

    const qp = require(path.join(REPO_ROOT, 'scripts', 'question-provenance'));
    assert.deepEqual(qp.validateProvenanceSidecar(sidecar, bank, { requireBuildReady: true }), { errors: [] });
    // The approved seed bank has completed the recorded review gate and has
    // cleared rights status for every item.
    for (const id of Object.keys(sidecar)) {
      assert.equal(sidecar[id].rightsStatus, 'cleared', `${id}: rights must already be cleared`);
      assert.equal(sidecar[id].reviewStatus, 'approved', `${id}: review must be approved`);
    }
  });

  test('--edition india builds the approved seed bank and embeds its own content', () => {
    const repo = freshRepo();
    const r = runBuild(repo, ['--edition', 'india']);
    assert.equal(r.status, 0, r.out);
    const html = fs.readFileSync(path.join(repo, 'dist-editions', 'india', 'index.html'), 'utf8');
    assert.equal(extractEditionGlobal(html), 'india');
    assert.match(html, /India ASOC Practice/);
    assert.match(html, /R1B01/);
  });
  test('marking every item "approved" makes the India edition build successfully, twice, byte-identically', () => {
    const repo = freshRepo();
    const sidecar = readIndiaProvenance(repo);
    writeIndiaProvenance(repo, approveAll(sidecar));

    const r1 = runBuild(repo, ['--edition', 'india']);
    assert.equal(r1.status, 0, `expected success once review is complete, got:\n${r1.out}`);
    const indiaDist = path.join(repo, 'dist-editions', 'india');
    const html = fs.readFileSync(path.join(indiaDist, 'index.html'), 'utf8');
    assert.equal(extractEditionGlobal(html), 'india');
    const config = extractRuntimeConfig(html);
    assert.deepEqual(config.poolKeys, ['restricted']);

    const first = hashTree(indiaDist);
    const r2 = runBuild(repo, ['--edition', 'india']);
    assert.equal(r2.status, 0, r2.out);
    assert.deepEqual(hashTree(indiaDist), first,
      'repeat India build is not byte-identical');
  });

  test('a provenance sidecar missing an entry for a real bank question fails before any output mutation', () => {
    const repo = freshRepo();
    const sidecar = approveAll(readIndiaProvenance(repo));
    delete sidecar.R1A01;
    writeIndiaProvenance(repo, sidecar);
    const r = runBuild(repo, ['--edition', 'india']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /missing entry for bank question id "R1A01"/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist-editions', 'india')));
  });

  test('a provenance sidecar entry with an unsupported provenance class fails before any output mutation', () => {
    const repo = freshRepo();
    const sidecar = approveAll(readIndiaProvenance(repo));
    sidecar.R1A01.provenanceClass = 'fcc-pool-reprint';
    writeIndiaProvenance(repo, sidecar);
    const r = runBuild(repo, ['--edition', 'india']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /provenanceClass must be one of:.*got "fcc-pool-reprint"/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist-editions', 'india')));
  });

  test('a provenance sidecar entry with a missing citation fails before any output mutation', () => {
    const repo = freshRepo();
    const sidecar = approveAll(readIndiaProvenance(repo));
    sidecar.R1A01.sourceCitation = '';
    writeIndiaProvenance(repo, sidecar);
    const r = runBuild(repo, ['--edition', 'india']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /sourceCitation must be a non-blank string \(missing citation\)/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist-editions', 'india')));
  });

  test('an unresolved rights status fails before any output mutation', () => {
    const repo = freshRepo();
    const sidecar = approveAll(readIndiaProvenance(repo));
    sidecar.R1A01.rightsStatus = 'unresolved';
    writeIndiaProvenance(repo, sidecar);
    const r = runBuild(repo, ['--edition', 'india']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /unresolved rights status, this item cannot build yet/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist-editions', 'india')));
  });

  test('an orphan provenance entry naming no real bank question id fails before any output mutation', () => {
    const repo = freshRepo();
    const sidecar = approveAll(readIndiaProvenance(repo));
    sidecar.R9Z99 = Object.assign({}, sidecar.R1A01);
    writeIndiaProvenance(repo, sidecar);
    const r = runBuild(repo, ['--edition', 'india']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /provenance sidecar\["R9Z99"\]: does not correspond to any bank question id/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist-editions', 'india')));
  });

  test('a duplicate bank question id still fails the existing question-bank gate, unaffected by the new provenance gate', () => {
    const repo = freshRepo();
    const bank = readIndiaBank(repo);
    bank[1].id = bank[0].id;
    fs.writeFileSync(indiaBankPath(repo), JSON.stringify(bank, null, 2) + '\n');
    writeIndiaProvenance(repo, approveAll(readIndiaProvenance(repo)));
    const r = runBuild(repo, ['--edition', 'india']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /duplicate question id/);
    assert.ok(!fs.existsSync(path.join(repo, 'dist-editions', 'india')));
  });

  test('the provenance gate is a complete no-op for editions that declare no provenanceSidecars (US and synthetic)', () => {
    const repo = freshRepo();
    const r1 = runBuild(repo);
    assert.equal(r1.status, 0, r1.out);
    const r2 = runBuild(repo, ['--edition', 'synthetic']);
    assert.equal(r2.status, 0, r2.out);
    // Neither profile declares build.provenanceSidecars; both already
    // succeed (proven throughout this file) with no provenance-shaped
    // diagnostic ever possible for them.
  });
});
