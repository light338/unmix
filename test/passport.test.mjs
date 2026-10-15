import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Unmix, run } from '../src/core.mjs';
import { expectedFailureMarker } from '../src/passport.mjs';
const command = (expression, expectedFailureId) => [process.execPath, '-e', `const fs=require('fs');const app=JSON.parse(fs.readFileSync('app.json'));if(!(${expression})){${expectedFailureId ? `console.log(${JSON.stringify(expectedFailureMarker(expectedFailureId))});` : ''}process.exit(1)}`];
const preserve = { requirementId: 'payment', title: 'Payment remains available', kind: 'preserve', command: command('app.payment') };
const remove = { requirementId: 'guest', title: 'Guest purchase works', kind: 'remove', command: command('!app.registration','guest') };
const manual = { requirementId: 'scroll', title: 'Scroll stays', kind: 'preserve', checkId: 'scroll-position', procedure: 'Scroll, complete the interaction, compare position.' };
function fixture(t, declared = [preserve, remove], payment = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'unmix-passport-')); const repo = path.join(root, 'repo');fs.mkdirSync(repo);
  const git = (...args) => {const r=run(repo,'git',args);assert.equal(r.ok,true,r.stderr);return r.stdout.trim();};
  git('init','-q');git('config','user.name','Test');git('config','user.email','test@example.invalid');
  fs.writeFileSync(path.join(repo,'app.json'),JSON.stringify({registration:false,payment}));
  fs.writeFileSync(path.join(repo,'.gitignore'),'runtime/\n');fs.mkdirSync(path.join(repo,'test'));fs.writeFileSync(path.join(repo,'test','oracle.txt'),'fixed');
  git('add','.');git('commit','-qm','base');const u=new Unmix(repo);u.init();
  u.begin({taskId:'registration',title:'Registration',intent:'Require registration'});
  fs.writeFileSync(path.join(repo,'app.json'),JSON.stringify({registration:true,payment}));u.finish();
  u.begin({taskId:'receipt',title:'Receipt',intent:'Keep receipt'});fs.writeFileSync(path.join(repo,'receipt.txt'),'receipt');u.finish();
  const p=u.prepare({remove:['registration'],instruction:'Allow guests, keep payment and receipt',requirements:declared});
  const observation=(phase='candidate',overrides={})=>{const inspected=u.inspect(p.planId);return {planId:p.planId,phase,checkId:manual.checkId,title:manual.title,procedure:manual.procedure,result:'passed',observer:'Authored fixture, no human interaction',note:'Synthetic API evidence',expectedTree:phase==='baseline'?inspected.baselineReview.tree:inspected.candidateTree,...overrides};};
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return {root,repo,u,p,git,observation};
}
test('passport compares a frozen original with candidate, gates missing baseline and preserves source/index',t=>{
  const {u,p,repo,git}=fixture(t);const original=()=>[git('rev-parse','HEAD'),git('write-tree'),git('status','--porcelain'),fs.readFileSync(path.join(repo,'app.json'),'utf8')];const before=original();
  assert.equal(u.verify({planId:p.planId}).passed,false);
  assert.equal(u.report({planId:p.planId}).checks.state,'passed');
  assert.equal(u.report({planId:p.planId}).passport.ready,false);
  const baseline=u.verify({planId:p.planId,phase:'baseline'});
  assert.equal(baseline.passed,false);assert.deepEqual(baseline.results.map(r=>r.code),[0,1]);
  const result=u.verify({planId:p.planId});assert.equal(result.passed,true);
  assert.equal(result.passport.ready,true);assert.equal(result.passport.requirements[1].baseline.state,'failed');
  assert.equal(result.passport.requirements[1].expectedFailureMarker,expectedFailureMarker('guest'));
  assert.deepEqual(original(),before);assert.equal(JSON.parse(fs.readFileSync(path.join(baseline.candidate,'app.json'),'utf8')).registration,true);
  assert.match(u.report({planId:p.planId,format:'markdown'}),/Preservation passport/);
});
test('separate mandatory manual IDs cannot be omitted, refreshed by tests or satisfied with a different procedure',t=>{
  const second={...manual,requirementId:'like',checkId:'like-saved',title:'Like saved',procedure:'Like, reload, inspect selection.'};
  const {u,p,observation}=fixture(t,[preserve,manual,second]);u.verify({planId:p.planId,phase:'baseline'});
  for(const phase of ['baseline','candidate']){
    u.manualCheck(observation(phase));u.manualCheck(observation(phase,{checkId:second.checkId,title:second.title,procedure:second.procedure}));
  }
  assert.equal(u.verify({planId:p.planId}).passed,true);
  fs.writeFileSync(path.join(p.candidate,'repair.txt'),'later repair');
  assert.equal(u.verify({planId:p.planId}).passed,false);
  u.manualCheck(observation());let r=u.inspect(p.planId).passport;
  assert.equal(r.requirements.find(x=>x.requirementId==='scroll').state,'passed');assert.equal(r.requirements.find(x=>x.requirementId==='like').state,'stale');
  u.manualCheck(observation('candidate',{checkId:second.checkId,procedure:'Wrong procedure'}));
  assert.equal(u.inspect(p.planId).passport.requirements.at(-1).state,'not_checked');
  u.manualCheck(observation('candidate',{checkId:second.checkId,procedure:second.procedure}));assert.equal(u.inspect(p.planId).passport.ready,true);
  assert.equal(u.inspect(p.planId).status,'checks_passed');
});
test('original failures and already-passing removal scenarios are not attributed to adaptation',t=>{
  const {u,p}=fixture(t,[preserve,{...remove,command:command('app.payment','guest')}],false);
  u.verify({planId:p.planId,phase:'baseline'});const r=u.verify({planId:p.planId});
  assert.equal(r.passport.requirements[0].state,'pre_existing_failure');assert.equal(r.passport.ready,false);
  const f=fixture(t,[{...remove,command:command('app.payment','guest')}]);f.u.verify({planId:f.p.planId,phase:'baseline'});
  assert.equal(f.u.verify({planId:f.p.planId}).passport.requirements[0].state,'removal_not_demonstrated');
});
test('launch failures, changed protected inputs and check-written files cannot satisfy a passport',t=>{
  const {u,p}=fixture(t,[{...remove,command:['unmix-nonexistent-executable']}]);
  u.verify({planId:p.planId,phase:'baseline'});assert.equal(u.verify({planId:p.planId}).passport.requirements[0].state,'error');
  const f=fixture(t);f.u.verify({planId:f.p.planId,phase:'baseline'});
  fs.writeFileSync(path.join(f.p.candidate,'test','oracle.txt'),'weakened');
  assert.equal(f.u.verify({planId:f.p.planId}).passport.ready,false);
  const g=fixture(t,[{...preserve,command:[process.execPath,'-e',"require('fs').writeFileSync('changed.txt','changed')"]}]);
  const baseline=g.u.verify({planId:g.p.planId,phase:'baseline'});assert.equal(baseline.changedDuringChecks,true);
  assert.equal(g.u.verify({planId:g.p.planId}).passport.ready,false);
});
test('baseline edits make observations stale and cannot be re-attested or verified as the original',t=>{
  const {u,p,observation}=fixture(t,[preserve,manual]);u.verify({planId:p.planId,phase:'baseline'});
  u.manualCheck(observation('baseline'));u.manualCheck(observation());assert.equal(u.verify({planId:p.planId}).passed,true);
  fs.writeFileSync(path.join(u.getPlan(p.planId).baseline.candidate,'later.txt'),'changed');
  assert.equal(u.inspect(p.planId).passport.ready,false);
  assert.throws(()=>u.verify({planId:p.planId,phase:'baseline'}),/Baseline files changed/);
  assert.throws(()=>u.manualCheck(observation('baseline')),/Baseline files changed/);
});
test('manual-only passports require observations in both phases and a verification sweep',t=>{
  const {u,p,observation}=fixture(t,[manual]);const b=u.verify({planId:p.planId,phase:'baseline'});assert.equal(b.results.length,0);
  u.manualCheck(observation());assert.equal(u.verify({planId:p.planId}).passed,false);
  u.manualCheck(observation('baseline'));assert.equal(u.inspect(p.planId).passport.ready,true);
  assert.equal(u.verify({planId:p.planId}).passed,true);
});
test('invalid or duplicate requirements are rejected before creating worktrees; legacy plans remain explicit',t=>{
  const {u,p,git,repo}=fixture(t,[]);const before=git('worktree','list','--porcelain');
  const invalidIds=[
    [{...preserve,requirementId:['payment']}],
    [{...preserve,requirementId:123}],
    [{...preserve,requirementId:{id:'payment'}}],
    [{...manual,checkId:['scroll-position']}],
    [{...manual,checkId:123}],
    [{...preserve,requirementId:['payment']},{...preserve,requirementId:['payment']}],
  ];
  for(const requirements of [[preserve,preserve],[{...manual,command:command('true')}],[{...manual,checkId:'../bad'}],[{...preserve,kind:'anything'}],[{...preserve,command:[]}],[{...preserve,unknown:'x'}],...invalidIds])
    assert.throws(()=>u.prepare({remove:['registration'],instruction:'Guest',requirements}));
  assert.equal(git('worktree','list','--porcelain'),before);assert.equal(u.inspect(p.planId).passport.state,'not_configured');
  assert.throws(()=>u.verify({planId:p.planId,phase:'baseline'}),/requires a passport/);
  const bin=new URL('../bin/unmix.mjs',import.meta.url).pathname;
  for(const requirements of invalidIds){
    const refused=run(repo,process.execPath,[bin,'prepare','--repo',repo,'--json',JSON.stringify({remove:['registration'],instruction:'Guest',requirements})]);
    assert.equal(refused.ok,false);assert.equal(refused.code,1);
    assert.equal(git('worktree','list','--porcelain'),before);assert.deepEqual(Object.keys(u.load().plans),[p.planId]);
  }
  const cli=run(repo,process.execPath,[bin,'prepare','--repo',repo,'--json',JSON.stringify({remove:['registration'],instruction:'Guest',requirements:[preserve,remove]})]);assert.equal(cli.ok,true,cli.stderr);
  const planId=JSON.parse(cli.stdout).planId;
  let verified=run(repo,process.execPath,[bin,'verify','--repo',repo,'--json',JSON.stringify({planId})]);assert.equal(verified.code,2);
  run(repo,process.execPath,[bin,'verify','--repo',repo,'--json',JSON.stringify({planId,phase:'baseline'})]);
  verified=run(repo,process.execPath,[bin,'verify','--repo',repo,'--json',JSON.stringify({planId})]);assert.equal(verified.ok,true,verified.stderr);
});
test('a removal test missing from the original cannot turn a module launch failure into readiness',t=>{
  const {u,p}=fixture(t,[{...remove,command:[process.execPath,'test/guest.test.mjs']}]);
  fs.writeFileSync(path.join(p.candidate,'test','guest.test.mjs'),"import fs from 'node:fs';if(JSON.parse(fs.readFileSync('app.json')).registration)process.exit(1);\n");
  const baseline=u.verify({planId:p.planId,phase:'baseline'});assert.equal(baseline.results[0].code,1);
  assert.match(baseline.results[0].stderr,/MODULE_NOT_FOUND/);
  const candidate=u.verify({planId:p.planId});assert.equal(candidate.checksPassed,true);assert.equal(candidate.passed,false);
  const row=candidate.passport.requirements[0];assert.equal(row.baseline.state,'error');assert.equal(row.baseline.reason,'missing_failure_marker');
  assert.equal(row.state,'error');assert.equal(candidate.passport.ready,false);
  assert.equal(candidate.passport.repairRequests[0].expectedFailureMarker,expectedFailureMarker('guest'));
  assert.match(candidate.passport.repairRequests[0].action,/startup\/import errors/);
});
test('removal failure markers must match the exact requirement and a separate stdout line',t=>{
  const valid=expectedFailureMarker('guest');
  for(const output of ['',`prefix ${valid}`,`${valid} suffix`,expectedFailureMarker('another'),'UNMIX_EXPECTED_FAILURE:guest-extra']){
    const criterion=[process.execPath,'-e',`const app=JSON.parse(require('fs').readFileSync('app.json'));if(app.registration){console.log(${JSON.stringify(output)});process.exit(1)}`];
    const {u,p}=fixture(t,[{...remove,command:criterion}]);u.verify({planId:p.planId,phase:'baseline'});
    const result=u.verify({planId:p.planId});assert.equal(result.passport.ready,false);
    assert.equal(result.passport.requirements[0].baseline.reason,'missing_failure_marker');
  }
  for(const output of [`${valid}\n`,`other line\r\n${valid}\r\n`]){
    const criterion=[process.execPath,'-e',`const app=JSON.parse(require('fs').readFileSync('app.json'));if(app.registration){process.stdout.write(${JSON.stringify(output)});process.exit(1)}`];
    const {u,p}=fixture(t,[{...remove,command:criterion}]);u.verify({planId:p.planId,phase:'baseline'});
    assert.equal(u.verify({planId:p.planId}).passport.ready,true);
  }
  const stderrCriterion=[process.execPath,'-e',`const app=JSON.parse(require('fs').readFileSync('app.json'));if(app.registration){console.error(${JSON.stringify(valid)});process.exit(1)}`];
  const {u,p}=fixture(t,[{...remove,command:stderrCriterion}]);u.verify({planId:p.planId,phase:'baseline'});
  assert.equal(u.verify({planId:p.planId}).passport.requirements[0].baseline.reason,'missing_failure_marker');
});
test('a lost retained behavior produces a repair request; fixing code restores readiness without changing obligations',t=>{
  const {u,p}=fixture(t);u.verify({planId:p.planId,phase:'baseline'});const frozen=JSON.stringify(u.getPlan(p.planId).requirements);
  fs.writeFileSync(path.join(p.candidate,'app.json'),JSON.stringify({registration:false,payment:false}));
  const failed=u.verify({planId:p.planId});assert.equal(failed.passed,false);
  assert.equal(failed.passport.requirements[0].state,'failed');assert.equal(failed.passport.requirements[1].state,'passed');
  assert.equal(failed.passport.repairRequests[0].requirementId,'payment');
  fs.writeFileSync(path.join(p.candidate,'app.json'),JSON.stringify({registration:false,payment:true}));
  assert.equal(u.verify({planId:p.planId}).passed,true);assert.equal(JSON.stringify(u.getPlan(p.planId).requirements),frozen);
});
test('published fixture demonstrates missing manual evidence, a broken behavior and repaired readiness honestly',async t=>{
  const {passportExample}=await import('../examples/passport.mjs');const root=fs.mkdtempSync(path.join(os.tmpdir(),'unmix-passport-example-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const dest=path.join(root,'demo');const r=passportExample(dest);
  assert.equal(r.missingManual.checksPassed,true);assert.equal(r.missingManual.ready,false);
  assert.equal(r.broken.requirements.find(v=>v.id==='payment').result,'failed');
  assert.equal(r.broken.requirements.find(v=>v.id==='scroll').result,'stale');assert.equal(r.repaired.ready,true);
  assert.match(fs.readFileSync(path.join(dest,'passport.md'),'utf8'),/not a human|synthetic/i);assert.throws(()=>passportExample(dest),/EEXIST/);
});
