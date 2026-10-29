import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Unmix, run } from '../src/core.mjs';
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'unmix-checkpoint-')),repo=path.join(root,'repo');fs.mkdirSync(repo);t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const git=(...a)=>{let r=run(repo,'git',a);assert.equal(r.ok,true,r.stderr);return r.stdout;};git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');fs.writeFileSync(path.join(repo,'base.txt'),'base');git('add','.');git('commit','-qm','base');let u=new Unmix(repo);u.init();const write=(f,s)=>fs.writeFileSync(path.join(repo,f),s);return{u,repo,root,git,write};}
test('one post-edit checkpoint records staged/unstaged changes without altering HEAD, source or real index',t=>{
 const {u,git,write,repo}=fixture(t);const head=git('rev-parse','HEAD');write('base.txt','staged');git('add','base.txt');const index=git('write-tree');write('base.txt','unstaged');write('new.txt','new');
 const task=u.checkpoint({title:'Completed change'});assert.equal(task.intent,'Completed change');assert.match(task.taskId,/^task-/);assert.equal(task.recordingMode,'checkpoint');assert.equal(git('write-tree'),index);assert.equal(git('rev-parse','HEAD'),head);assert.equal(fs.readFileSync(path.join(repo,'base.txt'),'utf8'),'unstaged');assert.deepEqual(task.files,['base.txt','new.txt']);assert.equal(u.timeline().active,null);
});
test('checkpoint chunks mix with begin/finish and retain explicit dependencies/checks',t=>{
 const {u,write}=fixture(t);write('a.txt','a');let a=u.checkpoint({taskId:'a',title:'A'});u.begin({taskId:'b',title:'B',intent:'B',dependsOn:[a.taskId]});write('b.txt','b');u.finish();write('c.txt','c');let c=u.checkpoint({taskId:'c',title:'C',intent:'Keep C',dependsOn:['b','b'],checks:[[process.execPath,'-e','process.exit(0)']]});assert.deepEqual(c.dependsOn,['b']);assert.equal(u.timeline().tasks.length,3);let p=u.prepare({remove:['a'],instruction:'Keep rest'});assert.equal(p.blocked.taskId,'b');
});
test('unknown dependencies, invalid metadata, empty changes and an active task are refused',t=>{
 const {u,write}=fixture(t);const before=fs.readFileSync(u.file,'utf8');for(const args of [{title:'X',taskId:[]},{title:'X',dependsOn:['missing']},{title:''},{title:'X',checks:[['node',null]]}])assert.throws(()=>u.checkpoint(args));assert.throws(()=>u.checkpoint({title:'Empty'}),/no file changes/);assert.equal(fs.readFileSync(u.file,'utf8'),before);u.begin({taskId:'a',title:'A',intent:'A'});write('a.txt','a');assert.throws(()=>u.checkpoint({title:'Not a separate task'}),/still active/);
});
test('checkpoint requires a known clean starting ledger; no retrospective intent inference',t=>{
 const {u,write}=fixture(t);fs.unlinkSync(u.file);write('pending.txt','pending');assert.throws(()=>u.checkpoint({title:'Unknown past'}),/init first/);assert.throws(()=>u.init(),/Commit or remove/);
});
test('undeclared retained file dependency applies cleanly but runtime checks fail, never verified by patch success',t=>{
 const {u,write,repo,git}=fixture(t);write('settings.json','{"factor":2}');u.checkpoint({taskId:'settings',title:'Temporary settings'});
 write('consumer.cjs',"const fs=require('fs');module.exports=()=>JSON.parse(fs.readFileSync('settings.json')).factor*3;\n");
 u.checkpoint({taskId:'consumer',title:'Retain calculation',checks:[[process.execPath,'-e',"if(require('./consumer.cjs')()!==6)process.exit(1)"]]});const head=git('rev-parse','HEAD'),index=git('write-tree');
 let p=u.prepare({remove:['settings'],instruction:'Keep calculation without temporary settings'});assert.equal(p.status,'ready_for_checks');assert.equal(p.tasks[0].replay,'replayed');assert.deepEqual(p.tasks[0].dependsOn,[]);
 let v=u.verify({planId:p.planId});assert.equal(v.passed,false);assert.match(v.results[0].stderr,/ENOENT.*settings.json|settings.json/s);let r=u.report({planId:p.planId});assert.equal(r.checks.state,'failed');assert.equal(r.status,'checks_failed');assert.equal(git('rev-parse','HEAD'),head);assert.equal(git('write-tree'),index);assert.equal(fs.existsSync(path.join(repo,'settings.json')),true);
});
test('title-only CLI records completed work and refuses mixed request formats',t=>{
 const {u,repo,write}=fixture(t);const bin=new URL('../bin/unmix.mjs',import.meta.url).pathname;write('done.txt','done');let r=run(repo,process.execPath,[bin,'checkpoint','--repo',repo,'--title','Completed chunk']);assert.equal(r.ok,true,r.stderr);assert.equal(JSON.parse(r.stdout).title,'Completed chunk');assert.equal(u.timeline().tasks.length,1);
 for(const args of [['checkpoint','--title','X','--json','{}'],['begin','--title','X']])assert.equal(run(repo,process.execPath,[bin,...args,'--repo',repo]).ok,false);
});
