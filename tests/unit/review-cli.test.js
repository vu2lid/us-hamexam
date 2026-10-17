'use strict';
// Stage 8E3 review-finding fixes: the pilot subcommand's two adapter paths.
// 1) command adapter: a returned record whose id doesn't match the
//    candidate it was requested for must become that candidate's own
//    failure, never abort the whole pilot.
// 2) fixture adapter: the model-output JSONL file now goes through the
//    same strict validateModelRecord every other path uses, and duplicate
//    or unusable ids in that file fail the whole pilot explicitly instead
//    of a plain Map silently keeping the last of two duplicate-id lines.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const REPO = path.resolve(__dirname, '../..');
const CLI = path.join(REPO, 'scripts', 'review-cli.js');

function mkCandidate(id, question = 'What is a beam antenna?') {
  return {
    id, poolKey: 'technician', sub: 'T9A', question,
    choices: {A: 'a', B: 'b', C: 'c', D: 'd'}, correct: 'A', correctText: 'a', ref: '',
    figure: false, source: {editionId: 't-1', revisionId: 'r-1', element: 2, displayName: 'Technician'},
  };
}
const model = (id, over = {}) => Object.assign({
  id, syllabusRelevant: true, indianTopic: 'electronics', recommendation: 'keep',
  jurisdictionRisk: 'none', figureRightsWarning: 'none', rationale: 'stub',
}, over);

function writeCandidates(dir, candidates) {
  const f = path.join(dir, 'candidates.jsonl');
  fs.writeFileSync(f, candidates.map(JSON.stringify).join('\n') + '\n');
  return f;
}

function runPilot(args) {
  return cp.spawnSync(process.execPath, [CLI, 'pilot', ...args], {encoding: 'utf8'});
}

// A command adapter that, for one specific candidate id, deliberately
// answers with a DIFFERENT id -- simulating a buggy or non-standard
// --command adapter (anything other than the bundled run-bitnet.sh, which
// happens to self-check ids before this fix existed at all).
function wrongIdAdapter(dir, targetId, wrongId) {
  const f = path.join(dir, 'wrong-id-adapter.sh');
  fs.writeFileSync(f, `#!/usr/bin/env bash
set -euo pipefail
input="$(cat)"
id="$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).id))')"
out_id="$id"
if [ "$id" = "${targetId}" ]; then out_id="${wrongId}"; fi
node -e "console.log(JSON.stringify({id:process.argv[1],syllabusRelevant:true,indianTopic:'electronics',recommendation:'keep',jurisdictionRisk:'none',figureRightsWarning:'none',rationale:'stub'}))" "$out_id"
`);
  fs.chmodSync(f, 0o755);
  return f;
}

test('pilot --adapter command: an id-mismatched record becomes that candidate\'s failure, not an abort', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-cmd-'));
  const candidatesFile = writeCandidates(dir, [mkCandidate('T9A01'), mkCandidate('T9A02')]);
  const adapter = wrongIdAdapter(dir, 'T9A01', 'WRONG-ID');
  const out = path.join(dir, 'report.json');
  const r = runPilot(['--candidates', candidatesFile, '--sample', '2', '--adapter', 'command', '--command', adapter, '--out', out]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(out), 'report.json must still be written for a partial failure');
  const report = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(report.counts.sampled, 2);
  assert.equal(report.counts.succeeded, 1);
  assert.equal(report.counts.failed, 1);
  assert.equal(report.failures.length, 1);
  assert.equal(report.failures[0].id, 'T9A01');
  assert.match(report.failures[0].error, /id mismatch/);
  assert.match(report.failures[0].error, /T9A01/);
  assert.match(report.failures[0].error, /WRONG-ID/);
  // The other candidate's own, correctly-id'd record still made it through.
  assert.equal(report.manifest.items.length, 1);
  assert.equal(report.manifest.items[0].candidate.id, 'T9A02');
});

test('pilot --adapter fixture: duplicate ids in the model-output file fail the whole pilot explicitly', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-dup-'));
  const candidatesFile = writeCandidates(dir, [mkCandidate('T9A01'), mkCandidate('T9A02')]);
  const modelOutput = path.join(dir, 'model.jsonl');
  // Two lines, same id -- a copy/paste mistake while hand-authoring a fixture.
  fs.writeFileSync(modelOutput, [model('T9A01'), model('T9A01', {rationale: 'second copy'})].map(JSON.stringify).join('\n') + '\n');
  const out = path.join(dir, 'report.json');
  const r = runPilot(['--candidates', candidatesFile, '--sample', '2', '--adapter', 'fixture', '--model-output', modelOutput, '--out', out]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /duplicate model output id: T9A01/);
  assert.ok(!fs.existsSync(out), 'nothing should be written when the fixture file itself is corrupt');
});

test('pilot --adapter fixture: a record missing a usable id fails the whole pilot explicitly', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-noid-'));
  const candidatesFile = writeCandidates(dir, [mkCandidate('T9A01')]);
  const modelOutput = path.join(dir, 'model.jsonl');
  fs.writeFileSync(modelOutput, JSON.stringify({syllabusRelevant: true, recommendation: 'keep'}) + '\n');
  const out = path.join(dir, 'report.json');
  const r = runPilot(['--candidates', candidatesFile, '--sample', '1', '--adapter', 'fixture', '--model-output', modelOutput, '--out', out]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /missing a usable string id/);
  assert.ok(!fs.existsSync(out));
});

test('pilot --adapter fixture: a malformed record is that candidate\'s own failure, not an abort', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-malformed-'));
  const candidatesFile = writeCandidates(dir, [mkCandidate('T9A01'), mkCandidate('T9A02')]);
  const modelOutput = path.join(dir, 'model.jsonl');
  // T9A01's record fails strict validation (bad enum); T9A02's is fine.
  fs.writeFileSync(modelOutput, [model('T9A01', {recommendation: 'maybe'}), model('T9A02')].map(JSON.stringify).join('\n') + '\n');
  const out = path.join(dir, 'report.json');
  const r = runPilot(['--candidates', candidatesFile, '--sample', '2', '--adapter', 'fixture', '--model-output', modelOutput, '--out', out]);
  assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(report.counts.succeeded, 1);
  assert.equal(report.counts.failed, 1);
  assert.equal(report.failures[0].id, 'T9A01');
  assert.match(report.failures[0].error, /recommendation/);
  assert.equal(report.manifest.items.length, 1);
  assert.equal(report.manifest.items[0].candidate.id, 'T9A02');
});

test('pilot --adapter fixture: a reusable model-output file larger than the sample is unaffected', () => {
  // Confirms the stricter lookup did not turn "the fixture file covers more
  // candidates than this particular --sample" into an error -- that is a
  // normal, useful pattern (one big fixture file reused at different
  // --sample sizes), not an "unexpected id".
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-extra-'));
  const candidatesFile = writeCandidates(dir, [mkCandidate('T9A01'), mkCandidate('T9A02'), mkCandidate('T9A03')]);
  const modelOutput = path.join(dir, 'model.jsonl');
  fs.writeFileSync(modelOutput, [model('T9A01'), model('T9A02'), model('T9A03')].map(JSON.stringify).join('\n') + '\n');
  const out = path.join(dir, 'report.json');
  const r = runPilot(['--candidates', candidatesFile, '--sample', '2', '--adapter', 'fixture', '--model-output', modelOutput, '--out', out]);
  assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(report.counts.sampled, 2);
  assert.equal(report.counts.succeeded, 2);
  assert.equal(report.counts.failed, 0);
});
