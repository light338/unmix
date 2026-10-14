import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {setupFixture} from './live/fixture.mjs';
import {capture,audit} from './live/audit.mjs';
import {Unmix,run} from '../src/core.mjs';
import assert from 'node:assert/strict';

// This runner writes only the base fixture, prompts and independent oracle.
// All task implementations and reconstruction repairs come from real Codex.
const live=path.resolve(process.argv[2]||'unmix-live-evidence');
if(fs.existsSync(live)) throw Error('Evidence directory must not exist.');
const repo=setupFixture(live);
const observer=fileURLToPath(new URL('./live/mcp-observer.mjs',import.meta.url));
const bin=fileURLToPath(new URL('../bin/unmix.mjs',import.meta.url));
const toml=JSON.stringify;
async function session(phase) {
  const args=['exec','--ephemeral','-s',process.env.UNMIX_CODEX_SANDBOX||'workspace-write','-c','approval_policy="never"','-C',repo,'--add-dir',live,'--json',
    '-c',`mcp_servers.unmix.command=${toml(process.execPath)}`,
    '-c',`mcp_servers.unmix.args=${toml([observer,bin,repo,path.join(live,'evidence/mcp.jsonl')])}`,
    '-o',path.join(live,`evidence/${phase}-final.txt`),'-'];
  const child=spawn(process.env.UNMIX_CODEX_BIN||'codex',args,{env:{...process.env,PATH:`${path.dirname(process.execPath)}:${process.env.PATH}`},stdio:['pipe','pipe','pipe']});
  child.stdin.end(fs.readFileSync(path.join(live,`${phase}-prompt.txt`)));
  child.stdout.pipe(fs.createWriteStream(path.join(live,`evidence/${phase}-events.jsonl`)));
  child.stderr.pipe(fs.createWriteStream(path.join(live,`evidence/${phase}-stderr.txt`)));
  await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error(`Codex ${phase} exited ${code}; inspect evidence logs.`)));});
}
console.log(`Recording tasks through live Codex/MCP. Evidence: ${live}`);
await session('record');
const recorded=new Unmix(repo).timeline();
assert.deepEqual(recorded.tasks.map(t=>t.taskId),['identity','tags','normalization','export'],'Codex did not finish recording all tasks; inspect logs before retrying.');
assert.equal(recorded.active,null);
assert.equal(run(repo,'git',['rev-parse','HEAD']).stdout.trim(),recorded.base,'Recording changed original HEAD');
const baseline=run(repo,process.execPath,['--test']);
assert.equal(baseline.ok,true,baseline.stdout+baseline.stderr);
const before=capture(live);
fs.writeFileSync(path.join(live,'evidence/before-removal.json'),JSON.stringify(before,null,2)+'\n');
console.log('Reconstructing through live Codex/MCP.');
await session('remove');
console.log(JSON.stringify(audit(live,before),null,2));
