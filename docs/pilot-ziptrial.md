# Maintainer pilot: remove compact output, keep quiet output

Date: 2026-10-29. Source: [ZipTrial](https://github.com/light338/ziptrial), commit
`94057accdb7b736f0d8c5d457ead6b7b1817ca2d`, an existing published Python project.
This is a maintainer-controlled pilot with staged feature changes, not an
independent user trial or a controlled benchmark. Do not count it as adoption.

## Task and protocol

Two authored feature changes touched the real CLI: add compact JSON output, then
add quiet output with error diagnostics. Remove compact output while retaining
quiet output, default pretty JSON, report files and all retained tests. The second
task deliberately omitted a dependency declaration. The implementations/tests
were authored; **both reconstruction repairs were written by the installed,
authenticated Codex CLI**, not supplied as prewritten fixes.

Unmix recorded each completed chunk with checkpoint, prepared a separate candidate
and stopped on a patch conflict. The comparison used the same task deltas as two
ordinary Git commits, then attempted `git revert --no-commit` on the first commit.
That revert also conflicted. Each workflow got one fresh noninteractive Codex
session with the same behavior goals and frozen retained tests; Unmix ran first.
The Unmix session additionally had the actual stdio MCP connection and report.

## Recorded times

| Measured stage | Unmix | Ordinary Git |
| --- | ---: | ---: |
| Prepare / revert attempt | 0.129 s | 0.020 s |
| Codex CLI invocation, including its checks/tool attempts | 64.895 s | 48.399 s |
| Host staging / completion after the session | 2.070 s | 0.007 s |
| Sum of those measured stages | **67.094 s** | **48.425 s** |

**Ordinary Git was faster in this run.** This does not establish relative human
cost or a general performance result. Timings exclude source/setup/editing time,
review time, delays between stages and the initial sandbox startup failure. One
sample per workflow, run order, model variability, caching and extra report/tool
work make a speedup claim inappropriate.

The agent could repair files but sandbox policy blocked index writes in both
workflows. In the Unmix session, approval policy also denied the verification tool.
The maintainer reviewed the generated repair, staged it and invoked resume/verify
from the host; plain Git also needed host staging. The Unmix result is **not a
fully unattended end-to-end agent run**. The initial failed startup (before model
execution) was kept locally and excluded from the successful-run timings.

## What passed

- Both candidates: all **17 retained tests** passed; retained test bytes unchanged.
- External maintainer-run oracle passed on both: default pretty JSON, quiet
  inspection, removed compact option, quiet run still creates report files,
  and error diagnostics remain on stderr.
- Unmix source files, HEAD, real index and status remained unchanged during
  reconstruction. Protected inputs stayed intact; final Unmix verification passed
  after host completion.
- Two completed chunks used **2 checkpoint calls instead of 4 begin/finish calls**.
  Core API recording took 76.229 ms and 70.845 ms. These are not measurements of
  human effort or a CLI/runtime comparison with begin/finish.

The requested clean-apply hidden-input case is covered separately in the
checkpoint regression test: a retained consumer reads settings.json created by
the removed task, without declaring that dependency. Replay succeeds; its actual
runtime check fails on the missing input, and verification stays failed. A test
that never exercises a hidden dependency can still miss it; no universal dependency
detector is claimed.

## Evidence and reproduction

- [Machine-readable measurements](pilots/ziptrial-2026-10-29.json)
- [Unmix result diff](pilots/unmix-ziptrial-result.diff)
- [Ordinary Git result diff](pilots/plain-ziptrial-result.diff)
- [External CLI oracle](pilots/ziptrial-oracle.py)
- Exact original [driver](pilots/pilot-driver.txt) and separate
  [completion harness](pilots/pilot-complete.txt), recorded in their original
  workspace layout. They are evidence snapshots, not commands to run in docs/.

For a fresh optional run, clone ZipTrial, check out the pinned commit, then use:

```sh
git clone https://github.com/light338/ziptrial.git /absolute/ziptrial
# In that clone: git checkout 94057accdb7b736f0d8c5d457ead6b7b1817ca2d
node examples/pilot-ziptrial.mjs /absolute/new-output /absolute/ziptrial --live
```

This invokes the installed Codex CLI twice using existing access and may consume
usage. It keeps Codex's workspace-write sandbox; it does not bypass protections.
The combined runner makes the host completion step explicit; the recorded pilot
used the two separate scripts above. It requires Git, Python 3, Node.js 22+ and
an authenticated Codex CLI. Command-line compatibility and permissions can vary.
No fresh rerun of this combined convenience runner is claimed here. Run the oracle
against each candidate afterward. Local raw logs are not published because they
include machine paths and session details; no credentials are included in public
measurements or patches.

The reduced recording-call count is demonstrated. Whether checkpointing is worth
its remaining interruption cost is still an open question for independent users.
