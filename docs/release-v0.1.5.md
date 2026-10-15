# Unmix v0.1.5 — protect recorded test and check inputs

Previously the core verifier could run a weakened candidate test and return a
passing result. New reconstruction plans now freeze selected test/config file
versions from base and retained-task Git evidence before adaptation.

- Reject modified/deleted selected tests, file-mode changes, symlink replacements
  and modified test/package configuration before running commands.
- Optional `protectedFiles` selects custom scripts and fixtures by literal path.
- Show expected/actual object IDs and provenance in inspection and JSON/Markdown
  reports; preserve candidate/original files and real indexes during review.
- Stop subsequent commands when an earlier command changes candidate content.
- Keep new regression tests possible and manual observations separate.
- Label old plans `unavailable_legacy_plan`; prepare a new plan for enforcement.

Validation: 30 integration tests, including negative tests for weakened assertions,
configuration edits, deletion, symlink/mode changes, retained updates/deletions,
custom checkers, retry, legacy behavior, CLI exit status and real stdio MCP calls.
The existing shop reconstruction demo remains covered. No new live model run or
external adoption is claimed.

This is a guard for selected recorded files, not a malicious-agent sandbox or
semantic proof. Heuristic discovery is incomplete; external oracles, ignored
files, runtime and installed dependencies are not frozen. See
[protected-input workflow and limits](protected-inputs.md).
