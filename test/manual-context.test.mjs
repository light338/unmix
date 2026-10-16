import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Unmix, run } from '../src/core.mjs';
const baseContext={browser:'FixtureBrowser',browserVersion:'1',environment:'local-fixture',authState:'signed_in',accountAlias:'test-buyer',role:'buyer',session:'fresh-session-v1',dataState:'seed-v1'};
const requirements=['like','scroll'].map(checkId=>({requirementId:checkId,title:checkId,kind:'preserve',checkId,procedure:'Fixture-only '+checkId+' interaction'}));
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'unmix-context-'));const repo=path.join(root,'repo');fs.mkdirSync(repo);t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const git=(...a)=>{const r=run(repo,'git',a);assert.equal(r.ok,true,r.stderr);return r.stdout;};
 git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');fs.writeFileSync(path.join(repo,'base.txt'),'base');git('add','.');git('commit','-qm','base');
 const u=new Unmix(repo);u.init();u.begin({taskId:'drop',title:'Drop',intent:'Drop a decision'});fs.writeFileSync(path.join(repo,'drop.txt'),'drop');u.finish();
 const p=u.prepare({remove:['drop'],instruction:'Keep interactions',requirements});u.verify({planId:p.planId,phase:'baseline'});
 const declare=(phase='candidate',change={})=>u.manualContext({planId:p.planId,phase,context:{...baseContext,...change}});
 const observe=(checkId='like',phase='candidate',overrides={})=>{const i=u.inspect(p.planId);return u.manualCheck({planId:p.planId,phase,checkId,title:checkId,procedure:'Fixture-only '+checkId+' interaction',result:'passed',observer:'Synthetic test client, not a human',note:'Authored API test, no browser tested',expectedTree:phase==='baseline'?i.baselineReview.tree:i.candidateTree,expectedContext:i.manualContexts?.[phase]?.revision,...overrides});};
 const complete=()=>{for(const phase of ['baseline','candidate']){declare(phase);for(const id of ['like','scroll'])observe(id,phase);}return u.verify({planId:p.planId});};
 return {u,p,repo,git,declare,observe,complete};
}
test('declared context is bound to observations in each phase and report shows matching conditions',t=>{
 const {u,p,repo,git,complete}=fixture(t);const original=[git('rev-parse','HEAD'),git('write-tree'),git('status','--porcelain')];
 assert.equal(complete().passed,true);const r=u.report({planId:p.planId});assert.equal(r.passport.contextCoverage,'declared');assert.equal(r.passport.requirements[0].contextComparison.state,'matching');
 assert.equal(r.manualChecks.latest[0].context.accountAlias,'test-buyer');assert.equal(r.baselineManualChecks.latest[0].contextReview.state,'declared');
 assert.match(u.report({planId:p.planId,format:'markdown'}),/Manual conditions and original observations/);assert.deepEqual([git('rev-parse','HEAD'),git('write-tree'),git('status','--porcelain')],original);assert.equal(fs.readFileSync(path.join(repo,'base.txt'),'utf8'),'base');
});
test('account changes invalidate both IDs without file edits; rechecking one does not refresh another',t=>{
 const {u,p,declare,observe,complete}=fixture(t);complete();const tree=u.inspect(p.planId).candidateTree;
 const next=declare('candidate',{accountAlias:'another-buyer'});let r=u.inspect(p.planId);assert.equal(r.candidateTree,tree);assert.equal(r.manualChecks.state,'stale');assert.equal(r.manualChecks.latest[0].fileState,'passed');assert.equal(r.passport.ready,false);
 assert.equal(u.verify({planId:p.planId}).passed,false);observe('like');r=u.inspect(p.planId);assert.equal(r.manualChecks.latest.find(v=>v.checkId==='like').state,'passed');assert.equal(r.manualChecks.latest.find(v=>v.checkId==='scroll').state,'stale');
 observe('scroll');r=u.inspect(p.planId);assert.equal(r.passport.requirements[0].state,'context_mismatch');assert.equal(r.passport.requirements[0].contextComparison.differences[0].field,'accountAlias');
 declare('baseline',{accountAlias:'another-buyer'});observe('like','baseline');observe('scroll','baseline');assert.equal(u.verify({planId:p.planId}).passed,true);assert.equal(next.context.accountAlias,'another-buyer');
});
test('racing context declarations refuse submissions and returning to old labels does not revive old observations',t=>{
 const {u,p,declare,observe,complete}=fixture(t);complete();const first=u.inspect(p.planId).manualContexts.candidate;
 const second=declare('candidate',{session:'fresh-session-v2'});assert.throws(()=>observe('like','candidate',{expectedContext:first.revision}),/Manual context changed/);
 const third=declare();assert.notEqual(third.revision,first.revision);assert.equal(u.inspect(p.planId).manualChecks.state,'stale');
 assert.equal(declare().changed,false);assert.equal(u.inspect(p.planId).manualContexts.candidate.revision,third.revision);assert.notEqual(second.revision,third.revision);
});
test('sign-in state, data and browser changes are compared; distinct server URLs are displayed without mismatching conditions',t=>{
 const {u,p,declare,observe,complete}=fixture(t);complete();
 declare('baseline',{appUrl:'http://localhost:3000/shop'});declare('candidate',{appUrl:'http://localhost:3001/shop'});
 for(const phase of ['baseline','candidate'])for(const id of ['like','scroll'])observe(id,phase);
 let r=u.verify({planId:p.planId});assert.equal(r.passed,true);assert.equal(r.passport.requirements[0].contextComparison.differences[0].affectsComparison,false);
 for(const change of [{authState:'signed_out',accountAlias:undefined,role:undefined},{dataState:'empty-db'},{browserVersion:'2'},{environment:'staging'}]){
   declare('candidate',change);observe('like');observe('scroll');r=u.verify({planId:p.planId});assert.equal(r.passed,false);assert.equal(r.passport.requirements[0].state,'context_mismatch');
 }
});
test('legacy observations keep explicit unrecorded context and declaration never retroactively supplies evidence',t=>{
 const {u,p,declare,observe}=fixture(t);for(const phase of ['baseline','candidate'])for(const id of ['like','scroll'])observe(id,phase);
 assert.equal(u.verify({planId:p.planId}).passed,true);let r=u.inspect(p.planId);assert.equal(r.passport.contextCoverage,'not_declared');assert.equal(r.manualChecks.latest[0].contextReview.state,'not_recorded');
 declare();r=u.inspect(p.planId);assert.equal(r.manualChecks.state,'context_unconfirmed');assert.equal(r.manualChecks.latest[0].context,null);assert.equal(r.passport.ready,false);
 declare('baseline');for(const phase of ['baseline','candidate'])for(const id of ['like','scroll'])observe(id,phase);assert.equal(u.verify({planId:p.planId}).passed,true);
});
test('unknown authentication remains unconfirmed and verification cannot refresh conditions',t=>{
 const {u,p,declare,observe}=fixture(t);for(const phase of ['baseline','candidate']){declare(phase,{authState:'unknown',accountAlias:undefined,role:undefined});for(const id of ['like','scroll'])observe(id,phase);}
 const r=u.verify({planId:p.planId});assert.equal(r.checksPassed,true);assert.equal(r.passed,false);assert.equal(r.passport.requirements[0].baseline.reason,'context_unconfirmed');
});
test('context validation rejects secret-shaped fields and unsafe URLs without ledger mutation; CLI exposes declarations',t=>{
 const {u,p,repo}=fixture(t);const before=fs.readFileSync(u.file,'utf8');
 for(const context of [null,[],{}, {...baseContext,cookies:'x'},{...baseContext,accountAlias:'person@example.com'},{...baseContext,authState:'signed_out'},{...baseContext,appUrl:'https://u:p@example.com/'},{...baseContext,appUrl:'https://example.com/?token=secret'},{...baseContext,appUrl:'https://example.com/#token'},{...baseContext,browser:1},{...baseContext,session:'\n'},{...baseContext,role:undefined}])assert.throws(()=>u.manualContext({planId:p.planId,context}));
 assert.equal(fs.readFileSync(u.file,'utf8'),before);
 const cli=run(repo,process.execPath,[new URL('../bin/unmix.mjs',import.meta.url).pathname,'manual-context','--repo',repo,'--json',JSON.stringify({planId:p.planId,context:baseContext})]);assert.equal(cli.ok,true,cli.stderr);assert.match(JSON.parse(cli.stdout).revision,/^context-/);
 const restored=new Unmix(repo);assert.equal(restored.inspect(p.planId).manualContexts.candidate.context.authState,'signed_in');
});
