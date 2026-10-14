import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const identity = {
  GIT_AUTHOR_NAME: 'Unmix', GIT_AUTHOR_EMAIL: 'unmix@localhost',
  GIT_COMMITTER_NAME: 'Unmix', GIT_COMMITTER_EMAIL: 'unmix@localhost',
};
export function run(cwd, command, args = [], options = {}) {
  const r = spawnSync(command, args, {
    cwd, encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024,
    ...options, env: { ...process.env, ...options.env },
  });
  return { ok: r.status === 0 && !r.error, code: r.status,
    stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error?.message ?? null };
}
function git(cwd, args, options = {}) {
  const r = run(cwd, 'git', args, options);
  if (!r.ok) throw new Error(`git ${args[0]} failed: ${r.stderr.trim() || r.error}`);
  return r.stdout.trim();
}
function atomic(file, data) {
  const temp = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temp, file);
}
function id(value) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(value))
    throw new Error('ID must start with a lowercase letter and contain only lowercase letters, digits or hyphens (max 64).');
  return value;
}
function text(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 16000)
    throw new Error(`${label} must be a nonempty string (max 16000 characters).`);
  return value;
}
function checks(value = []) {
  if (!Array.isArray(value) || value.length > 32 || value.some(c => !Array.isArray(c) || !c.length || c.length > 64 || c.some(a => typeof a !== 'string' || !a || a.includes('\0'))))
    throw new Error('Checks must be an array of command argument arrays, e.g. [["node", "--test", "test/payment.test.mjs"]].');
  return value;
}

export class Unmix {
  constructor(repo) {
    const supplied = fs.realpathSync(repo);
    this.repo = fs.realpathSync(git(supplied, ['rev-parse', '--show-toplevel']));
    if (supplied !== this.repo) throw new Error('Pass the Git repository root, not a subdirectory.');
    const dir = git(this.repo, ['rev-parse', '--git-dir']);
    this.store = path.resolve(this.repo, dir, 'unmix');
    this.file = path.join(this.store, 'ledger.json');
  }
  load() {
    if (!fs.existsSync(this.file)) throw new Error('Run unmix init first.');
    return JSON.parse(fs.readFileSync(this.file, 'utf8'));
  }
  locked(fn) {
    fs.mkdirSync(this.store, { recursive: true });
    const lock = path.join(this.store, 'lock');
    try { fs.mkdirSync(lock); } catch { throw new Error('Unmix is busy. If a process crashed, remove the lock directory after confirming it is no longer running.'); }
    try { return fn(); } finally { fs.rmdirSync(lock); }
  }
  snapshot(cwd = this.repo, parent = null, message = 'Unmix snapshot') {
    // A separate index preserves the user's real staged changes. No checkout/reset.
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'unmix-index-'));
    const env = { GIT_INDEX_FILE: path.join(temp, 'index'), ...identity };
    try {
      git(cwd, ['read-tree', parent || 'HEAD'], { env });
      git(cwd, ['add', '-A', '--', '.'], { env });
      const tree = git(cwd, ['write-tree'], { env });
      if (!parent) return tree;
      return git(cwd, ['commit-tree', tree, '-p', parent], { env, input: message + '\n' });
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  }
  init() {
    return this.locked(() => {
      if (fs.existsSync(this.file)) throw new Error('This repository already has an Unmix ledger.');
      const base = git(this.repo, ['rev-parse', 'HEAD']);
      if (git(this.repo, ['status', '--porcelain'])) throw new Error('Commit or remove nonignored changes before initializing Unmix.');
      const l = { version: 1, base, tasks: [], active: null, plans: {} };
      git(this.repo, ['update-ref', 'refs/unmix/base', base]);
      atomic(this.file, l);
      return { repo: this.repo, base, initialized: true };
    });
  }
  begin({ taskId, title, intent, dependsOn = [], checks: commands = [] }) {
    id(taskId); text(title, 'Title'); text(intent, 'Intent'); checks(commands);
    return this.locked(() => {
      const l = this.load();
      if (l.active) throw new Error(`Task ${l.active.taskId} is still active.`);
      if (l.tasks.some(t => t.taskId === taskId)) throw new Error('Task ID already exists.');
      if (!Array.isArray(dependsOn) || dependsOn.some(d => !l.tasks.some(t => t.taskId === d))) throw new Error('Dependencies must reference finished tasks.');
      const before = l.tasks.at(-1)?.after || l.base;
      if (this.snapshot() !== git(this.repo, ['rev-parse', `${before}^{tree}`]))
        throw new Error('Unrecorded changes detected. Restore the last recorded tree or initialize a fresh ledger in a separate repository.');
      l.active = { taskId, title, intent, dependsOn: [...new Set(dependsOn)], checks: commands, before };
      atomic(this.file, l);
      return l.active;
    });
  }
  finish() {
    return this.locked(() => {
      const l = this.load();
      if (!l.active) throw new Error('No active task.');
      const t = { ...l.active };
      t.after = this.snapshot(this.repo, t.before, `Unmix task: ${t.taskId}\n\n${t.intent}`);
      if (git(this.repo, ['rev-parse', `${t.after}^{tree}`]) === git(this.repo, ['rev-parse', `${t.before}^{tree}`])) throw new Error('Task has no file changes.');
      t.files = git(this.repo, ['diff', '--name-only', t.before, t.after]).split('\n');
      git(this.repo, ['update-ref', `refs/unmix/tasks/${t.taskId}`, t.after]);
      l.tasks.push(t); l.active = null;
      atomic(this.file, l);
      return t;
    });
  }
  timeline() { const l = this.load(); return { base: l.base, tasks: l.tasks, active: l.active }; }
  getPlan(planId) {
    id(planId);
    const p = this.load().plans[planId];
    if (!p) throw new Error('Unknown plan.');
    return p;
  }
  assertCandidate(p) {
    if (!fs.existsSync(p.candidate)) throw new Error('Candidate directory is missing.');
    if (fs.realpathSync(p.candidate) !== p.candidate) throw new Error('Candidate path was replaced by a symlink.');
    const common = git(p.candidate, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
    const original = git(this.repo, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
    if (common !== original || fs.realpathSync(git(p.candidate, ['rev-parse', '--show-toplevel'])) !== p.candidate)
      throw new Error('Candidate is no longer the expected Git worktree.');
  }
  prepare({ remove, output, instruction, checks: extra = [] }) {
    checks(extra); text(instruction, 'Removal instruction');
    return this.locked(() => {
      const l = this.load();
      if (l.active) throw new Error('Finish the active task first.');
      if (!Array.isArray(remove) || !remove.length || remove.some(r => !l.tasks.some(t => t.taskId === r))) throw new Error('Select one or more finished task IDs to remove.');
      const planId = 'plan-' + randomUUID().slice(0, 8);
      const requested = path.resolve(output || path.join(path.dirname(this.repo), `${path.basename(this.repo)}-${planId}`));
      if (fs.existsSync(requested)) throw new Error('Candidate directory must not exist.');
      const candidate = path.join(fs.realpathSync(path.dirname(requested)), path.basename(requested));
      if (candidate === this.repo || candidate.startsWith(this.repo + path.sep) || this.repo.startsWith(candidate + path.sep)) throw new Error('Candidate must be outside the original repository.');
      git(this.repo, ['worktree', 'add', '--detach', candidate, l.base]);
      const p = { planId, candidate, base: l.base, remove: [...new Set(remove)], instruction,
        extraChecks: extra, cursor: 0, blocked: null, status: 'draft', verification: null,
        tasks: l.tasks.filter(t => !remove.includes(t.taskId)).map(t => ({ ...t, replay: 'pending' })),
        removedTasks: l.tasks.filter(t => remove.includes(t.taskId)) };
      l.plans[planId] = p;
      // Save before replay so a process interruption still leaves a discoverable plan.
      atomic(this.file, l);
      this.replay(p, l);
      atomic(this.file, l);
      return p;
    });
  }
  replay(p, ledger) {
    this.assertCandidate(p);
    while (p.cursor < p.tasks.length) {
      const t = p.tasks[p.cursor];
      const patch = run(this.repo, 'git', ['diff', '--binary', '--full-index', t.before, t.after]);
      if (!patch.ok) throw new Error('Unable to read task patch.');
      const applied = run(p.candidate, 'git', ['-c', 'core.hooksPath=/dev/null', 'apply', '--3way', '--index', '--whitespace=nowarn', '-'], { input: patch.stdout });
      const missing = t.dependsOn.filter(d => p.remove.includes(d));
      if (!applied.ok || missing.length) {
        t.replay = 'needs_adaptation';
        p.blocked = { taskId: t.taskId, kind: applied.ok ? 'removed_dependency' : 'patch_conflict',
          removedDependencies: missing, detail: applied.stderr.slice(0, 16000) };
        p.status = 'needs_adaptation';
        atomic(this.file, ledger);
        return;
      }
      const commit = this.snapshot(p.candidate, git(p.candidate, ['rev-parse', 'HEAD']), `Retain ${t.taskId}`);
      git(p.candidate, ['reset', '--hard', commit]);
      t.replay = 'replayed'; p.cursor++;
      atomic(this.file, ledger);
    }
    p.blocked = null; p.status = 'ready_for_checks';
  }
  resume({ planId, note }) {
    text(note, 'Adaptation note');
    return this.locked(() => {
      const l = this.load(), p = l.plans[id(planId)];
      if (!p || !p.blocked) throw new Error('Plan is not waiting for adaptation.');
      this.assertCandidate(p);
      if (git(p.candidate, ['diff', '--name-only', '--diff-filter=U'])) throw new Error('Unmerged files remain. Resolve conflicts and git add the resolved files in the candidate.');
      const commit = this.snapshot(p.candidate, git(p.candidate, ['rev-parse', 'HEAD']), `Adapt ${p.blocked.taskId}\n\n${note}`);
      git(p.candidate, ['reset', '--hard', commit]);
      p.tasks[p.cursor].replay = 'adapted'; p.tasks[p.cursor].adaptationNote = note;
      p.cursor++; p.blocked = null; p.verification = null;
      this.replay(p, l); atomic(this.file, l);
      return p;
    });
  }
  verify({ planId }) {
    return this.locked(() => {
      const l = this.load(), p = l.plans[id(planId)];
      if (!p) throw new Error('Unknown plan.');
      this.assertCandidate(p);
      if (p.blocked || p.cursor !== p.tasks.length) throw new Error('Resolve and replay all retained tasks before verification.');
      const configured = [...p.tasks.flatMap(t => t.checks), ...p.extraChecks];
      const commands = [...new Map(configured.map(c => [JSON.stringify(c), c])).values()];
      if (!commands.length) throw new Error('No behavioral checks configured. Cannot mark a candidate verified.');
      const beforeTree = this.snapshot(p.candidate);
      const results = commands.map(([cmd, ...args]) => ({ command: [cmd, ...args], ...run(p.candidate, cmd, args) }));
      const afterTree = this.snapshot(p.candidate);
      const changedDuringChecks = beforeTree !== afterTree;
      const passed = results.every(r => r.ok) && !changedDuringChecks;
      p.verification = { passed, tree: afterTree, changedDuringChecks, results, at: new Date().toISOString(), scope: 'Configured checks only; this is not proof of all behavior.' };
      p.status = passed ? 'checks_passed' : 'checks_failed';
      atomic(this.file, l); return p.verification;
    });
  }
  inspect(planId) {
    const p = this.getPlan(planId);
    this.assertCandidate(p);
    const verificationStale = !!p.verification && p.verification.tree !== this.snapshot(p.candidate);
    return { ...p, verificationStale, status: verificationStale ? 'checks_stale' : p.status,
      diff: run(p.candidate, 'git', ['diff', p.base]).stdout };
  }
  prompt(planId) {
    const p = this.getPlan(planId);
    return [
      'You are adapting an Unmix reconstruction. Work only in the candidate worktree.',
      `Candidate: ${p.candidate}`, `Original (do not edit): ${this.repo}`, `Plan: ${p.planId}`,
      `User instruction: ${p.instruction}`, '',
      'REMOVE these intents:', ...p.removedTasks.map(t => `- ${t.taskId}: ${t.intent}`), '',
      'PRESERVE these intents:', ...p.tasks.map(t => `- ${t.taskId} [${t.replay}]: ${t.intent}`), '',
      `Blocked task: ${JSON.stringify(p.blocked)}`, '',
      'When adapting a blocked task, inspect its original patch with git diff BEFORE AFTER, using these commit pairs:',
      ...p.tasks.map(t => `- ${t.taskId}: ${t.before} ${t.after}; files: ${t.files.join(', ')}`), '',
      'Resolve conflict markers and stage resolved files only in the candidate. Do not run git reset/checkout on the original.',
      'Call unmix_resume with the planId and a concrete adaptation note after repairing the blocked task.',
      'Repeat if another task blocks. Do not edit the ledger or weaken retained tests to make them pass.',
      'For a new removal behavior, add a separate regression check; existing checks cannot prove the requested removal.',
      'Call unmix_verify after all tasks replay. Passing means only that configured checks passed.',
      'Return candidate path, observed changes, test results and unresolved limitations. Never merge automatically.',
      '', 'Configured checks:', ...[...p.tasks.flatMap(t => t.checks), ...p.extraChecks].map(c => JSON.stringify(c)),
    ].join('\n');
  }
}
