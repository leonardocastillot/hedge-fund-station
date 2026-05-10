# RTK - Rust Token Killer For Codex

RTK is the repo's token-saving shell wrapper for Codex and future agents. Use
the normal Hedge Fund Station command surface, but run shell commands through
`rtk` by default so noisy output is filtered before it reaches the model.

## Default Rule

Prefer `rtk <command>` for shell commands that inspect files, git state,
builds, tests, logs, or package metadata.

Examples:

```bash
rtk npm run agent:brief
rtk git status
rtk rg -n "pattern" src electron docs
rtk sed -n '1,160p' docs/project-architecture.md
rtk npm run build
rtk python3 -m unittest discover tests
```

## Exceptions

Use raw commands, `rtk proxy <command>`, or `RTK_DISABLED=1 <command>` when:

- the command is interactive, long-running, or starts a dev server
- the exact raw output is required for debugging or audit evidence
- RTK is missing, broken, or filtering away details needed for the task
- a command is destructive or externally visible and should be reviewed exactly

When you bypass RTK for a meaningful command, mention the reason in the handoff.

## Verification

Run these when orienting or when RTK behavior is in doubt:

```bash
rtk --version
rtk gain
rtk init --codex --show
which rtk
```

`rtk gain` must work; if it does not, the installed binary may be the wrong
project named `rtk`. Do not reinstall, enable telemetry, or install global
hooks without explicit human approval.
