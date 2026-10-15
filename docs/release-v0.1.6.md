# Unmix v0.1.6 — preview removal impact

Inspect the consequences recorded in your task history before creating a candidate
or spending a model run on adaptation.

- New read-only `unmix_preview` MCP tool and `preview` CLI command, JSON or Markdown.
- Show selected removals, direct/transitive dependency paths, shared-file evidence
  and tasks with no declared link. These are signals, not a safety guarantee.
- List retained check commands without executing them. No candidate, replay,
  model, ledger write or Git-object write occurs during preview.
- Optional `expectedTimeline` in prepare refuses a stale reviewed task timeline
  before creating a worktree; existing prepare calls remain compatible.
- Expose unfinished recording separately; preserve literal file names and rename
  endpoints in snapshot evidence.
- Add a reproducible five-task fixture and generated impact table.

Validation: all 36 integration tests, including direct/transitive/multiple
removals, untouched source/index/ledger/Git objects, unknown conflicts, active
recording, stale refusal, literal file names, CLI, real stdio MCP and example output.

This remains an experimental local tool. Preview does not infer hidden semantic
or runtime dependencies and cannot establish behavior preservation. No new live
model adaptation or independent user test is claimed.

See [preview workflow and limitations](removal-preview.md).
