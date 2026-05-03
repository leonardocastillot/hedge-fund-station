# Agent Operating System

This folder is the simple home for agent harness, workflow, memory, and
templates in Hedge Fund Station.

## Start Here

1. `orientation.md` gets a new agent productive quickly.
2. `harness.md` defines mission classes, permissions, checks, and artifact
   expectations.
3. `memory/memory-policy.md` defines how agents keep memory small and useful.
4. `memory/README.md` explains how agents share context across runs.
5. `templates/` contains reusable task, handoff, and change-summary contracts.

## Folder Contract

- `harness.md`: the rules around agents before, during, and after work.
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
