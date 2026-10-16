import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Unmix, run } from '../src/core.mjs';
import { expectedFailureMarker } from '../src/passport.mjs';

// Authored CLI fixture, not a live model adaptation or a human/browser test.
export function passportExample(root) {
  fs.mkdirSync(root); // Refuse to overwrite an existing directory.
  const repo = path.join(root, 'project'); fs.mkdirSync(repo);
  const git = (...args) => { const r = run(repo, 'git', args); if (!r.ok) throw new Error(r.stderr); };
  git('init', '-q'); git('config', 'user.name', 'Unmix fixture'); git('config', 'user.email', 'fixture@example.invalid');
  fs.writeFileSync(path.join(repo, 'app.json'), JSON.stringify({ registration: false, payment: true }));
  git('add', '.'); git('commit', '-qm', 'base');
  const app = new Unmix(repo); app.init();
  app.begin({ taskId: 'registration', title: 'Registration', intent: 'Require registration before payment' });
  fs.writeFileSync(path.join(repo, 'app.json'), JSON.stringify({ registration: true, payment: true })); app.finish();
  app.begin({ taskId: 'receipt', title: 'Receipt export', intent: 'Retain receipt export' });
  fs.writeFileSync(path.join(repo, 'receipt.txt'), 'Receipt export fixture'); app.finish();
  const criterion = (expression, expectedFailureId) => ['node', '-e', `const a=JSON.parse(require('fs').readFileSync('app.json'));if(!(${expression})){${expectedFailureId ? `console.log(${JSON.stringify(expectedFailureMarker(expectedFailureId))});` : ''}process.exit(1)}`];
  const manual = { requirementId: 'scroll', title: 'Scroll position stays', kind: 'preserve', checkId: 'scroll-position', procedure: 'Fixture procedure: record scroll position before and after interaction.' };
  const plan = app.prepare({ remove: ['registration'], instruction: 'Allow guest purchase and retain payment, receipt and scroll behavior', requirements: [
    { requirementId: 'payment', title: 'Payment available', kind: 'preserve', command: criterion('a.payment') },
    { requirementId: 'guest', title: 'Guest purchase available', kind: 'remove', command: criterion('!a.registration','guest') },
    { requirementId: 'receipt', title: 'Receipt export retained', kind: 'preserve', command: ['node', '-e', "process.exit(require('fs').existsSync('receipt.txt')?0:1)"] }, manual,
  ] });
  app.verify({ planId: plan.planId, phase: 'baseline' });
  for (const phase of ['baseline', 'candidate']) app.manualContext({ planId: plan.planId, phase, context: { browser: 'FixtureBrowser', browserVersion: '1', environment: 'authored-fixture', authState: 'signed_out', session: 'synthetic-session-v1', dataState: 'seed-v1' } });
  const missingManual = app.verify({ planId: plan.planId });
  const inspected = app.inspect(plan.planId);
  for (const phase of ['baseline', 'candidate']) app.manualCheck({ planId: plan.planId, phase, checkId: manual.checkId, title: manual.title, procedure: manual.procedure, result: 'passed',
    expectedTree: phase === 'baseline' ? inspected.baselineReview.tree : inspected.candidateTree, expectedContext: inspected.manualContexts[phase].revision, observer: 'Authored fixture, not a human', note: 'Synthetic evidence to demonstrate the API; no browser or scroll behavior was tested.' });
  fs.writeFileSync(path.join(plan.candidate, 'app.json'), JSON.stringify({ registration: false, payment: false }));
  const broken = app.verify({ planId: plan.planId });
  fs.writeFileSync(path.join(plan.candidate, 'app.json'), JSON.stringify({ registration: false, payment: true }));
  const repaired = app.verify({ planId: plan.planId });
  const compact = value => ({ ready: value.passport.ready, checksPassed: value.checksPassed, requirements: value.passport.requirements.map(r => ({ id: r.requirementId, original: r.baseline.state, candidate: r.candidate.state, result: r.state })) });
  const evidence = { scope: 'Authored file/command fixture. Repairs and manual records are synthetic; no live model, UI or independent user test.', missingManual: compact(missingManual), broken: compact(broken), repaired: compact(repaired) };
  fs.writeFileSync(path.join(root, 'passport.json'), JSON.stringify(evidence, null, 2) + '\n');
  const md = ['# Preservation passport example', '', evidence.scope, ''];
  for (const key of ['missingManual', 'broken', 'repaired']) {
    const stage = evidence[key]; md.push(`## ${key}`, '', `Ready: ${stage.ready}; automated commands passed: ${stage.checksPassed}.`, '', '| Requirement | Original | Candidate | Result |', '| --- | --- | --- | --- |');
    for (const r of stage.requirements) md.push(`| ${r.id} | ${r.original} | ${r.candidate} | ${r.result} |`);
    md.push('');
  }
  md.push('Restoring the exact previous file tree makes its earlier observations applicable again. A different repaired tree would require new observations. Freshness does not cover browser/database/runtime state.', '');
  fs.writeFileSync(path.join(root, 'passport.md'), md.join('\n'));
  return evidence;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Pass a new output directory.');
  console.log(JSON.stringify(passportExample(path.resolve(process.argv[2])), null, 2));
}
