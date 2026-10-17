'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const {evaluateGuard} = require('./jurisdiction-guard.js');
const SCHEMA_VERSION = 2;
const PROMPT_VERSION = 'india-review-prompt-v3';
const PROMPT_TEMPLATE_PATH = path.join(__dirname, '..', 'tools', 'india-review', 'prompt-v3.txt');
const DECISIONS = new Set(['keep', 'adapt', 'reject']);
const RECOMMENDATIONS = new Set(['keep', 'adapt', 'reject', 'defer']);
const JURISDICTION_RISKS = new Set(['none', 'low', 'medium', 'high']);
const FIGURE_WARNINGS = new Set(['none', 'warning']);
const MODEL_KEYS = ['figureRightsWarning', 'id', 'indianTopic', 'jurisdictionRisk', 'rationale', 'recommendation', 'syllabusRelevant'];
const keys = ['id', 'poolKey', 'sub', 'question', 'choices', 'correct', 'correctText', 'ref', 'figure', 'source'];
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const object = x => x && typeof x === 'object' && !Array.isArray(x);
const text = x => typeof x === 'string' && x.trim() !== '';
const stableJson = x => JSON.stringify(x);
const promptTemplate = () => fs.readFileSync(PROMPT_TEMPLATE_PATH, 'utf8');
const promptHash = () => crypto.createHash('sha256').update(promptTemplate()).digest('hex');

// extractCandidates: pull transferable candidates from the US NCVEC banks.
// Filters out figure-bearing, withdrawn, Commission-rules (bare T1/G1/E1
// subelements), and FCC Part 97 questions. Candidates carry the full v2
// identity: answer key + correctText + ref (hidden by default in the review
// UI) and a figure:false indicator (candidates are figure-filtered, but the
// field is present so the model/UI can reason about figure rights).
function extractCandidates({dataDir, poolKeys = ['technician', 'general', 'extra']}) {
  const registry = readJson(path.join(dataDir, 'pools.json')); const reasons = {figure:0, withdrawn:0, commissionRules:0, fccPart97:0}; const candidates=[];
  for (const poolKey of poolKeys) { const meta=registry.pools[poolKey]; if (!meta) throw new Error(`unknown pool: ${poolKey}`); const bank=readJson(path.join(dataDir, `${poolKey}.json`)); const withdrawn=new Set(meta.withdrawnIds||[]);
    for (const q of bank) { const reason=q.figure?'figure':withdrawn.has(q.id)?'withdrawn':/^(?:T|G|E)1(?:[A-Z].*)?$/.test(q.sub)?'commissionRules':/97\./i.test([q.q,q.ref,...Object.values(q.choices||{})].join(' '))?'fccPart97':null; if(reason){reasons[reason]++;continue;}
      candidates.push({id:q.id,poolKey,sub:q.sub,question:q.q,choices:{A:q.choices.A,B:q.choices.B,C:q.choices.C,D:q.choices.D},correct:q.correct,correctText:q.correctText,ref:q.ref,figure:false,source:{editionId:meta.editionId,revisionId:meta.revisionId,element:meta.element,displayName:meta.displayName}}); }
  } candidates.sort((a,b)=>a.id.localeCompare(b.id)); return {schemaVersion:SCHEMA_VERSION,candidates,filterReport:{reasons,inputPools:poolKeys.slice(),candidateCount:candidates.length}};
}

// source.element and source.displayName are required alongside
// editionId/revisionId: reviewHtml renders c.source.element directly, and a
// candidate that passed validation with either field missing used to
// render the literal text "element undefined" in the review UI instead of
// failing loudly at load time, as this function's strict-validation design
// otherwise guarantees for every other field.
function validateCandidate(c){if(!object(c))throw Error('candidate must be an object'); for(const k of keys)if(!(k in c))throw Error(`candidate missing ${k}`); if(!text(c.id)||!text(c.poolKey)||!text(c.sub)||!text(c.question))throw Error('candidate identity/text is invalid'); if(!object(c.choices)||['A','B','C','D'].some(k=>!text(c.choices[k])))throw Error(`candidate ${c.id} choices are invalid`); if(!['A','B','C','D'].includes(c.correct))throw Error(`candidate ${c.id} correct is invalid`); if(c.correctText!==c.choices[c.correct])throw Error(`candidate ${c.id} correctText does not match choices[correct]`); if(typeof c.ref!=='string')throw Error(`candidate ${c.id} ref is invalid`); if(c.figure!==false)throw Error(`candidate ${c.id} figure must be false for filtered candidates`); if(!object(c.source)||!text(c.source.editionId)||!text(c.source.revisionId)||typeof c.source.element!=='number'||!Number.isFinite(c.source.element)||!text(c.source.displayName))throw Error(`candidate ${c.id} source metadata is invalid`); return c;}

// Model output contract v2: exactly these seven keys.
function validateModelRecord(r,id){if(!object(r))throw Error(`model output for ${id} is not an object`); const got=Object.keys(r).sort(); if(got.length!==MODEL_KEYS.length||got.some((k,i)=>k!==MODEL_KEYS[i]))throw Error(`model output for ${id} has an invalid schema`); if(r.id!==id)throw Error(`model output id mismatch: expected ${id}, got ${r.id}`); if(typeof r.syllabusRelevant!=='boolean')throw Error(`model output for ${id}: syllabusRelevant must be a boolean`); if(!text(r.indianTopic))throw Error(`model output for ${id}: indianTopic must be a non-empty string`); if(!RECOMMENDATIONS.has(r.recommendation))throw Error(`model output for ${id}: recommendation must be keep|adapt|reject|defer`); if(!JURISDICTION_RISKS.has(r.jurisdictionRisk))throw Error(`model output for ${id}: jurisdictionRisk must be none|low|medium|high`); if(!FIGURE_WARNINGS.has(r.figureRightsWarning))throw Error(`model output for ${id}: figureRightsWarning must be none|warning`); if(!text(r.rationale))throw Error(`model output for ${id}: rationale must be a non-empty string`); if(r.jurisdictionRisk==='high'&&r.recommendation==='keep')throw Error(`model output for ${id}: recommendation cannot be keep when jurisdictionRisk is high`); return {id:r.id,syllabusRelevant:r.syllabusRelevant,indianTopic:r.indianTopic,recommendation:r.recommendation,jurisdictionRisk:r.jurisdictionRisk,figureRightsWarning:r.figureRightsWarning,rationale:r.rationale};}

function readJsonl(f){return fs.readFileSync(f,'utf8').split(/\r?\n/).filter(Boolean).map((line,i)=>{try{return JSON.parse(line)}catch(e){throw Error(`${f}:${i+1}: malformed JSON (${e.message})`)}});}

// splitGuarded/guardRecord: the PRE-invocation half of the jurisdiction
// guard. Dispatch paths (review-cli triage/pilot) split candidates before
// calling runModelAdapter so a flagged candidate never consumes model time;
// the guarded item still lands in the manifest via a clearly-labeled
// synthetic model record that passes validateModelRecord (indianTopic must
// be a non-empty string, so it carries a deterministic label). The
// post-invocation override inside createManifest stays as defense in depth
// -- it re-forces reject/high over this synthetic record harmlessly, since
// the guard verdict and rule are identical either way.
const GUARD_TOPIC='Jurisdiction-specific (US) — not syllabus relevant';
function splitGuarded(candidates){const eligible=[],guarded=[];for(const c of candidates){const guard=evaluateGuard(c);(guard.flagged?guarded:eligible).push({candidate:c,guard});}return {eligible:eligible.map(x=>x.candidate),guarded};}
function guardRecord(candidate,guard){return {id:candidate.id,syllabusRelevant:false,indianTopic:GUARD_TOPIC,recommendation:guard.verdict,jurisdictionRisk:'high',figureRightsWarning:'none',rationale:'Deterministic pre-invocation guard ('+guard.rule+'): '+guard.reason+' — no model involved; the adapter never saw this candidate'};}

function runModelAdapter({adapter="fixture",candidates,modelOutput,command}){if(adapter==="fixture")return readJsonl(modelOutput);if(adapter!=="command"||!text(command))throw Error("unsupported adapter: "+adapter);const r=childProcess.spawnSync(command,{input:candidates.map(stableJson).join("\n")+"\n",encoding:"utf8",shell:true});if(r.error)throw r.error;if(r.status!==0)throw Error("model command exited "+r.status+": "+(r.stderr||"").trim());return r.stdout.split(/\r?\n/).filter(Boolean).map((line,i)=>{try{return JSON.parse(line)}catch(e){throw Error("model command output line "+(i+1)+": malformed JSON ("+e.message+")")}});}

// Every item passes through the deterministic jurisdiction guard here,
// after model-output validation and before the manifest is built, so a
// flagged candidate's recommendation/jurisdictionRisk are forced to
// reject/high regardless of what the model said -- there is no later
// point where a model result could still override that call. The guard
// field is attached to every item (flagged or not) for transparency, but
// it is NOT one of the seven model-output keys MODEL_KEYS enforces, so a
// manifest produced here still carries an unmodified, independently
// re-validatable `model` record alongside it.
function createManifest(candidates, records, metadata={}){const byId=new Map(records.map(r=>[r.id,r]));if(byId.size!==records.length)throw Error('duplicate model output id: '+records.map(r=>r.id).find((id,i)=>records.findIndex(x=>x.id===id)!==i));const items=candidates.map(validateCandidate).map(candidate=>{const modelRecord=validateModelRecord(byId.get(candidate.id),candidate.id);const guard=evaluateGuard(candidate);const model=guard.flagged?{...modelRecord,recommendation:guard.verdict,jurisdictionRisk:'high',rationale:'Deterministic guard ('+guard.rule+'): '+guard.reason+'. Model said: '+modelRecord.rationale}:modelRecord;return {candidate,model,guard,decision:{status:'pending',action:null,topic:model.indianTopic,note:''}}});if(byId.size!==items.length)throw Error('model output does not exactly cover candidates (missing records)');return {schemaVersion:SCHEMA_VERSION,tool:'india-question-review',promptVersion:PROMPT_VERSION,promptHash:promptHash(),metadata:{...metadata},items};}

function validateManifest(m){if(!object(m)||m.schemaVersion!==SCHEMA_VERSION||!Array.isArray(m.items))throw Error('invalid review manifest');const ids=new Set();for(const i of m.items){validateCandidate(i.candidate);if(ids.has(i.candidate.id))throw Error(`duplicate manifest id ${i.candidate.id}`);ids.add(i.candidate.id);validateModelRecord(i.model,i.candidate.id);if(!object(i.decision)||!['pending','decided','approved'].includes(i.decision.status)||(i.decision.action!==null&&!DECISIONS.has(i.decision.action)))throw Error(`invalid decision for ${i.candidate.id}`);if(i.decision.status==='approved'&&!['keep','adapt'].includes(i.decision.action))throw Error(`approved item ${i.candidate.id} must be keep or adapt`);}return m;}

function exportApproved(m){validateManifest(m);return m.items.filter(i=>i.decision.status==='approved'&&['keep','adapt'].includes(i.decision.action)).map(i=>({sourceId:i.candidate.id,sourcePool:i.candidate.poolKey,action:i.decision.action,indianTopic:i.decision.topic,question:i.candidate.question,choices:i.candidate.choices,source:i.candidate.source,model:i.model,humanNote:i.decision.note||''}));}

// Review UI. The correct letter + correctText are withheld from the initial
// render: they live in a separate `answers` map keyed by id and are shown
// only after the human clicks "Reveal answer". Model output is labeled
// "Model suggestion" and is advisory only — human approval is mandatory.
//
// Embedding untrusted candidate/model text into a hand-built <script>:
// JSON.stringify already escapes every quote, backslash, and C0 control
// character inside string values in a way that is simultaneously valid
// JSON and valid JS (that overlap is the whole point of the acronym). Two
// gaps remain, neither covered by JSON.stringify, both fixed once in
// scriptSafe() below and applied to every value spliced into the <script>
// body: (1) a literal "</script" (or "<!--") inside the text would end the
// script element early regardless of any `type` attribute, since the HTML
// tokenizer's script-data-state does not parse JS and does not care what
// the content actually is -- blanket-escaping "<" to its < JSON
// string-escape dodges this and is always valid, reversible JSON, since
// JSON structure never itself uses a literal "<"; (2) U+2028/U+2029 (LINE
// SEPARATOR / PARAGRAPH SEPARATOR) are legal, unescaped inside a JSON
// string (and candidates are allowed to carry them -- see the JSONL-split
// note in docs/COMPATIBILITY.md) but were a SyntaxError inside a JS string
// literal before ES2019; escaping them costs nothing and removes any
// dependency on that engine-version guarantee holding everywhere this ever
// runs.
const scriptSafe=s=>s.replace(/</g,'\\u003c').split(String.fromCharCode(0x2028)).join('\\u2028').split(String.fromCharCode(0x2029)).join('\\u2029');
function reviewHtml(m,saveUrl=''){const answers={};for(const i of m.items){answers[i.candidate.id]={correct:i.candidate.correct,correctText:i.candidate.correctText};}
// Answers are base64-gated: the initial render cannot show them, they only
// become readable when the human clicks "Reveal answer" (atob decode), and
// save() re-attaches them so the manifest round-trips. Base64 output is
// always drawn from [A-Za-z0-9+/=], so embedding it is unconditionally safe
// however hostile the underlying answer text was.
const answersB64=Buffer.from(JSON.stringify(answers),'utf8').toString('base64');
// The embedded manifest copy is redacted; save() re-attaches the answers.
const redacted=JSON.parse(JSON.stringify(m));for(const i of redacted.items){i.candidate.correct=null;i.candidate.correctText='';}
const safe=scriptSafe(JSON.stringify(redacted));
return '<!doctype html><meta charset="utf-8"><title>India question review</title><style>body{font:16px system-ui;max-width:900px;margin:2rem auto;padding:0 1rem}article{border:1px solid #bbb;border-radius:8px;padding:1rem;margin:1rem 0}button,select,textarea,input{font:inherit;padding:.45rem;margin:.25rem}.model{background:#f4f4f4;border-radius:6px;padding:.5rem;margin:.5rem 0}.guard{background:#fff3e0;border:1px solid #e0a040;border-radius:6px;padding:.5rem;margin:.5rem 0}</style><h1>India question review</h1><p>Local-only review. J/K navigate. Model suggestions are advisory only — a human decision is required for every question.</p><main id="app"></main><script>const manifest='+safe+',answers=JSON.parse(atob('+JSON.stringify(answersB64)+')),saveUrl='+scriptSafe(JSON.stringify(saveUrl))+';let n=0;const esc=s=>String(s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));function doSave(){for(const i of manifest.items){const a=answers[i.candidate.id];i.candidate.correct=a.correct;i.candidate.correctText=a.correctText;}const body=JSON.stringify(manifest);if(saveUrl){fetch(saveUrl,{method:"POST",headers:{"content-type":"application/json"},body}).then(r=>{savemsg.textContent=r.ok?"Saved locally.":"Save failed.";}).catch(()=>savemsg.textContent="Save failed.");}else{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([body],{type:"application/json"}));a.download="india-review-manifest.json";a.click();savemsg.textContent="Downloaded manifest.";}}function render(){const i=manifest.items[n],c=i.candidate,d=answers[c.id],g=i.guard;document.querySelector("#app").innerHTML="<p>"+(n+1)+" / "+manifest.items.length+"  |  "+esc(c.id)+"  |  pool: "+esc(c.poolKey)+"  |  element "+esc(String(c.source.element))+"</p><article><h2>"+esc(c.question)+"</h2><pre>"+esc(JSON.stringify(c.choices,null,2))+"</pre><p>Source: "+esc(c.source.editionId)+" / "+esc(c.source.revisionId)+" / element "+esc(String(c.source.element))+(c.ref?" / ref: "+esc(c.ref):"")+"</p><p>Figure: "+(c.figure?"yes":"no")+"</p><div class=model><h3>Model suggestion (advisory only)</h3><p>Syllabus relevant: "+esc(String(i.model.syllabusRelevant))+"  |  Recommendation: "+esc(i.model.recommendation)+"  |  Jurisdiction risk: "+esc(i.model.jurisdictionRisk)+"  |  Figure rights: "+esc(i.model.figureRightsWarning)+"</p><p>Indian topic: "+esc(i.model.indianTopic)+"</p><p>Rationale: "+esc(i.model.rationale)+"</p></div>"+(g&&g.flagged?"<div class=guard><h3>Deterministic guard</h3><p>Rule: "+esc(g.rule)+"  |  Verdict: "+esc(g.verdict)+"</p><p>"+esc(g.reason)+"</p></div>":"")+"<p id=answer hidden><strong>Answer: "+esc(d.correct)+" — "+esc(d.correctText)+"</strong></p><button id=reveal type=button>Reveal answer</button><label>Decision <select id=a><option value=\'\'>pending</option><option>keep</option><option>adapt</option><option>reject</option></select></label><br><label>Topic <input id=t></label><br><textarea id=note rows=3 cols=60></textarea><br><button id=save>Save / Download manifest</button><p id=savemsg role=status></p></article>";a.value=i.decision.action||"";t.value=i.decision.topic||"";note.value=i.decision.note||"";reveal.onclick=()=>{answer.hidden=false;reveal.disabled=true;};a.onchange=e=>{i.decision.action=e.target.value||null;i.decision.status=e.target.value?"approved":"pending"};t.onchange=e=>{i.decision.topic=e.target.value};note.onchange=e=>{i.decision.note=e.target.value};save.onclick=()=>{doSave();};}document.addEventListener("keydown",e=>{if(e.key==="j"&&n<manifest.items.length-1){n++;render();}if(e.key==="k"&&n>0){n--;render();}});render();</scr'+'ipt>';}

module.exports={SCHEMA_VERSION,PROMPT_VERSION,PROMPT_TEMPLATE_PATH,promptTemplate,promptHash,extractCandidates,validateCandidate,validateModelRecord,createManifest,validateManifest,exportApproved,reviewHtml,readJsonl,runModelAdapter,splitGuarded,guardRecord,GUARD_TOPIC,stableJson};
