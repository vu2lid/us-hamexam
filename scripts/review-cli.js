#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),p=require('./review-pipeline.js'),args=process.argv.slice(2);
const flag=(n,d)=>{const i=args.indexOf(n);return i<0?d:args[i+1]},req=n=>{const x=flag(n);if(!x)throw Error('missing '+n);return x},write=(f,x)=>{fs.mkdirSync(path.dirname(path.resolve(f)),{recursive:true});fs.writeFileSync(f,x)};
try{const cmd=args[0];
if(cmd==='extract'){const r=p.extractCandidates({dataDir:flag('--data-dir','data')});write(req('--out'),r.candidates.map(p.stableJson).join('\n')+'\n');write(flag('--report',req('--out')+'.report.json'),JSON.stringify(r.filterReport,null,2)+'\n');}
else if(cmd==='triage'){const c=fs.readFileSync(req('--candidates'),'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse),adapter=flag('--adapter','fixture'),{eligible,guarded}=p.splitGuarded(c),records=p.runModelAdapter({adapter,candidates:eligible,modelOutput:flag('--model-output'),command:flag('--command')}).concat(guarded.map(g=>p.guardRecord(g.candidate,g.guard)));const m=p.createManifest(c,records,{adapter,model:flag('--model','fixture'),guarded:guarded.length});write(req('--manifest'),JSON.stringify(m,null,2)+'\n');}
else if(cmd==='serve'){const m=p.validateManifest(JSON.parse(fs.readFileSync(req('--manifest'),'utf8'))),port=Number(flag('--port','8787')),savePath=flag('--manifest-write');http.createServer((q,s)=>{if(savePath&&q.method==='POST'&&q.url==='/save'){let b='';q.on('data',x=>b+=x);q.on('end',()=>{try{const x=p.validateManifest(JSON.parse(b));write(savePath,JSON.stringify(x,null,2)+'\n');s.writeHead(204);s.end()}catch(e){s.writeHead(400);s.end(e.message)}});return}s.writeHead(200,{'content-type':'text/html; charset=utf-8'});s.end(p.reviewHtml(m,savePath?'/save':''))}).listen(port,'127.0.0.1',()=>console.log('review UI: http://127.0.0.1:'+port+'/'));}
else if(cmd==='export'){const out=p.exportApproved(JSON.parse(fs.readFileSync(req('--manifest'),'utf8')));write(req('--out'),out.map(p.stableJson).join('\n')+(out.length?'\n':''));}
else if(cmd==='pilot'){
  // Validate everything BEFORE writing anything.
  const adapter=flag('--adapter','fixture');
  if(!['fixture','command'].includes(adapter))throw Error('unsupported adapter: '+adapter);
  const sample=Number(flag('--sample','25'));
  if(!Number.isInteger(sample)||sample<1||sample>50)throw Error('--sample must be an integer between 1 and 50 (default 25)');
  const modelOutput=flag('--model-output'),command=flag('--command');
  if(adapter==='fixture'&&!modelOutput)throw Error('fixture adapter requires --model-output');
  if(adapter==='command'&&!command)throw Error('command adapter requires --command');
  const candidatesFile=flag('--candidates');
  let candidates;
  if(candidatesFile){candidates=fs.readFileSync(candidatesFile,'utf8').split(/\r?\n/).filter(Boolean).map((l,i)=>{try{return JSON.parse(l)}catch(e){throw Error(candidatesFile+':'+(i+1)+': malformed JSON')}});}
  else candidates=p.extractCandidates({dataDir:flag('--data-dir','data')}).candidates;
  const sampled=candidates.slice(0,sample);
  const startedAt=new Date();const t0=process.hrtime.bigint();
  const failures=[];const records=[];
  const {eligible,guarded}=p.splitGuarded(sampled);
  if(adapter==='fixture'){
    // Build the id->record lookup with the same strictness triage/
    // createManifest apply to a model-output file: a plain Map built by
    // `.map(r=>[r.id,r])` silently keeps only the LAST of two duplicate-id
    // lines, which let a corrupted fixture file through pilot (though not
    // triage) with no error at all. A record missing a usable string id is
    // a parse-level defect in the file itself, not any one candidate's
    // problem, so both of those fail the whole pilot immediately, exactly
    // as triage already does on the same kind of file. A record that IS
    // found but fails validateModelRecord's strict shape/enum checks is
    // still that candidate's own failure, not a reason to abort everyone
    // else's results.
    const byId=new Map();
    for(const r of p.readJsonl(modelOutput)){
      const rid=r&&typeof r.id==='string'&&r.id.trim()!==''?r.id:undefined;
      if(rid===undefined)throw Error(modelOutput+': a model-output record is missing a usable string id: '+JSON.stringify(r));
      if(byId.has(rid))throw Error(modelOutput+': duplicate model output id: '+rid);
      byId.set(rid,r);
    }
    for(const c of eligible){
      const r=byId.get(c.id);
      if(r===undefined){failures.push({id:c.id,error:'no model record for candidate'});continue;}
      try{records.push(p.validateModelRecord(r,c.id));}
      catch(e){failures.push({id:c.id,error:e.message});}
    }
  }
  else for(const c of eligible){
    try{const rs=p.runModelAdapter({adapter,candidates:[c],modelOutput,command});if(rs.length!==1)throw Error('expected 1 record, got '+rs.length);if(rs[0].id!==c.id)throw Error('model output id mismatch: expected '+c.id+', got '+rs[0].id);records.push(rs[0]);}
    catch(e){failures.push({id:c.id,error:e.message});}
  }
  const adapterSucceeded=records.length;
  for(const g of guarded)records.push(p.guardRecord(g.candidate,g.guard));
  const manifest=p.createManifest(sampled.filter(c=>!failures.some(f=>f.id===c.id)),records,{adapter,model:flag('--model','unidentified'),modelPath:flag('--model-path',''),pilot:true,guarded:guarded.length});
  const elapsedMs=Number(process.hrtime.bigint()-t0)/1e6;
  const report={tool:'india-question-review',toolVersion:2,promptVersion:p.PROMPT_VERSION,promptHash:p.promptHash(),model:flag('--model','unidentified'),modelPath:flag('--model-path',''),adapter,runtimeSettings:{deterministic:true,temperature:0,seed:42,greedy:true,nonInteractive:true},startedAt:startedAt.toISOString(),elapsedMs:Math.round(elapsedMs),counts:{extracted:candidates.length,sampled:sampled.length,succeeded:adapterSucceeded,guarded:guarded.length,failed:failures.length},failures,manifest};
  write(req('--out'),JSON.stringify(report,null,2)+'\n');
  console.log('pilot: sampled '+report.counts.sampled+'/'+report.counts.extracted+', succeeded '+report.counts.succeeded+', guarded '+report.counts.guarded+' (adapter never saw them), failed '+report.counts.failed+', '+report.elapsedMs+' ms -> '+req('--out'));
}
else throw Error('usage: review-cli.js extract|triage|serve|export|pilot')}catch(e){console.error('review tool: '+e.message);process.exitCode=1}
