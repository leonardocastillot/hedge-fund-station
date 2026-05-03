# Agent Decisions

Policy: keep this file to 10 active visible decisions or fewer. Each decision
needs status, date, decision, and reason.

## Agent Harness Folder Contract

- Status: accepted
- Date: 2026-05-03
- Decision: agent harness, automation, templates, backlog, and shared memory live
  under `docs/operations/agents/`.
- Reason: agents need one obvious folder for orientation, mission contracts,
  memory, and continuity.

## Backend-First Agent Evidence

- Status: accepted
- Date: 2026-05-03
- Decision: backend agent runtime code lives in
  `backend/hyperliquid_gateway/agents/`; generated run evidence lives in
  `backend/hyperliquid_gateway/data/agent_runs/`.
- Reason: agent conclusions should be inspectable backend artifacts, not hidden
  renderer state.

## Workbench Boundary

- Status: accepted
- Date: 2026-05-03
- Decision: `src/features/agents/` is mission control and review UI only.
  Electron launches, bridges, and manages native runtime surfaces.
- Reason: neither React nor Electron should become the trading engine.

## Curated Memory Governance

- Status: accepted
- Date: 2026-05-03
- Decision: shared memory is capped, curated, and governed by
  `docs/operations/agents/memory/memory-policy.md`.
- Reason: memory should reduce context load for agents, not become an
  unbounded log.

## VM Owns Heavy Runtime Evidence

- Status: accepted
- Date: 2026-05-03
- Decision: `hf-backend-01` owns heavy compute and runtime evidence under
  `/data/hedge-fund-station/hyperliquid_gateway/data`; the repo keeps code,
  docs, specs, smoke artifacts, and curated examples.
- Reason: agent runs, checkpoints, SQLite state, backtests, replay outputs, and
  logs grow too quickly for Git and should not pollute the local workspace.
