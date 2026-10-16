# Unmix v0.1.9 — manual browser and account conditions

Record the conditions behind each manual interaction, not only its Git tree.
This extends the feedback about separate “Like saved” and “scroll position
preserved” checks with explicit browser/account/environment evidence.

- New `unmix_manual_context` MCP tool and `manual-context` CLI command declare
  browser/version, environment, test-account/authentication, session and data
  labels independently for original and candidate phases.
- Inspect the context revision before interacting, then submit `expectedContext`
  alongside `expectedTree`. A changed declaration refuses a racing submission
  and invalidates previous phase observations even if code stays unchanged.
- Reports separate file freshness from declared-condition freshness, retain the
  observed context per record and compare original/candidate conditions by field.
- Contextual manual passports block missing/unknown conditions and mismatches.
  Separate server URLs are displayed but allowed when the other labels match.
- Older observations remain explicitly without external context. File-only
  verification stays compatible until context declarations opt the plan into
  enforcement; no old record is silently promoted.

Validation: all 70 tests pass, including actual stdio MCP/CLI, account changes,
login/logout, browser/data/environment differences, revision races, per-ID
rechecking, legacy records, input rejection and the updated authored example.
All 27 JavaScript modules pass syntax checks. Tests also run from the extracted ZIP.

This is caller-declared evidence, not browser monitoring or proof a human acted.
Do not submit cookies, passwords, tokens or private account details. Undeclared
external changes remain undetected. No new live model or human/browser test is
claimed; examples and observations in tests are synthetic.

See [workflow and limits](manual-context.md).
