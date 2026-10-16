# Changelog

## 0.1.9 — 2026-10-16

- Add phase-specific manual context declarations for browser, environment,
  test-account/authentication, session and data conditions.
- Bind observations to an inspected context revision; changed declarations make
  earlier manual results stale independently of Git files.
- Compare original/candidate conditions in passports, expose differences and
  block contextual manual requirements when conditions are missing or differ.
- Keep legacy file-only evidence explicit; do not infer automatic external state.

## 0.1.8 — 2026-10-16

- Fix non-UTF8 patch corruption and isolate machine patches from Git display
  drivers, prefix/color settings and relative path formatting.
- Reject baseline exit-1 removal evidence without its explicit assertion marker;
  document migration for v0.1.7 passports. Add strict ID/schema/CLI validation.
- Pin historical replay refs, expose lossless report patches, save recoverable
  replay checkpoints and preserve literal filenames from recorded snapshots.
- Update the Russian start guide and add regressions for all reproduced defects.

## 0.1.7 — 2026-10-16

- Add optional preservation passports with fixed requirement IDs, preserve/remove
  criteria and automated/manual evidence in original and candidate versions.
- Run baseline criteria in a separate original worktree. Expose pre-existing
  failures, unproven removal, missing/stale evidence and concrete repair requests.
- Gate candidate success on current passport obligations; retain legacy behavior
  for plans without requirements. Add workflow and reproducible fixture.

## 0.1.6 — 2026-10-16

- Add read-only removal preview via MCP/CLI, with JSON and Markdown impact table.
- Distinguish direct/transitive declared dependencies, removed tasks, shared files
  and no recorded link without claiming to predict actual conflicts or behavior.
- Add optional stale-timeline refusal to prepare and show active recording separately.
- Read literal file evidence from recorded snapshots; no worktree or Git objects
  are created by preview, and no checks/model are run.
- Add six preview integration scenarios, CLI/MCP coverage and a generated example.

## 0.1.5 — 2026-10-16

- Protect selected test/config file versions from base and retained-task evidence
  before candidate adaptation, with literal custom `protectedFiles` paths.
- Refuse changed protected inputs before executing checks; expose violations in
  inspection and JSON/Markdown reports. Keep legacy protection unavailable explicit.
- Stop subsequent commands after a check changes nonignored candidate content.
- Add six protection integration scenarios and extend CLI/MCP coverage.
- Keep the independent live auditor's retained-test diagnosis before status checks.

## 0.1.4 — 2026-10-15

- Added `unmix_manual_check` MCP tool and `manual-check` CLI command following
  TheodorNEngoy's feedback in Codex Discussion #53955.
- Tie caller-supplied manual observations to an inspected candidate tree; refuse
  recording if it changed before submission. Keep independent IDs and history.
- Report stale observations after candidate changes, including after resume;
  automatic verification cannot refresh manual results.
- Expose manual evidence separately in inspection and JSON/Markdown reports;
  preserve original files/HEAD/index and retain observed Git trees.
- Inspection now includes candidateTree and untracked nonignored diff content.
- Added six integration scenarios, CLI/MCP coverage and workflow documentation.
- State runtime/browser/data exclusions and unauthenticated observer/evidence limits.

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
