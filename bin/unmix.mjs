#!/usr/bin/env node
import fs from 'node:fs';
import { Unmix } from '../src/core.mjs';
import { serve } from '../src/mcp.mjs';

const args = process.argv.slice(2);
const command = args.shift();
let repo = process.cwd(), payload = '{}';
const help = `Unmix 0.1.8 — task-aware reconstruction for Codex
Usage: node bin/unmix.mjs COMMAND --repo /absolute/repository [--json JSON | --input request.json]
Commands: init, begin, finish, timeline, preview, prepare, resume, verify, inspect, report, manual-check, prompt, mcp
begin:   {taskId,title,intent,dependsOn?:[],checks?:[[command,arg,...]]}
prepare: {remove:[taskId],instruction,output?:absolutePath,checks?:[[command,arg,...]],protectedFiles?:[relativePath],expectedTimeline?:fingerprint,requirements?:[{requirementId,title,kind:"preserve"|"remove",command?:[cmd,...],checkId?:id,procedure?:text}]}
preview: {remove:[taskId],format?:"json"|"markdown"} — read-only dependency/file impact before reconstruction
resume:  {planId,note}
verify: {planId,phase?:"baseline"|"candidate"}
inspect / prompt: {planId}
report: {planId,format?:"json"|"markdown"} — task-grouped review without executing checks
manual-check: {planId,checkId,title,procedure,result:"passed"|"failed",observer,note,expectedTree,evidence?:[],phase?:"baseline"|"candidate"}
See docs/codex.md for MCP registration and agent instructions.`;
try {
  while (args.length) {
    const flag = args.shift();
    if (!['--repo', '--json', '--input'].includes(flag)) throw new Error(`Unknown option: ${flag}`);
    const value = args.shift();
    if (typeof value !== 'string' || !value.trim() || value.startsWith('--')) throw new Error(`Option ${flag} requires a value.`);
    if (flag === '--repo') repo = value;
    else if (flag === '--json') payload = value;
    else payload = fs.readFileSync(value, 'utf8');
  }
  if (!command || command === 'help' || command === '--help') console.log(help);
  else if (command === 'mcp') serve(repo);
  else {
    const app = new Unmix(repo), input = JSON.parse(payload);
    if (!['init', 'begin', 'finish', 'timeline', 'preview', 'prepare', 'resume', 'verify', 'inspect', 'report', 'manual-check', 'prompt'].includes(command)) throw new Error('Unknown command.');
    const method = command === 'manual-check' ? 'manualCheck' : command;
    const r = ['inspect', 'prompt'].includes(command) ? app[command](input.planId) : app[method](input);
    console.log(typeof r === 'string' ? r : JSON.stringify(r, null, 2));
    if (command === 'verify' && !r.passed) process.exitCode = 2;
  }
} catch (e) { console.error(e.message); process.exitCode = 1; }
