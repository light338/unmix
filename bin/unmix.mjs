#!/usr/bin/env node
import fs from 'node:fs';
import { Unmix } from '../src/core.mjs';
import { serve } from '../src/mcp.mjs';

const args = process.argv.slice(2);
const command = args.shift();
let repo = process.cwd(), payload = '{}';
while (args.length) {
  const flag = args.shift();
  if (flag === '--repo') repo = args.shift();
  else if (flag === '--json') payload = args.shift();
  else if (flag === '--input') payload = fs.readFileSync(args.shift(), 'utf8');
  else { console.error(`Unknown option: ${flag}`); process.exit(1); }
}
const help = `Unmix 0.1.5 — task-aware reconstruction for Codex
Usage: node bin/unmix.mjs COMMAND --repo /absolute/repository [--json JSON | --input request.json]
Commands: init, begin, finish, timeline, prepare, resume, verify, inspect, report, manual-check, prompt, mcp
begin:   {taskId,title,intent,dependsOn?:[],checks?:[[command,arg,...]]}
prepare: {remove:[taskId],instruction,output?:absolutePath,checks?:[[command,arg,...]],protectedFiles?:[relativePath]}
resume:  {planId,note}
verify / inspect / prompt: {planId}
report: {planId,format?:"json"|"markdown"} — task-grouped review without executing checks
manual-check: {planId,checkId,title,procedure,result:"passed"|"failed",observer,note,expectedTree,evidence?:[]}
See docs/codex.md for MCP registration and agent instructions.`;
try {
  if (!command || command === 'help' || command === '--help') console.log(help);
  else if (command === 'mcp') serve(repo);
  else {
    const app = new Unmix(repo), input = JSON.parse(payload);
    if (!['init', 'begin', 'finish', 'timeline', 'prepare', 'resume', 'verify', 'inspect', 'report', 'manual-check', 'prompt'].includes(command)) throw new Error('Unknown command.');
    const method = command === 'manual-check' ? 'manualCheck' : command;
    const r = ['inspect', 'prompt'].includes(command) ? app[command](input.planId) : app[method](input);
    console.log(typeof r === 'string' ? r : JSON.stringify(r, null, 2));
    if (command === 'verify' && !r.passed) process.exitCode = 2;
  }
} catch (e) { console.error(e.message); process.exitCode = 1; }
