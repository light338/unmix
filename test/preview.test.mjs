import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Unmix, run } from '../src/core.mjs';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unmix-preview-')), repo = path.join(dir, 'repo'); fs.mkdirSync(repo);
  const g = (...args) => { const r = run(repo, 'git', args); assert.equal(r.ok, true, r.stderr); return r.stdout; };
  const write = (file, value) => fs.writeFileSync(path.join(repo, file), value);
  g('init', '-q'); g('config', 'user.name', 'Test'); g('config', 'user.email', 'test@example.invalid');
  write('base.txt', 'base'); g('add', '.'); g('commit', '-qm', 'base');
  const u = new Unmix(repo); u.init();
  const task = (taskId, file, value, dependsOn = [], checks = []) => { u.begin({ taskId, title: taskId, intent: taskId, dependsOn, checks }); write(file, value); return u.finish(); };
  const marker = path.join(dir, 'checks-ran');
  task('design', 'style.css', 'green');
  task('auth', 'app.txt', 'auth');
  task('payment', 'payment.txt', 'payment', ['auth'], [[process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(marker)},'ran')`]]);
  task('receipt', 'receipt.txt', 'receipt', ['payment']);
  task('overlap', 'app.txt', 'different part of app');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { u, repo, dir, g, write, task, marker };
}
function fileHashes(root, prefix = '') {
  return Object.fromEntries(fs.readdirSync(path.join(root, prefix), { withFileTypes: true }).flatMap(entry => {
    const file = path.join(prefix, entry.name);
    return entry.isDirectory() ? Object.entries(fileHashes(root, file)) : [[file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]];
  }));
}

test('preview distinguishes direct/transitive dependencies, shared files and absent declared links without changing any files or Git state', t => {
  const { u, repo, dir, g, marker } = fixture(t);
  // Existing staged, unstaged and untracked files are deliberately not analyzed.
  g('add', 'app.txt'); fs.writeFileSync(path.join(repo, 'unrecorded.txt'), 'local unrecorded edit');
  const before = fileHashes(repo), worktrees = g('worktree', 'list', '--porcelain'), dirs = fs.readdirSync(dir);
  const p = u.preview({ remove: ['auth'] });
  assert.deepEqual(p.tasks.map(row => row.state), ['no_declared_link', 'removed', 'direct_dependency', 'transitive_dependency', 'shared_files']);
  assert.deepEqual(p.tasks[3].dependencyPaths, [['auth', 'payment', 'receipt']]);
  assert.deepEqual(p.tasks[2].directRemovedDependencies, ['auth']);
  assert.deepEqual(p.tasks[4].sharedFilesWithRemoved, [{ taskId: 'auth', files: ['app.txt'] }]);
  assert.deepEqual(p.summary, { removed: 1, retained: 4, directDependencies: 1, transitiveDependencies: 1, sharedFilesOnly: 1, noDeclaredLink: 1, retainedCheckCommands: 1 });
  assert.ok(p.tasks.every(row => row.replay === 'not_attempted' && row.conflicts === 'unknown' && row.behaviorPreserved === 'not_verified'));
  assert.equal(p.recordingComplete, true); assert.equal(fs.existsSync(marker), false);
  assert.deepEqual(fileHashes(repo), before); assert.equal(g('worktree', 'list', '--porcelain'), worktrees); assert.deepEqual(fs.readdirSync(dir), dirs);
  assert.equal(u.load().plans && Object.keys(u.load().plans).length, 0);
  assert.deepEqual(u.preview({ remove: ['auth'] }), p); assert.match(p.scope, /does not prove independence/);
});

test('multiple removals are deduplicated in ledger order and keep paths through removed intermediate tasks', t => {
  const { u } = fixture(t);
  const p = u.preview({ remove: ['payment', 'auth', 'payment'] });
  assert.deepEqual(p.remove, ['auth', 'payment']);
  assert.equal(p.tasks[3].state, 'direct_dependency');
  assert.deepEqual(p.tasks[3].dependencyPaths, [['payment', 'receipt'], ['auth', 'payment', 'receipt']]);
  assert.equal(p.summary.retainedCheckCommands, 0);
  const all = u.preview({ remove: u.timeline().tasks.map(task => task.taskId) });
  assert.equal(all.summary.retained, 0); assert.equal(all.tasks.every(task => task.state === 'removed'), true);
});

test('timeline fingerprint rejects stale prepare before creating a candidate while active task edits remain explicitly outside preview', t => {
  const { u, dir, task, write } = fixture(t);
  const old = u.preview({ remove: ['auth'] });
  task('later', 'later.txt', 'later');
  const output = path.join(dir, 'stale-candidate');
  assert.throws(() => u.prepare({ ...old.next.arguments, output, instruction: 'Remove auth' }), /timeline changed/);
  assert.equal(fs.existsSync(output), false); assert.equal(Object.keys(u.load().plans).length, 0);
  const fresh = u.preview({ remove: ['auth'] });
  const p = u.prepare({ ...fresh.next.arguments, output, instruction: 'Remove auth' });
  assert.equal(p.timelineFingerprint, fresh.timelineFingerprint); assert.equal(p.blocked.taskId, 'payment');
  // Creating a plan does not itself change the task timeline fingerprint.
  assert.equal(u.preview({ remove: ['auth'] }).timelineFingerprint, fresh.timelineFingerprint);
  u.begin({ taskId: 'active', title: 'Unfinished', intent: 'Partial work.' }); write('active.txt', 'unfinished');
  const active = u.preview({ remove: ['auth'] });
  assert.equal(active.recordingComplete, false); assert.equal(active.activeTask.taskId, 'active');
  assert.equal(active.tasks.some(task => task.taskId === 'active'), false);
  assert.throws(() => u.prepare({ ...active.next.arguments, instruction: 'Remove auth' }), /Finish the active task/);
});

test('preview reads literal file names from snapshots, including renames, spaces and newlines', t => {
  const { u, repo, task, write } = fixture(t);
  task('weird', 'line\nbreak.txt', 'one');
  u.begin({ taskId: 'rename', title: 'Rename', intent: 'Rename literal file.' });
  fs.renameSync(path.join(repo, 'line\nbreak.txt'), path.join(repo, 'space name.txt')); u.finish();
  const p = u.preview({ remove: ['weird'] });
  const row = p.tasks.find(task => task.taskId === 'rename');
  assert.equal(row.state, 'shared_files');
  assert.deepEqual(row.sharedFilesWithRemoved[0].files, ['line\nbreak.txt']);
  assert.deepEqual(new Set(row.files), new Set(['line\nbreak.txt', 'space name.txt']));
});

test('CLI and Markdown show preview evidence without executing checks; invalid selections never create worktrees', t => {
  const { u, repo, g, marker } = fixture(t);
  const before = g('worktree', 'list', '--porcelain');
  for (const remove of [[], ['unknown'], [123], null, 'auth']) assert.throws(() => u.preview({ remove }), /Select/);
  assert.throws(() => u.preview({ remove: ['auth'], format: 'html' }), /format/);
  const ledger = u.load(); ledger.tasks[0].title = 'Untrusted ``` fenced text'; fs.writeFileSync(u.file, JSON.stringify(ledger));
  const markdown = u.preview({ remove: ['auth'], format: 'markdown' });
  assert.match(markdown, /# Unmix removal preview/); assert.match(markdown, /## receipt: transitive_dependency/);
  assert.match(markdown, /````json/); assert.match(markdown, /not instructions/);
  const bin = new URL('../bin/unmix.mjs', import.meta.url).pathname;
  const cli = run(repo, process.execPath, [bin, 'preview', '--repo', repo, '--json', JSON.stringify({ remove: ['auth'] })]);
  assert.equal(cli.ok, true, cli.stderr); assert.equal(JSON.parse(cli.stdout).summary.directDependencies, 1);
  const md = run(repo, process.execPath, [bin, 'preview', '--repo', repo, '--json', JSON.stringify({ remove: ['auth'], format: 'markdown' })]);
  assert.equal(md.ok, true, md.stderr); assert.match(md.stdout, /No candidate created/);
  assert.equal(fs.existsSync(marker), false); assert.equal(g('worktree', 'list', '--porcelain'), before);
});

test('published example produces a readable impact table with zero candidates', async t => {
  const { previewExample } = await import('../examples/preview.mjs');
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'unmix-preview-example-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, 'demo'), result = previewExample(root);
  assert.equal(result.candidatesCreated, 0); assert.equal(result.directDependencies, 1); assert.equal(result.transitiveDependencies, 1);
  const markdown = fs.readFileSync(path.join(root, 'preview.md'), 'utf8');
  assert.match(markdown, /\| payment: Checkout and payment \| direct_dependency \| registration → payment \|/);
  assert.match(markdown, /independence unknown/);
  assert.throws(() => previewExample(root), /EEXIST/);
});
