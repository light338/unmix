# Unmix v0.1.2 — record decisions, reconstruct without one

Unmix helps when you change your mind about an early feature after building
other features on top of it. Record tasks through a local Codex MCP server;
select a task to remove; Unmix replays the retained patches in a separate Git
worktree and asks the agent to adapt dependencies and conflicts.

The original repository stays intact. The candidate includes per-command
verification results and snapshot evidence. Unmix has no npm dependencies,
hosted backend or telemetry. Node.js 22+, Git and your existing Codex access
are sufficient.

## What has been checked

- 14 offline tests, including snapshots without changing the original index,
  conflicting replay, removed dependencies, binaries, verification freshness
  and independent audit of weakened tests.
- A real authenticated Codex CLI recorded four notebook tasks through MCP,
  then removed mandatory authors and adapted tags, normalization and export.
- Five check commands passed. The original files, HEAD, index and status,
  retained test files and external oracle were unchanged.

The shop demo uses authored repairs. The separate live notebook experiment
uses actual model-written repairs. See the live validation document for exact
scope and the nested macOS sandbox limitation.

## Install and try

Download and extract the source release or clone the repository. Run
`node bin/unmix.mjs help` and `node --test test/*.test.mjs` in the source directory.
No dependency installation is needed. Follow `docs/first-project.md` to connect
the MCP server to your project and record actual changes.

## Early-user request

Try one real change of direction in a small, noncritical project and submit a
First-use report. Tell us what you removed, what survived, what broke and
whether you would use Unmix again. We especially need independent cases where
tests pass but a retained behavior has been lost.

This is an experimental release, not a general semantic undo guarantee. Tasks
must be recorded before editing; dependencies are declared rather than proven;
core verification does not freeze arbitrary tests. Windows, LFS, submodules and
sparse checkouts are unvalidated. There are no external users claimed yet.
