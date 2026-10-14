import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runDemo } from '../examples/demo.mjs';

test('five intertwined tasks: remove registration, retain four behaviors and original project', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unmix-full-demo-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const r = runDemo(dir);
  assert.equal(r.originalUnchanged, true);
  assert.equal(r.recordedTasks, 5); assert.equal(r.passedChecks, 5);
  assert.ok(r.blocks.some(b => b.taskId === 'payment'));
  assert.equal(r.liveCodexInvocation, false);
  const candidate = fs.readFileSync(path.join(r.candidate, 'shop.mjs'), 'utf8');
  assert.doesNotMatch(candidate, /Account required|function register|<<<<<<<|>>>>>>>/);
  assert.match(candidate, /Math.round/); assert.match(candidate, /function receipt/);
});
