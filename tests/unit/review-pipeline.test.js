'use strict';
const {test}=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const os=require('node:os'); const path=require('node:path'); const p=require('../../scripts/review-pipeline.js');
function mkq(id,sub,q,extra={}){return Object.assign({id,sub,q,choices:{A:'a',B:'b',C:'c',D:'d'},correct:'A',correctText:'a',ref:''},extra);}
function fixture(){const d=fs.mkdtempSync(path.join(os.tmpdir(),'review-'));fs.writeFileSync(path.join(d,'pools.json'),JSON.stringify({pools:{technician:{editionId:'t-1',revisionId:'r-1',element:2,displayName:'Technician',withdrawnIds:['T9A']}}}));fs.writeFileSync(path.join(d,'technician.json'),JSON.stringify([mkq('T2A','T2A','keep?'),mkq('T1A','T1A','rules'),mkq('T9A','T9A','withdrawn'),mkq('T2B','T2B','figure 1',{figure:'T-1'}),mkq('T2C','T2C','FCC 97.1',{ref:'97.1'})]));return d;}
const model=(id,over={})=>Object.assign({id,syllabusRelevant:true,indianTopic:'electronics',recommendation:'keep',jurisdictionRisk:'none',figureRightsWarning:'none',rationale:'portable topic'},over);
test('deterministic extraction filters and reports reasons',()=>{const a=p.extractCandidates({dataDir:fixture(),poolKeys:['technician']});const b=p.extractCandidates({dataDir:fixture(),poolKeys:['technician']});assert.deepEqual(a,b);assert.deepEqual(a.filterReport.reasons,{figure:1,withdrawn:1,commissionRules:1,fccPart97:1});assert.equal(a.candidates[0].id,'T2A')});
test('candidate schema v2 fields populated from real bank shape',()=>{const c=p.extractCandidates({dataDir:fixture(),poolKeys:['technician']}).candidates[0];assert.equal(c.correct,'A');assert.equal(c.correctText,c.choices[c.correct]);assert.ok('ref' in c);assert.equal(c.figure,false);assert.equal(c.source.displayName,'Technician');assert.equal(c.source.element,2)});
test('validateCandidate strictly rejects missing v2 fields',()=>{const c=p.extractCandidates({dataDir:fixture(),poolKeys:['technician']}).candidates[0];for(const k of ['correct','correctText','ref','figure','source']){const x=JSON.parse(JSON.stringify(c));delete x[k];assert.throws(()=>p.validateCandidate(x),new RegExp('missing '+k));}const bad=JSON.parse(JSON.stringify(c));bad.correctText='zzz';assert.throws(()=>p.validateCandidate(bad),/correctText does not match/);const fig=JSON.parse(JSON.stringify(c));fig.figure=true;assert.throws(()=>p.validateCandidate(fig),/figure must be false/)});
test('malformed model output is rejected strictly',()=>{assert.throws(()=>p.validateModelRecord({id:'T2A',recommendation:'keep'},'T2A'),/invalid schema/);assert.throws(()=>p.validateModelRecord(model('T2A',{recommendation:'maybe'}),'T2A'),/recommendation/);assert.throws(()=>p.validateModelRecord(model('T2A',{syllabusRelevant:'yes'}),'T2A'),/syllabusRelevant/);assert.throws(()=>p.validateModelRecord(model('T2A',{jurisdictionRisk:'extreme'}),'T2A'),/jurisdictionRisk/);assert.throws(()=>p.validateModelRecord(model('T2A',{figureRightsWarning:'yes'}),'T2A'),/figureRightsWarning/);assert.throws(()=>p.validateModelRecord(model('T2A',{rationale:' '}),'T2A'),/rationale/);assert.throws(()=>p.validateModelRecord(model('T2B'),'T2A'),/id mismatch/)});
test('manifest round trip and approval export gate',()=>{const c=p.extractCandidates({dataDir:fixture(),poolKeys:['technician']}).candidates;const m=p.createManifest(c,[model('T2A')],{model:'fixture'});assert.equal(m.schemaVersion,2);assert.equal(m.promptVersion,p.PROMPT_VERSION);assert.equal(m.promptHash,p.promptHash());assert.deepEqual(p.validateManifest(JSON.parse(JSON.stringify(m))),m);assert.deepEqual(p.exportApproved(m),[]);m.items[0].decision={status:'approved',action:'adapt',topic:'basic electronics',note:'checked'};assert.equal(p.exportApproved(m).length,1)});
test('rejects invalid approved decision and does not mutate production bank',()=>{const d=fixture(),original=fs.readFileSync(path.join(d,'technician.json'),'utf8');const c=p.extractCandidates({dataDir:d,poolKeys:['technician']}).candidates;const m=p.createManifest(c,[model('T2A')]);m.items[0].decision={status:'approved',action:'reject',topic:'x',note:''};assert.throws(()=>p.exportApproved(m),/must be keep or adapt/);assert.equal(fs.readFileSync(path.join(d,'technician.json'),'utf8'),original)});

test('high jurisdictionRisk cannot be paired with recommendation keep',()=>{
  assert.throws(()=>p.validateModelRecord(model('T2A',{jurisdictionRisk:'high',recommendation:'keep'}),'T2A'),/cannot be keep/);
  for(const recommendation of ['adapt','reject','defer']){
    assert.doesNotThrow(()=>p.validateModelRecord(model('T2A',{jurisdictionRisk:'high',recommendation}),'T2A'));
  }
  for(const jurisdictionRisk of ['none','low','medium']){
    assert.doesNotThrow(()=>p.validateModelRecord(model('T2A',{jurisdictionRisk,recommendation:'keep'}),'T2A'));
  }
});

test('validateCandidate requires source.element and source.displayName',()=>{
  const c=p.extractCandidates({dataDir:fixture(),poolKeys:['technician']}).candidates[0];
  for(const bad of [
    {...c,source:{...c.source,element:undefined}},
    {...c,source:{...c.source,element:'2'}},          // string, not number
    {...c,source:{...c.source,element:NaN}},
    {...c,source:{...c.source,displayName:undefined}},
    {...c,source:{...c.source,displayName:''}},
    {...c,source:{...c.source,displayName:'   '}},    // whitespace-only
    {...c,source:{...c.source,displayName:42}},        // non-string
  ]){
    assert.throws(()=>p.validateCandidate(bad),/source metadata is invalid/);
  }
  // Still valid with every required source field present.
  assert.doesNotThrow(()=>p.validateCandidate(c));
});

test('malformed source metadata is rejected before any review HTML is generated',()=>{
  const d=fixture();
  const pools=JSON.parse(fs.readFileSync(path.join(d,'pools.json')));
  delete pools.pools.technician.element; // extraction now produces source.element: undefined
  fs.writeFileSync(path.join(d,'pools.json'),JSON.stringify(pools));
  const c=p.extractCandidates({dataDir:d,poolKeys:['technician']}).candidates;
  assert.throws(()=>p.createManifest(c,[model('T2A')]),/source metadata is invalid/);
});

test('a candidate with valid source metadata never renders undefined in the review HTML',()=>{
  const c=p.extractCandidates({dataDir:fixture(),poolKeys:['technician']}).candidates;
  const m=p.createManifest(c,[model('T2A')]);
  const html=p.reviewHtml(m);
  assert.ok(!html.includes('undefined'),'review HTML must never contain the literal text "undefined"');
});

test('bare subelement Commission rules are filtered',()=>{const d=fixture();const pools=JSON.parse(fs.readFileSync(path.join(d,'pools.json')));pools.pools.technician.withdrawnIds=[];fs.writeFileSync(path.join(d,'pools.json'),JSON.stringify(pools));const bank=JSON.parse(fs.readFileSync(path.join(d,'technician.json')));bank.push(mkq('T1','T1','bare rules'));fs.writeFileSync(path.join(d,'technician.json'),JSON.stringify(bank));const r=p.extractCandidates({dataDir:d,poolKeys:['technician']});assert.equal(r.filterReport.reasons.commissionRules,2);assert.ok(!r.candidates.some(x=>x.id==='T1'));});

test("generated HTML has no C0 controls",()=>{const c=p.extractCandidates({dataDir:fixture(),poolKeys:["technician"]}).candidates;const m=p.createManifest(c,[model("T2A")]);const html=p.reviewHtml(m);assert.equal([...html].filter(ch=>ch.charCodeAt(0)<32&&!/[\n\r\t]/.test(ch)).length,0)});

test("review HTML withholds the answer until the reveal control",()=>{const d=fixture();const bank=JSON.parse(fs.readFileSync(path.join(d,'technician.json')));bank[0].choices.A='DISTINCTIVE-ANSWER-TEXT-XYZZY';bank[0].correctText='DISTINCTIVE-ANSWER-TEXT-XYZZY';fs.writeFileSync(path.join(d,'technician.json'),JSON.stringify(bank));const c=p.extractCandidates({dataDir:d,poolKeys:['technician']}).candidates;const m=p.createManifest(c,[model('T2A')]);const html=p.reviewHtml(m);
// The correct letter + correctText are redacted from the embedded manifest
// (choices necessarily contain the answer text, so assert structure, not the
// literal string) and rendering is gated behind the "Reveal answer" button.
assert.ok(html.includes('"correct":null'));assert.ok(html.includes('"correctText":""'));
assert.ok(html.includes('Reveal answer'));assert.ok(html.includes('Model suggestion'));assert.ok(html.includes('advisory'));assert.ok(html.includes('reveal.onclick'));assert.ok(html.includes('id=answer hidden'));assert.ok(html.includes('atob('))});
