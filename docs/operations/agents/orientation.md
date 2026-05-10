# New Agent Five-Minute Orientation

Use this when starting work in Hedge Fund Station.

## First Read

Start with the shortest machine-readable snapshot:

```bash
rtk npm run agent:brief
```

Read these before changing anything:

1. `AGENTS.md`
2. `RTK.md`
3. `docs/project-architecture.md`
4. `docs/operations/hedge-fund-company-constitution.md`
5. `docs/operations/product-objective.md`
6. `docs/operations/agents/harness.md`
7. `docs/operations/agents/memory/memory-policy.md`
8. `docs/operations/agents/memory/shared-memory.md`
9. `docs/operations/agents/memory/decisions.md`
10. `docs/operations/agents/automation-system.md` for recurring or autonomous work
11. the relevant skill under `skills/`

If the mission needs broad repo orientation, memory work, Graphify, or Obsidian,
also read `docs/operations/agents/graph-memory-operating-system.md`.

For strategy work, also read:

- `docs/hedge-fund-agent-operating-model.md`
- `docs/hyperliquid-strategy-roadmap.md`
- `docs/strategies/README.md`
- `backend/hyperliquid_gateway/strategies/README.md`

## Repo Map

- `backend/hyperliquid_gateway/`: market logic, strategy logic, persistence,
  replay, validation, paper workflows, APIs, and agent run artifacts
- `src/`: React cockpit, review surfaces, API adapters, and operator controls
- `electron/`: desktop shell, IPC, native integrations, and terminal bridge
- `docs/`: architecture, operating memory, runbooks, and strategy reasoning
- `docs/operations/agents/`: agent harness, templates, backlog, and shared memory
- `skills/`: repeatable agent workflows
- `scripts/`: stable command entrypoints
- `graphify-out/`: generated repo graph artifacts for fast navigation; verify
  every lead against source before changing behavior

## Default Operating Loop

1. Run `rtk npm run agent:brief`.
2. Classify the mission.
3. Identify the trading lifecycle stage: research, backtesting, evaluation, or
   production.
4. Run `rtk npm run graph:status` before using Graphify; use Graphify for broad
   repo topology only when it is fresh enough for navigation.
5. Check curated memory only for durable decisions, lessons, and open questions.
6. Inspect source before changing.
7. Keep changes small and reviewable.
8. Preserve backend-first strategy ownership.
9. Use stable commands for milestone evidence.
10. Leave a handoff.

## Common Mission Classes

- repo health audit
- strategy research
- strategy validation audit
- data quality audit
- UI review-speed audit
- operations/runbook audit

Use `harness.md` for the full mission matrix.

## Safe Defaults

- Prefer docs and tests before behavior changes.
- Prefer backend artifacts over UI-only state.
- Prefer stable `npm run hf:*` commands over one-off scripts, and run them
  through `rtk` from agent shells when available.
- Do not promote live trading, change credentials, or perform large migrations
  without explicit human instruction.

## Before Finishing

Run the checks that match the work and fill out `templates/handoff.md`.
If the work is part of continuous improvement, update or name the next item in
`backlog.md`. If the work creates reusable context, follow
`memory/memory-policy.md`; otherwise say memory was intentionally unchanged.
