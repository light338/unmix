import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../src/core.mjs';

test('MCP client handshake, tool discovery, recording, reconstruction and verification', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unmix-mcp-')); const repo = path.join(dir, 'repo'); fs.mkdirSync(repo);
  for (const args of [['init', '-q'], ['config', 'user.name', 'Test'], ['config', 'user.email', 'test@example.invalid']]) assert.equal(run(repo, 'git', args).ok, true);
  fs.writeFileSync(path.join(repo, 'base.txt'), 'base'); run(repo, 'git', ['add', '.']); run(repo, 'git', ['commit', '-qm', 'base']);
  const bin = fileURLToPath(new URL('../bin/unmix.mjs', import.meta.url));
  const child = spawn(process.execPath, [bin, 'mcp', '--repo', repo], { stdio: ['pipe', 'pipe', 'pipe'] });
  let sequence = 0; const waiting = new Map(); let stderr = '';
  child.stderr.on('data', data => stderr += data);
  readline.createInterface({ input: child.stdout }).on('line', line => {
    const response = JSON.parse(line); waiting.get(response.id)?.(response); waiting.delete(response.id);
  });
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => reject(new Error('MCP timeout')), 5000);
    waiting.set(id, response => { clearTimeout(timer); resolve(response); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const tool = async (name, args = {}) => {
    const response = await request('tools/call', { name, arguments: args });
    assert.equal(response.result?.isError, undefined, JSON.stringify(response));
    return JSON.parse(response.result.content[0].text);
  };
  t.after(() => { child.kill(); fs.rmSync(dir, { recursive: true, force: true }); });
  assert.equal((await request('tools/list')).error.code, -32000);
  const init = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test-client', version: '1' } });
  assert.equal(init.result.protocolVersion, '2025-06-18');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  assert.equal((await request('tools/list')).result.tools.length, 9);
  assert.equal((await request('ping')).result.constructor, Object);
  await tool('unmix_init');
  await tool('unmix_begin', { taskId: 'drop', title: 'Drop', intent: 'Temporary file' });
  fs.writeFileSync(path.join(repo, 'drop.txt'), 'drop'); await tool('unmix_finish');
  const plan = await tool('unmix_prepare', { remove: ['drop'], instruction: 'Remove the temporary file', checks: [['node', '-e', "if(require('fs').existsSync('drop.txt'))process.exit(1)"]] });
  assert.equal((await tool('unmix_verify', { planId: plan.planId })).passed, true);
  assert.equal((await tool('unmix_inspect', { planId: plan.planId })).status, 'checks_passed');
  const invalid = await request('tools/call', { name: 'unmix_begin', arguments: { taskId: 'x', title: 'x', intent: 'x', repo: '/' } });
  assert.equal(invalid.result.isError, true);
  assert.equal((await request('tools/call', { name: 'missing' })).error.code, -32602);
  assert.equal(stderr, '');
});
