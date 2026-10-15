import fs from 'node:fs';
import path from 'node:path';
import { Unmix, run } from '../src/core.mjs';

const root = path.resolve(process.argv[2] || 'unmix-report-demo');
if (fs.existsSync(root)) throw new Error('Demo output must not already exist.');
fs.mkdirSync(root, { recursive: true });
const repo = path.join(root, 'original'); fs.mkdirSync(repo);
const git = (...args) => { const r = run(repo, 'git', args); if (!r.ok) throw Error(r.stderr); return r.stdout.trim(); };
const write = (name, text) => fs.writeFileSync(path.join(repo, name), text);
const record = (taskId, intent, file, content, dependsOn = []) => {
  u.begin({ taskId, title: taskId, intent, dependsOn }); write(file, content); u.finish();
};
git('init', '-q'); git('config', 'user.name', 'Report demo'); git('config', 'user.email', 'demo@example.invalid');
write('checkout.mjs', 'export const checkout = price => price;\n');
git('add', '.'); git('commit', '-qm', 'base');
const u = new Unmix(repo); u.init();
record('registration', 'Require an account for checkout.', 'checkout.mjs', 'export const checkout = (price, account) => { if (!account) throw Error("Account required"); return price; };\n');
record('design', 'Retain green checkout styling.', 'style.css', 'body { color: green; }\n');
record('rounding', 'Round checkout totals to cents.', 'checkout.mjs', 'export const checkout = (price, account) => { if (!account) throw Error("Account required"); return Math.round(price * 100) / 100; };\n', ['registration']);
record('receipt', 'Retain receipt formatting.', 'receipt.mjs', 'export const receipt = amount => `Receipt: ${amount.toFixed(2)}`;\n', ['rounding']);
const check = 'import("./checkout.mjs").then(m=>{if(m.checkout(1.235)!==1.24)process.exit(1)})';
const plan = u.prepare({ remove: ['registration'], instruction: 'Allow guest checkout while preserving design, rounding and receipt formatting.', checks: [[process.execPath, '-e', check]] });
if (plan.blocked?.kind !== 'patch_conflict') throw Error('Expected rounding conflict.');
fs.writeFileSync(path.join(root, 'before-checks.md'), u.report({ planId: plan.planId, format: 'markdown' }));
// Authored demonstration repair, not a live agent invocation.
fs.writeFileSync(path.join(plan.candidate, 'checkout.mjs'), 'export const checkout = price => Math.round(price * 100) / 100;\n');
const staged = run(plan.candidate, 'git', ['add', 'checkout.mjs']); if (!staged.ok) throw Error(staged.stderr);
u.resume({ planId: plan.planId, note: 'Removed the account guard; retained cents rounding for guest checkout.' });
if (!u.verify({ planId: plan.planId }).passed) throw Error('Guest checkout check failed.');
fs.writeFileSync(path.join(root, 'report.json'), JSON.stringify(u.report({ planId: plan.planId }), null, 2) + '\n');
fs.writeFileSync(path.join(root, 'review.md'), u.report({ planId: plan.planId, format: 'markdown' }));
console.log(JSON.stringify({ root, planId: plan.planId, candidate: plan.candidate, checksPassed: true }, null, 2));
