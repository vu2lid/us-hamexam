'use strict';
// Stage 8E3 review fix: run-bitnet.sh's extract_first_json had a dead first
// pass in its Node fallback (parsed every "{" position, discarded the
// result either way, per its own "fall through to decoder approach below"
// comment) before the real brace-depth scanner ran unconditionally
// afterward. This extracts the REAL shipped Node one-liner straight out of
// the script file (never a hand-copied duplicate that could silently drift
// from what actually runs) and exercises it directly against every model
// output shape it has to handle, independent of whether python3 happens to
// be preferred in a given environment. A separate end-to-end pass runs the
// same cases through the full wrapper, exercising whichever of python3/node
// is actually selected there.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const REPO = path.resolve(__dirname, '../..');
const SCRIPT_PATH = path.join(REPO, 'tools', 'india-review', 'run-bitnet.sh');
const SCRIPT_SRC = fs.readFileSync(SCRIPT_PATH, 'utf8');

const NODE_SNIPPET = (() => {
  const m = SCRIPT_SRC.match(/elif command -v node[\s\S]*?node -e '([\s\S]*?)'\s*"\$1"/);
  assert.ok(m, 'could not find the Node fallback one-liner in run-bitnet.sh -- update this extraction regex if the script changed');
  return m[1];
})();

test('the extracted Node snippet no longer contains the dead discard-the-result loop', () => {
  assert.doesNotMatch(NODE_SNIPPET, /fall through to decoder approach below/);
  assert.match(NODE_SNIPPET, /tracking brace depth and string/i);
});

function runNodeExtractor(rawOutput) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'extract-node-'));
  const outFile = path.join(dir, 'out.txt');
  fs.writeFileSync(outFile, rawOutput);
  return cp.spawnSync(process.execPath, ['-e', NODE_SNIPPET, outFile], {encoding: 'utf8'});
}

const record = (id) => ({
  id, syllabusRelevant: true, indianTopic: 'electronics', recommendation: 'keep',
  jurisdictionRisk: 'none', figureRightsWarning: 'none', rationale: 'stub',
});

test('Node extractor: a clean, unadorned JSON object', () => {
  const r = runNodeExtractor(JSON.stringify(record('T9A01')));
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout.trim()), record('T9A01'));
});

test('Node extractor: JSON wrapped in a markdown code fence', () => {
  const raw = '```json\n' + JSON.stringify(record('T9A01')) + '\n```';
  const r = runNodeExtractor(raw);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout.trim()), record('T9A01'));
});

test('Node extractor: JSON with surrounding model prose', () => {
  const raw = 'Sure, here is my answer:\n' + JSON.stringify(record('T9A01')) + '\nLet me know if you need anything else!';
  const r = runNodeExtractor(raw);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout.trim()), record('T9A01'));
});

test('Node extractor: truncated/malformed JSON fails cleanly (exit 1, no stdout)', () => {
  const r = runNodeExtractor('{"id":"T9A01","syllabusRelevant":tr');
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
});

test('Node extractor: two JSON objects in the output -- the first one wins', () => {
  const first = record('T9A01');
  const second = {note: 'a second, unrelated object that must be ignored'};
  const raw = JSON.stringify(first) + '\n' + JSON.stringify(second);
  const r = runNodeExtractor(raw);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout.trim()), first);
});

test('Node extractor: a brace inside a quoted string does not miscount depth', () => {
  const rec = record('T9A01');
  rec.rationale = 'contains a literal { and } inside this string';
  const r = runNodeExtractor(JSON.stringify(rec));
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout.trim()), rec);
});

// --- End-to-end through the full wrapper (whichever interpreter it picks) ---

function mkCandidate(id) {
  return {id, poolKey: 'technician', sub: 'T9A', question: 'q', choices: {A: 'a', B: 'b', C: 'c', D: 'd'}, correct: 'A', correctText: 'a', ref: '', figure: false, source: {editionId: 'e', revisionId: 'r', element: 2, displayName: 'd'}};
}
function stubPrinting(dir, rawOutput) {
  const f = path.join(dir, 'stub.sh');
  fs.writeFileSync(f, `#!/usr/bin/env bash\ncat <<'RAWEOF'\n${rawOutput}\nRAWEOF\n`);
  fs.chmodSync(f, 0o755);
  return f;
}
function runWrapper(cliScript, input) {
  const dir = path.dirname(cliScript);
  return cp.spawnSync(SCRIPT_PATH, {
    input,
    encoding: 'utf8',
    env: Object.assign({}, process.env, {BITNET_CLI: cliScript, BITNET_MODEL: path.join(dir, 'stub.gguf')}),
  });
}
const INPUT = JSON.stringify(mkCandidate('T9A01')) + '\n';

test('wrapper end-to-end: clean JSON, fenced JSON, prose-wrapped JSON, and multi-object output all extract correctly', () => {
  const cases = [
    JSON.stringify(record('T9A01')),
    '```json\n' + JSON.stringify(record('T9A01')) + '\n```',
    'Here you go:\n' + JSON.stringify(record('T9A01')) + '\nHope that helps.',
    JSON.stringify(record('T9A01')) + '\n' + JSON.stringify({note: 'ignored'}),
  ];
  for (const raw of cases) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrapper-extract-'));
    const r = runWrapper(stubPrinting(dir, raw), INPUT);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout.trim()), record('T9A01'));
  }
});

test('wrapper end-to-end: truncated/malformed JSON is a clean per-record failure, not a crash', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrapper-extract-bad-'));
  const r = runWrapper(stubPrinting(dir, '{"id":"T9A01","syllabusRelevant":tr'), INPUT);
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /no valid JSON object found/);
});
