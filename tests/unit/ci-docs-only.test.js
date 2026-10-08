'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { isDocsOnly, classify } = require('../../scripts/ci-docs-only');
const base = 'a'.repeat(40), head = 'b'.repeat(40);
function fixture(paths = ['docs/PLAN.md']) {
  return {
    eventName: 'push', head,
    api: async route => route.includes('/jobs?')
      ? { jobs: [{ name: 'deploy', conclusion: 'success' }] }
      : { workflow_runs: [{ id: 1, head_sha: base }] },
    git: args => args.includes('--name-only') ? paths.join('\0') + '\0' : ''
  };
}

test('only explicit root documentation and docs Markdown qualify', () => {
  assert.equal(isDocsOnly(['README.md', 'AGENTS.md', 'AUTHORS.md', 'SECURITY.md', 'docs/nested/plan.md']), true);
  for (const p of ['src/app.js', 'data/pools.json', 'dist/index.html', '.github/workflows/deploy-pages.yml',
    'tests/README.md', 'scripts/README.md', 'docs/fixture.json', 'docs/image.png', 'package.json', '.nvmrc', 'unknown.md']) {
    assert.equal(isDocsOnly(['docs/PLAN.md', p]), false, p);
  }
  assert.equal(isDocsOnly([]), false);
});
test('docs-only comparison uses deployed baseline and checks whitespace', async () => {
  const f = fixture(), calls = [], original = f.git;
  f.git = args => { calls.push(args); return original(args); };
  assert.equal((await classify(f)).full, false);
  assert.deepEqual(calls[0], ['merge-base', '--is-ancestor', base, head]);
  assert.deepEqual(calls[1], ['diff', '--no-renames', '--name-only', '-z', base, head]);
  assert.deepEqual(calls[2], ['diff', '--check', base, head]);
});
test('manual invocation always runs full gate without baseline lookup', async () => {
  const f = fixture(); f.eventName = 'workflow_dispatch';
  f.api = () => { throw new Error('must not call'); };
  assert.equal((await classify(f)).full, true);
});
test('successful docs workflows are skipped when locating the deployed baseline', async () => {
  const f = fixture(['docs/PLAN.md', 'src/app.js']);
  f.api = async route => route.includes('/runs?')
    ? { workflow_runs: [{ id: 2, head_sha: head }, { id: 1, head_sha: base }] }
    : { jobs: [{ name: 'deploy', conclusion: route.includes('/2/') ? 'skipped' : 'success' }] };
  assert.equal((await classify(f)).full, true);
});
test('unknown baseline, API errors, invalid SHAs and failed ancestry require full gate', async () => {
  for (const override of [
    { api: async () => ({ workflow_runs: [] }) },
    { api: async () => { throw new Error('unavailable'); } },
    { head: 'bad' },
    { git: () => { throw new Error('missing commit or divergent history'); } }
  ]) assert.equal((await classify({ ...fixture(), ...override })).full, true);
});
test('empty changes and docs whitespace failures cannot skip full verification', async () => {
  assert.equal((await classify(fixture([]))).full, true);
  const f = fixture(), original = f.git;
  f.git = args => { if (args.includes('--check')) throw new Error('whitespace'); return original(args); };
  assert.equal((await classify(f)).full, true);
});
test('real Git diff detects source renamed into docs and more than 300 changed paths', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-docs-policy-'));
  const git = args => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  const commit = message => {
    git(['add', '.']);
    git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', message]);
    return git(['rev-parse', 'HEAD']).trim();
  };
  try {
    git(['init', '-q']); fs.mkdirSync(path.join(dir, 'src')); fs.mkdirSync(path.join(dir, 'docs'));
    fs.writeFileSync(path.join(dir, 'src/app.js'), 'original\n');
    const original = commit('baseline');
    fs.renameSync(path.join(dir, 'src/app.js'), path.join(dir, 'docs/moved.md'));
    for (let i = 0; i < 301; i++) fs.writeFileSync(path.join(dir, 'docs/' + i + '.md'), 'doc\n');
    const current = commit('mixed');
    const f = fixture(); f.head = current; f.git = git;
    f.api = async route => route.includes('/jobs?')
      ? { jobs: [{ name: 'deploy', conclusion: 'success' }] }
      : { workflow_runs: [{ id: 1, head_sha: original }] };
    assert.equal((await classify(f)).full, true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
