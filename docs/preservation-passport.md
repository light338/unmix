# Preservation passport

Since v0.1.7, `prepare` accepts up to 32 explicit `requirements`. They are frozen
in that plan: there is no tool for changing or removing them during adaptation.
The workflow guards declared behavior, not every possible behavior in a project.
An agent with filesystem access can still tamper with the ledger or runtime;
this is not a security sandbox.

## Declare before adapting

```json
{
  "remove": ["registration"],
  "instruction": "Allow guest purchase while preserving payment and scrolling",
  "requirements": [
    {
      "requirementId": "payment",
      "title": "Payment remains available",
      "kind": "preserve",
      "command": ["node", "test/payment.test.mjs"]
    },
    {
      "requirementId": "guest",
      "title": "Guest purchase works",
      "kind": "remove",
      "command": ["node", "test/guest.test.mjs"]
    },
    {
      "requirementId": "scroll",
      "title": "Scroll position stays",
      "kind": "preserve",
      "checkId": "scroll-position",
      "procedure": "Record scroll position, complete purchase, compare position."
    }
  ]
}
```

Each stable ID has a title, kind and exactly one command or one manual check ID
plus a procedure. IDs and manual IDs must be unique. Optional existing
`protectedFiles` freezes custom check files outside automatic test/config discovery.
Use actual behavioral assertions, not file existence as a substitute for UI behavior.

## Compare with the recorded original

Call `unmix_verify` with `{"planId":"PLAN","phase":"baseline"}`. CLI:

```sh
node bin/unmix.mjs verify --repo /absolute/project --json '{"planId":"PLAN","phase":"baseline"}'
```

This creates a separate detached original worktree at the last finished recorded
task snapshot, including intentionally removed tasks. It runs requirement commands
there, without checking out or executing commands in your original directory.
It can run while candidate replay is blocked. Existing unrecorded edits are not
part of this baseline. Both the baseline and candidate directories remain available
for review; Unmix does not merge or delete them automatically.

`preserve` expects the same criterion to pass on both versions. `remove` expresses
the desired new behavior: it must fail on the original and pass on the candidate.
For example, a guest-purchase assertion should exit 1 when registration prevents
purchase, and 0 when guests can purchase. Since v0.1.8, that expected original
failure must also print the exact separate stdout line
`UNMIX_EXPECTED_FAILURE:guest` (substitute the requirement ID). Emit it only after
evaluating the intended behavioral assertion, never in a blanket error handler:

```js
// The check and app import must already exist in recorded original history.
const allowed = await canPurchaseWithoutAccount();
if (!allowed) {
  console.log('UNMIX_EXPECTED_FAILURE:guest');
  process.exit(1);
}
```

An ordinary exit 1 without this marker is `error` / `missing_failure_marker`.
This prevents a missing test module from being accepted as behavioral evidence.
The marker is a declared assertion contract, not independent proof the assertion
is correct. A test that prints it before an unrelated error is itself an invalid
criterion. Plans created under v0.1.7 without this contract fail closed after an
upgrade: record the corrected criterion and prepare a new plan; do not rewrite
frozen requirements or protected test inputs inside an existing plan. A missing executable, timeout, signal,
or exit code other than 1 is an error, not removal evidence. A failing assertion
can itself be wrong: inspect the recorded stdout/stderr and test design.

Baseline verification returns raw check success: `passed:false` and CLI exit 2
are expected when a removal criterion deliberately exits 1 there. Inspect individual
results and the passport rather than treating baseline success as the removal proof.
If a criterion only exists in the repaired candidate, it cannot establish the
original comparison. Introduce the criterion in recorded history first, or use
an explicitly managed external harness (external content is not frozen by Unmix).

## Record actual manual checks in both versions

Baseline verification also creates the original worktree for manual-only passports.
`unmix_inspect` returns `baselineReview.candidate`, `baselineReview.tree` and the
candidate's `candidateTree`. Inspect **before** performing each interaction.
Then use the existing `unmix_manual_check`, adding `phase:"baseline"` for an
original observation or `phase:"candidate"` for the reconstructed version.
Use its matching tree as `expectedTree`, the declared check ID and **exact declared
procedure**, plus the real observer, result, note and optional evidence references.
Baseline observations are refused if its files differ from the recorded original.
For removal criteria the baseline observation must be failed and candidate passed.

These are caller-supplied observations, not proof a human actually acted.
Never fabricate a result. One ID cannot satisfy another; changed procedure does
not satisfy the obligation; automated verification cannot refresh manual evidence.
Changes to nonignored file content or modes make observations stale. Returning
to the exact same tree restores applicability of the older observation. Browser,
runtime, database, ignored files and external services remain outside freshness.

## Read readiness and repair requests

After adapting all retained tasks, run `unmix_verify` (default phase candidate).
It executes deduplicated retained/extra checks and requirement commands, with
existing protected-input checks and detection of files changed during commands.

- `checksPassed` describes only command execution, including an empty command
  sweep for a manual-only passport.
- Candidate `passed` is false until the passport is ready, even when commands pass.
- `report.passport.ready` and `inspect.passport.ready` derive current readiness,
  including later manual records and baseline/candidate file changes.
- Every requirement shows original and candidate evidence. Result states include
  `passed`, `failed`, `not_checked`, `stale`, `error`, `pre_existing_failure`, and
  `removal_not_demonstrated` (criterion already passed on original).
- `repairRequests` identifies unmet IDs and next actions. The agent inspects those,
  repairs implementation and reruns verification, redoing actual manual checks as
  needed. Unmix does not launch a model or perform interactions by itself.

No configured requirement can disappear just because nobody ran its check.
A failing original preservation criterion is explicitly a pre-existing problem;
it cannot be used to claim a regression caused by adaptation. This comparison
alone does not prove causality, full preservation or absence of the removed feature.
The selected removal scenario demonstrates only its asserted behavior.

Without `requirements`, existing verification semantics remain compatible;
reports say `passport.state:"not_configured"` and do not infer a complete passport.
A new plan is needed to declare obligations; old plans are not silently upgraded.

## Reproducible example

```sh
node examples/passport.mjs /absolute/new-demo-directory
```

See [generated stages](passport-example.md): passing commands with missing manual
checks are blocked; a lost payment behavior generates a failed obligation; restoring
implementation produces readiness. This is explicitly an authored fixture with
synthetic manual observations, not a new live-agent or human/UI test.
