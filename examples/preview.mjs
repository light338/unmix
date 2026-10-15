import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Unmix, run } from '../src/core.mjs';

export function previewExample(root) {
  fs.mkdirSync(root); // Refuse reuse so existing work cannot be overwritten.
  const repo = path.join(root, 'project'); fs.mkdirSync(repo);
  const write = (file, body) => fs.writeFileSync(path.join(repo, file), body);
  const git = (...args) => { const r = run(repo, 'git', args); if (!r.ok) throw new Error(r.stderr); return r.stdout; };
  git('init', '-q'); git('config', 'user.name', 'Unmix example'); git('config', 'user.email', 'example@localhost');
  write('README.md', 'Authored preview fixture. No real UI, payment or model run.\n');
  git('add', '.'); git('commit', '-qm', 'base');
  const app = new Unmix(repo); app.init();
  const record = (taskId, title, file, body, dependsOn = []) => {
    app.begin({ taskId, title, intent: title, dependsOn }); write(file, body); app.finish();
  };
  record('design', 'Dark theme', 'theme.css', 'body { color: white; background: black; }\n');
  record('registration', 'Require account registration', 'routes.txt', 'registration required\n');
  record('payment', 'Checkout and payment', 'payment.txt', 'payment workflow\n', ['registration']);
  record('receipt', 'Export receipts', 'receipt.txt', 'receipt workflow\n', ['payment']);
  record('routing', 'Route cleanup without declared dependency', 'routes.txt', 'registration required\nroute cleanup\n');
  const preview = app.preview({ remove: ['registration'] });
  fs.writeFileSync(path.join(root, 'preview.json'), JSON.stringify(preview, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'preview.md'), app.preview({ remove: ['registration'], format: 'markdown' }));
  if (Object.keys(app.load().plans).length) throw new Error('Preview unexpectedly created a plan.');
  if (git('worktree', 'list', '--porcelain').split('worktree ').length !== 2) throw new Error('Unexpected candidate worktree.');
  return { root, ...preview.summary, candidatesCreated: 0, scope: 'Authored fixture for preview only; no reconstruction, executable checks or model run.' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = path.resolve(process.argv[2] || path.join(os.tmpdir(), `unmix-preview-${Date.now()}`));
  console.log(JSON.stringify(previewExample(root), null, 2));
}
