# Manual checks tied to a candidate snapshot

Added in v0.1.4 in response to [TheodorNEngoy's question](https://github.com/openai/codex/discussions/53955#discussioncomment-18946488).

“Like saved” and “scroll position preserved” are separate checks. Record each
with its own stable `checkId`. Unmix stores the supplied observation and the
candidate Git tree; later candidate edits make the observation `stale` in
`unmix_inspect` and JSON/Markdown `unmix_report`.

## Workflow

1. Run `unmix_inspect` with `{ "planId": "PLAN_ID" }`. Keep `candidateTree`.
2. Test the application built/running from that candidate. Perform the actual
   interaction; record the procedure, observer and what happened. Do not edit
   candidate source while reviewing it.
3. Call `unmix_manual_check` with the tree from step 1 as `expectedTree`:

```json
{
  "planId": "PLAN_ID",
  "checkId": "like-saved",
  "title": "Like persists after reload",
  "procedure": "Click Like on a post, reload the page, confirm it is still selected.",
  "result": "passed",
  "observer": "Name or accurate role of the actual observer",
  "note": "Describe the actual observation and browser/runtime used.",
  "expectedTree": "COPY_CANDIDATE_TREE_FROM_INSPECT_BEFORE_TESTING",
  "evidence": ["Optional screenshot or issue reference; not fetched or validated"]
}
```

The CLI equivalent uses `manual-check --repo /absolute/project --input
/outside/project/observation.json`. Save the input file, exported reports and
screenshots outside the candidate/original, so they do not become source edits.
`result` accepts `passed` or `failed`. `title`, `procedure`, `observer`, `note`
and `expectedTree` are required. Evidence references are optional (at most 16).

If code changed since step 1, saving is refused. Inspect again and **repeat the
interaction** before saving against the new tree; changing the hash alone does
not establish a new observation. Unmerged files must be resolved and staged first.
A clean partial candidate may be observed while replay is blocked; later resume
or replay will make those observations stale if it changes file content.

4. Record the scroll interaction separately using `checkId: "scroll-position"`.
5. After further adaptation, inspect/report again. Stale entries require rechecking.
   Reuse the same ID to append a new observation; previous results remain in history.

## Reading the result

Both inspection and report expose `manualChecks`:

- `latest`: the newest observation for each check ID, including `tree`, `result`,
  `state`, `stale`, timestamp, observer, procedure, note and evidence references.
- `history`: all observations, with freshness computed against the current tree.
- `state`: `not_recorded` if empty, `stale` if any latest result is stale,
  otherwise `failed` if any latest result failed, otherwise `passed`.
- `scope`: the limits of this evidence.

A historical `result: "passed"` stays recorded even when its current `state` is
`stale`. The recorded tree is retained in local `refs/unmix/manual/` so Git GC
can preserve it. At most 1,000 observations are accepted per plan. The source,
HEAD, branch, real index and candidate files are not edited when recording.
Older plans work without a migration; no observations are invented for them.

Automated `checks` and the plan's existing `status` remain separate. A plan may
have `status: "checks_passed"` alongside stale or failed manual checks. **Read both
sections.** Running `unmix_verify` does not refresh manual checks. A manual pass
also cannot satisfy missing executable checks or make automated checks pass.

## Limits

This is a caller-supplied observation ledger, not proof that a human performed
an action or that the stated observer's identity is authentic. An agent must
never invent a human check or label browser automation as a human observation.
Evidence references are stored as text without fetching or verifying them.

Freshness compares the current nonignored Git file content and executable modes
with the recorded tree. New untracked, nonignored files count. Ignored build
outputs, browser state, local storage, databases, API responses, environment,
server processes and deployed versions do **not** count. The observer must ensure
that the running application matches the candidate and recheck when relevant
runtime state changes. Restoring the exact recorded file tree makes an old
observation current for that content again; this is content identity, not a
monotonic edit history or a guarantee about runtime behavior. Edits that happen
and are reverted during the interaction cannot be detected. Do not run concurrent
editing during a manual review.

Tests exercise storage, stale detection, replay, CLI and real stdio MCP calls
with explicitly authored fixture observations. They are not user testing of
Turnfeed or evidence of independent human adoption.

## Browser/account conditions (v0.1.9)

Use [manual context declarations](manual-context.md) before interacting.
After a declaration, `expectedContext` is required alongside `expectedTree`.
File freshness and declared-condition freshness are shown separately; older
records without context remain explicitly unconfirmed about external conditions.
