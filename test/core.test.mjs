import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Unmix, run } from '../src/core.mjs';

export function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unmix-test-'));
  const repo = path.join(dir, 'repo'); fs.mkdirSync(repo);
  const g = (...args) => { const r = run(repo, 'git', args); assert.equal(r.ok, true, r.stderr); return r.stdout.trim(); };
  g('init', '-q'); g('config', 'user.name', 'Test'); g('config', 'user.email', 'test@example.invalid');
  fs.writeFileSync(path.join(repo, 'app.mjs'), 'export const value = 0;\n');
  g('add', '.'); g('commit', '-qm', 'base');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const u = new Unmix(repo); u.init();
  return { dir, repo, g, u, write: (name, s) => fs.writeFileSync(path.join(repo, name), s) };
}
test('records staged and unstaged edits without changing branch or user index', t => {
  const { u, g, write } = fixture(t); const head = g('rev-parse', 'HEAD');
  u.begin({ taskId: 'one', title: 'One', intent: 'Change the value.' });
  write('app.mjs', 'export const value = 1;\n'); g('add', 'app.mjs');
  const index = g('write-tree'); write('app.mjs', 'export const value = 2;\n');
  const task = u.finish();
  assert.equal(g('write-tree'), index); assert.equal(g('rev-parse', 'HEAD'), head);
  assert.match(g('show', `${task.after}:app.mjs`), /value = 2/);
});
test('removes a task and replays independent behavior, checks freshness', t => {
  const { u, write, g, repo } = fixture(t);
  u.begin({ taskId: 'drop', title: 'Drop', intent: 'Add temporary file.' }); write('temporary.txt', 'drop'); u.finish();
  u.begin({ taskId: 'keep', title: 'Keep', intent: 'Return value 7.', checks: [['node', '-e', "import('./app.mjs').then(m=>{if(m.value!==7)process.exit(1)})"]] });
  write('app.mjs', 'export const value = 7;\n'); u.finish();
  const original = fs.readFileSync(path.join(repo, 'app.mjs'), 'utf8'), head = g('rev-parse', 'HEAD');
  const p = u.prepare({ remove: ['drop'], instruction: 'Remove the temporary file and retain value seven.' });
  assert.equal(p.status, 'ready_for_checks'); assert.equal(fs.existsSync(path.join(p.candidate, 'temporary.txt')), false);
  assert.equal(u.verify({ planId: p.planId }).passed, true);
  fs.writeFileSync(path.join(p.candidate, 'app.mjs'), 'export const value = 8;\n');
  assert.equal(u.inspect(p.planId).status, 'checks_stale');
  assert.equal(fs.readFileSync(path.join(repo, 'app.mjs'), 'utf8'), original); assert.equal(g('rev-parse', 'HEAD'), head);
});
test('overlapping edits block, human or Codex repairs, replay resumes', t => {
  const { u, write, g } = fixture(t);
  u.begin({ taskId: 'drop', title: 'One', intent: 'Change value to one.' }); write('app.mjs', 'export const value = 1;\n'); u.finish();
  u.begin({ taskId: 'keep', title: 'Two', intent: 'Preserve value two.', dependsOn: ['drop'], checks: [['node', '-e', "import('./app.mjs').then(m=>{if(m.value!==2)process.exit(1)})"]] });
  write('app.mjs', 'export const value = 2;\n'); u.finish();
  const p = u.prepare({ remove: ['drop'], instruction: 'Remove the intermediate change but retain value two.' });
  assert.equal(p.status, 'needs_adaptation');
  assert.throws(() => u.verify({ planId: p.planId }), /Resolve/);
  assert.match(u.prompt(p.planId), /PRESERVE/);
  fs.writeFileSync(path.join(p.candidate, 'app.mjs'), 'export const value = 2;\n');
  assert.equal(run(p.candidate, 'git', ['add', 'app.mjs']).ok, true);
  assert.equal(u.resume({ planId: p.planId, note: 'Kept the final behavior without the intermediate task.' }).status, 'ready_for_checks');
  assert.equal(u.verify({ planId: p.planId }).passed, true);
  assert.equal(g('show', 'HEAD:app.mjs'), 'export const value = 0;');
});
test('declared removed dependency stops even when the patch applies cleanly', t => {
  const { u, write } = fixture(t);
  u.begin({ taskId: 'auth', title: 'Auth', intent: 'Require accounts.' }); write('auth.txt', 'accounts'); u.finish();
  u.begin({ taskId: 'payment', title: 'Payment', intent: 'Retain payment.', dependsOn: ['auth'], checks: [['node', '-e', 'process.exit(0)']] }); write('payment.txt', 'payment'); u.finish();
  const p = u.prepare({ remove: ['auth'], instruction: 'Make payment available to guests.' });
  assert.equal(p.blocked.kind, 'removed_dependency');
  assert.deepEqual(p.blocked.removedDependencies, ['auth']);
});
test('rejects invalid IDs, unknown dependencies, unrecorded changes and empty task', t => {
  const { u, write } = fixture(t);
  assert.throws(() => u.begin({ taskId: '../escape', title: 'A', intent: 'B' }), /ID/);
  assert.throws(() => u.begin({ taskId: 'x', title: 'A', intent: 'B', dependsOn: ['missing'] }), /Dependencies/);
  write('extra.txt', 'unrecorded');
  assert.throws(() => u.begin({ taskId: 'x', title: 'A', intent: 'B' }), /Unrecorded/);
  fs.unlinkSync(path.join(u.repo, 'extra.txt')); u.begin({ taskId: 'x', title: 'A', intent: 'B' });
  assert.throws(() => u.finish(), /no file changes/);
});
test('never overwrites an existing candidate, rejects candidate inside original', t => {
  const { u, write, dir, repo } = fixture(t);
  u.begin({ taskId: 'one', title: 'One', intent: 'One' }); write('one.txt', 'one'); u.finish();
  assert.throws(() => u.prepare({ remove: ['one'], instruction: 'Drop one', output: dir }), /must not exist/);
  assert.throws(() => u.prepare({ remove: ['one'], instruction: 'Drop one', output: path.join(repo, 'nested') }), /outside/);
});
test('does not claim verification without checks and reports failures', t => {
  const { u, write } = fixture(t);
  u.begin({ taskId: 'one', title: 'One', intent: 'One' }); write('one.txt', 'one'); u.finish();
  const p = u.prepare({ remove: ['one'], instruction: 'Drop one' });
  assert.throws(() => u.verify({ planId: p.planId }), /No behavioral/);
  const q = u.prepare({ remove: ['one'], instruction: 'Drop one', checks: [['node', '-e', 'process.exit(1)']] });
  assert.equal(u.verify({ planId: q.planId }).passed, false);
});
test('check commands cannot silently rewrite the candidate and pass', t => {
  const { u, write } = fixture(t);
  u.begin({ taskId: 'one', title: 'One', intent: 'One' }); write('one.txt', 'one'); u.finish();
  const p = u.prepare({ remove: ['one'], instruction: 'Drop one', checks: [['node', '-e', "require('fs').writeFileSync('app.mjs','changed')"]] });
  const v = u.verify({ planId: p.planId }); assert.equal(v.passed, false); assert.equal(v.changedDuringChecks, true);
});
test('binary patches and executable modes survive reconstruction', t => {
  const { u, write } = fixture(t);
  u.begin({ taskId: 'drop', title: 'Drop', intent: 'Drop' }); write('drop.txt', 'x'); u.finish();
  u.begin({ taskId: 'asset', title: 'Asset', intent: 'Retain binary and executable.' });
  write('asset.bin', Buffer.from([0, 1, 2, 255])); write('run.sh', '#!/bin/sh\nexit 0\n'); fs.chmodSync(path.join(u.repo, 'run.sh'), 0o755); u.finish();
  const p = u.prepare({ remove: ['drop'], instruction: 'Keep the asset' });
  assert.deepEqual(fs.readFileSync(path.join(p.candidate, 'asset.bin')), Buffer.from([0, 1, 2, 255]));
  assert.ok(fs.statSync(path.join(p.candidate, 'run.sh')).mode & 0o100);
});
test('refuses a candidate replaced by a symlink', t => {
  const { u, write, dir } = fixture(t);
  u.begin({ taskId: 'one', title: 'One', intent: 'One' }); write('one.txt', 'one'); u.finish();
  const p = u.prepare({ remove: ['one'], instruction: 'Drop one', checks: [['node', '-e', 'process.exit(0)']] });
  const moved = path.join(dir, 'moved'); fs.renameSync(p.candidate, moved); fs.symlinkSync(moved, p.candidate);
  assert.throws(() => u.verify({ planId: p.planId }), /symlink/);
});
