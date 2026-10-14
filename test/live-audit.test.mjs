import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Unmix,run} from '../src/core.mjs';
import {setupFixture} from '../examples/live/fixture.mjs';
import {capture,audit} from '../examples/live/audit.mjs';

test('live evidence audit rejects a passing candidate with weakened retained tests', t => {
  // This is an auditor regression fixture, not evidence of a live model run.
  const live=fs.mkdtempSync(path.join(os.tmpdir(),'unmix-live-audit-'));
  t.after(()=>fs.rmSync(live,{recursive:true,force:true}));
  const repo=setupFixture(live), app=new Unmix(repo);
  app.init();
  for(const taskId of ['identity','tags','normalization','export']) {
    app.begin({taskId,title:taskId,intent:taskId,dependsOn:taskId==='tags'?['identity']:[],checks:[['node','--test',`${taskId}.test.mjs`]]});
    fs.writeFileSync(path.join(repo,`${taskId}.test.mjs`),'import assert from "node:assert/strict"; assert.equal(2 + 2, 4);\n');
    app.finish();
  }
  const before=capture(live);
  const plan=app.prepare({remove:['identity'],instruction:'Remove identity, retain checks'});
  app.resume({planId:plan.planId,note:'Regression fixture: no semantic repair needed for independent assertion files'});
  fs.writeFileSync(path.join(plan.candidate,'tags.test.mjs'),'// All assertions removed\n');
  assert.equal(app.verify({planId:plan.planId}).passed,true);
  assert.throws(()=>audit(live,before),/tags tests were changed/);
});

test('live audit detects original index edits and external oracle tampering', t => {
  const live=fs.mkdtempSync(path.join(os.tmpdir(),'unmix-live-integrity-'));
  t.after(()=>fs.rmSync(live,{recursive:true,force:true}));
  const repo=setupFixture(live), before=capture(live);
  fs.writeFileSync(path.join(repo,'notes.mjs'),'changed\n');
  assert.equal(run(repo,'git',['add','notes.mjs']).ok,true);
  assert.throws(()=>audit(live,before),/Original files, HEAD, index or status changed/);
  assert.equal(run(repo,'git',['reset','--hard','HEAD']).ok,true);
  fs.appendFileSync(path.join(live,'oracle.mjs'),'// altered\n');
  assert.throws(()=>audit(live,before),/External oracle was changed/);
});
