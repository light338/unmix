# Preview removal impact before reconstruction

`unmix_preview` (CLI `preview`) reads recorded tasks and Git snapshot file lists
without creating a candidate, replaying patches, running checks, invoking a model,
writing the ledger or creating Git objects/refs. JSON is the default; Markdown
adds a compact impact table and the detailed evidence.

```sh
node /absolute/unmix/bin/unmix.mjs preview --repo /absolute/project --json '{"remove":["registration"],"format":"markdown"}'
```

If exporting to a file, save it outside the original/candidate repository.

## Signals shown for every task

| State | What it means |
| --- | --- |
| `removed` | Explicitly selected for omission. |
| `direct_dependency` | A retained task declares a dependency on a removed task. |
| `transitive_dependency` | A retained task is reachable from a removed task through recorded dependencies. |
| `shared_files` | No declared dependency path, but the task changed a file also changed by a selected removed task. |
| `no_declared_link` | Neither a recorded dependency path nor overlap with selected removed-task files was found. |

Dependency states take precedence over file overlap in the summary; detailed
rows retain both signals. `dependencyPaths` contains one shortest recorded path
per removed root. `dependencyEdges` includes the whole declared graph. These
paths explain the signal, not inferred semantic causality. Multiple selected
removals are deduplicated in recording order.

File lists come from before/after snapshot diffs with rename detection disabled,
so a rename includes old and new paths. Literal spaces/newlines are preserved in
JSON. The preview does not rely on older escaped `task.files` display strings.

Rows expose intent, declared dependencies, file overlap and registered check
commands. `retainedChecks` deduplicates retained tasks' commands; these are shown,
never executed. Additional checks for the new removal behavior still need to be
supplied when preparing the actual reconstruction.

## Carry the reviewed timeline into prepare

The result contains `timelineFingerprint` and `next.arguments` with the selected
IDs and `expectedTimeline`. Copy those arguments to `unmix_prepare`, adding the
user's desired `instruction`, any additional checks, and optional protected files:

```json
{
  "remove": ["registration"],
  "expectedTimeline": "COPY_TIMELINE_FINGERPRINT_FROM_PREVIEW",
  "instruction": "Keep checkout and receipts, allowing guests to pay."
}
```

If task metadata, snapshots or the active task changed since preview, prepare
refuses the supplied fingerprint before creating a candidate. Refresh and review
the preview. The token covers base/task/active-task ledger data, not working-tree,
runtime or environment state. Creating another plan does not invalidate it.
It is not an authentication token. Omitting it preserves the existing prepare
API; use it when preparing from a reviewed preview.

Preview can read finished tasks while another task is active, but it exposes
`recordingComplete: false` and the active task separately. Unfinished edits are
not analyzed or inferred. Finish the active task before prepare; only finished
IDs can be selected for removal.

## Unknown until reconstruction

Shared files do not prove a patch conflict. `no_declared_link` does not prove
independence, safety or behavior preservation. The preview does not analyze
unrecorded source edits, hidden dependencies, database state, external services,
actual merge conflicts or test correctness. Every row explicitly says
`replay: not_attempted`, `conflicts: unknown`, `behaviorPreserved: not_verified`.
The later prepare/report/verify/manual-review steps remain necessary.

## Reproduce the example

```sh
node examples/preview.mjs /absolute/new-preview-demo
```

This creates an explicitly authored five-task fixture, then writes `preview.json`
and `preview.md` outside its project directory. It refuses existing output roots.
There are zero candidate worktrees and no patch, check or model execution.
See the [generated preview](preview-example.md). It illustrates tracking only;
it does not implement a real checkout or claim external adoption.
