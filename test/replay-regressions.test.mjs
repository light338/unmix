import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Unmix, run } from '../src/core.mjs';

function fixture(t, configure = () => {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unmix-replay-regression-'));
  const repo = path.join(dir, 'repo');
  fs.mkdirSync(repo);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const gitAt = (cwd, ...args) => {
    const result = run(cwd, 'git', args);
    assert.equal(result.ok, true, result.stderr || result.error);
    return result.stdout.trim();
  };
  const git = (...args) => gitAt(repo, ...args);
  const write = (file, content) => {
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    fs.writeFileSync(path.join(repo, file), content);
  };
  git('init', '-q');
  git('config', 'user.name', 'Replay regression');
  git('config', 'user.email', 'replay@example.invalid');
  write('base.txt', 'original\n');
  configure({ repo, dir, git, write });
  git('add', '.');
  git('commit', '-qm', 'base');
  const u = new Unmix(repo);
  u.init();
  const task = (taskId, edits) => {
    u.begin({ taskId, title: taskId, intent: `Preserve ${taskId}.` });
    for (const [file, content] of Object.entries(edits)) write(file, content);
    return u.finish();
  };
  task('drop', { 'temporary.txt': 'remove me\n' });
  const prepare = () => u.prepare({ remove: ['drop'], instruction: 'Remove the temporary task and preserve the rest.' });
  return { dir, repo, git, gitAt, write, task, u, prepare };
}

test('retained non-UTF8 text patches preserve exact bytes for additions and existing files', t => {
  const oldBytes = Buffer.from([0xe9, 0xe8, 0x0a]);
  const { task, prepare, u } = fixture(t, ({ write }) => write('legacy.txt', oldBytes));
  const added = Buffer.from([0xc0, 0xc1, 0xc2, 0x0a]);
  const updated = Buffer.from([0xe9, 0xe8, 0xe7, 0x0a]);
  task('keep', { 'cp1251.txt': added, 'legacy.txt': updated });
  const plan = prepare();
  assert.equal(plan.status, 'ready_for_checks');
  assert.equal(plan.tasks[0].replay, 'replayed');
  assert.deepEqual(fs.readFileSync(path.join(plan.candidate, 'cp1251.txt')), added);
  assert.deepEqual(fs.readFileSync(path.join(plan.candidate, 'legacy.txt')), updated);
  const report = u.report({ planId: plan.planId });
  for (const evidence of [report.tasks[0].original, report.tasks[0].result]) {
    assert.equal(evidence.diffEncoding, 'utf8_with_replacement');
    const raw = Buffer.from(evidence.diffBase64, 'base64');
    assert.ok(raw.includes(added));
    assert.ok(raw.includes(updated));
    assert.equal(Buffer.from(evidence.diff, 'utf8').equals(raw), false);
  }
  assert.equal(report.aggregateDiffEncoding, 'utf8_with_replacement');
  assert.ok(Buffer.from(report.aggregateDiffBase64, 'base64').includes(added));
  const inspected = u.inspect(plan.planId);
  assert.equal(inspected.diffEncoding, 'utf8_with_replacement');
  assert.ok(Buffer.from(inspected.diffBase64, 'base64').includes(updated));
});

test('replay uses applicable raw patches despite local Git display configuration', async t => {
  const cases = [
    ['external diff', ({ dir, git }) => {
      const script = path.join(dir, 'display-diff.sh');
      fs.writeFileSync(script, '#!/bin/sh\nprintf "display-only diff\\n"\n', { mode: 0o755 });
      git('config', 'diff.external', script);
    }],
    ['text conversion', ({ write, git }) => {
      write('.gitattributes', '*.txt diff=upper\n');
      git('config', 'diff.upper.textconv', 'tr a-z A-Z <');
    }],
    ['prefixless diff with nested paths', ({ git }) => git('config', 'diff.noprefix', 'true')],
    ['forced color', ({ git }) => {
      git('config', 'color.ui', 'always');
      git('config', 'color.diff', 'always');
    }],
  ];
  for (const [name, configure] of cases) await t.test(name, child => {
    const { task, prepare, u } = fixture(child, configure);
    const content = 'retained lowercase source\n';
    task('keep', { 'nested/source.txt': content });
    const plan = prepare();
    assert.equal(plan.status, 'ready_for_checks');
    assert.equal(plan.tasks[0].replay, 'replayed');
    assert.equal(fs.readFileSync(path.join(plan.candidate, 'nested/source.txt'), 'utf8'), content);
    assert.equal(fs.existsSync(path.join(plan.candidate, 'source.txt')), false);
    const report = u.report({ planId: plan.planId });
    assert.match(report.tasks[0].result.diff, /retained lowercase source/);
    assert.equal(report.tasks[0].result.diff.includes('\u001b['), false);
  });
});

test('recorded task file evidence retains literal whitespace, newline and quote characters', t => {
  const { task, u, prepare } = fixture(t);
  const files = ['space name.txt', 'new\nline.txt', 'quote"name.txt', 'tab\tname.txt'];
  const recorded = task('keep', Object.fromEntries(files.map(file => [file, 'retained\n'])));
  assert.deepEqual(new Set(recorded.files), new Set(files));
  assert.deepEqual(new Set(u.timeline().tasks.find(item => item.taskId === 'keep').files), new Set(files));
  const plan = prepare();
  const report = u.report({ planId: plan.planId });
  assert.deepEqual(new Set(report.tasks[0].files), new Set(files));
  for (const file of files) assert.equal(fs.readFileSync(path.join(plan.candidate, file), 'utf8'), 'retained\n');
});

test('historical replay reports survive amended candidate commits and garbage collection', t => {
  const { task, prepare, git, gitAt, u } = fixture(t);
  task('keep', { 'retained.txt': 'durable retained behavior\n' });
  const plan = prepare();
  const before = u.report({ planId: plan.planId });
  gitAt(plan.candidate, 'commit', '--amend', '-qm', 'User cleans up the candidate commit message');
  assert.notEqual(gitAt(plan.candidate, 'rev-parse', 'HEAD'), plan.tasks[0].replayAfter);
  // Expire reflogs immediately to simulate normal eventual Git maintenance.
  git('reflog', 'expire', '--expire=now', '--all');
  git('gc', '--prune=now');
  const after = new Unmix(u.repo).report({ planId: plan.planId });
  assert.deepEqual(after.tasks[0].result, before.tasks[0].result);
  assert.equal(after.aggregateDiff, before.aggregateDiff);
  assert.equal(after.unattributed.diff, '');
});

test('an interrupted applied replay is discoverable and can be reviewed then resumed after restart', t => {
  const { task, prepare, repo, git, u } = fixture(t);
  task('first', { 'first.txt': 'applied exactly once\n' });
  task('later', { 'later.txt': 'subsequent retained task\n' });
  const sourceState = () => [git('rev-parse', 'HEAD'), git('write-tree'), git('status', '--porcelain')];
  const originalState = sourceState();
  const snapshot = u.snapshot.bind(u);
  let interrupted = false;
  u.snapshot = (...args) => {
    if (!interrupted && args[0] && args[0] !== repo && args[1]) {
      interrupted = true;
      throw new Error('Simulated transient snapshot write failure');
    }
    return snapshot(...args);
  };
  assert.throws(prepare, /Simulated transient snapshot write failure/);
  const restored = new Unmix(repo);
  const saved = Object.values(restored.load().plans)[0];
  assert.equal(saved.cursor, 0);
  assert.equal(saved.blocked.kind, 'interrupted_replay');
  assert.equal(saved.blocked.taskId, 'first');
  assert.equal(fs.readFileSync(path.join(saved.candidate, 'first.txt'), 'utf8'), 'applied exactly once\n');
  assert.equal(fs.existsSync(path.join(saved.candidate, 'later.txt')), false);
  assert.throws(() => restored.verify({ planId: saved.planId }), /Resolve and replay/);
  const reviewed = restored.report({ planId: saved.planId });
  assert.equal(reviewed.blocked.kind, 'interrupted_replay');
  assert.match(reviewed.unattributed.diff, /applied exactly once/);
  const resumed = restored.resume({ planId: saved.planId, note: 'Reviewed the already applied complete first task after the transient failure.' });
  assert.equal(resumed.status, 'ready_for_checks');
  assert.equal(resumed.blocked, null);
  assert.deepEqual(resumed.tasks.map(item => item.replay), ['adapted', 'replayed']);
  assert.equal(fs.readFileSync(path.join(saved.candidate, 'first.txt'), 'utf8'), 'applied exactly once\n');
  assert.equal(fs.readFileSync(path.join(saved.candidate, 'later.txt'), 'utf8'), 'subsequent retained task\n');
  assert.deepEqual(sourceState(), originalState);
});

test('recovery continues not-yet-started replay from durable draft and between-task checkpoints', async t => {
  await t.test('draft saved before replay starts', child => {
    const { task, prepare, repo, u } = fixture(child);
    task('keep', { 'retained.txt': 'not started before interruption\n' });
    u.replay = () => { throw new Error('Simulated interruption before replay starts'); };
    assert.throws(prepare, /Simulated interruption before replay starts/);
    const restored = new Unmix(repo);
    const saved = Object.values(restored.load().plans)[0];
    assert.equal(saved.status, 'draft');
    assert.equal(saved.cursor, 0);
    assert.equal(saved.blocked, null);
    assert.equal(fs.existsSync(path.join(saved.candidate, 'retained.txt')), false);
    const resumed = restored.resume({ planId: saved.planId, note: 'Continue the plan whose replay never started.' });
    assert.equal(resumed.status, 'ready_for_checks');
    assert.equal(resumed.blocked, null);
    assert.equal(resumed.tasks[0].replay, 'replayed');
    assert.equal(fs.readFileSync(path.join(resumed.candidate, 'retained.txt'), 'utf8'), 'not started before interruption\n');
  });

  await t.test('completed first task is durable before the next task starts', child => {
    const { task, prepare, repo, u } = fixture(child);
    task('first', { 'first.txt': 'first completed once\n' });
    task('later', { 'later.txt': 'second starts after restart\n' });
    const rename = fs.renameSync;
    let interrupted = false;
    fs.renameSync = (from, to) => {
      if (!interrupted && to === u.file) {
        const ledger = JSON.parse(fs.readFileSync(from, 'utf8'));
        const saved = Object.values(ledger.plans)[0];
        if (saved?.cursor === 1 && saved.status === 'needs_adaptation'
            && saved.blocked?.taskId === 'later' && saved.blocked.kind === 'interrupted_replay') {
          interrupted = true;
          throw new Error('Simulated interruption before the next replay checkpoint');
        }
      }
      return rename(from, to);
    };
    try {
      assert.throws(prepare, /Simulated interruption before the next replay checkpoint/);
    } finally {
      fs.renameSync = rename;
    }
    assert.equal(interrupted, true);
    const restored = new Unmix(repo);
    const saved = Object.values(restored.load().plans)[0];
    assert.equal(saved.cursor, 1);
    assert.equal(saved.status, 'replay_pending');
    assert.equal(saved.blocked, null);
    assert.equal(saved.tasks[0].replay, 'replayed');
    assert.equal(saved.tasks[1].replay, 'pending');
    const firstSnapshot = saved.tasks[0].replayAfter;
    assert.equal(fs.readFileSync(path.join(saved.candidate, 'first.txt'), 'utf8'), 'first completed once\n');
    assert.equal(fs.existsSync(path.join(saved.candidate, 'later.txt')), false);
    const resumed = restored.resume({ planId: saved.planId, note: 'Continue with the second task after the first completed.' });
    assert.equal(resumed.status, 'ready_for_checks');
    assert.equal(resumed.blocked, null);
    assert.deepEqual(resumed.tasks.map(item => item.replay), ['replayed', 'replayed']);
    assert.equal(resumed.tasks[0].replayAfter, firstSnapshot);
    assert.equal(fs.readFileSync(path.join(resumed.candidate, 'first.txt'), 'utf8'), 'first completed once\n');
    assert.equal(fs.readFileSync(path.join(resumed.candidate, 'later.txt'), 'utf8'), 'second starts after restart\n');
  });
});
