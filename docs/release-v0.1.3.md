# Unmix v0.1.3 — task-by-task review reports

Added specifically in response to [bomtobe-hgkim's reviewability feedback](https://github.com/openai/codex/discussions/53955#discussioncomment-18930579).

New `unmix_report` MCP tool and `report` CLI command expose JSON or Markdown:

- Original and recorded resulting patches for each completed retained task.
- Replay outcome, intent, dependency IDs, adaptation note and blocker history.
- Intentionally removed tasks, pending tasks and the current blocker.
- Additional candidate changes outside completed task snapshots, including untracked files.
- Aggregate candidate diff, configured checks, recorded results and freshness.

Generate it before checks; it does not run check commands. Regenerate it after
verification to review outcomes. `unmix_prepare` exposes the report tool/plan ID,
and repair prompts recommend reviewing the report before checks.

[Usage and evidence limits](task-report.md) · [Generated report](report-example.md)

```sh
node bin/unmix.mjs report --repo /absolute/project --json '{"planId":"PLAN_ID","format":"markdown"}' > /outside/project/review.md
```

Snapshots are recorded for plans prepared with v0.1.3. Existing plans remain
readable but explicitly mark unavailable per-task result evidence; prepare a new
plan for the complete report. Later task edits can overwrite earlier results:
this is a historical replay review, not semantic ownership of final lines or
proof that every behavior survived. Blockers are discovered incrementally.

Validation: 18 tests cover existing behavior plus conflict/dependency history,
pending work, original/result attribution, overlapping tasks, stale checks,
untracked edits, legacy plans, binary patches, CLI Markdown and stdio MCP JSON /
Markdown discovery and calls. The generated checkout example uses explicitly
authored repairs; this update does not claim a new live model evaluation.

No npm dependencies or registry publication. Local CLI/MCP source release,
experimental; existing project checks remain trusted executable code.
