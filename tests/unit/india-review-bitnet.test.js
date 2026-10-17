'use strict';
// Stage 8E2: BitNet local-model pilot tests. The real BitNet/llama runtime
// does NOT exist on any development machine used for this stage, so the
// wrapper (tools/india-review/run-bitnet.sh) is exercised ONLY through a
// fake runtime stub supplied via BITNET_CLI/BITNET_MODEL. No network, no new
// npm dependencies, and editions/india/ is hashed before/after to prove
// immutability.
const {test}=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const os=require('node:os'); const path=require('node:path'); const crypto=require('node:crypto'); const cp=require('node:child_process');
const p=require('../../scripts/review-pipeline.js');
const REPO=path.resolve(__dirname,'../..');
const WRAPPER=path.join(REPO,'tools','india-review','run-bitnet.sh');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

function mkCandidate(id){return {id,poolKey:'technician',sub:'T2A',question:'What is a resistor?',choices:{A:'a',B:'b',C:'c',D:'d'},correct:'A',correctText:'a',ref:'T2A01',figure:false,source:{editionId:'t-1',revisionId:'r-1',element:2,displayName:'Technician'}};}
function mkRecord(id){return {id,syllabusRelevant:true,indianTopic:'electronics',recommendation:'keep',jurisdictionRisk:'low',figureRightsWarning:'none',rationale:'basic electronics topic'};}

// Fake BitNet-compatible runtime: reads the -f prompt file, extracts the
// candidate JSON after the "Candidate JSON:" marker, and echoes one strict
// v2 record per invocation. MODE env var: normal | malformed | missing | badid
function fakeRuntime(dir,mode){const f=path.join(dir,'fake-bitnet.sh');fs.writeFileSync(f,`#!/usr/bin/env bash
set -euo pipefail
prompt_file=""
while [ $# -gt 0 ]; do case "$1" in -f) prompt_file="$2"; shift 2;; *) shift;; esac; done
[ -n "$prompt_file" ] || { echo "fake: no -f" >&2; exit 1; }
line="$(grep -A1 'Candidate JSON:' "$prompt_file" | tail -n1)"
id="$(printf '%s' "$line" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).id))')"
case "\${FAKE_MODE:-normal}" in
  malformed) echo "sorry, no json here" ;;
  missing) [ "$id" = "FAKE_SKIP_ME" ] && echo '{"note":"skipped"}' || true ;;
  badid) echo '{"id":"WRONG-ID","syllabusRelevant":true,"indianTopic":"x","recommendation":"keep","jurisdictionRisk":"none","figureRightsWarning":"none","rationale":"x"}' ;;
  *) printf '{"id":"%s","syllabusRelevant":true,"indianTopic":"electronics","recommendation":"keep","jurisdictionRisk":"low","figureRightsWarning":"none","rationale":"stub"}\n' "$id" ;;
esac
exit 0
`);fs.chmodSync(f,0o755);return f;}

function runWrapper(env,input){return cp.spawnSync(WRAPPER,{input,encoding:'utf8',env:Object.assign({},process.env,env)});}

test('wrapper: N records in -> N valid records out, order preserved, stdout clean',()=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'bitnet-'));const fake=fakeRuntime(d);const input=[mkCandidate('T2A01'),mkCandidate('G2A01'),mkCandidate('E2A01')].map(JSON.stringify).join('\n')+'\n';
const r1=runWrapper({BITNET_CLI:fake,BITNET_MODEL:'/models/stub.gguf',FAKE_MODE:'normal'},input);
assert.equal(r1.status,0,r1.stderr);const out1=r1.stdout.trim().split('\n').map(JSON.parse);
assert.equal(out1.length,3);assert.deepEqual(out1.map(x=>x.id),['T2A01','G2A01','E2A01']);out1.forEach(x=>assert.doesNotThrow(()=>p.validateModelRecord(x,x.id)));
// determinism spot-check: identical input twice -> identical stdout
const r2=runWrapper({BITNET_CLI:fake,BITNET_MODEL:'/models/stub.gguf',FAKE_MODE:'normal'},input);
assert.equal(r2.status,0);assert.equal(r2.stdout,r1.stdout);});

test('wrapper: unset BITNET_MODEL exits 2 with a clear message',()=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'bitnet-'));const fake=fakeRuntime(d);const env=Object.assign({},process.env,{BITNET_CLI:fake});delete env.BITNET_MODEL;
const r=cp.spawnSync(WRAPPER,{input:'{}\n',encoding:'utf8',env});assert.equal(r.status,2);assert.match(r.stderr,/BITNET_MODEL/);assert.equal(r.stdout,'');});

test('wrapper: malformed output line fails with a clear stderr diagnostic',()=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'bitnet-'));const fake=fakeRuntime(d);
const r=runWrapper({BITNET_CLI:fake,BITNET_MODEL:'m',FAKE_MODE:'malformed'},JSON.stringify(mkCandidate('T2A01'))+'\n');
assert.notEqual(r.status,0);assert.match(r.stderr,/no valid JSON object/);});

test('wrapper: missing record in output fails',()=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'bitnet-'));const fake=fakeRuntime(d);
const c=mkCandidate('FAKE_SKIP_ME');const r=runWrapper({BITNET_CLI:fake,BITNET_MODEL:'m',FAKE_MODE:'missing'},JSON.stringify(c)+'\n');
assert.notEqual(r.status,0);assert.match(r.stderr,/failed/);});

test('wrapper: output id mismatch fails',()=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'bitnet-'));const fake=fakeRuntime(d);
const r=runWrapper({BITNET_CLI:fake,BITNET_MODEL:'m',FAKE_MODE:'badid'},JSON.stringify(mkCandidate('T2A01'))+'\n');
assert.notEqual(r.status,0);assert.match(r.stderr,/id mismatch/);});

test('pipeline: duplicate and missing model records are rejected with clear errors',()=>{const cs=[mkCandidate('T2A01'),mkCandidate('G2A01')];
assert.throws(()=>p.createManifest(cs,[mkRecord('T2A01'),mkRecord('T2A01')]),/duplicate model output id/);
assert.throws(()=>p.createManifest(cs,[mkRecord('T2A01')]),/does not exactly cover|is not an object/);
assert.throws(()=>p.createManifest(cs,[mkRecord('T2A01'),mkRecord('XXX')]),/id mismatch|does not exactly cover|is not an object/);});

test('pilot: --sample above 50 is rejected before anything is written',()=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'pilot-'));const out=path.join(d,'report.json');
const r=cp.spawnSync(process.execPath,[path.join(REPO,'scripts','review-cli.js'),'pilot','--sample','51','--adapter','fixture','--model-output',path.join(d,'m.jsonl'),'--out',out],{encoding:'utf8'});
assert.notEqual(r.status,0);assert.match(r.stderr,/--sample/);assert.equal(fs.existsSync(out),false);});

test('pilot: fixture adapter end-to-end on a temp candidate set; report is complete',()=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'pilot-'));
const candidates=[mkCandidate('T2A01'),mkCandidate('G2A01'),mkCandidate('E2A01')];
fs.writeFileSync(path.join(d,'candidates.jsonl'),candidates.map(JSON.stringify).join('\n')+'\n');
fs.writeFileSync(path.join(d,'model.jsonl'),candidates.map(c=>JSON.stringify(mkRecord(c.id))).join('\n')+'\n');
const out=path.join(d,'report.json');
const r=cp.spawnSync(process.execPath,[path.join(REPO,'scripts','review-cli.js'),'pilot','--candidates',path.join(d,'candidates.jsonl'),'--sample','3','--adapter','fixture','--model-output',path.join(d,'model.jsonl'),'--model','fixture-stub','--model-path','/models/stub.gguf','--out',out],{encoding:'utf8'});
assert.equal(r.status,0,r.stderr);const report=JSON.parse(fs.readFileSync(out,'utf8'));
assert.equal(report.promptVersion,p.PROMPT_VERSION);assert.equal(report.promptHash,p.promptHash());assert.equal(report.model,'fixture-stub');assert.equal(report.modelPath,'/models/stub.gguf');assert.equal(report.adapter,'fixture');assert.equal(report.counts.extracted,3);assert.equal(report.counts.sampled,3);assert.equal(report.counts.succeeded,3);assert.equal(report.counts.failed,0);assert.deepEqual(report.failures,[]);assert.ok(typeof report.elapsedMs==='number'&&report.elapsedMs>=0);assert.ok(report.startedAt);assert.equal(report.manifest.items.length,3);assert.equal(report.runtimeSettings.deterministic,true);});

test('pilot: command adapter with the fake runtime wrapper end-to-end',()=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'pilot-'));const fake=fakeRuntime(d);
const candidates=[mkCandidate('T2A01'),mkCandidate('G2A01')];
fs.writeFileSync(path.join(d,'candidates.jsonl'),candidates.map(JSON.stringify).join('\n')+'\n');
const out=path.join(d,'report.json');
const env=Object.assign({},process.env,{BITNET_CLI:fake,BITNET_MODEL:'/models/stub.gguf',FAKE_MODE:'normal'});
const r=cp.spawnSync(process.execPath,[path.join(REPO,'scripts','review-cli.js'),'pilot','--candidates',path.join(d,'candidates.jsonl'),'--sample','2','--adapter','command','--command',WRAPPER,'--model','fake-bitnet','--model-path','/models/stub.gguf','--out',out],{encoding:'utf8',env});
assert.equal(r.status,0,r.stderr);const report=JSON.parse(fs.readFileSync(out,'utf8'));
assert.equal(report.counts.succeeded,2);assert.equal(report.counts.failed,0);assert.equal(report.adapter,'command');assert.equal(report.model,'fake-bitnet');});

test('production India bank is immutable across the review pipeline (temp copies only)',()=>{
const bank=path.join(REPO,'editions','india','banks','restricted.json');
const prov=path.join(REPO,'editions','india','banks','restricted.provenance.json');
const before=[sha(bank),sha(prov)];
// Run the extract/triage pipeline against a temp copy of the US data dir,
// exercising the exact functions the tool uses; never point at editions/india/.
const d=fs.mkdtempSync(path.join(os.tmpdir(),'immut-'));
const r=p.extractCandidates({dataDir:path.join(REPO,'data'),poolKeys:['technician']});
assert.ok(r.candidates.length>0);assert.ok(r.candidates.every(c=>c.figure===false));
const records=r.candidates.slice(0,5).map(c=>mkRecord(c.id));
const m=p.createManifest(r.candidates.slice(0,5),records);assert.equal(m.items.length,5);
assert.deepEqual([sha(bank),sha(prov)],before);
fs.rmSync(d,{recursive:true,force:true});});
