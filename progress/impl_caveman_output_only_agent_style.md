# Caveman Output-Only Agent Style

## Objective

Add Caveman as an output-only token discipline for user-facing agent replies,
without enabling context compression, memory rewriting, MCP shrink, or global
hooks.

## Scope

Inspected upstream Caveman docs, the existing RTK repo convention, the agent
harness, orientation docs, compatibility docs, and curated memory.

## Changes Made

- Added `CAVEMAN.md` with output-only rules: concise replies, exact technical
  details, no parody speech, no repo-memory compression.
- Included `@CAVEMAN.md` from `AGENTS.md` next to `@RTK.md`.
- Updated `agent:brief` to require and list `CAVEMAN.md` in the next reads.
- Updated orientation, harness, README, Claude/Codex compatibility docs, and
  curated memory to distinguish RTK command-output savings from Caveman
  user-facing output discipline.
- Kept official upstream skill install as optional only; no install command,
  hook, MCP middleware, or global config was run.

## Files Changed

- `CAVEMAN.md`: output-only Caveman contract.
- `AGENTS.md`: local Codex include and quick-start rule.
- `scripts/agent_harness.py`: required file and brief next read.
- `docs/operations/agents/orientation.md`,
  `docs/operations/agents/harness.md`: agent workflow updates.
- `docs/operations/agents/memory/shared-memory.md`,
  `docs/operations/agents/memory/decisions.md`: durable decision update.
- `README.md`, `CLAUDE.md`, `CODEX.md`: compatibility pointers.
- `agent_tasks.json`, `progress/current.md`, `progress/history.md`: harness
  evidence.

## Verification

Commands run:

```bash
rtk npm run agent:check
rtk npm run agent:brief
rtk npm run build
rtk npm run graph:build
rtk npm run graph:check
rtk rg -n "CAVEMAN|Caveman|caveman" AGENTS.md CAVEMAN.md README.md CLAUDE.md CODEX.md docs/operations/agents scripts/agent_harness.py
rtk git diff --check
```

Result:

- passed: harness check and brief, build, Graphify build/check, Caveman
  reference search, and whitespace check.

## Findings

- Upstream Caveman for Codex is installed as a skill and normally activated per
  session with `/caveman`.
- The requested repo behavior is narrower: output-only style for the human, so
  a local `CAVEMAN.md` include is safer and reviewable in Git.
- RTK and Caveman now have separate jobs: RTK filters command output; Caveman
  keeps agent replies compact.

## Memory Updated

updated: `docs/operations/agents/memory/shared-memory.md` and
`docs/operations/agents/memory/decisions.md` now combine RTK and Caveman under
one token-discipline decision without exceeding the visible decision cap.

## Assumptions

- The human wants compact output style only, not upstream Caveman memory/context
  compression features.
- Official Caveman skill install can remain optional because the repo-level
  include is enough for Codex sessions that load `AGENTS.md`.

## Next Best Step

Use the merged repo instructions in a fresh Codex session and confirm the first
assistant response is concise while still citing evidence and commands.
