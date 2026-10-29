# Unmix v0.2.0 — record completed work with one checkpoint

Feedback on recording overhead led to a new CLI/MCP checkpoint workflow. Initialize
on a clean repository before editing, then record one completed chunk:

```sh
node bin/unmix.mjs checkpoint --repo /absolute/project --title "Guest checkout"
```

The task ID and intent default automatically. Explicit dependencies and checks can
still be supplied in JSON. Existing begin/finish recording remains supported.
Checkpoint groups all nonignored changes since the last recorded chunk: it does
not infer task boundaries, dependencies or arbitrary past intent.

A requested regression now covers a retained task reading a file created by the
removed task without declaring that dependency. Patches apply, but the runtime
check fails on the missing input; verification does not pass on patch application.

## Actual Codex pilot

On the existing ZipTrial repository, two actual Codex sessions repaired the same
staged feature-removal scenario, one through Unmix MCP and one with ordinary Git.
Both candidates passed 17 retained tests and a separate five-case CLI oracle.
Measured reconstruction stages totaled 67.094 s for Unmix versus 48.425 s for Git.
**Git was faster.** Both needed maintainer staging after sandbox index restrictions;
Unmix also needed host resume/verification. This is one maintainer pilot, not a
controlled benchmark, independent adoption or a fully unattended run.

See [protocol, measurements and limitations](pilot-ziptrial.md),
[checkpoint guide](checkpoint.md) and [regression tests](../test/checkpoint.test.mjs).

## Validation

- All 76 Node tests passed locally, including CLI and real stdio MCP checkpoint calls.
- Existing source, HEAD and index preservation checks remain covered.
- Runtime requirements remain Node.js 22+ and Git; no npm dependencies.

Download and extract `unmix-v0.2.0.zip`; run `node bin/unmix.mjs --help`.
