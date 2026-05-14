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

## File-Based Agent Harness

- Status: accepted
- Date: 2026-05-05
- Decision: repo-level agent coordination uses `agent_tasks.json`,
  `progress/`, `CHECKPOINTS.md`, `scripts/agent_harness.py`, and
  `docs/operations/agents/file-harness.md`.
- Reason: Codex, Claude, Gemini, external agents, and in-app agents need one
  vendor-neutral file contract for task ownership, progress, review, and
  handoff.

## Backend-First Agent Evidence

- Status: accepted
- Date: 2026-05-03
- Decision: backend agent runtime code lives in
  `backend/hyperliquid_gateway/agents/`; generated run evidence lives in
  `backend/hyperliquid_gateway/data/agent_runs/`.
- Reason: agent conclusions should be inspectable backend artifacts, not hidden
  renderer state.

## Strategy Learning Memory

- Status: accepted
- Date: 2026-05-07
- Decision: strategy lessons, decisions, postmortems, mistakes, wins, and rule
  changes are stored as structured backend artifacts under
  `backend/hyperliquid_gateway/data/strategy_memory/`; Obsidian mirrors them as
  managed notes for navigation and human review.
- Reason: strategy learning must be durable, testable, and linked to evidence
  instead of living only in renderer state or manual notes.

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

## Graphify And Obsidian Split

- Status: accepted
- Date: 2026-05-08
- Decision: Graphify is the repo navigation map, Obsidian is curated durable
  memory, and the file harness is the live task and evidence state.
- Reason: agents need fast orientation without treating generated graphs as
  canonical truth or turning memory into an artifact dump.

## Recurring Agent Cadence

- Status: accepted
- Date: 2026-05-13
- Decision: Hedge Fund Station uses a daily 02:30 implementation-first Strategy
  Factory to create or materially improve exactly one backend-first strategy
  candidate and carry it through tests, backtest, validation, paper candidate
  when eligible, and blocked live-gate prep when evidence supports it. A daily
  03:30 improvement automation follows up on the latest factory output or
  highest-upside validation blocker. The Sunday 09:00 health report remains
  read-only for harness, memory, Graphify, Obsidian, and strategy status.
- Reason: agents need compounding strategy R&D and evidence generation without
  turning recurring work into noisy broad rewrites, fake edge claims, or unsafe
  live-trading promotion.

## VM Owns Heavy Runtime Evidence

- Status: accepted
- Date: 2026-05-03
- Decision: `hf-backend-01` owns heavy compute and runtime evidence under
  `/data/hedge-fund-station/hyperliquid_gateway/data`; the repo keeps code,
  docs, specs, smoke artifacts, and curated examples.
- Reason: agent runs, checkpoints, SQLite state, backtests, replay outputs, and
  logs grow too quickly for Git and should not pollute the local workspace.

## RTK And Caveman Token Discipline

- Status: accepted
- Date: 2026-05-10
- Decision: Codex and future repo agents should load `RTK.md` for compact shell
  output and `CAVEMAN.md` for output-only concise replies. Caveman must not
  rewrite repo memory, compress strategy docs, add MCP shrink, or install global
  hooks without explicit human approval.
- Reason: RTK reduces command-output token noise and Caveman reduces
  user-facing output verbosity without changing backend-first architecture,
  stable `hf:*` commands, or handoff evidence rules.
