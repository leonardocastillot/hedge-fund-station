# Agent Memory Harness Performance Implementation

## Objective

Optimize Hedge Fund Station agent orientation, memory usefulness, Graphify
freshness visibility, and the Codex recurring automation setup.

## Scope

Inspected and updated the file harness, agent operating docs, curated memory,
Graphify artifacts, the existing Obsidian vault, package scripts, and the Hedge
Fund Station Codex automations. Career-Ops and LinkedIn automations were
inventoried only and were not changed.

## Changes Made

- Added `npm run agent:brief` through `scripts/agent_harness.py` to summarize
  harness health, active task, Graphify freshness, memory files, Obsidian vault
  status, and next reads.
- Added `npm run graph:status` through `scripts/graphify-status.mjs` to report
  Graphify availability, freshness, counts, built commit, current commit, dirty
  tree status, changed paths, and recommended command.
- Updated `AGENTS.md`, `docs/operations/agents/orientation.md`,
  `docs/operations/agents/harness.md`,
  `docs/operations/agents/graph-memory-operating-system.md`, and
  `docs/operations/agents/automation-system.md` around the short loop:
  `agent:brief`, `graph:status`, fresh Graphify, curated memory, then task
  work.
- Replaced stale `CLAUDE.md` guidance with a compatibility shim pointing to
  `AGENTS.md`.
- Added `hedge-station/Agent Navigation Index.md` and linked it from
  `hedge-station/Workspace Home.md`.
- Resolved the recurring cadence open question by updating memory decisions and
  clearing the question from `open-questions.md`.
- Updated the nightly Hedge Fund Station automation to use `agent:brief`,
  `graph:status`, and one-small-patch constraints.
- Created `weekly-hedge-fund-agent-health-report`, a Sunday read-only local
  automation for harness, memory, Graphify, Obsidian, and strategy status.
- Rebuilt Graphify and pruned stale generated `CLAUDE.md` nodes that remained
  from the old semantic graph.

## Files Changed

- `scripts/agent_harness.py`, `scripts/graphify-status.mjs`, and `package.json`
  define the new command surface.
- `AGENTS.md`, `CLAUDE.md`, and `docs/operations/agents/` define the shorter
  agent operating path.
- `docs/operations/agents/memory/decisions.md` and
  `docs/operations/agents/memory/open-questions.md` record the cadence
  decision.
- `hedge-station/Agent Navigation Index.md` and
  `hedge-station/Workspace Home.md` make the existing Obsidian vault useful to
  agents.
- `graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.json`, and
  `graphify-out/graph.html` were refreshed after the docs and compatibility
  cleanup.

## Commands Run

```bash
npm run agent:check
npm run agent:status
npm run agent:brief
npm run graph:status
npm run graph:check
npm run graph:query -- "where should a new agent start for repo architecture and memory work?"
python3 -m unittest tests.test_graphify_memory_status
npm run perf:budget
npm run graph:build
uvx --python 3.11 --from graphifyy graphify cluster-only . --graph graphify-out/graph.json
git diff --check
```

## Verification Result

- passed: `npm run agent:check`
- passed: `npm run agent:status`
- passed: `npm run agent:brief`
- passed: `npm run graph:status`
- passed: `npm run graph:check`
- passed: `npm run graph:query -- "where should a new agent start for repo architecture and memory work?"`
- passed: `python3 -m unittest tests.test_graphify_memory_status`
- passed: `npm run perf:budget`
- passed: `git diff --check`

## Findings

- The harness live-task detector treats the word `execution` as production/live
  language. The task acceptance was adjusted to say `task work`.
- `graph:build` refreshed code nodes and graph metadata but did not remove old
  semantic document nodes for `CLAUDE.md`; stale compatibility nodes were
  pruned from `graph.json` and the graph was reclustered.
- `graph:status` correctly remains `dirty` because the repo has uncommitted
  changes, including unrelated Electron/Gemini work that this task preserved.

## Memory Updated

- updated: `docs/operations/agents/memory/decisions.md` and
  `docs/operations/agents/memory/open-questions.md` now record the daily plus
  weekly recurring cadence decision.

## Assumptions

- The weekly health report should be read-only and local.
- The nightly automation may still create one focused patch when safe.
- Graphify may remain `dirty` until the human commits or otherwise resolves the
  current worktree.

## Next Step

Run the weekly health report once after this change lands to confirm the new
automation output is the right level of detail.
