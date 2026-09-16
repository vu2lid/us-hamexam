'use strict';

// Stage 5B3: static/policy regression coverage for the routine standalone
// selection's project routing (playwright.routine.config.js). This encodes,
// as a repeatable test, the audit the original T2 work performed manually
// (see docs/TEST_EFFICIENCY_PLAN.md) -- it was never previously captured as
// a regression test, so a future change to the routine config's project
// list or grep patterns could silently reintroduce a duplicate test/project
// pair or drop coverage without any test failing.
//
// This does NOT launch a browser: `playwright test --list --reporter=json`
// only resolves the test/project matrix (fast, ~1-2s) -- a real subprocess,
// consistent with this project's existing pattern of driving real CLI entry
// points (see tests/unit/build-gate.test.js), not a browser test.
//
// Review fix: every cross-project/coverage comparison below now compares
// stable logical-test IDENTITIES (`file::line::title`), never bare titles.
// Two different `test(...)` definitions can never share both the same file
// and the same source line, so `file + line` alone already disambiguates
// same-named tests in different files or different describe blocks -- title
// is included in the identity only for readable failure messages, not for
// uniqueness. `collectFromReport` (the identity/collection logic) is a pure
// function of a plain JS object, so it is exercised here both against the
// real Playwright JSON output and, in the "identity helper" block below,
// against a hand-built synthetic report with two same-titled tests in
// different files/lines -- proving the fix without any browser or
// Playwright subprocess.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.join(__dirname, '../..');
const PLAYWRIGHT_CLI = require.resolve('@playwright/test/cli');

function listProject(configFile) {
  const result = spawnSync(
    process.execPath,
    [PLAYWRIGHT_CLI, 'test', `--config=${configFile}`, '--list', '--reporter=json'],
    { cwd: REPO_ROOT, encoding: 'utf8', shell: false, maxBuffer: 32 * 1024 * 1024 }
  );
  assert.equal(result.status, 0, `playwright --list failed for ${configFile}: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

// A stable identity for ONE logical test definition, independent of which
// project runs it: `file::line::title`. `file + line` alone is already
// unique (two `test(...)` calls cannot share a source line), so this cannot
// conflate two different tests that merely happen to share a leaf title in
// different files or describe blocks -- unlike comparing bare titles.
function testId(spec) {
  return `${spec.file}::${spec.line}::${spec.title}`;
}

// A stable identity for one (test, project) EXECUTION -- used only for the
// duplicate-pair check, which must catch the same logical test appearing
// twice under the same project.
function pairId(spec, projectName) {
  return `${testId(spec)}::${projectName}`;
}

// Walks a Playwright `--list --reporter=json` report (or an equivalent
// hand-built object for the synthetic tests below) into:
//   pairs      -- one { id, file, line, title, project } per (spec, project)
//   byProject  -- { [projectName]: Map<id, title> }, one entry per logical
//                 test that project runs (title kept only for tag matching
//                 and readable assertion messages, never for identity).
function collectFromReport(reportJson) {
  const pairs = [];
  const byProject = {};
  (function walk(suite) {
    for (const s of suite.suites || []) walk(s);
    for (const spec of suite.specs || []) {
      const id = testId(spec);
      for (const t of spec.tests || []) {
        pairs.push({ id, file: spec.file, line: spec.line, title: spec.title, project: t.projectName });
        const byId = (byProject[t.projectName] = byProject[t.projectName] || new Map());
        byId.set(id, spec.title);
      }
    }
  })(reportJson);
  return { pairs, byProject };
}

// The set of logical-test IDs a project runs.
function idSet(byProject, projectName) {
  return new Set(byProject[projectName] ? byProject[projectName].keys() : []);
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

// The subset of `logicalByProject`'s IDs whose TITLE matches `tagRegex`.
// Title is used only to decide inclusion (tags live in the title string);
// the returned set is still keyed by stable ID.
function idsMatchingTag(byIdMap, tagRegex) {
  const out = new Set();
  for (const [id, title] of byIdMap) {
    if (tagRegex.test(title)) out.add(id);
  }
  return out;
}

// --------------------------------------------------------------------------
// Synthetic identity-helper tests (no Playwright subprocess, no browser) --
// protects the review fix itself: two tests sharing a leaf title in
// different files (and, separately, different lines of the same file) must
// never be conflated by the identity/collection logic.
// --------------------------------------------------------------------------

describe('collectFromReport / testId -- identity helper (synthetic, no subprocess)', () => {
  // Two entirely different logical tests that happen to share a leaf title,
  // in different files, both present on the same project. A title-only
  // implementation would treat these as one test; a naive title Set would
  // collapse to size 1.
  const sameLeafTitleDifferentFiles = {
    suites: [
      {
        title: 'a.spec.js',
        file: 'a.spec.js',
        specs: [
          { file: 'a.spec.js', line: 10, title: 'does the thing', tests: [{ projectName: 'p1' }] },
        ],
      },
      {
        title: 'b.spec.js',
        file: 'b.spec.js',
        specs: [
          { file: 'b.spec.js', line: 10, title: 'does the thing', tests: [{ projectName: 'p1' }] },
        ],
      },
    ],
  };

  test('testId differs for same-titled tests in different files even at the same line', () => {
    const { byProject } = collectFromReport(sameLeafTitleDifferentFiles);
    const ids = [...idSet(byProject, 'p1')];
    assert.equal(ids.length, 2, 'both same-leaf-title tests must be counted as distinct logical tests');
    assert.notEqual(ids[0], ids[1]);
  });

  test('a naive title-only Set would have wrongly collapsed these to one entry (demonstrating the bug this fixes)', () => {
    const titles = [];
    (function walk(suite) {
      for (const s of suite.suites || []) walk(s);
      for (const spec of suite.specs || []) titles.push(spec.title);
    })(sameLeafTitleDifferentFiles);
    assert.equal(new Set(titles).size, 1, 'both specs share one leaf title string');
    // ...but collectFromReport keeps them distinct:
    const { byProject } = collectFromReport(sameLeafTitleDifferentFiles);
    assert.equal(idSet(byProject, 'p1').size, 2);
  });

  test('same file, same title, different lines are also kept distinct', () => {
    const report = {
      suites: [{
        title: 'x.spec.js',
        file: 'x.spec.js',
        specs: [
          { file: 'x.spec.js', line: 5, title: 'repeats', tests: [{ projectName: 'p1' }] },
          { file: 'x.spec.js', line: 50, title: 'repeats', tests: [{ projectName: 'p1' }] },
        ],
      }],
    };
    const { byProject } = collectFromReport(report);
    assert.equal(idSet(byProject, 'p1').size, 2);
  });

  test('a set-based desktop-equality check correctly FAILS when one project is missing a same-titled-elsewhere test', () => {
    // p1 has both same-leaf-title tests (from different files); p2 has only
    // one of them. A title-based Set comparison could wrongly report these
    // as equal (both reduce to the title-set {"does the thing"}); the
    // identity-based comparison must not.
    const report = {
      suites: [
        { title: 'a.spec.js', file: 'a.spec.js', specs: [
          { file: 'a.spec.js', line: 10, title: 'does the thing', tests: [{ projectName: 'p1' }, { projectName: 'p2' }] },
        ] },
        { title: 'b.spec.js', file: 'b.spec.js', specs: [
          { file: 'b.spec.js', line: 10, title: 'does the thing', tests: [{ projectName: 'p1' }] },
        ] },
      ],
    };
    const { byProject } = collectFromReport(report);
    assert.equal(setsEqual(idSet(byProject, 'p1'), idSet(byProject, 'p2')), false,
      'p1 and p2 must NOT be reported equal -- p1 has one more distinct logical test than p2, ' +
      'even though every title in play is the string "does the thing"');
  });

  test('pairId also distinguishes same-titled tests, protecting the duplicate-pair check', () => {
    const specA = { file: 'a.spec.js', line: 10, title: 'does the thing' };
    const specB = { file: 'b.spec.js', line: 10, title: 'does the thing' };
    assert.notEqual(pairId(specA, 'p1'), pairId(specB, 'p1'));
  });
});

// --------------------------------------------------------------------------
// Real routine/full-matrix routing (real playwright --list subprocesses)
// --------------------------------------------------------------------------

// Listed once and shared by both describe blocks below -- each is a real
// subprocess call (~1s), so this avoids paying for it twice.
const routine = collectFromReport(listProject('playwright.routine.config.js'));
const full = collectFromReport(listProject('playwright.config.js'));

describe('routine standalone routing (playwright.routine.config.js)', () => {
  const { pairs, byProject } = routine;

  test('every project in the routine selection is one of the seven documented projects', () => {
    assert.deepEqual(
      Object.keys(byProject).sort(),
      ['chromium-desktop', 'chromium-mobile', 'chromium-tablet', 'firefox-desktop', 'webkit-desktop', 'webkit-mobile', 'webkit-tablet']
    );
  });

  test('no duplicate (file, line, title, project) pair occurs in the routine union', () => {
    const seen = new Set();
    const dupes = [];
    for (const p of pairs) {
      const key = pairId(p, p.project);
      if (seen.has(key)) dupes.push(key);
      seen.add(key);
    }
    assert.deepEqual(dupes, []);
  });

  test('all three desktop projects run the identical, complete logical test set', () => {
    const desktopKeys = ['chromium-desktop', 'firefox-desktop', 'webkit-desktop'];
    const sets = desktopKeys.map((k) => idSet(byProject, k));
    for (let i = 1; i < sets.length; i++) {
      assert.ok(setsEqual(sets[0], sets[i]),
        `${desktopKeys[i]} must run the exact same logical tests as ${desktopKeys[0]}`);
    }
  });

  test('webkit-mobile runs exactly the @compat OR @responsive tagged tests, once each', () => {
    const logical = byProject['chromium-desktop']; // the complete logical set (see test above)
    const expected = idsMatchingTag(logical, /@compat|@responsive/);
    assert.ok(setsEqual(idSet(byProject, 'webkit-mobile'), expected));
  });

  test('chromium-mobile, chromium-tablet, and webkit-tablet each run exactly the @responsive-tagged tests', () => {
    const logical = byProject['chromium-desktop'];
    const expected = idsMatchingTag(logical, /@responsive/);
    for (const key of ['chromium-mobile', 'chromium-tablet', 'webkit-tablet']) {
      assert.ok(setsEqual(idSet(byProject, key), expected), `${key} must match the @responsive-tagged set`);
    }
  });

  test('the routine selection never runs a test on a project the full matrix does not also cover', () => {
    for (const key of Object.keys(byProject)) {
      assert.ok(full.byProject[key], `routine project "${key}" must also exist in the full matrix`);
      const fullIds = idSet(full.byProject, key);
      for (const [id, title] of byProject[key]) {
        assert.ok(fullIds.has(id),
          `routine test "${title}" (${id}) on "${key}" must also run in the full matrix's same project`);
      }
    }
  });
});

describe('full standalone matrix (playwright.config.js)', () => {
  test('every one of the nine projects runs the identical, complete logical test set', () => {
    const { byProject } = full;
    const names = Object.keys(byProject).sort();
    assert.deepEqual(names, [
      'chromium-desktop', 'chromium-mobile', 'chromium-tablet',
      'firefox-desktop', 'firefox-mobile', 'firefox-tablet',
      'webkit-desktop', 'webkit-mobile', 'webkit-tablet',
    ]);
    const sets = names.map((n) => idSet(byProject, n));
    for (let i = 1; i < sets.length; i++) {
      assert.ok(setsEqual(sets[0], sets[i]),
        `${names[i]} must run every test that ${names[0]} runs, untagged included`);
    }
  });
});
