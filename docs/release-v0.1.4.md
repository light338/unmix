# Unmix v0.1.4 — manual checks with snapshot freshness

Implements the workflow gap raised by [TheodorNEngoy](https://github.com/openai/codex/discussions/53955#discussioncomment-18946488): record separate interaction observations, then see whether later adaptations changed their candidate snapshot.

- New `unmix_manual_check` MCP tool and `manual-check` CLI command.
- Record a stable check ID, procedure, outcome, observer, note and optional evidence references against `candidateTree` inspected before testing. Refuse a submission when that tree has changed.
- Inspection and JSON/Markdown reports expose latest observations and append-only history, with `stale` on content changes. Rechecking one check never refreshes another. Resume retains history.
- Keep manual evidence separate from automated checks: a passing test run cannot refresh manual results, and a manual pass cannot replace executable checks.
- Support existing plans without migration. Inspection now includes `candidateTree` and nonignored untracked files in its aggregate diff.

Validation: 24 offline integration tests, including six manual-evidence scenarios and actual CLI/stdio MCP calls. The fixtures explicitly identify authored observations; no real human UI testing or new live model adaptation is claimed for this release. Existing v0.1.1 model evidence remains historical.

Freshness covers nonignored Git file content and modes, not browser/storage/database/runtime/deployment state. Recorded observer identity and evidence references are caller supplied and not authenticated. This remains an experimental local tool; passing checks and current observations do not prove all behavior.

See [manual-check documentation](manual-checks.md) for the workflow and limits. No dependencies, telemetry, hosted backend or automatic merge added.
