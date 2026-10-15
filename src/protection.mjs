// A workflow guard over recorded Git objects, not a security boundary against
// an agent that can edit the ledger, Git configuration, runtime or dependencies.
export function validateProtectedFiles(files) {
  if (!Array.isArray(files) || files.length > 256 || files.some(file =>
    typeof file !== 'string' || !file || file.length > 4096 || file.includes('\0') || file.includes('\\') ||
    file.split('/').some(part => !part || part === '.' || part === '..' || part.toLowerCase() === '.git') || file.startsWith('/')))
    throw new Error('protectedFiles must contain at most 256 literal repository-relative file paths without traversal or .git.');
}
export function treeEntries(git, cwd, revision) {
  const rows = git(cwd, ['ls-tree', '-rz', '--full-tree', revision]);
  return new Map(rows.split('\0').filter(Boolean).map(row => {
    const tab = row.indexOf('\t'), [mode, type, oid] = row.slice(0, tab).split(' ');
    return [row.slice(tab + 1), { mode, type, oid }];
  }));
}
function automatic(file) {
  const name = file.split('/').at(-1);
  return /(^|\/)(?:test|tests|__tests__|spec|specs|__snapshots__|fixtures)(\/|$)/i.test(file)
    || /(?:^test_.+|.+_test|.+\.(?:test|spec))\.[^/]+$/i.test(name)
    || /^(?:package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|pyproject\.toml|pytest\.ini|tox\.ini|setup\.cfg|requirements[^/]*\.txt|Cargo\.(?:toml|lock)|go\.(?:mod|sum)|Gemfile(?:\.lock)?|\.gitignore|\.gitattributes|\.npmrc|\.yarnrc(?:\.yml)?)$/i.test(name)
    || /^(?:tsconfig(?:\.[^.]+)*\.json|(?:vitest|vite|jest|playwright|cypress)\.config\.[^/]+)$/i.test(name)
    || file.startsWith('.github/workflows/');
}
export function buildProtection(git, repo, base, tasks, explicit) {
  validateProtectedFiles(explicit);
  const selected = new Set(explicit), entries = new Map();
  const isSelected = file => selected.has(file) || automatic(file);
  for (const [file, entry] of treeEntries(git, repo, base)) if (isSelected(file)) entries.set(file, { file, expected: entry, source: 'base' });
  for (const task of tasks) {
    const after = treeEntries(git, repo, task.after);
    const changed = git(repo, ['diff', '--name-only', '-z', '--no-renames', task.before, task.after]).split('\0').filter(Boolean);
    for (const file of changed) if (isSelected(file)) entries.set(file, { file, expected: after.get(file) || null, source: task.taskId });
  }
  for (const file of selected) if (!entries.get(file)?.expected) throw new Error(`Protected file is absent from the base/retained task evidence: ${file}`);
  for (const entry of entries.values()) if (entry.expected && !['100644', '100755'].includes(entry.expected.mode))
    throw new Error(`Protected input must be a regular file, not a symlink/submodule: ${entry.file}`);
  return { version: 1, entries: [...entries.values()].sort((a, b) => a.file.localeCompare(b.file)),
    scope: 'Recorded base plus retained-task test/config file versions and explicit protectedFiles. Heuristic discovery is incomplete; external inputs, ignored files, runtime and dependencies are not frozen. Not a security sandbox.' };
}
export function inspectProtection(git, repo, p, candidateTree) {
  if (!p.protection) return { state: 'unavailable_legacy_plan', violations: [], scope: 'Prepare a new plan to protect recorded test/config inputs; no baseline is inferred for legacy plans.' };
  const actual = treeEntries(git, repo, candidateTree);
  const violations = p.protection.entries.flatMap(entry => {
    const found = actual.get(entry.file) || null;
    return JSON.stringify(found) === JSON.stringify(entry.expected) ? [] : [{ ...entry, actual: found }];
  });
  return { state: violations.length ? 'changed' : 'intact', violations, protectedCount: p.protection.entries.length,
    entries: p.protection.entries, scope: p.protection.scope };
}
