# Contributing

Unmix is an experimental project. Start with a small reproduction of
a real reconstruction failure, not a broad promise of universal semantic undo.

## Local checks

```sh
npm run check
npm test
npm run demo
```

No dependency installation is required. Use Node.js 22+ and Git.

## Valuable contributions

- Minimal repositories where a retained behavior is lost during reconstruction.
- MCP client interoperability and Codex integration reports.
- Tests for deletion, rename, overlapping edits, dependency chains and verification.
- Improvements that protect the original workspace and preserve check provenance.
- Independent benchmark tasks with explicit retained and removed behavior.

For architecture changes, explain the problem and intended behavior before
implementation. PRs should identify the concrete issue, describe the resulting
behavior and include meaningful validation. Respect licenses of fixture code;
do not submit confidential source or credentials in reproductions.

## First-time users

Use the First-use report issue form after trying a recorded removal in a small
project. Tell us what succeeded as well as what failed. Reports should describe
the actual attempt; stars and synthetic benchmark runs do not establish adoption.
