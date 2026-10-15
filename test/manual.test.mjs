import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Unmix, run } from '../src/core.mjs';

function fixture(t, dependent = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unmix-manual-'));
  const repo = path.join(dir, 'repo'); fs.mkdirSync(repo);
  const git = (...args) => { const r = run(repo, 'git', args); assert.equal(r.ok, true, r.stderr); return r.stdout.trim(); };
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  fs.writeFileSync(path.join(repo, 'app.txt'), 'base');
  fs.writeFileSync(path.join(repo, '.gitignore'), 'runtime/\n');
  git('add', '.'); git('commit', '-qm', 'base');
  const u = new Unmix(repo); u.init();
  u.begin({ taskId: 'drop', title: 'Drop', intent: 'Remove temporary decision.' });
  fs.writeFileSync(path.join(repo, 'drop.txt'), 'drop'); u.finish();
  u.begin({ taskId: 'keep', title: 'Keep', intent: 'Keep interaction.', dependsOn: dependent ? ['drop'] : [] });
  fs.writeFileSync(path.join(repo, 'keep.txt'), 'keep'); u.finish();
  const p = u.prepare({ remove: ['drop'], instruction: 'Keep interaction without temporary decision.', checks: [[process.execPath, '-e', 'process.exit(0)']] });
  const input = overrides => ({ planId: p.planId, checkId: 'like-saved', title: 'Like saved',
    procedure: 'Click Like, reload, check it remains selected.', result: 'passed', observer: 'Fixture observation (not a human UI test)',
    note: 'Authored test record; no real browser interaction claimed.', expectedTree: u.inspect(p.planId).candidateTree, ...overrides });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, repo, git, u, p, input };
}

test('manual results stay separate, preserve originals and real indexes, and retain independent check history', t => {
  const { u, p, input, git, repo } = fixture(t);
  const original = () => [git('rev-parse', 'HEAD'), git('write-tree'), git('status', '--porcelain'), fs.readFileSync(path.join(repo, 'keep.txt'), 'utf8')];
  const before = original();
  const candidateIndex = run(p.candidate, 'git', ['write-tree']).stdout;
  assert.equal(u.report({ planId: p.planId }).manualChecks.state, 'not_recorded');
  const a = u.manualCheck(input({ evidence: ['local screenshot reference (not fetched)'] }));
  u.manualCheck(input({ checkId: 'scroll-position', title: 'Scroll position', result: 'failed', note: 'Scroll jumped to top.' }));
  let r = u.report({ planId: p.planId });
  assert.equal(r.checks.state, 'not_run'); assert.equal(r.status, 'ready_for_checks');
  assert.equal(r.manualChecks.state, 'failed'); assert.equal(r.manualChecks.latest.length, 2);
  assert.equal(u.verify({ planId: p.planId }).passed, true);
  assert.equal(u.report({ planId: p.planId }).manualChecks.state, 'failed');
  const ledger = fs.readFileSync(u.file, 'utf8');
  const markdown = u.report({ planId: p.planId, format: 'markdown' });
  assert.match(markdown, /## Manual checks/); assert.match(markdown, /Scroll jumped/);
  assert.equal(fs.readFileSync(u.file, 'utf8'), ledger);
  const b = u.manualCheck(input({ checkId: 'scroll-position', title: 'Scroll position', note: 'Rechecked after resetting the browser.' }));
  r = u.report({ planId: p.planId });
  assert.equal(r.manualChecks.state, 'passed'); assert.equal(r.manualChecks.history.length, 3);
  assert.equal(r.manualChecks.history[1].result, 'failed'); assert.notEqual(a.observationId, b.observationId);
  assert.deepEqual(original(), before); assert.equal(run(p.candidate, 'git', ['write-tree']).stdout, candidateIndex);
  assert.equal(git('rev-parse', `refs/unmix/manual/${p.planId}/${a.observationId}`), a.tree);
});

test('candidate edits invalidate both manual checks; stale submission is rejected; rechecking refreshes only one ID', t => {
  const { u, p, input } = fixture(t);
  const old = input({}); u.manualCheck(old); u.manualCheck(input({ checkId: 'scroll-position' }));
  fs.writeFileSync(path.join(p.candidate, 'untracked.txt'), 'later adaptation');
  assert.throws(() => u.manualCheck(old), /Candidate changed/);
  let r = u.report({ planId: p.planId });
  assert.equal(r.manualChecks.state, 'stale'); assert.ok(r.manualChecks.latest.every(v => v.stale));
  assert.equal(u.verify({ planId: p.planId }).passed, true);
  assert.equal(u.report({ planId: p.planId }).manualChecks.state, 'stale');
  u.manualCheck(input({})); r = u.report({ planId: p.planId });
  assert.equal(r.manualChecks.latest.find(v => v.checkId === 'like-saved').state, 'passed');
  assert.equal(r.manualChecks.latest.find(v => v.checkId === 'scroll-position').state, 'stale');
  assert.equal(r.manualChecks.history[0].result, 'passed'); assert.equal(r.manualChecks.history[0].state, 'stale');
  u.manualCheck(input({ checkId: 'scroll-position' }));
  assert.equal(u.inspect(p.planId).manualChecks.state, 'passed');
});

test('observations survive resume but later replay makes them stale without changing their recorded outcome', t => {
  const { u, p, input } = fixture(t, true);
  assert.equal(p.blocked.kind, 'removed_dependency');
  u.manualCheck(input({}));
  fs.writeFileSync(path.join(p.candidate, 'keep.txt'), 'adapted');
  u.resume({ planId: p.planId, note: 'Adapt interaction after manual review.' });
  const r = u.report({ planId: p.planId });
  assert.equal(r.manualChecks.history.length, 1); assert.equal(r.manualChecks.history[0].result, 'passed');
  assert.equal(r.manualChecks.latest[0].state, 'stale');
});

test('legacy plans support manual records without migration; ignored runtime changes are outside freshness scope', t => {
  const { u, p, input } = fixture(t);
  const l = u.load(); delete l.plans[p.planId].reportVersion; delete l.plans[p.planId].manualChecks;
  fs.writeFileSync(u.file, JSON.stringify(l));
  const a = u.manualCheck(input({}));
  fs.mkdirSync(path.join(p.candidate, 'runtime')); fs.writeFileSync(path.join(p.candidate, 'runtime', 'db'), 'changed data');
  assert.equal(u.inspect(p.planId).manualChecks.latest[0].state, 'passed');
  fs.writeFileSync(path.join(p.candidate, 'app.txt'), 'temporary');
  assert.equal(u.inspect(p.planId).manualChecks.state, 'stale');
  fs.writeFileSync(path.join(p.candidate, 'app.txt'), 'base');
  assert.equal(u.inspect(p.planId).manualChecks.latest[0].tree, a.tree);
  assert.equal(u.inspect(p.planId).manualChecks.state, 'passed');
  assert.match(u.inspect(p.planId).manualChecks.scope, /runtime, browser, data/);
});

test('manual input validation and CLI reject incomplete/racing records without modifying the ledger', t => {
  const { u, p, input, repo } = fixture(t);
  const before = fs.readFileSync(u.file, 'utf8');
  for (const change of [{ expectedTree: undefined }, { expectedTree: '0'.repeat(40) }, { checkId: '../bad' }, { result: 'maybe' }, { observer: '' }, { procedure: '' }, { note: '' }, { evidence: 'url' }, { evidence: Array(17).fill('x') }, { evidence: [null] }])
    assert.throws(() => u.manualCheck(input(change)));
  assert.equal(fs.readFileSync(u.file, 'utf8'), before);
  const bin = new URL('../bin/unmix.mjs', import.meta.url).pathname;
  const cli = args => run(repo, process.execPath, [bin, 'manual-check', '--repo', repo, '--json', JSON.stringify(args)]);
  assert.equal(cli(input({ result: 'unknown' })).ok, false);
  const saved = cli(input({})); assert.equal(saved.ok, true, saved.stderr);
  assert.equal(JSON.parse(saved.stdout).state, 'passed');
  assert.equal(u.report({ planId: p.planId }).manualChecks.history.length, 1);
  assert.match(u.prompt(p.planId), /Never invent a human check/);
});

test('file modes, deletions and staged edits change freshness; unmerged candidate cannot be attested', t => {
  const { u, p, input } = fixture(t);
  u.manualCheck(input({}));
  fs.chmodSync(path.join(p.candidate, 'app.txt'), 0o755);
  assert.equal(u.inspect(p.planId).manualChecks.state, 'stale');
  fs.chmodSync(path.join(p.candidate, 'app.txt'), 0o644);
  fs.unlinkSync(path.join(p.candidate, 'keep.txt'));
  assert.equal(u.inspect(p.planId).manualChecks.state, 'stale');
  fs.writeFileSync(path.join(p.candidate, 'keep.txt'), 'staged repair');
  assert.equal(run(p.candidate, 'git', ['add', 'keep.txt']).ok, true);
  assert.equal(u.inspect(p.planId).manualChecks.state, 'stale');
  u.manualCheck(input({}));
  assert.equal(u.inspect(p.planId).manualChecks.state, 'passed');
  const entry = run(p.candidate, 'git', ['ls-files', '-s', 'app.txt']).stdout.trim().split(/\s+/);
  assert.equal(run(p.candidate, 'git', ['update-index', '--index-info'], { input: `0 ${'0'.repeat(40)}\tapp.txt\n100644 ${entry[1]} 1\tapp.txt\n100644 ${entry[1]} 2\tapp.txt\n100644 ${entry[1]} 3\tapp.txt\n` }).ok, true);
  const args = { ...input({}), expectedTree: u.snapshot(p.candidate) };
  assert.throws(() => u.manualCheck(args), /unmerged/);
});
