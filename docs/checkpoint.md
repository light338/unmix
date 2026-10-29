# Record a completed chunk with one checkpoint

Since v0.2.0, checkpoint can replace begin/finish for a completed chunk of work.
You do not have to predict the final task title, dependencies or full intent before
editing. Initialize a clean Git project **before the first change**, then edit normally:

```sh
node /absolute/unmix/bin/unmix.mjs init --repo /absolute/project
# Make one coherent change using your editor or coding agent.
node /absolute/unmix/bin/unmix.mjs checkpoint --repo /absolute/project --title "Guest checkout"
```

The title-only form generates a task ID and uses the title as its intent. MCP:

```json
{"name":"unmix_checkpoint","arguments":{"title":"Guest checkout"}}
```

This is one recording call per completed chunk rather than begin + finish. It
still requires a deliberate checkpoint; no background recording or automatic
inference of task boundaries is claimed. All nonignored changes since the last
recorded task become one task, including staged and unstaged files. Your source,
HEAD, branch and real Git index remain untouched. Avoid mixing unrelated edits.

For explicit metadata use JSON (cannot be combined with --title):

```json
{
  "taskId": "checkout",
  "title": "Guest checkout",
  "intent": "Accept a purchase without an account",
  "dependsOn": ["catalog"],
  "checks": [["node", "--test", "test/checkout.test.mjs"]]
}
```

Checks and dependencies remain optional, explicit evidence. You can also supply
additional checks when preparing a reconstruction. An absent dependency declaration
is not proof of independence. Retained patches can apply cleanly and still fail
because a removed task supplied a runtime input. Run configured behavioral checks;
`ready_for_checks` is never a claim of behavior preservation. Without configured
checks or a declared passport, verification refuses to mark success.

The regression suite includes a retained consumer reading settings.json from a
removed task, with no dependsOn declaration. Patch application succeeds, but the
registered runtime check reports the missing file and verification fails. This
covers that scenario; it does not detect all hidden dependencies automatically.

Existing begin/finish recording remains supported and can be mixed with checkpoints.
Finish an active task before checkpointing. Empty changes, duplicate IDs, invalid
metadata and unknown dependencies are refused. A checkpoint does not reconstruct
reliable intent units from arbitrary old unrecorded history, and init still refuses
a dirty starting repository.
