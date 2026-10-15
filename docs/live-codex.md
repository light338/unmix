# Live Codex reconstruction

On 2026-10-14, the existing v0.1.0 implementation was exercised with an
authenticated Codex CLI 0.162.0-alpha.17.2, Node.js 24.19.0 and local stdio MCP
on macOS. This is a real model run, separate from the scripted shop demo.

Codex authored four notebook tasks through MCP: identity, tags, text normalization
and JSON export. Eight baseline tests passed. A fresh Codex session removed the
identity task and adapted the other three tasks using snapshot diffs and
`unmix_resume`. Normalization produced a patch conflict. No repair implementation
was supplied in either prompt or the runner.

The removal contract was specified before reconstruction: remove `createAuthor`
and the mandatory author requirement; guest notes and JSON contain no author.
Explicit legacy author metadata remains supported because the tagging test
checks preservation of that field. This does not demonstrate complete erasure
of author data from legacy inputs.

Five verification commands passed: three unchanged retained test files, an
external independent oracle, and the agent's new removal tests. All eight
candidate tests also passed when independently rerun. SHA-256 comparisons
confirmed the retained tests and oracle were unchanged. Original files, HEAD,
index entries and Git status matched the pre-removal capture. The transcript
contains 19 MCP tool calls across recording and reconstruction.

The first CLI recording attempt initialized MCP successfully but could not run
shell commands: the nested macOS sandbox returned `sandbox_apply: Operation not
permitted`. The successful sessions disabled the inner sandbox while running
inside the desktop executor's enforced filesystem sandbox. This environment
detail matters for reproduction; it is not an Unmix protocol failure.

## Reproduce

Prerequisites: Node.js 22+, Git, an installed Codex CLI, and `codex login`.
The model uses the existing Codex account; this is an opt-in live run that uses
account capacity. Ordinary `npm test` never invokes a model or uses the network.

```sh
node examples/live-codex.mjs /absolute/new-evidence-directory
# Or: npm run demo:live -- /absolute/new-evidence-directory
```

The directory must not exist. `UNMIX_CODEX_BIN` can select the CLI executable.
Node's directory is added to the child PATH, so registered `node` checks work.
The runner passes a stdio MCP definition with `-c` and does not install or alter
the user's global MCP configuration. Model and authentication settings continue
to come from the user's Codex environment.

The default child sandbox is `workspace-write`, with the evidence root added as
a writable directory so the candidate worktree can be edited. Only when already
running inside an independently enforced executor sandbox, such as this desktop
experiment, `UNMIX_CODEX_SANDBOX=danger-full-access` can avoid an unsupported
nested OS sandbox. Do not use that override in an unconfined terminal.

The runner creates only the base notebook, task/removal prompts and an independent
oracle. Codex supplies all task implementations, retained tests and repairs.
It records raw MCP messages and CLI JSONL events. Afterward the audit checks
original preservation, unchanged retained tests, unchanged oracle, actual MCP
tool calls and fresh verification; it reruns the oracle and all candidate tests.
If Codex exits successfully without completing the work, the audit still fails.
Failed evidence is preserved for diagnosis; existing directories are never reused.

## Limits

This proves one synthetic workflow, not reliable reconstruction of arbitrary
repositories. The live auditor protected this v0.1.1 experiment independently;
that version's core verifier did not freeze project test files. From v0.1.5,
new plans also protect selected recorded test/config inputs in the core (see
[scope and limits](protected-inputs.md)). The regression fixture now checks that
both core verification and the independent auditor reject a weakened retained
test. This does not rerun or broaden the historical live experiment.
The oracle is outside the candidate and hash-checked afterward,
but not protected by a separate process-level read-only filesystem boundary.

The downloadable evidence includes prompts, original notebook, candidate,
snapshot Git history, MCP transcript, CLI events, pre-removal fingerprints,
independent report and candidate diff. Authentication files are excluded.

Official Codex integration reference:
https://learn.chatgpt.com/docs/extend/mcp?surface=cli
