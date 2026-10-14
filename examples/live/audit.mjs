import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Unmix,run} from '../../src/core.mjs';
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export function fingerprint(repo) {
  const g = args => {const r=run(repo,'git',args); assert.equal(r.ok,true,r.stderr); return r.stdout;};
  const files = g(['ls-files','--cached','--others','--exclude-standard','-z']).split('\0').filter(Boolean);
  return {head:g(['rev-parse','HEAD']),index:g(['ls-files','--stage','-z']),status:g(['status','--porcelain=v1','-z']),
    files:Object.fromEntries([...new Set(files)].sort().map(f=>[f,hash(path.join(repo,f))]))};
}
export function audit(live,before) {
  const repo = path.join(live,'notebook');
  assert.deepEqual(fingerprint(repo),before.original,'Original files, HEAD, index or status changed during reconstruction');
  assert.equal(hash(path.join(live,'oracle.mjs')),before.oracle,'External oracle was changed');
  const app=new Unmix(repo), ledger=app.load();
  assert.deepEqual(ledger.tasks.map(t=>t.taskId),['identity','tags','normalization','export']);
  assert.equal(ledger.active,null);
  const plans=Object.values(ledger.plans); assert.equal(plans.length,1);
  const p=app.inspect(plans[0].planId);
  assert.deepEqual(p.remove,['identity']);
  assert.equal(p.status,'checks_passed'); assert.equal(p.verificationStale,false);
  assert.ok(p.tasks.some(t=>t.replay==='adapted'));
  for(const name of ['tags','normalization','export']) {
    assert.equal(hash(path.join(p.candidate,`${name}.test.mjs`)),before.original.files[`${name}.test.mjs`],`${name} tests were changed`);
  }
  const oracle=run(p.candidate,process.execPath,[path.join(live,'oracle.mjs')]);
  assert.equal(oracle.ok,true,oracle.stderr);
  const regression=run(p.candidate,process.execPath,['--test']);
  assert.equal(regression.ok,true,regression.stdout+regression.stderr);
  const messages=fs.readFileSync(path.join(live,'evidence/mcp.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  const calls=messages.filter(m=>m.direction==='request'&&m.message.method==='tools/call').map(m=>m.message.params);
  for(const name of ['unmix_init','unmix_begin','unmix_finish','unmix_timeline','unmix_prepare','unmix_codex_prompt','unmix_resume','unmix_verify','unmix_inspect']) assert.ok(calls.some(c=>c.name===name),`Missing live MCP call ${name}`);
  const report={liveCodexInvocation:true,originalUnchanged:true,retainedTestsUnchanged:true,oracleUnchanged:true,
    planId:p.planId,candidate:p.candidate,removed:p.remove,adaptations:p.tasks.filter(t=>t.replay==='adapted').map(t=>({taskId:t.taskId,note:t.adaptationNote})),
    verification:p.verification,independentOracle:oracle,allCandidateTests:regression,mcpCallCount:calls.length,
    scope:'One synthetic notebook; agent-authored tasks and repairs. No claim of general semantic correctness.'};
  fs.writeFileSync(path.join(live,'evidence/report.json'),JSON.stringify(report,null,2)+'\n');
  fs.writeFileSync(path.join(live,'evidence/candidate.diff'),p.diff);
  return report;
}
export function capture(live) {
  return {original:fingerprint(path.join(live,'notebook')),oracle:hash(path.join(live,'oracle.mjs'))};
}
