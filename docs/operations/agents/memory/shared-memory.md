# Shared Agent Memory

Policy: keep this file to 20 bullets or fewer. Use links instead of repeating
canonical docs.

## Current Operating Shape

- Hedge Fund Station is backend-first: market logic, strategy logic,
  persistence, replay, validation, paper workflows, and agent artifacts belong
  under `backend/hyperliquid_gateway/`.
- The renderer under `src/` is a cockpit for review, visualization, approval,
  and operator controls.
- Electron is a shell and bridge: lifecycle, native integrations, IPC,
  workspace, and terminal orchestration.
- Agent operating docs now live under `docs/operations/agents/`.
- File-based agent coordination starts from `agent_tasks.json`,
  `progress/current.md`, `CHECKPOINTS.md`, and
  `docs/operations/agents/file-harness.md`.
- Generated agent evidence belongs under
  `backend/hyperliquid_gateway/data/agent_runs/`.
- Shared memory is curated under `docs/operations/agents/memory/`; follow
  `memory-policy.md` before adding entries.

## Useful Entry Points

- Agent orientation: `docs/operations/agents/orientation.md`
- Harness: `docs/operations/agents/harness.md`
- File harness: `docs/operations/agents/file-harness.md`
- Memory policy: `docs/operations/agents/memory/memory-policy.md`
- Backlog: `docs/operations/agents/backlog.md`
- Handoff template: `docs/operations/agents/templates/handoff.md`
- Repo architecture: `docs/project-architecture.md`
- Product objective: `docs/operations/product-objective.md`

## Default Priorities

1. Strategy and validation quality.
2. Operational reliability.
3. Fast human review.
4. Data quality and auditability.
5. Simple agent workflows with inspectable memory.
