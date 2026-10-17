'use strict';
// Stage 8E3 Part B: the deterministic jurisdiction guard, tested on its
// own (no model, no manifest) and then through createManifest() to prove
// a flagged candidate's forced reject/high survives even when the model
// record it is layered over says "keep"/"none" -- the exact failure mode
// observed in the 2026-10-14 Qwen pilot.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {evaluateGuard, RULES} = require('../../scripts/jurisdiction-guard.js');
const p = require('../../scripts/review-pipeline.js');

function candidate(question, correctText, over = {}) {
  return Object.assign({
    id: 'X1', poolKey: 'technician', sub: 'T2', question,
    choices: {A: correctText, B: 'b', C: 'c', D: 'd'},
    correct: 'A', correctText, ref: '',
    figure: false, source: {editionId: 'e', revisionId: 'r', element: 2, displayName: 'd'},
  }, over);
}
const keepRecord = (id, over = {}) => Object.assign({
  id, syllabusRelevant: true, indianTopic: 'electronics', recommendation: 'keep',
  jurisdictionRisk: 'none', figureRightsWarning: 'none', rationale: 'model says this is fine',
}, over);

test('RULES is a non-empty, independently-addressable list', () => {
  assert.ok(Array.isArray(RULES) && RULES.length >= 6);
  const ids = RULES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, 'rule ids must be unique');
});

test('each of the six named categories flags a representative candidate', () => {
  const cases = [
    ['Part 97 references', candidate('What does FCC Part 97 say about station identification?', 'It requires a call sign.'), 'fcc-part-97'],
    ['RACES / civil defense', candidate('What is RACES?', 'A civil defense radio service.'), 'races-civil-defense'],
    ['US band-plan restrictions', candidate('What is the band plan restriction for US stations in the 48 contiguous states?', 'No contacts within the 48 contiguous states.'), 'band-plan-us'],
    ['US call-sign/licensing rules', candidate('What must a US-licensed operator do when identifying?', 'Give the call sign in English.'), 'callsign-licensing-us'],
    ['US RF-exposure requirements', candidate('What stations are subject to the FCC rules on RF exposure?', 'All stations above the threshold.'), 'rf-exposure-us'],
    ['explicit United States framing', candidate('In the United States, what color is the hot wire?', 'Black.'), 'us-self-declared'],
  ];
  for (const [label, c, expectedRule] of cases) {
    const g = evaluateGuard(c);
    assert.equal(g.flagged, true, label);
    assert.equal(g.rule, expectedRule, label);
    assert.equal(g.verdict, 'reject', label);
    assert.ok(g.reason && g.reason.length > 0, label + ': must carry a reason');
  }
});

test('a bare FCC mention is caught by the catch-all rule', () => {
  const g = evaluateGuard(candidate('Why does the FCC require a station log?', 'For accountability.'));
  assert.equal(g.flagged, true);
  assert.equal(g.rule, 'fcc-reference');
});

test('universal electronics/propagation candidates are not flagged', () => {
  const universal = [
    candidate('What is a beam antenna?', 'An antenna that concentrates signals in one direction.'),
    candidate('How does a higher sunspot number affect HF propagation?', 'It generally improves propagation at higher frequencies.'),
    candidate('What electrical component opposes the flow of current in a DC circuit?', 'A resistor.'),
  ];
  for (const c of universal) {
    assert.equal(evaluateGuard(c).flagged, false, c.question);
  }
});

test('a wrong-answer distractor mentioning the FCC does not flag the candidate', () => {
  // The real pool question this mirrors: T7C05, where only the WRONG
  // choice B ("To comply with FCC rules on spectral purity") names the
  // FCC; the question and the correct answer are pure electronics. The
  // guard must not punish a question for a decoy's content.
  const c = candidate(
    'Why do most solid-state transmitters reduce output power as SWR increases beyond a certain level?',
    'To protect the RF output amplifier transistors',
    {choices: {A: 'To protect the RF output amplifier transistors', B: 'To comply with FCC rules on spectral purity', C: 'c', D: 'd'}},
  );
  assert.equal(evaluateGuard(c).flagged, false);
});

test('evaluateGuard is deterministic and independent of any model fields', () => {
  const c = candidate('What is RACES?', 'A civil defense radio service.');
  const g1 = evaluateGuard(c);
  const g2 = evaluateGuard(JSON.parse(JSON.stringify(c)));
  assert.deepEqual(g2, g1);
  // Model opinion is not an input: attaching model-style fields must not
  // change the verdict, so no model output can talk the guard out of a flag.
  const withModelFields = {...c, recommendation: 'keep', jurisdictionRisk: 'none', rationale: 'model says fine'};
  assert.deepEqual(evaluateGuard(withModelFields), g1);
  const clean = candidate('What is a beam antenna?', 'An antenna that concentrates signals in one direction.');
  assert.deepEqual(evaluateGuard({...clean, recommendation: 'reject', jurisdictionRisk: 'high'}), evaluateGuard(clean));
});

test('createManifest forces reject/high even when the model record says keep/none', () => {
  const c = candidate('What is RACES?', 'A civil defense radio service.');
  const m = p.createManifest([c], [keepRecord('X1')]);
  const item = m.items[0];
  assert.equal(item.guard.flagged, true);
  assert.equal(item.guard.rule, 'races-civil-defense');
  assert.equal(item.model.recommendation, 'reject');
  assert.equal(item.model.jurisdictionRisk, 'high');
  // The original model rationale is preserved, not discarded, inside the
  // overriding rationale -- a human reviewer can still see what the model
  // thought even though the guard's verdict is what actually governs.
  assert.match(item.model.rationale, /model says this is fine/);
  assert.match(item.model.rationale, /races-civil-defense/);
});

test('createManifest leaves an unflagged item\'s model record untouched', () => {
  const c = candidate('What is a beam antenna?', 'An antenna that concentrates signals in one direction.');
  const m = p.createManifest([c], [keepRecord('X1')]);
  const item = m.items[0];
  assert.equal(item.guard.flagged, false);
  assert.deepEqual(item.model, keepRecord('X1'));
});

// --- Pre-invocation guard on the dispatch paths (Stage 8E3 follow-up) ---

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const REPO = path.resolve(__dirname, '../..');
const CLI = path.join(REPO, 'scripts', 'review-cli.js');

test('splitGuarded separates flagged candidates and guardRecord passes the validator', () => {
  const us = candidate('What is RACES?', 'A civil defense radio service.');
  const ok = candidate('What is a beam antenna?', 'An antenna that concentrates signals in one direction.');
  const {eligible, guarded} = p.splitGuarded([us, ok]);
  assert.equal(eligible.length, 1);
  assert.equal(guarded.length, 1);
  assert.equal(guarded[0].candidate.id, 'X1');
  assert.equal(guarded[0].guard.rule, 'races-civil-defense');
  const rec = p.guardRecord(guarded[0].candidate, guarded[0].guard);
  assert.doesNotThrow(() => p.validateModelRecord(rec, 'X1'));
  assert.equal(rec.recommendation, 'reject');
  assert.equal(rec.jurisdictionRisk, 'high');
  assert.match(rec.rationale, /races-civil-defense/);
  assert.match(rec.rationale, /adapter never saw this candidate/);
  assert.ok(rec.indianTopic.length > 0, 'validator requires non-empty indianTopic');
});

// Stub command adapter: records exactly the JSONL it received on stdin to
// $STUB_INPUT, then emits one valid v2 record per input line.
function stubAdapter(dir) {
  const f = path.join(dir, 'stub-adapter.sh');
  fs.writeFileSync(f, `#!/usr/bin/env bash
set -euo pipefail
input="$(cat)"
printf '%s' "$input" > "$STUB_INPUT"
while IFS= read -r line; do
  [ -z "$line" ] && continue
  printf '%s' "$line" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const c=JSON.parse(s);console.log(JSON.stringify({id:c.id,syllabusRelevant:true,indianTopic:"electronics",recommendation:"keep",jurisdictionRisk:"low",figureRightsWarning:"none",rationale:"stub"}))})'
done <<< "$input"
`);
  fs.chmodSync(f, 0o755);
  return f;
}

function guardedFixture(dir) {
  const us = candidate('What is RACES?', 'A civil defense radio service.', {id: 'X1'});
  const us2 = candidate('What does FCC Part 97 say about station identification?', 'It requires a call sign.', {id: 'X2'});
  const ok = candidate('What is a beam antenna?', 'An antenna that concentrates signals in one direction.', {id: 'X3'});
  const ok2 = candidate('How does a higher sunspot number affect HF propagation?', 'It generally improves propagation at higher frequencies.', {id: 'X4'});
  const candidates = [us, us2, ok, ok2];
  fs.writeFileSync(path.join(dir, 'candidates.jsonl'), candidates.map(JSON.stringify).join('\n') + '\n');
  return candidates;
}

test('pilot (fixture): guarded candidates never reach the adapter and carry the deterministic guard record', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-pilot-'));
  const candidates = guardedFixture(dir);
  // model.jsonl deliberately contains NO records for the guarded ids: if the
  // fixture adapter were ever handed them, it would push a 'no model record'
  // failure and the counts below would prove it.
  fs.writeFileSync(path.join(dir, 'model.jsonl'), candidates.slice(2).map(c => JSON.stringify(keepRecord(c.id))).join('\n') + '\n');
  const out = path.join(dir, 'report.json');
  const r = cp.spawnSync(process.execPath, [CLI, 'pilot', '--candidates', path.join(dir, 'candidates.jsonl'), '--sample', '4', '--adapter', 'fixture', '--model-output', path.join(dir, 'model.jsonl'), '--out', out], {encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(report.counts.guarded, 2);
  assert.equal(report.counts.succeeded, 2);
  assert.equal(report.counts.failed, 0);
  assert.equal(report.manifest.items.length, 4);
  for (const item of report.manifest.items) {
    if (item.candidate.id === 'X1' || item.candidate.id === 'X2') {
      assert.equal(item.model.recommendation, 'reject', item.candidate.id);
      assert.equal(item.model.jurisdictionRisk, 'high', item.candidate.id);
      assert.equal(item.model.syllabusRelevant, false, item.candidate.id);
      assert.match(item.model.rationale, /Deterministic/);
      assert.match(item.model.rationale, /no model involved/);
    } else {
      assert.equal(item.model.rationale, 'model says this is fine', item.candidate.id);
    }
  }
  assert.equal(report.manifest.metadata.guarded, 2);
});

test('triage (command adapter): adapter stdin contains none of the guarded ids', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-triage-'));
  guardedFixture(dir);
  const stub = stubAdapter(dir);
  const logFile = path.join(dir, 'stdin.jsonl');
  const manifest = path.join(dir, 'manifest.json');
  const env = Object.assign({}, process.env, {STUB_INPUT: logFile});
  const r = cp.spawnSync(process.execPath, [CLI, 'triage', '--candidates', path.join(dir, 'candidates.jsonl'), '--adapter', 'command', '--command', stub, '--manifest', manifest], {encoding: 'utf8', env});
  assert.equal(r.status, 0, r.stderr);
  const adapterSaw = fs.readFileSync(logFile, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const seenIds = adapterSaw.map(c => c.id);
  assert.deepEqual(seenIds.sort(), ['X3', 'X4'], 'adapter must only receive eligible candidates');
  const m = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  assert.equal(m.items.length, 4);
  assert.equal(m.metadata.guarded, 2);
  const guardedItem = m.items.find(i => i.candidate.id === 'X1');
  assert.equal(guardedItem.model.recommendation, 'reject');
  assert.equal(guardedItem.model.jurisdictionRisk, 'high');
  assert.match(guardedItem.model.rationale, /races-civil-defense/);
});

// --- Checked-in golden fixture: the shared guard-record convention (8E3) ---
//
// tools/india-review/guard-record-golden.json pins the exact synthetic record
// both this tool and the local-llm-review-runner must produce for the same
// canonical US-specific candidate. These tests NEVER depend on the sibling
// checkout; only the optional byte-identity check does.

const GOLDEN = JSON.parse(fs.readFileSync(path.join(REPO, 'tools', 'india-review', 'guard-record-golden.json'), 'utf8'));
const SIBLING_GOLDEN = path.resolve(REPO, '..', 'local-llm-review-runner', 'fixtures', 'guard-record-golden.json');

test('golden: evaluateGuard flags the canonical candidate with the golden rule', () => {
  assert.equal(GOLDEN.conventionVersion, 1);
  const guard = evaluateGuard(GOLDEN.candidate);
  assert.equal(guard.flagged, true);
  assert.equal(guard.rule, 'fcc-part-97');
  assert.equal(guard.verdict, 'reject');
});

test('golden: guardRecord output deep-equals the pinned expectedRecord', () => {
  const guard = evaluateGuard(GOLDEN.candidate);
  const record = p.guardRecord(GOLDEN.candidate, guard);
  assert.deepEqual(record, GOLDEN.expectedRecord);
});

test('golden: the pinned record passes validateModelRecord unchanged', () => {
  assert.doesNotThrow(() => p.validateModelRecord(GOLDEN.expectedRecord, GOLDEN.expectedRecord.id));
});

test('golden: sibling repo golden bytes match when its checkout is present', () => {
  if (!fs.existsSync(SIBLING_GOLDEN)) {
    // Optional cross-check only: the golden test above is fully self-contained.
    return;
  }
  const ours = crypto.createHash('sha256').update(fs.readFileSync(path.join(REPO, 'tools', 'india-review', 'guard-record-golden.json'))).digest('hex');
  const theirs = crypto.createHash('sha256').update(fs.readFileSync(SIBLING_GOLDEN)).digest('hex');
  assert.equal(ours, theirs);
});
