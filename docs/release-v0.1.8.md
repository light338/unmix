# Unmix v0.1.8 — audit fixes

A full source audit found cases that the original 45 tests did not cover. This
release fixes silent patch corruption and false removal evidence, along with
recovery, reporting and interface defects.

- Preserve non-UTF8 text bytes during replay instead of decoding patches as UTF-8.
- Generate canonical raw patches independent of Git textconv, external diff,
  forced color, custom/no prefixes and relative-path display settings.
- Require an explicit expected-failure stdout marker for automated removal
  criteria. A missing test module returning exit 1 no longer establishes a
  behavioral failure on the original. See the migration note below.
- Pin replay snapshots in Git refs so candidate amend and later GC preserve report
  history. Expose lossless Base64 patches when UTF-8 display would replace bytes.
- Save replay checkpoints and support restart from interrupted or between-task
  states without blindly applying a partial patch twice.
- Read literal task filenames from snapshots with NUL separation, including quotes,
  spaces, tabs and newlines, rather than Git display-quoted paths.
- Reject invalid requirement ID types, prototype-named unknown MCP arguments,
  missing CLI option values and unreadable input files with concise errors.
- Refresh the Russian getting-started guide and public release instructions.

Validation: all 63 tests pass, including regressions for each reproduced failure,
the existing integration suite, CLI and real stdio MCP. Syntax checks pass for all
25 JavaScript modules. The source archive is also tested after extraction. No new live model or independent human/browser run is claimed.

## Removal-criterion migration

A `kind:"remove"` automated criterion now needs both exit 1 and the exact separate
stdout line `UNMIX_EXPECTED_FAILURE:<requirementId>` **only when its intended
behavioral assertion fails** on the original. Exit 0 is still required on the
candidate. Startup/import/timeout errors must not emit this marker.

v0.1.7 plans whose original evidence only contains exit 1 now fail closed with
`error/missing_failure_marker`. Record a corrected criterion and prepare a new
plan; do not weaken frozen requirements or protected tests in an existing plan.
The marker is an explicit assertion contract, not a security boundary or proof
that the test author chose the correct assertion.

See [passport workflow](preservation-passport.md) and [report/recovery details](task-report.md).
