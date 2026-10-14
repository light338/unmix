import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Unmix, run } from '../src/core.mjs';

export function runDemo(directory) {
  const root = path.resolve(directory ?? fs.mkdtempSync(path.join(os.tmpdir(), 'unmix-demo-')));
  fs.mkdirSync(root, { recursive: true });
  const repo = path.join(root, 'shop'); fs.mkdirSync(repo);
  const g = (...args) => { const r = run(repo, 'git', args); if (!r.ok) throw new Error(r.stderr); return r.stdout.trim(); };
  const write = (file, content) => fs.writeFileSync(path.join(repo, file), content);
  g('init', '-q'); g('config', 'user.name', 'Unmix demo'); g('config', 'user.email', 'demo@example.invalid');
  write('package.json', '{"type":"module","private":true}\n');
  let source = 'export const theme = "plain";\n\nexport function checkout(items) {\n  return { total: 0 };\n}\n';
  write('shop.mjs', source); g('add', '.'); g('commit', '-qm', 'Initial shop');
  const head = g('rev-parse', 'HEAD');
  const u = new Unmix(repo); u.init();
  const task = (taskId, title, intent, edit, testSource, dependsOn = []) => {
    u.begin({ taskId, title, intent, dependsOn, checks: [['node', '--test', `${taskId}.test.mjs`]] });
    source = edit(source); write('shop.mjs', source); write(`${taskId}.test.mjs`, testSource); u.finish();
  };
  const prefix = 'import {test} from "node:test";\nimport assert from "node:assert/strict";\nimport * as shop from "./shop.mjs";\n';
  task('design', 'Dark design', 'Keep the midnight theme.', s => s.replace('"plain"', '"midnight"'),
    prefix + 'test("midnight theme",()=>assert.equal(shop.theme,"midnight"));\n');
  task('registration', 'Registration', 'Add account registration by email.', s => s + '\nexport function register(email) { return { id: email }; }\n',
    prefix + 'test("registration",()=>assert.equal(shop.register("a@b.test").id,"a@b.test"));\n');
  task('payment', 'Checkout', 'Keep checkout and calculation of item totals.', s => s.replace(
    'export function checkout(items) {\n  return { total: 0 };',
    'export function checkout(items, user) {\n  if (!user?.id) throw new Error("Account required");\n  return { total: items.reduce((sum, item) => sum + item.price, 0) };'),
    prefix + 'test("checkout total",()=>assert.equal(shop.checkout([{price:2},{price:3}],{id:"a"}).total,5));\n', ['registration']);
  task('rounding', 'Money fix', 'Keep the fix: 0.1 plus 0.2 must produce exactly 0.3.', s => s.replace(
    'items.reduce((sum, item) => sum + item.price, 0)',
    'Math.round(items.reduce((sum, item) => sum + item.price, 0) * 100) / 100'),
    prefix + 'test("money rounding",()=>assert.equal(shop.checkout([{price:0.1},{price:0.2}],{id:"a"}).total,0.3));\n', ['payment']);
  task('receipt', 'Receipt', 'Keep JSON receipt export.', s => s + '\nexport function receipt(order) { return JSON.stringify({ total: order.total, currency: "USD" }); }\n',
    prefix + 'test("receipt",()=>assert.deepEqual(JSON.parse(shop.receipt({total:5})),{total:5,currency:"USD"}));\n', ['payment']);
  const originalSource = fs.readFileSync(path.join(repo, 'shop.mjs'), 'utf8');
  const checksBefore = ['design', 'registration', 'payment', 'rounding', 'receipt'].map(name => run(repo, 'node', ['--test', `${name}.test.mjs`]).ok);
  if (!checksBefore.every(Boolean)) throw new Error('Original demo checks failed.');
  const plan = u.prepare({ remove: ['registration'], output: path.join(root, 'guest-shop'),
    instruction: 'Remove registration. Keep design, payment, the rounding fix and receipts. Guests must be able to purchase without an account.',
    checks: [['node', '-e', "import('./shop.mjs').then(s=>{if('register' in s || s.checkout([{price:0.1},{price:0.2}]).total!==0.3)process.exit(1)})"]] });
  fs.writeFileSync(path.join(root, 'codex-repair-prompt.txt'), u.prompt(plan.planId));
  const blocks = [];
  // This demo uses an explicitly authored adaptation, NOT a hidden live Codex call.
  // A real Codex session follows the same protocol with unmix_codex_prompt/resume.
  while (plan.blocked) {
    const taskId = plan.blocked.taskId; blocks.push({ taskId, kind: plan.blocked.kind });
    const rounded = taskId === 'rounding' || taskId === 'receipt';
    const hasReceipt = taskId === 'receipt';
    const total = rounded ? 'Math.round(items.reduce((sum, item) => sum + item.price, 0) * 100) / 100' : 'items.reduce((sum, item) => sum + item.price, 0)';
    const adapted = `export const theme = "midnight";\n\nexport function checkout(items) {\n  return { total: ${total} };\n}\n` +
      (hasReceipt ? '\nexport function receipt(order) { return JSON.stringify({ total: order.total, currency: "USD" }); }\n' : '');
    fs.writeFileSync(path.join(plan.candidate, 'shop.mjs'), adapted);
    const staged = run(plan.candidate, 'git', ['add', '-A']); if (!staged.ok) throw new Error(staged.stderr);
    Object.assign(plan, u.resume({ planId: plan.planId, note: `Demo-authored adaptation of ${taskId}: keep intended behavior without account registration.` }));
  }
  const verification = u.verify({ planId: plan.planId });
  if (!verification.passed) throw new Error(JSON.stringify(verification, null, 2));
  const originalUnchanged = g('rev-parse', 'HEAD') === head && fs.readFileSync(path.join(repo, 'shop.mjs'), 'utf8') === originalSource;
  if (!originalUnchanged) throw new Error('Original project changed.');
  const report = { original: repo, candidate: plan.candidate, recordedTasks: 5, removed: ['registration'],
    retained: ['design', 'payment', 'rounding', 'receipt'], blocks, passedChecks: verification.results.length,
    originalUnchanged, liveCodexInvocation: false,
    adaptation: 'Authored demonstration through the same repair/resume interface used by Codex.',
    planId: plan.planId };
  fs.writeFileSync(path.join(root, 'demo-report.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(runDemo(process.argv[2]), null, 2));
