# Unmix v0.1.7 — preservation passports

Declare what must survive a removal, and require evidence for every obligation.
Passing automated commands alone no longer closes a configured passport while
manual requirements are missing or stale.

- Optional requirements in prepare with stable IDs, preserve/remove criteria,
  automated commands or separate manual interaction IDs and procedures.
- Baseline verification in a separate original worktree at the last recorded task
  snapshot. Original files, branch and staged index are not used as a test workspace.
- Preserve criteria must pass on both versions; removal criteria must fail on the
  original and pass on the candidate. Existing original failures, already-passing
  removal criteria, command errors and unperformed observations remain explicit.
- Current readiness, evidence by requirement, Markdown table and repair requests
  in inspect/report. Requirements stay fixed for that plan during adaptation.
- Existing protected check inputs, per-snapshot freshness and backward-compatible
  verification when no passport is configured.

Validation: 45 integration tests including stdio MCP, CLI, pre-existing failures,
missing/stale manual observations, changed procedures, protected inputs, launch
errors, baseline tampering, implementation repair and the reproducible example.
All tests also run from the extracted source archive.

The example uses authored repairs and synthetic observations. No new live model,
real browser/manual test or independent user validation is claimed. This is an
experimental workflow guard for declared scenarios, not proof of all behavior,
causality, or a security boundary against an agent that can edit the ledger/runtime.

See [workflow and limits](preservation-passport.md) and [generated example](passport-example.md).
