# Browser and account conditions for manual checks

Since v0.1.9, `unmix_manual_context` (CLI `manual-context`) declares current
conditions for a plan phase. It does not read a browser or perform any interaction.
Do not include passwords, cookies, tokens, emails or personal account details.

## Declare before interacting

Create the candidate with prepare. For original checks, first run verify with
`phase:"baseline"` to create the separate recorded-original worktree.
Then declare conditions for **each** phase:

```json
{
  "planId": "PLAN",
  "phase": "candidate",
  "context": {
    "browser": "Firefox",
    "browserVersion": "record-the-actual-version",
    "environment": "local-fixture",
    "appUrl": "http://localhost:3001/shop",
    "authState": "signed_in",
    "accountAlias": "test-buyer",
    "role": "buyer",
    "session": "fresh-session-v1",
    "dataState": "seed-v1"
  }
}
```

CLI:

```sh
node bin/unmix.mjs manual-context --repo /absolute/project --input context.json
```

Required fields: browser, browserVersion, environment, authState, session and
dataState. authState is signed_in, signed_out or unknown. A signed-in declaration
requires an anonymous test accountAlias and role. Signed-out declarations omit
both. Use session/dataState as descriptive labels for relevant conditions; never
paste session identifiers, authentication material or database contents.
Optional appUrl accepts HTTP(S), without credentials, query strings or fragments.
Unknown fields are refused. Validation is not a general secret/PII detector:
the caller is responsible for the contents of labels and notes.

## Bind the actual observation

The declaration returns a `revision`. Inspect before each interaction:
`manualContexts.candidate.revision` (or baseline) and the corresponding file tree.
Perform the interaction, then submit `unmix_manual_check` using both:

```json
{
  "planId": "PLAN",
  "phase": "candidate",
  "checkId": "scroll-position",
  "title": "Scroll stays",
  "procedure": "Use the exact declared requirement procedure",
  "result": "passed",
  "observer": "Actual observer or automation identity",
  "note": "What actually happened",
  "expectedTree": "TREE_FROM_INSPECTION",
  "expectedContext": "REVISION_FROM_INSPECTION"
}
```

If declared conditions change between inspection and submission, the record is
refused even when files match. The observation stores a copy of its context and
revision; later declarations do not retroactively add context to older evidence.

## Freshness and comparison

- File freshness and context freshness are separate: each observation exposes
  `fileState` and `contextReview` in inspection/report.
- A changed declaration invalidates all old observations in that phase. Repeating
  identical normalized labels is a no-op; it does not refresh any result. Returning
  A → B → A creates a new revision, so original A observations stay stale.
- After a browser/account/session/data change, declare the new conditions and
  actually repeat each affected interaction. Rerunning automated checks or
  rechecking one manual ID cannot refresh other IDs.
- A passport that uses declared contexts requires fresh observations in both phases.
  Unknown authentication or missing context cannot close those obligations.
- Manual requirements show `contextComparison` with explicit field differences.
  Different browser/version/environment/auth/account/role/session/data labels
  produce `context_mismatch` and block readiness. Investigate the conditions and
  repeat checks under intended comparable conditions; do not merely relabel old
  results as matching.
- Separate original/candidate servers can have different app URLs. Those
  differences are displayed with `affectsComparison:false`; the other declared
  conditions still need to match. Use environment/data/session labels to describe
  relevant equivalence, not process-specific secrets or private identifiers.

Reports include phase declarations, original manual history, candidate history,
and per-requirement comparison. Context values remain untrusted caller evidence.

## Legacy records and limitations

Older observations remain readable with `contextReview.state:"not_recorded"`.
Without any context declaration, legacy file-based manual verification keeps its
previous behavior and the passport explicitly says `contextCoverage:"not_declared"`.
Such readiness does **not** confirm external conditions. Declaring context opts the
plan's manual passport obligations into context enforcement; old uncontextualized
records must be performed again, not silently promoted.

Unmix does not detect undeclared browser, account, database, runtime, ignored-file
or external-service changes. Matching labels and a matching Git tree are not proof
that external conditions remained unchanged. The declaration is not authenticated
proof a human checked anything. Full preservation, automatic monitoring and a
security sandbox are not provided.
