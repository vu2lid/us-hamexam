'use strict';

// Stage 5B2: unit tests for scripts/check-generated.js -- the dependency-free
// generated-artifact freshness checker.
//
// Every fixture is an isolated temporary Git repository created under the OS
// temp directory (never inside this project's own working tree), so no test
// reads, mutates, stages, commits, or resets anything in the real repository.
// Negative "git could not run" cases use an injected fake spawnFn instead of
// a real failing git invocation, per the project's existing pattern of
// isolating fixtures from the real repo.

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const checkGenerated = require('../../scripts/check-generated');

const CHECK_GENERATED_SCRIPT = path.join(__dirname, '../../scripts/check-generated.js');

const scratch = [];
after(() => {
  for (const dir of scratch) fs.rmSync(dir, { recursive: true, force: true });
});

// --------------------------------------------------------------------------
// fixture repo helpers
// --------------------------------------------------------------------------

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', shell: false });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

// A fresh, initialized, isolated repo with a committed `dist/` tree
// containing two files. `dirNamePrefix` lets a test force a directory name
// containing a space.
function makeRepo(dirNamePrefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), dirNamePrefix || 'hamexam-checkgen-'));
  scratch.push(dir);
  git(dir, ['init', '--quiet']);
  git(dir, ['config', 'user.email', 'test@example.invalid']);
  git(dir, ['config', 'user.name', 'Test']);
  fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'dist', 'index.html'), '<html>original</html>\n');
  fs.writeFileSync(path.join(dir, 'dist', 'sw.js'), '// original\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '--quiet', '-m', 'initial dist']);
  return dir;
}

function statusOf(dir) {
  return git(dir, ['status', '--porcelain=v1', '--untracked-files=all']);
}

// --------------------------------------------------------------------------
// parsePorcelainStatus / describeStatusCode (pure)
// --------------------------------------------------------------------------

describe('describeStatusCode', () => {
  test('decodes untracked and ignored', () => {
    assert.equal(checkGenerated.describeStatusCode('??'), 'untracked');
    assert.equal(checkGenerated.describeStatusCode('!!'), 'ignored');
  });

  test('decodes staged and unstaged letters, including combinations', () => {
    assert.equal(checkGenerated.describeStatusCode(' M'), 'unstaged modified');
    assert.equal(checkGenerated.describeStatusCode('M '), 'staged modified');
    assert.equal(checkGenerated.describeStatusCode('MM'), 'staged modified, unstaged modified');
    assert.equal(checkGenerated.describeStatusCode(' D'), 'unstaged deleted');
    assert.equal(checkGenerated.describeStatusCode('R '), 'staged renamed');
  });
});

describe('parsePorcelainStatus', () => {
  test('parses and sorts entries by path regardless of input order', () => {
    const entries = checkGenerated.parsePorcelainStatus('?? dist/z.txt\n M dist/a.txt\n');
    assert.deepEqual(entries.map((e) => e.path), ['dist/a.txt', 'dist/z.txt']);
    assert.equal(entries[0].code, ' M');
    assert.equal(entries[1].code, '??');
  });

  test('preserves a rename line\'s "old -> new" text as one opaque path', () => {
    const entries = checkGenerated.parsePorcelainStatus('R  dist/old.html -> dist/new.html\n');
    assert.equal(entries.length, 1);
    assert.equal(entries[0].path, 'dist/old.html -> dist/new.html');
    assert.equal(entries[0].description, 'staged renamed');
  });

  test('empty output parses to an empty array', () => {
    assert.deepEqual(checkGenerated.parsePorcelainStatus(''), []);
    assert.deepEqual(checkGenerated.parsePorcelainStatus('\n'), []);
  });
});

// --------------------------------------------------------------------------
// checkGenerated() against real isolated Git repositories
// --------------------------------------------------------------------------

describe('checkGenerated — real Git repositories', () => {
  test('a clean tracked dist/ is reported clean', () => {
    const dir = makeRepo();
    const before = statusOf(dir);
    const result = checkGenerated.checkGenerated({ cwd: dir });
    assert.equal(result.ok, true);
    assert.equal(result.kind, 'clean');
    assert.deepEqual(result.entries, []);
    assert.equal(statusOf(dir), before, 'checking must not mutate repository state');
  });

  test('a modified tracked file is reported stale', () => {
    const dir = makeRepo();
    fs.writeFileSync(path.join(dir, 'dist', 'index.html'), '<html>changed</html>\n');
    const result = checkGenerated.checkGenerated({ cwd: dir });
    assert.equal(result.ok, false);
    assert.equal(result.kind, 'stale');
    assert.deepEqual(result.entries.map((e) => e.path), ['dist/index.html']);
    assert.equal(result.entries[0].description, 'unstaged modified');
  });

  test('a deleted tracked file is reported stale', () => {
    const dir = makeRepo();
    fs.rmSync(path.join(dir, 'dist', 'sw.js'));
    const result = checkGenerated.checkGenerated({ cwd: dir });
    assert.equal(result.ok, false);
    assert.deepEqual(result.entries.map((e) => e.path), ['dist/sw.js']);
    assert.equal(result.entries[0].description, 'unstaged deleted');
  });

  test('an untracked file under dist/ is reported stale', () => {
    const dir = makeRepo();
    fs.writeFileSync(path.join(dir, 'dist', 'unexpected.txt'), 'surprise\n');
    const result = checkGenerated.checkGenerated({ cwd: dir });
    assert.equal(result.ok, false);
    assert.deepEqual(result.entries.map((e) => e.path), ['dist/unexpected.txt']);
    assert.equal(result.entries[0].description, 'untracked');
  });

  // Review fix: a file matching a gitignore pattern (this repo ignores
  // .DS_Store) is neither tracked nor plain-untracked -- `git status` omits
  // it entirely unless asked for with --ignored=matching. Without that flag
  // a stray dist/.DS_Store would silently read as "clean", despite being
  // exactly the kind of unexpected extra generated file this checker exists
  // to catch.
  test('a gitignored file under dist/ (e.g. .DS_Store) is reported stale, not silently clean', () => {
    const dir = makeRepo();
    fs.writeFileSync(path.join(dir, '.gitignore'), '.DS_Store\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '--quiet', '-m', 'add gitignore']);
    fs.writeFileSync(path.join(dir, 'dist', '.DS_Store'), 'binary junk\n');
    const result = checkGenerated.checkGenerated({ cwd: dir });
    assert.equal(result.ok, false);
    assert.equal(result.kind, 'stale');
    assert.deepEqual(result.entries.map((e) => e.path), ['dist/.DS_Store']);
    assert.equal(result.entries[0].code, '!!');
    assert.equal(result.entries[0].description, 'ignored');
  });

  test('a staged rename is reported stale and its "old -> new" text is preserved', () => {
    const dir = makeRepo();
    fs.renameSync(path.join(dir, 'dist', 'index.html'), path.join(dir, 'dist', 'renamed.html'));
    git(dir, ['add', '-A']); // stage the move so Git detects it as a rename
    const result = checkGenerated.checkGenerated({ cwd: dir });
    assert.equal(result.ok, false);
    assert.equal(result.entries.length, 1);
    assert.ok(result.entries[0].path.includes('dist/index.html'));
    assert.ok(result.entries[0].path.includes('dist/renamed.html'));
    assert.ok(result.entries[0].description.includes('renamed'));
  });

  test('a deleted-then-replaced file (unstaged) reports both changes distinctly', () => {
    const dir = makeRepo();
    fs.rmSync(path.join(dir, 'dist', 'index.html'));
    fs.writeFileSync(path.join(dir, 'dist', 'replacement.html'), 'new content\n');
    const result = checkGenerated.checkGenerated({ cwd: dir });
    assert.equal(result.ok, false);
    assert.deepEqual(result.entries.map((e) => e.path), ['dist/index.html', 'dist/replacement.html']);
    assert.deepEqual(result.entries.map((e) => e.description), ['unstaged deleted', 'untracked']);
  });

  test('multiple simultaneous changes produce deterministic, path-sorted output', () => {
    const dir = makeRepo();
    fs.writeFileSync(path.join(dir, 'dist', 'sw.js'), '// changed\n');
    fs.writeFileSync(path.join(dir, 'dist', 'aaa-first.txt'), 'x\n');
    fs.writeFileSync(path.join(dir, 'dist', 'zzz-last.txt'), 'x\n');
    const run = () => checkGenerated.checkGenerated({ cwd: dir });
    const first = run();
    const second = run();
    assert.equal(first.entries.length, 3);
    assert.deepEqual(
      first.entries.map((e) => e.path),
      ['dist/aaa-first.txt', 'dist/sw.js', 'dist/zzz-last.txt'],
      'entries must be sorted by path'
    );
    assert.deepEqual(second.entries, first.entries, 'repeated checks of unchanged state must be deterministic');
  });

  test('works when the repository path itself contains a space', () => {
    const dir = makeRepo('hamexam check gen ');
    assert.ok(dir.includes(' '), 'fixture directory must actually contain a space');
    fs.writeFileSync(path.join(dir, 'dist', 'index.html'), 'changed\n');
    const result = checkGenerated.checkGenerated({ cwd: dir });
    assert.equal(result.ok, false);
    assert.deepEqual(result.entries.map((e) => e.path), ['dist/index.html']);
  });

  test('a non-repository directory is reported as a git-error, not "clean" or "stale"', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hamexam-checkgen-norepo-'));
    scratch.push(dir);
    fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'dist', 'index.html'), 'x\n');
    const result = checkGenerated.checkGenerated({ cwd: dir });
    assert.equal(result.ok, false);
    assert.equal(result.kind, 'git-error');
    assert.match(result.message, /not a git repository/i);
  });

  test('checking a stale repo performs no repository mutation', () => {
    const dir = makeRepo();
    fs.writeFileSync(path.join(dir, 'dist', 'index.html'), 'changed\n');
    fs.writeFileSync(path.join(dir, 'dist', 'new.txt'), 'x\n');
    const before = statusOf(dir);
    checkGenerated.checkGenerated({ cwd: dir });
    checkGenerated.checkGenerated({ cwd: dir }); // twice, to rule out a second-call side effect
    assert.equal(statusOf(dir), before, 'checking must never write/stage/reset/checkout anything');
  });
});

// --------------------------------------------------------------------------
// checkGenerated() with an injected spawnFn (git executable/command failure)
// --------------------------------------------------------------------------

describe('checkGenerated — injected Git failures', () => {
  test('a spawn error (e.g. git not found) is reported as git-error', () => {
    const spawnFn = () => ({ error: new Error('spawn git ENOENT'), status: null, signal: null, stdout: '', stderr: '' });
    const result = checkGenerated.checkGenerated({ cwd: '/irrelevant', spawnFn });
    assert.equal(result.ok, false);
    assert.equal(result.kind, 'git-error');
    assert.match(result.message, /ENOENT/);
  });

  test('git terminated by a signal is reported as git-error', () => {
    const spawnFn = () => ({ error: null, status: null, signal: 'SIGKILL', stdout: '', stderr: '' });
    const result = checkGenerated.checkGenerated({ cwd: '/irrelevant', spawnFn });
    assert.equal(result.kind, 'git-error');
    assert.match(result.message, /SIGKILL/);
  });

  test('a nonzero git exit status is reported as git-error with stderr included', () => {
    const spawnFn = () => ({ error: null, status: 128, signal: null, stdout: '', stderr: 'fatal: bad revision\n' });
    const result = checkGenerated.checkGenerated({ cwd: '/irrelevant', spawnFn });
    assert.equal(result.kind, 'git-error');
    assert.match(result.message, /128/);
    assert.match(result.message, /bad revision/);
  });

  test('the git invocation itself uses an argument array with shell disabled', () => {
    let captured = null;
    const spawnFn = (cmd, args, opts) => {
      captured = { cmd, args, opts };
      return { error: null, status: 0, signal: null, stdout: '', stderr: '' };
    };
    checkGenerated.checkGenerated({ cwd: '/some/repo', spawnFn, gitPath: 'git', distDir: 'dist' });
    assert.equal(captured.cmd, 'git');
    assert.deepEqual(captured.args,
      ['status', '--porcelain=v1', '--untracked-files=all', '--ignored=matching', '--', 'dist']);
    assert.equal(captured.opts.shell, false);
    assert.equal(captured.opts.cwd, '/some/repo');
  });
});

// --------------------------------------------------------------------------
// CLI entry point (real subprocess, matching the project's build-gate.test.js
// pattern of driving the real script rather than only its exported function)
// --------------------------------------------------------------------------

function runCli(cwd) {
  return spawnSync(process.execPath, [CHECK_GENERATED_SCRIPT], { cwd, encoding: 'utf8', shell: false });
}

describe('CLI (require.main === module)', () => {
  test('exits 0 and prints a confirmation when clean', () => {
    const dir = makeRepo();
    const r = runCli(dir);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /up to date/i);
  });

  test('exits 1 and lists each stale entry when stale', () => {
    const dir = makeRepo();
    fs.writeFileSync(path.join(dir, 'dist', 'index.html'), 'changed\n');
    fs.writeFileSync(path.join(dir, 'dist', 'extra.txt'), 'x\n');
    const r = runCli(dir);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /STALE/);
    assert.match(r.stdout, /dist\/index\.html/);
    assert.match(r.stdout, /dist\/extra\.txt/);
    assert.match(r.stdout, /npm run build/);
  });

  test('exits 2 and reports the failure distinctly when Git cannot run (non-repository directory)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hamexam-checkgen-cli-norepo-'));
    scratch.push(dir);
    fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
    const r = runCli(dir);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /could not/i);
  });
});
