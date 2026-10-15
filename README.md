# Unmix

**Remove a development decision. Rebuild the changes you want to keep.**

Unmix is an experimental, local-first task ledger and reconstruction tool for
Codex. It records the intent, dependencies, file changes, and behavioral checks
for each task. When you remove a task, it constructs a separate Git worktree,
replays retained changes, and hands conflicts or missing dependencies to Codex
for adaptation.

**v0.1.5 is an experimental release.** Git performs
patch replay. Codex or a human performs semantic adaptation. Unmix coordinates
that work and reports evidence. It does not guarantee preservation of all
behavior, infer all dependencies, or automatically merge the candidate.

## Quick start

Requirements: Node.js 22+, Git on PATH, and a Git project with an initial commit.
The prototype has no npm dependencies, API key requirement, telemetry, or hosted
backend. An actual Codex session uses the user's existing Codex access.

Clone this repository or download and extract the source release, then run
the commands below in the Unmix directory. No `npm install` is required.

```sh
node bin/unmix.mjs help
npm test
npm run demo
```

The demo records five intertwined shop tasks and removes registration while
preserving design, payment, a monetary rounding fix, and receipt export. It
uses **explicitly authored repairs**, not a live Codex invocation. Its report
includes candidate paths, blocked tasks, five passing behavioral checks, and
confirmation that the original source and branch are unchanged.

For a real model run, use `node examples/live-codex.mjs /absolute/new-directory`.
Codex writes the tasks and adaptations through MCP; an external oracle and
independent audit check the result. See [live validation](docs/live-codex.md).

## Connect Codex

Replace both absolute paths with the locations on your computer:

```sh
codex mcp add unmix -- node /absolute/unmix/bin/unmix.mjs mcp --repo /absolute/your-project
```

Open Codex in your project and check `/mcp`. The server exposes eleven tools for
initializing, recording, reconstructing, inspecting, adapting, and verifying
tasks. See [the Codex guide](docs/codex.md) for the complete workflow and a
project instruction block. A real authenticated Codex CLI/MCP connection and
agent-authored reconstruction passed on one synthetic notebook in v0.1.1.
This does not establish reliability on arbitrary projects.

## Try it on your work

Unmix is for developers who use Codex to make several related changes, then
change their mind about an earlier feature. For example: remove account
registration while keeping checkout, receipts and a rounding fix.

Start with a small local repository and record tasks before editing. It cannot
reliably reconstruct decisions from an existing unrecorded Git history. Follow
[the first-project walkthrough](docs/first-project.md) to connect the MCP server
and ask Codex to record and remove a decision.

If you try it, open a **First-use report** issue with the behavior you wanted to
remove, what you wanted to retain and whether the candidate worked. Successful
reports and failing cases both help establish where this tool is useful. Never
include private source, credentials or personal data in a public report.

## Record and reconstruct

Initialize against a clean repository. Unmix snapshots all nonignored files;
use your project's `.gitignore` to exclude local configuration and generated
files. Task snapshots are stored in local Git objects and private `refs/unmix/`
refs. The ledger lives under the repository's Git directory, not in source.

Before each task:

```sh
node /absolute/unmix/bin/unmix.mjs begin --repo /absolute/your-project --json '{"taskId":"payment","title":"Checkout","intent":"Calculate item totals and accept payment","dependsOn":["registration"],"checks":[["node","--test","payment.test.mjs"]]}'
```

After editing:

```sh
node /absolute/unmix/bin/unmix.mjs finish --repo /absolute/your-project
```

Select removed tasks and state the desired replacement behavior:

```sh
node /absolute/unmix/bin/unmix.mjs prepare --repo /absolute/your-project --json '{"remove":["registration"],"instruction":"Remove registration; keep payment and allow guest checkout","checks":[["node","--test","guest-checkout.test.mjs"]]}'
```

`prepare` returns a plan ID and candidate path. A removed dependency triggers
adaptation even when a patch applies without text conflicts. Codex edits only
the candidate, stages resolved conflicts, then calls `unmix_resume`. After all
retained tasks replay, `unmix_verify` runs retained checks and additional checks.

## Review changes by task

Before running checks, call `unmix_report` with `{ "planId": "PLAN_ID" }`.
It returns structured evidence for every retained task: the original patch,
the recorded resulting patch, replay outcome, adaptation note and blocker history.
Removed tasks, pending work, the current blocker and additional candidate changes
are listed separately. Report generation does not execute checks.

To save the same review as Markdown:

```sh
node /absolute/unmix/bin/unmix.mjs report --repo /absolute/your-project --json '{"planId":"PLAN_ID","format":"markdown"}' > review.md
```

Save the report outside the original and candidate repositories so it does not
become an extra project change. Read it before checks, then regenerate it afterward
for results and freshness. See [report details](docs/task-report.md) and a
[generated example](docs/report-example.md). Plans prepared before v0.1.3 explicitly
report unavailable per-task result snapshots; create a new plan for full evidence.
Task diffs describe historical replay steps: later tasks may overwrite earlier
changes. They do not prove semantic preservation or final ownership of every line.

The guest check in this example must be present in the candidate before
verification. This tool executes exactly the configured command vectors, with
no shell interpolation. Commands are trusted project code and can have side
effects; the worktree is **not an OS security sandbox**.

## Protect tests during adaptation

New plans freeze selected test/config files from the base and retained-task
snapshots. `unmix_verify` refuses changed protected inputs before running commands,
and inspection/report shows exact violations. This prevents an edited assertion
or test script from silently producing a passing result. Add custom repository
paths with `protectedFiles` in `prepare`; new regression tests remain possible.

See [protected-input workflow and limits](docs/protected-inputs.md). Discovery is
heuristic, external/runtime inputs are not frozen, and legacy plans need preparing
again for enforcement. This is a workflow guard, not a security sandbox.

## Record manual interaction checks

`unmix_inspect` returns `candidateTree`. Inspect before testing, then use
`unmix_manual_check` (CLI: `manual-check`) to record the actual observer,
procedure and passed/failed result against that `expectedTree`. A changed tree
is refused. Use separate IDs for independent interactions such as “Like saved”
and “scroll position preserved”.

Inspection and JSON/Markdown reports show the latest results and history in
`manualChecks`; later candidate file changes mark prior observations `stale`.
Rechecking appends a result for that ID. Automated checks do not refresh manual
observations; read both sections even when the plan says `checks_passed`.

See [manual-check workflow and limits](docs/manual-checks.md). Records are caller
supplied, not authenticated proof of human actions. Freshness covers nonignored
file content/modes, not browser, database, runtime or deployment state.

## What the prototype protects

- Snapshots preserve the original Git index, staged changes, source files and branch.
- Reconstruction creates a new detached worktree; an existing destination is refused.
- Conflicts and declared removed dependencies stop replay for explicit adaptation.
- Verification requires at least one check; failing checks never get a success status.
- Source edits after verification make its results stale.
- Source edits caused by check commands invalidate that verification run.
- Binary files and executable modes are preserved by Git patch replay.

Checks cover only their executed scenarios. An agent can still make an incorrect
adaptation, and passing tests alone cannot establish semantic equivalence.

## Limitations

- Tasks must be recorded from the start; old repositories cannot be retrospectively
  divided into reliable intent units by this version.
- Task recording is sequential. One active task per ledger, no parallel agent editing.
- Dependency declarations are supplied by the agent/developer, not proven by analysis.
- No database rollback, external API reversal, migrations execution or deploy support.
- No UI or automatic model adaptation inside the core. The opt-in live runner
  invokes Codex CLI. No npm registry publication.
- Git submodules, LFS, sparse checkouts and Windows were not validated.
- Time-limited check subprocesses are not a complete process isolation boundary.
- If a process crashes, inspect the candidate and ledger before continuing. A stale
  lock must be removed manually after confirming no Unmix process is running.

## Roadmap

1. Expand the completed synthetic Codex CLI/MCP validation to real projects.
2. Evaluate on independently selected repositories and actual change histories.
3. Add evidence-backed task dependency suggestions and immutable check manifests.
4. Measure adaptation success, lost retained behavior, and required human intervention.
5. Add a review interface showing decisions, candidate differences and evidence.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Useful contributions include failing
reconstruction cases, realistic benchmark tasks, OS compatibility fixes and
MCP interoperability tests.

## License

MIT. The package name is a local prototype label; availability of public npm
names and branding has not been established.
