'use strict';

// Stage 5B2: focused, dependency-free static policy checks for the two
// GitHub Actions workflows and the package.json scripts they invoke.
//
// This deliberately does NOT parse general YAML -- both workflow files are
// small and hand-written with consistent indentation, so a narrowly scoped
// line-based/regex extraction anchored to that exact structure is enough to
// catch a policy regression (a write permission creeping in, the PR workflow
// gaining a deployment step, the full `npm test` gate quietly being swapped
// for the lighter routine selection, an unpinned action, etc.) without the
// cost and scope of a real parser. Extraction only ever looks at `run:` and
// `uses:` step lines (matched by line-start indentation), never raw
// substring search over the whole file, so prose in comments (which
// deliberately mentions commands like "npm test" and "npm run test:routine"
// for humans reading the workflow) can never produce a false pass or fail.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '../..');
const PR_WORKFLOW_PATH = path.join(REPO_ROOT, '.github/workflows/verify-pr.yml');
const DEPLOY_WORKFLOW_PATH = path.join(REPO_ROOT, '.github/workflows/deploy-pages.yml');

const prWorkflow = fs.readFileSync(PR_WORKFLOW_PATH, 'utf8');
const deployWorkflow = fs.readFileSync(DEPLOY_WORKFLOW_PATH, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));

// --------------------------------------------------------------------------
// small, narrowly-scoped extraction helpers (line-anchored, not a YAML parser)
// --------------------------------------------------------------------------

// Every `run: <command>` step body, trimmed, in file order. Only matches
// lines that are actually a `run:` step key (leading whitespace then
// `run:`), never text inside `#` comments or `name:` step titles.
function extractRunCommands(yamlText) {
  const commands = [];
  const re = /^[ \t]*run:[ \t]*(.+)$/gm;
  let m;
  while ((m = re.exec(yamlText)) !== null) {
    commands.push(m[1].trim());
  }
  return commands;
}

// Every `uses: <action-ref>` value, trimmed of any trailing `# vN` comment.
function extractUsesRefs(yamlText) {
  const refs = [];
  const re = /^[ \t]*uses:[ \t]*(\S+)/gm;
  let m;
  while ((m = re.exec(yamlText)) !== null) {
    refs.push(m[1]);
  }
  return refs;
}

// True only for a command that IS (not merely contains) an invocation of the
// bare "test" npm script -- "npm test" or "npm run test" exactly -- so it
// does not false-match "npm run test:routine", "npm run test:generated", or
// "npm run test:unit", each of which names a different script.
function isBareNpmTestInvocation(command) {
  return command === 'npm test' || command === 'npm run test';
}

// Parses a simple "key: value" mapping textually nested under a `key:` line
// at exactly `parentIndent` spaces, reading only child lines indented deeper
// than that until indentation returns to `parentIndent` or shallower (or the
// mapping is a same-line flow value like `{}`). Sufficient for this
// project's consistently-2-space-indented, hand-written workflow YAML.
function readMappingAfter(yamlText, keyLine) {
  const lines = yamlText.split('\n');
  const idx = lines.findIndex((l) => l.trim() === keyLine.trim());
  assert.ok(idx !== -1, `expected to find a line matching ${JSON.stringify(keyLine)}`);
  const parentIndent = lines[idx].match(/^[ \t]*/)[0].length;
  const out = {};
  for (let i = idx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const indent = line.match(/^[ \t]*/)[0].length;
    if (indent <= parentIndent) break;
    const kv = line.trim().match(/^([\w-]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2];
  }
  return out;
}

// --------------------------------------------------------------------------
// PR workflow (.github/workflows/verify-pr.yml)
// --------------------------------------------------------------------------

describe('PR workflow (verify-pr.yml)', () => {
  test('triggers on pull_request, and never on pull_request_target', () => {
    assert.match(prWorkflow, /^on:\s*\n[ \t]*pull_request:\s*$/m);
    assert.ok(!prWorkflow.includes('pull_request_target'));
  });

  test('every third-party action is pinned to a 40-character commit SHA', () => {
    const refs = extractUsesRefs(prWorkflow);
    assert.ok(refs.length > 0, 'expected at least one `uses:` step');
    for (const ref of refs) {
      assert.match(ref, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/,
        `action ref ${JSON.stringify(ref)} must be pinned to an immutable 40-hex-char commit SHA`);
    }
  });

  test('top-level permissions are empty', () => {
    assert.match(prWorkflow, /^permissions:\s*\{\}\s*$/m);
  });

  test('the job grants only contents: read, no write scope of any kind', () => {
    // readMappingAfter matches on trimmed content, so this finds the single
    // job-level "permissions:" line (the top-level one reads "permissions:
    // {}" on one line and does not match).
    const perms = readMappingAfter(prWorkflow, 'permissions:');
    assert.deepEqual(perms, { contents: 'read' });
  });

  test('runs test:routine, then test:generated, without rebuilding again', () => {
    const commands = extractRunCommands(prWorkflow);
    const routineIndex = commands.indexOf('npm run test:routine');
    const generatedIndex = commands.indexOf('npm run test:generated');
    assert.notEqual(routineIndex, -1, 'expected an `npm run test:routine` step');
    assert.notEqual(generatedIndex, -1, 'expected an `npm run test:generated` step');
    assert.ok(routineIndex < generatedIndex, 'test:generated must run after test:routine');
    // No separate "npm run build" between them -- test:routine's own build
    // phase is the only build this job performs.
    assert.ok(!commands.slice(routineIndex + 1, generatedIndex).some((c) => c === 'npm run build'));
  });

  test('never runs the full npm test gate', () => {
    const commands = extractRunCommands(prWorkflow);
    assert.ok(!commands.some(isBareNpmTestInvocation),
      'the PR workflow must use test:routine, never the full release gate');
  });

  test('never installs or runs a deployment/Pages action', () => {
    const refs = extractUsesRefs(prWorkflow);
    for (const forbidden of ['actions/deploy-pages', 'actions/configure-pages', 'actions/upload-pages-artifact']) {
      assert.ok(!refs.some((r) => r.startsWith(forbidden + '@')), `must not use ${forbidden}`);
    }
  });

  test('installs all three browser engines the routine configuration uses', () => {
    const commands = extractRunCommands(prWorkflow);
    const installCmd = commands.find((c) => c.includes('playwright install'));
    assert.ok(installCmd, 'expected a `playwright install` step');
    for (const engine of ['chromium', 'firefox', 'webkit']) {
      assert.ok(installCmd.includes(engine), `browser install command must include ${engine}`);
    }
  });

  test('declares an explicit, bounded job timeout', () => {
    const m = prWorkflow.match(/^\s*timeout-minutes:\s*(\d+)\s*$/m);
    assert.ok(m, 'expected an explicit timeout-minutes');
    const minutes = Number(m[1]);
    // Headroom over the measured ~20.5-minute local test:routine run plus
    // install time, but not an unbounded/excessive budget.
    assert.ok(minutes >= 30 && minutes <= 60, `timeout-minutes (${minutes}) should be a bounded, justified value`);
  });

  test('uses .nvmrc for the Node version, matching deploy-pages.yml', () => {
    assert.ok(prWorkflow.includes('node-version-file: .nvmrc'));
  });

  test('uses npm ci and audits dependencies at a high threshold', () => {
    const commands = extractRunCommands(prWorkflow);
    assert.ok(commands.includes('npm ci'));
    assert.ok(commands.includes('npm audit --audit-level=high'));
  });

  test('concurrency cancels superseded runs of the same PR, using a safe (non-secret) expression', () => {
    const group = readMappingAfter(prWorkflow, 'concurrency:');
    assert.ok(group.group, 'expected a concurrency.group');
    assert.ok(!group.group.includes('secrets.'), 'concurrency group must never reference a secret');
    assert.equal(group['cancel-in-progress'], 'true');
  });
});

// --------------------------------------------------------------------------
// Deployment workflow (.github/workflows/deploy-pages.yml)
// --------------------------------------------------------------------------

describe('Deployment workflow (deploy-pages.yml)', () => {
  test('still runs the full npm test gate', () => {
    const commands = extractRunCommands(deployWorkflow);
    assert.ok(commands.some(isBareNpmTestInvocation), 'expected an `npm test` step');
  });

  test('runs test:generated after npm test, without rebuilding again', () => {
    const commands = extractRunCommands(deployWorkflow);
    const testIndex = commands.findIndex(isBareNpmTestInvocation);
    const generatedIndex = commands.indexOf('npm run test:generated');
    assert.notEqual(generatedIndex, -1, 'expected an `npm run test:generated` step');
    assert.ok(testIndex < generatedIndex, 'test:generated must run after npm test');
    assert.ok(!commands.slice(testIndex + 1, generatedIndex).some((c) => c === 'npm run build'));
  });

  test('does not substitute test:routine for the full gate', () => {
    const commands = extractRunCommands(deployWorkflow);
    assert.ok(!commands.includes('npm run test:routine'),
      'the deployment gate must keep running the full matrix, not the routine selection');
  });

  test('still deploys to GitHub Pages', () => {
    const refs = extractUsesRefs(deployWorkflow);
    assert.ok(refs.some((r) => r.startsWith('actions/deploy-pages@')));
    assert.ok(refs.some((r) => r.startsWith('actions/configure-pages@')));
    assert.ok(refs.some((r) => r.startsWith('actions/upload-pages-artifact@')));
  });

  test('every third-party action remains pinned to a 40-character commit SHA', () => {
    const refs = extractUsesRefs(deployWorkflow);
    for (const ref of refs) {
      assert.match(ref, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
    }
  });

  test('push-to-main and workflow_dispatch triggers are unchanged', () => {
    assert.match(deployWorkflow, /^\s*branches:\s*\[main\]\s*$/m);
    assert.match(deployWorkflow, /^\s*workflow_dispatch:\s*$/m);
  });
});

// --------------------------------------------------------------------------
// package.json scripts (loaded and inspected, not blindly string-duplicated)
// --------------------------------------------------------------------------

describe('package.json scripts (Stage 5B2)', () => {
  test('test:generated runs the checker directly, without rebuilding', () => {
    const cmd = packageJson.scripts['test:generated'];
    assert.ok(cmd, 'expected a test:generated script');
    assert.ok(cmd.includes('scripts/check-generated.js'));
    assert.ok(!cmd.includes('npm run build'), 'test:generated must not rebuild');
  });

  test('check:generated builds once, then runs test:generated', () => {
    const cmd = packageJson.scripts['check:generated'];
    assert.ok(cmd, 'expected a check:generated script');
    const buildIndex = cmd.indexOf('npm run build');
    const checkIndex = cmd.indexOf('npm run test:generated');
    assert.ok(buildIndex !== -1 && checkIndex !== -1 && buildIndex < checkIndex);
  });

  test('test:unit includes the new Stage 5B1/5B2 test files', () => {
    const tokens = packageJson.scripts['test:unit'].split(/\s+/);
    assert.ok(tokens.includes('tests/unit/version-label.test.js'));
    assert.ok(tokens.includes('tests/unit/check-generated.test.js'));
  });

  test('test:routine and test:routine:list are unchanged in shape', () => {
    assert.equal(packageJson.scripts['test:routine'], 'node scripts/run-routine-tests.js');
    assert.ok(packageJson.scripts['test:routine:list'].includes('playwright.routine.config.js'));
  });

  test('the release branch carries the intended beta.2 version', () => {
    assert.equal(packageJson.version, '0.3.0-beta.2');
  });
});
