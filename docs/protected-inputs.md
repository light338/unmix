# Protect recorded check inputs

From v0.1.5, a newly prepared plan records a protected-input manifest **before**
replay or adaptation. It uses the Git objects for the original base and then
applies file versions/deletions from each retained task in order. It never
learns a supposedly trusted baseline from an already adapted candidate.

## What is protected

Automatic discovery selects test/spec/fixture/snapshot directories, common
`*.test.*`, `*.spec.*`, `test_*.*`, `*_test.*` names, package/dependency manifests
and locks, common JS/TS/Python test configuration, `.gitignore`, `.gitattributes`,
package-manager configuration and `.github/workflows/` files. This is a
conservative naming heuristic, not complete dependency discovery.

Files introduced only by a removed task are not automatically copied back.
Base tests remain protected. A later recorded retained-task update supplies its
new expected version; a retained deletion supplies an expected absence. Content,
Git file mode and object type must match. Protected inputs must be regular files:
symlink/submodule baselines are refused because freezing a link would not freeze
its external target. New regression files can be added in the candidate; they
do not replace protected existing tests and are not automatically registered
as extra commands.

For custom check scripts, fixtures or configuration not recognized by the
heuristic, add literal repository-relative paths to `protectedFiles` in
`unmix_prepare` (or CLI `prepare`):

```json
{
  "remove": ["registration"],
  "instruction": "Keep guest checkout and receipts.",
  "checks": [["node", "scripts/check-guest.mjs"]],
  "protectedFiles": ["scripts/check-guest.mjs", "data/expected-receipt.json"]
}
```

Explicit files must exist in the base/retained-task evidence. Traversal, absolute
paths, `.git` paths, directories and absent files are refused before creating a
worktree. There is no candidate-side approval or rebaseline command. If the
recorded contract genuinely must change, review the intended contract and record
that change before preparing a new plan. Avoid accepting a test deletion solely
to make a failing implementation pass.

## Verification and review

`unmix_inspect` and JSON/Markdown `unmix_report` include `protectedInputs` with
state `intact` or `changed`, expected/actual object IDs and modes, recorded
provenance, and the number of selected entries. Zero entries means discovery
found no check inputs; it is not proof that every check is protected.

`unmix_verify` compares the candidate before executing commands. If protected
inputs changed, it returns `passed: false`,
`skipped: "protected_inputs_changed"`, no executed results, and the violations.
CLI verification exits with code 2. Restoring the recorded bytes/modes permits a
retry. A command that changes nonignored candidate content stops later commands;
that run fails. The recorded verification contains before/after integrity and
normal command output. Changes after verification still make its result stale.

Manual interaction observations remain separate and retain their own snapshot
freshness. An intact protected manifest does not refresh manual checks or prove
semantic preservation.

## Existing plans and boundaries

Plans prepared before v0.1.5 report `unavailable_legacy_plan`, including in
verification evidence. They keep their existing command-only verification
behavior; a new plan is required for protected-input enforcement. No post-edit
baseline is invented.

This guard prevents accidental candidate-side weakening of **selected recorded
files**. It does not defend against a malicious agent that can alter the ledger,
Git configuration/attributes/filters, object storage, runtime, dependencies or
Unmix itself. It does not freeze external absolute-path oracles, installed
packages, ignored files, services, environment or transient changes restored
before sampling. Existing untracked source snapshots use Git's normal filters
and ignore rules. Use independently controlled external contracts or auditing
when those boundaries matter. The worktree is not an OS sandbox.

The base and recorded retained-task tests themselves may already be incomplete
or incorrect. Protecting their bytes does not validate their quality, coverage,
or the behavior of unselected inputs. A recorded retained deletion remains an
explicit review item, not a guarantee that the deletion was appropriate.
