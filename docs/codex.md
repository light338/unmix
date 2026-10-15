# Codex integration

## Install the local MCP server

Unmix uses a stdio MCP server. Official Codex documentation describes local
server registration as:

```sh
codex mcp add <name> -- <server-command>
```

For a downloaded copy of Unmix:

```sh
codex mcp add unmix -- node /absolute/unmix/bin/unmix.mjs mcp --repo /absolute/project
codex mcp list
```

Launch a new Codex session in `/absolute/project`. Inspect `/mcp` for the tool
list. This registration configures a server for one pinned repository. It does
not let a tool-call argument select an arbitrary repository. For another project,
register another named server with that project's path.

Alternative configuration:

```toml
[mcp_servers.unmix]
command = "node"
args = ["/absolute/unmix/bin/unmix.mjs", "mcp", "--repo", "/absolute/project"]
tool_timeout_sec = 180
```

`unmix_verify` runs check commands sequentially, each with a 30-second process
timeout. Adjust the MCP tool timeout to the sum of your expected check durations.

## Project instructions

Append the following block to the target project's `AGENTS.md`, preserving its
existing instructions. Unmix does not automatically modify agent configuration.

> Use the Unmix MCP tools for task recording and reconstruction in this project.
> On a clean initialized repository, call `unmix_begin` before each discrete
> development task and `unmix_finish` afterward. Give each task a stable ID,
> user-facing intent, actual dependencies, and executable behavioral checks.
> Never claim dependencies are exhaustive. Never include unrelated changes in
> a task. Task snapshots include all nonignored project files.
>
> When the user removes a decision, call `unmix_timeline`, select its task IDs,
> and call `unmix_prepare` with the user's desired replacement behavior and
> checks for that behavior. Use `unmix_codex_prompt` to inspect the repair brief.
> Edit only the returned candidate worktree. Read original snapshot diffs for
> task evidence. Resolve conflicts and stage the candidate's repaired files.
> Call `unmix_resume` with a concrete adaptation note; repeat if more tasks block.
> Preserve tests for retained behavior. Add checks for the removal's new behavior.
> Call `unmix_report` before checks to review original/result patches per task,
> blocker history, pending work and additional candidate changes. Once replay
> finishes, call `unmix_verify`, regenerate the report and call `unmix_inspect`. Report exactly
> which checks passed and what remains uncertain. Do not automatically merge,
> reset the original repository or rewrite its branch.

## Tool flow

| Stage | Tool | Result |
|---|---|---|
| Start recording | `unmix_init` | Base commit and local ledger |
| Start task | `unmix_begin` | Intent, dependency IDs, command vectors |
| Finish task | `unmix_finish` | Snapshot commits and changed files |
| Review history | `unmix_timeline` | Recorded tasks |
| Remove a decision | `unmix_prepare` | Candidate worktree and replay status |
| Obtain repair evidence | `unmix_codex_prompt` | Instructions, commit pairs and checks |
| Continue after repair | `unmix_resume` | Adaptation snapshot and remaining replay |
| Review by task before checks | `unmix_report` | Original/result patches, blocker history and pending work; JSON or Markdown |
| Run behavioral checks | `unmix_verify` | Per-command results |
| Record an actual manual observation | `unmix_manual_check` | Caller-supplied result tied to the pre-check candidateTree; see [manual checks](manual-checks.md) |
| Review final state | `unmix_inspect` | Candidate tree, difference, automated freshness and manual observations |

Manual checks require a real observation and accurate attribution. Inspect
`candidateTree` **before** the interaction and submit it as `expectedTree`.
Never invent a human test or refresh a result solely because automated checks
pass. Recheck stale observations individually; see [manual checks](manual-checks.md).

## Example user request to Codex

"Use Unmix to remove the registration task. Keep checkout, dark design, receipt
export and the rounding correction. Guest checkout must work without an account.
Build and verify a candidate, then show me the changes."

## Verification performed in v0.1.0

The test suite starts the real server process and performs JSON-RPC initialization,
tool discovery, task recording, reconstruction, verification and error handling
through stdio. The demo additionally exercises conflicting task reconstruction.
These checks do **not** substitute for testing in a real Codex client. No live
Codex CLI session, account authorization or automatic model repair was exercised.

## Live verification in v0.1.1

An authenticated Codex CLI recorded four notebook tasks through MCP, removed
mandatory identity and adapted three retained tasks itself. Five check commands
passed with unchanged retained tests and original state. The opt-in runner and
independent audit are described in [live-codex.md](live-codex.md). Ordinary unit
tests remain offline. This validates one synthetic workflow, not arbitrary
project reconstruction.

Official references:

- https://developers.openai.com/codex/mcp
- https://developers.openai.com/codex/cli/reference
- https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle
