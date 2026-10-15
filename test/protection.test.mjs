import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Unmix, run } from '../src/core.mjs';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unmix-protection-')), repo = path.join(dir, 'repo'); fs.mkdirSync(repo);
  const g = (...args) => { const r = run(repo, 'git', args); assert.equal(r.ok, true, r.stderr); return r.stdout.trim(); };
  const write = (file, content) => { fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); fs.writeFileSync(path.join(repo, file), content); };
  g('init', '-q'); g('config', 'user.name', 'Test'); g('config', 'user.email', 'test@example.invalid');
  write('app.mjs', 'export const n = 2;\n');
  write('base.test.mjs', 'import assert from "node:assert/strict"; import {n} from "./app.mjs"; assert.equal(n,2);\n');
  write('package.json', '{"type":"module","private":true}\n');
  write('custom checker.mjs', 'import assert from "node:assert/strict"; assert.equal(2+2,4);\n');
  g('add', '.'); g('commit', '-qm', 'base');
  const u = new Unmix(repo); u.init();
  const task = (taskId, edits) => { u.begin({ taskId, title: taskId, intent: taskId }); for (const [file, content] of Object.entries(edits)) write(file, content); u.finish(); };
  task('drop', { 'removed.test.mjs': 'throw new Error("must not replay");\n' });
  task('keep', { 'kept.test.mjs': 'import assert from "node:assert/strict"; assert.equal(3,3);\n' });
  const prepare = options => u.prepare({ remove: ['drop'], instruction: 'Keep existing behavior.', checks: [[process.execPath, '--test', 'base.test.mjs', 'kept.test.mjs']], ...options });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, repo, g, u, write, task, prepare };
}

test('protect base and retained inputs, exclude removed-only tests, and allow new regression tests', t => {
  const { u, prepare, g } = fixture(t), p = prepare();
  const original = [g('rev-parse', 'HEAD'), g('write-tree'), g('status', '--porcelain')];
  let r = u.report({ planId: p.planId });
  assert.equal(r.protectedInputs.state, 'intact');
  assert.deepEqual(r.protectedInputs.entries.map(e => e.file), ['base.test.mjs', 'kept.test.mjs', 'package.json']);
  assert.equal(fs.existsSync(path.join(p.candidate, 'removed.test.mjs')), false);
  fs.writeFileSync(path.join(p.candidate, 'new.test.mjs'), 'import assert from "node:assert/strict"; assert.equal(4,4);');
  assert.equal(u.verify({ planId: p.planId }).passed, true);
  assert.deepEqual([g('rev-parse', 'HEAD'), g('write-tree'), g('status', '--porcelain')], original);
  assert.match(u.report({ planId: p.planId, format: 'markdown' }), /## Protected check inputs/);
});

test('weakening, deleting, changing modes/config and replacing tests with symlinks refuse verification before execution', t => {
  const { u, prepare, dir } = fixture(t);
  const marker = path.join(dir, 'ran');
  const mutate = [
    p => fs.writeFileSync(path.join(p.candidate, 'kept.test.mjs'), '// assertions removed'),
    p => fs.unlinkSync(path.join(p.candidate, 'base.test.mjs')),
    p => fs.chmodSync(path.join(p.candidate, 'kept.test.mjs'), 0o755),
    p => fs.writeFileSync(path.join(p.candidate, 'package.json'), '{"scripts":{"test":"true"}}'),
    p => { fs.unlinkSync(path.join(p.candidate, 'base.test.mjs')); fs.symlinkSync('kept.test.mjs', path.join(p.candidate, 'base.test.mjs')); },
  ];
  for (const edit of mutate) {
    const p = prepare({ checks: [[process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(marker)},'ran')`]] }); edit(p);
    const v = u.verify({ planId: p.planId }); assert.equal(v.passed, false); assert.equal(v.skipped, 'protected_inputs_changed');
    assert.deepEqual(v.results, []); assert.equal(fs.existsSync(marker), false);
    assert.ok(v.integrity.before.violations.length); assert.equal(u.inspect(p.planId).protectedInputs.state, 'changed');
    const cli = run(u.repo, process.execPath, [new URL('../bin/unmix.mjs', import.meta.url).pathname, 'verify', '--repo', u.repo, '--json', JSON.stringify({ planId: p.planId })]);
    assert.equal(cli.code, 2); assert.equal(JSON.parse(cli.stdout).passed, false);
  }
});

test('latest retained version is frozen, and a retained deletion remains absent', t => {
  const { u, task, prepare } = fixture(t);
  task('update', { 'kept.test.mjs': 'import assert from "node:assert/strict"; assert.equal(9,9);\n' });
  u.begin({ taskId: 'delete-test', title: 'Delete obsolete test', intent: 'Recorded deletion.' });
  fs.unlinkSync(path.join(u.repo, 'base.test.mjs')); u.finish();
  const p = prepare({ checks: [[process.execPath, '--test', 'kept.test.mjs']] });
  assert.equal(u.verify({ planId: p.planId }).passed, true);
  fs.writeFileSync(path.join(p.candidate, 'base.test.mjs'), '// resurrected');
  assert.equal(u.verify({ planId: p.planId }).passed, false);
  fs.unlinkSync(path.join(p.candidate, 'base.test.mjs'));
  fs.writeFileSync(path.join(p.candidate, 'kept.test.mjs'), 'import assert from "node:assert/strict"; assert.equal(3,3);\n');
  assert.equal(u.verify({ planId: p.planId }).passed, false);
});

test('explicit literal paths protect custom checkers; invalid paths and symlink baselines are rejected before worktree creation', t => {
  const { u, prepare, dir, task } = fixture(t);
  const p = prepare({ protectedFiles: ['custom checker.mjs'] });
  fs.writeFileSync(path.join(p.candidate, 'custom checker.mjs'), '// weak');
  assert.equal(u.verify({ planId: p.planId }).passed, false);
  for (const protectedFiles of [['../x'], ['/tmp/x'], ['.git/config'], ['a/../x'], ['missing'], ['tests/'], ['a\\b'], 'x']) {
    const output = path.join(dir, 'must-not-exist');
    assert.throws(() => prepare({ protectedFiles, output })); assert.equal(fs.existsSync(output), false);
  }
  u.begin({ taskId: 'link', title: 'Link', intent: 'Symlink fixture.' });
  fs.symlinkSync('kept.test.mjs', path.join(u.repo, 'link.test.mjs')); u.finish();
  assert.throws(() => prepare(), /regular file/);
});

test('check-induced changes fail and stop later commands; restoring protected bytes permits retry', t => {
  const { u, prepare, dir } = fixture(t);
  const marker = path.join(dir, 'second-command-ran');
  const p = prepare({ checks: [[process.execPath, '-e', "require('fs').writeFileSync('kept.test.mjs','// weakened')"],
    [process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(marker)},'ran')`]] });
  const v = u.verify({ planId: p.planId }); assert.equal(v.passed, false); assert.equal(v.changedDuringChecks, true);
  assert.equal(v.integrity.after.state, 'changed'); assert.equal(v.results.length, 1); assert.equal(fs.existsSync(marker), false);
  const q = prepare(); const source = fs.readFileSync(path.join(q.candidate, 'kept.test.mjs'));
  fs.writeFileSync(path.join(q.candidate, 'kept.test.mjs'), '// weak'); assert.equal(u.verify({ planId: q.planId }).passed, false);
  fs.writeFileSync(path.join(q.candidate, 'kept.test.mjs'), source); assert.equal(u.verify({ planId: q.planId }).passed, true);
});

test('legacy plans remain explicit about missing protection rather than trust a post-edit baseline', t => {
  const { u, prepare } = fixture(t), p = prepare();
  const ledger = u.load(); delete ledger.plans[p.planId].protection; fs.writeFileSync(u.file, JSON.stringify(ledger));
  fs.writeFileSync(path.join(p.candidate, 'kept.test.mjs'), '// weaker');
  assert.equal(u.report({ planId: p.planId }).protectedInputs.state, 'unavailable_legacy_plan');
  const v = u.verify({ planId: p.planId }); assert.equal(v.integrity.before.state, 'unavailable_legacy_plan');
  assert.equal(v.passed, true); // Existing command-only semantics, explicitly labelled.
});
