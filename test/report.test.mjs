import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Unmix, run } from '../src/core.mjs';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unmix-report-'));
  const repo = path.join(dir, 'repo'); fs.mkdirSync(repo);
  const git = (...args) => { const r = run(repo, 'git', args); assert.equal(r.ok, true, r.stderr); return r.stdout.trim(); };
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  const write = (file, value) => fs.writeFileSync(path.join(repo, file), value);
  write('app.mjs', 'export const value = 0;\n'); git('add', '.'); git('commit', '-qm', 'base');
  const u = new Unmix(repo); u.init();
  const task = (taskId, file, value, options = {}) => {
    u.begin({ taskId, title: taskId, intent: `Retain ${taskId}`, ...options }); write(file, value); return u.finish();
  };
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, repo, git, write, task, u };
}

test('task review separates original/result patches, incremental blockers and pending work before checks', t => {
  const { dir, repo, git, task, u } = fixture(t);
  const checkMarker = path.join(dir, 'checks-ran');
  task('drop', 'app.mjs', 'export const value = 1;\n');
  task('style', 'style.css', 'body { color: green; }\n');
  task('value', 'app.mjs', 'export const value = 2;\n', { dependsOn: ['drop'], checks: [[process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(checkMarker)},'yes')`]] });
  task('dependent', 'client.txt', 'client\n', { dependsOn: ['drop'] });
  task('last', 'last.txt', 'last\n');
  const p = u.prepare({ remove: ['drop'], instruction: 'Remove intermediate decision; preserve other behavior.' });
  const original = () => [git('rev-parse', 'HEAD'), git('write-tree'), git('status', '--porcelain'), fs.readFileSync(path.join(repo, 'app.mjs'), 'utf8')];
  const before = original(); const ledger = fs.readFileSync(u.file, 'utf8');
  let r = u.report({ planId: p.planId });
  assert.equal(r.checks.state, 'not_run'); assert.equal(fs.existsSync(checkMarker), false);
  assert.deepEqual(original(), before); assert.equal(fs.readFileSync(u.file, 'utf8'), ledger);
  assert.equal(r.tasks[0].outcome, 'replayed'); assert.match(r.tasks[0].result.diff, /color: green/);
  assert.equal(r.tasks[1].outcome, 'needs_adaptation'); assert.equal(r.tasks[1].result, null);
  assert.equal(r.blocked.kind, 'patch_conflict'); assert.deepEqual(r.blocked.removedDependencies, ['drop']);
  assert.equal(r.tasks[2].outcome, 'pending'); assert.equal(r.tasks[3].resultAvailability, 'not_completed');
  assert.equal(r.removedTasks[0].outcome, 'removed');
  assert.throws(() => u.verify({ planId: p.planId }), /Resolve/);
  fs.writeFileSync(path.join(p.candidate, 'app.mjs'), 'export const value = 2; // adapted for guests\n');
  assert.equal(run(p.candidate, 'git', ['add', 'app.mjs']).ok, true);
  u.resume({ planId: p.planId, note: 'Retain value two for guests.' });
  r = u.report({ planId: p.planId });
  assert.equal(r.blocked.kind, 'removed_dependency');
  assert.equal(r.tasks[1].blockers[0].kind, 'patch_conflict');
  assert.match(r.tasks[1].original.diff, /-export const value = 1/);
  assert.match(r.tasks[1].result.diff, /-export const value = 0/);
  assert.match(r.tasks[1].result.diff, /adapted for guests/);
  assert.equal(r.tasks[1].adaptationNote, 'Retain value two for guests.');
  assert.equal(r.tasks[2].result, null); assert.equal(r.tasks[3].outcome, 'pending');
  u.resume({ planId: p.planId, note: 'Client remains usable without the removed dependency.' });
  r = u.report({ planId: p.planId });
  assert.equal(r.blocked, null); assert.equal(r.tasks[2].blockers[0].kind, 'removed_dependency');
  assert.equal(r.tasks[3].outcome, 'replayed'); assert.equal(r.unattributed.diff, '');
  assert.equal(fs.existsSync(checkMarker), false);
  assert.equal(u.verify({ planId: p.planId }).passed, true);
  fs.writeFileSync(path.join(p.candidate, 'extra.txt'), 'untracked review evidence\n');
  r = u.report({ planId: p.planId });
  assert.equal(r.checks.state, 'stale'); assert.equal(r.status, 'checks_stale');
  assert.match(r.unattributed.diff, /untracked review evidence/); assert.match(r.aggregateDiff, /extra.txt/);
  assert.doesNotMatch(r.tasks[3].result.diff, /extra.txt/);
  const markdown = u.report({ planId: p.planId, format: 'markdown' });
  assert.match(markdown, /### value — adapted/); assert.match(markdown, /Blocker: patch_conflict/);
  assert.match(markdown, /Checks: stale/); assert.match(markdown, /## Intentionally removed tasks/);
});

test('later overwrites preserve historical task deltas rather than claim final line ownership', t => {
  const { u, task } = fixture(t);
  task('drop', 'drop.txt', 'drop'); task('one', 'app.mjs', 'export const value = 1;\n');
  task('two', 'app.mjs', 'export const value = 2;\n');
  const p = u.prepare({ remove: ['drop'], instruction: 'Keep sequential values.' });
  const r = u.report({ planId: p.planId });
  assert.match(r.tasks[0].result.diff, /\+export const value = 1/);
  assert.match(r.tasks[1].result.diff, /-export const value = 1/);
  assert.match(r.aggregateDiff, /\+export const value = 2/);
  assert.doesNotMatch(r.aggregateDiff, /\+export const value = 1/);
  assert.match(r.scope, /later tasks can overwrite/);
});

test('legacy plans report unavailable result attribution without fabricating snapshot pairs', t => {
  const { u, task } = fixture(t);
  task('drop', 'drop.txt', 'drop'); task('keep', 'keep.txt', 'keep');
  const p = u.prepare({ remove: ['drop'], instruction: 'Keep one task.' });
  const ledger = u.load(); delete ledger.plans[p.planId].reportVersion;
  for (const task of ledger.plans[p.planId].tasks) { delete task.replayBefore; delete task.replayAfter; }
  fs.writeFileSync(u.file, JSON.stringify(ledger));
  const r = u.report({ planId: p.planId });
  assert.equal(r.tasks[0].result, null); assert.equal(r.tasks[0].resultAvailability, 'unavailable_legacy_plan');
  assert.equal(r.unattributed.diff, null); assert.match(r.aggregateDiff, /keep.txt/);
  assert.match(u.report({ planId: p.planId, format: 'markdown' }), /Unavailable for this legacy plan/);
  assert.throws(() => u.report({ planId: p.planId, format: 'html' }), /format/);
});

test('CLI emits Markdown; report retains binary diffs without running checks', t => {
  const { u, task, repo } = fixture(t);
  task('drop', 'drop.txt', 'drop');
  task('binary', 'asset.bin', Buffer.from([0, 1, 255]));
  const p = u.prepare({ remove: ['drop'], instruction: 'Retain binary evidence.' });
  const r = u.report({ planId: p.planId });
  assert.match(r.tasks[0].original.diff, /GIT binary patch/);
  assert.match(r.tasks[0].result.diff, /GIT binary patch/);
  const cli = run(repo, process.execPath, [new URL('../bin/unmix.mjs', import.meta.url).pathname, 'report', '--repo', repo, '--json', JSON.stringify({ planId: p.planId, format: 'markdown' })]);
  assert.equal(cli.ok, true, cli.stderr); assert.match(cli.stdout, /# Unmix task review/);
});
