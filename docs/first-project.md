# Your first project

Use a small repository you are comfortable experimenting with. Requirements:
Node.js 22+, Git, a working Codex client and the Unmix source checkout. This
walkthrough does not require an npm registry package or a separate API key.

## Connect

1. Commit the target project's initial state. It must be clean before Unmix init.
2. Replace both paths in this command with absolute paths on your machine:

```sh
codex mcp add unmix -- node /absolute/unmix/bin/unmix.mjs mcp --repo /absolute/project
codex mcp list
```

If `node` is not on PATH, use its absolute executable path in the registration.
Start a new Codex session in the target project and check `/mcp`. Preserve your
existing project instructions; add the Unmix instruction block from
[codex.md](codex.md) if you want task recording to continue in future sessions.

## Record actual changes

Give Codex a small feature request you already need, with this instruction:

> Use the Unmix MCP tools for this project. Initialize the ledger if needed.
> Before each discrete feature, call unmix_begin with its intent, dependencies
> on previous recorded tasks and a behavioral test command. Implement and test
> the feature, then call unmix_finish. Record tests for each feature's own
> behavior separately from tests of features it depends on. Do not commit or
> reset the original branch while recording. Show the timeline when done.

Unmix snapshots all nonignored files. Check `.gitignore` first. A task must
contain only the intended changes. If you already have unrelated uncommitted
changes, finish handling them before initializing this experiment.

## Remove a decision

After several recorded changes, ask Codex:

> Use Unmix to remove TASK_ID. Preserve RETAINED_BEHAVIORS. The new behavior
> should be REPLACEMENT_BEHAVIOR. Create a candidate with unmix_prepare, read
> unmix_codex_prompt and the original snapshot diffs, then adapt dependent
> tasks yourself. Edit only the candidate; stage conflicts and call unmix_resume
> until replay finishes. Preserve retained tests. Add a separate check for the
> replacement behavior. Call unmix_report before checks to review each retained
> task's original/result patches and adaptation notes. Call unmix_verify,
> regenerate unmix_report and call unmix_inspect. Show the candidate
> path, changes and verification results. Do not merge into the original.

Replace the capitalized fields with your concrete request. Test the candidate
yourself, especially behavior not covered by registered tests. A passing
verification covers only those tests. If a retained test itself demands a
removed behavior, report the contract conflict instead of deleting assertions.

## Report the result

Open a First-use report issue. Include the task count, removed decision,
retained functions, commands that passed or failed, manual result and one
specific improvement needed. A public minimal reproduction is useful; private
code is not required. Keep the original and candidate until you have reviewed
the changes. Unmix does not automatically accept or merge a candidate.
