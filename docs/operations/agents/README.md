# Agent Operating System

This folder is the simple home for agent harness, workflow, memory, and
templates in Hedge Fund Station.

## Start Here

1. `orientation.md` gets a new agent productive quickly.
2. `file-harness.md` defines the repo-file workflow for task queue, progress,
   role reports, and anti-telephone handoffs.
3. `harness.md` defines mission classes, permissions, checks, and artifact
   expectations.
4. `strategy-harness.md` defines the stricter strategy lifecycle, one-leader
   per `strategy_id` coordination, and blocked live-gate contract.
5. `memory/memory-policy.md` defines how agents keep memory small and useful.
6. `memory/README.md` explains how agents share context across runs.
7. `templates/` contains reusable task, handoff, and change-summary contracts.

## Folder Contract

- `harness.md`: the rules around agents before, during, and after work.
- `file-harness.md`: the file-based queue/progress/checkpoint workflow used by
  Codex, Claude, Gemini, external agents, and in-app mission runners.
- `strategy-harness.md`: the strategy-specific harness for Strategy Factory,
  strategy creation, validation, blocked live-gate packages, and role flow.
- `roles/`: vendor-neutral role contracts for leader, explorer, implementer,
  and reviewer agents.
- `automation-system.md`: recurring agent classes and safe automation defaults.
- `research-os.md`: backend Agent Research OS contract and artifacts.
- `workbench.md`: renderer mission-control UX contract.
- `backlog.md`: shared queue for compounding improvements.
- `templates/`: copy-ready output contracts.
- `memory/`: capped, curated shared state for continuity between agents.

## Source Of Truth

Agents may write memory and docs here, but strategy logic and validation
evidence remain backend-owned:

- runtime code: `backend/hyperliquid_gateway/agents/`
- generated agent evidence: `backend/hyperliquid_gateway/data/agent_runs/`
- strategy evidence: `backend/hyperliquid_gateway/data/`
- blocked live-gate packages:
  `docs/operations/strategy-live-gates/<strategy-id>.md`

The renderer workbench may launch and review missions. Electron may bridge
terminals and IPC. Neither should own trading decisions.

## Simple Agent Loop

1. Read orientation and harness.
2. Check memory policy and shared memory.
3. Pick or define the mission.
4. Inspect before changing.
5. Make a focused patch or report.
6. Run checks.
7. Update handoff, memory, and backlog only when relevant.
