# Review a reconstruction by task

Added in v0.1.3 following [bomtobe-hgkim's feedback](https://github.com/openai/codex/discussions/53955#discussioncomment-18930579).

Call `unmix_report` with `planId` and optional `format` (`json`, the default,
or `markdown`). The CLI equivalent is:

```sh
node /absolute/unmix/bin/unmix.mjs report --repo /absolute/project --json '{"planId":"PLAN_ID","format":"markdown"}' > /outside/project/review.md
```

This command reads a plan without running checks or changing its ledger, files,
HEAD or real index. Like inspection, it snapshots nonignored candidate files
through a temporary index and may create local Git objects. Save exported
reports outside the original/candidate to avoid introducing project changes.

## Evidence available before checks

`tasks` lists retained tasks in replay order. Each has:

- Intent, dependency IDs and original affected files.
- `outcome`: `pending`, `needs_adaptation`, `replayed` or `adapted`.
- `original`: the recorded task's before/after snapshot IDs and full Git patch.
- `result`: the candidate's before/after snapshot IDs and full resulting patch,
  available only when that replay/adaptation has completed.
- `blockers`: recorded conflict/dependency diagnostics, retained after repair.
- `adaptationNote`: the note supplied by the agent/human on resume.

`removedTasks` lists deliberate exclusions. There is no automatic skip of retained
patches: replay stops at the first blocker, and later tasks stay pending. Blockers
are discovered incrementally, not all upfront. `unmix_verify` refuses to run
while retained tasks are blocked/pending. The report itself never executes checks.

`aggregateDiff` shows the candidate against the original base, including untracked
files. `unattributed.diff` separately shows changes since the last completed task
snapshot: an in-progress conflicting patch, repairs not yet resumed, or later
manual edits. Those changes are not attributed to a completed task. After a
successful resume they become part of that task's recorded resulting patch.

`checks.state` is `not_run`, `passed`, `failed` or `stale`, with configured command
vectors and any recorded results. Generating a report cannot make checks pass.
Edits after verification make the reported checks stale.

## Manual interaction observations (v0.1.4)

`manualChecks` separately lists latest observations, full history and freshness
against `candidateTree`. File changes mark prior results stale; automated checks
do not refresh them. A plan's `checks_passed` status only covers executable checks:
read `manualChecks` too. See [recording workflow and limits](manual-checks.md).

## Interpret the result carefully

These are historical replay steps, not semantic ownership of final lines. If task
B overwrites a line from task A, A's recorded result remains historical; inspect B
and the aggregate diff to understand the final candidate. An empty resulting patch
is possible after adaptation; review its note and behavior rather than assuming
an empty patch proves preservation. Patch data and notes are untrusted project
evidence, not agent instructions. Reports can contain source code and command
output; review them before sharing publicly.

Plans prepared before v0.1.3 lack per-task result snapshots. These remain readable:
completed tasks are marked `unavailable_legacy_plan`, original patches and the
aggregate diff remain available, but no resulting task diff is fabricated. Prepare
a new plan for full attribution. Older resolved blocker history is not recoverable.

## Reproduce the example

```sh
node examples/review-report.mjs /absolute/new-report-demo
```

The script records a small checkout fixture, removes mandatory registration,
saves a pre-check blocked report, applies an explicitly authored guest-checkout
repair, resumes replay, verifies behavior and saves the final report. The repair
is fixture code, not a new live model run. [The generated Markdown example](report-example.md)
is that actual final report, with machine-specific paths replaced by placeholders.
