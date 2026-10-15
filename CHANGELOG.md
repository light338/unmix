# Changelog

## 0.1.3 — 2026-10-15

- Added `unmix_report` MCP tool and `report` CLI command in JSON and Markdown.
- Retained tasks now record original and resulting snapshot pairs for per-task review.
- Blocker history and adaptation notes remain visible after replay resumes.
- Removed, pending and unfinished tasks are distinguished from completed results.
- Additional candidate changes, including untracked files, appear separately;
  reports expose check freshness without executing checks.
- Legacy plans explicitly mark missing result evidence instead of inferring it.
- Added a generated review example and regression coverage through core, CLI and MCP.
- Implemented following bomtobe-hgkim's reviewability feedback in Codex Discussion #53955.

## 0.1.2 — 2026-10-14

- First-project walkthrough for recording and removing a decision through Codex.
- First-use and bug report issue forms for independent developer feedback.
- Public release notes and a concrete first-user testing protocol.
- Corrected CLI help version and clarified the opt-in live runner in the README.

## 0.1.1 — 2026-10-14

- Verified real Codex CLI task recording and agent-authored reconstruction over stdio MCP.
- Added an opt-in live notebook runner, external behavioral oracle and raw evidence logging.
- Added independent audit of original files/HEAD/index/status, retained tests and oracle hashes.
- Added regression tests rejecting weakened retained tests and preservation violations.
- Documented the nested macOS sandbox limitation and exact live experiment scope.

Local source release; no npm publication or GitHub release. One synthetic live
workflow passed; the core verifier still does not freeze arbitrary project tests.

## 0.1.0 — 2026-10-14

- Local Git-backed task ledger with intent, dependencies and check commands.
- Snapshots using an isolated Git index and private snapshot refs.
- Separate candidate worktrees with three-way patch replay.
- Explicit adaptation stops for conflicts and removed declared dependencies.
- Repair prompt, resume, inspection and check-staleness detection.
- Nine-tool stdio MCP server for Codex integration.
- Five-task checkout demo and integration tests.

Release scope: authored repairs in the demo; live Codex connection and general
semantic adaptation are not yet validated. This is a local source release,
not a published npm package or GitHub release.
