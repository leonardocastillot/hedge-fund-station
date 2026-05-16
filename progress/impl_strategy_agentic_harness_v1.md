# Implementation - strategy_agentic_harness_v1

## Objective

Add a docs-only strategy agent harness so Strategy Factory and strategy agents
share one lifecycle, role, evidence, and blocked live-gate contract.

## Scope

- `AGENTS.md`
- `CHECKPOINTS.md`
- `docs/operations/`
- `docs/operations/agents/`
- `skills/hedge-fund-strategy-lab/SKILL.md`
- `skills/hedge-fund-strategy-review/SKILL.md`
- `progress/current.md`
- `progress/history.md`

## Changes Made

- Added `docs/operations/agents/strategy-harness.md` as the canonical strategy
  agent contract.
- Added `docs/operations/agents/templates/strategy-live-gate.md` and
  `docs/operations/strategy-live-gates/README.md` for blocked production-review
  packages.
- Linked the harness from agent entrypoints, checkpoints, task templates,
  automation docs, role contracts, operations indexes, skills, backlog, and
  shared memory.
- Documented one leader per `strategy_id`, strategy-specific report naming,
  Research OS as auxiliary evidence, backend artifacts as source of truth, and
  live-gate status remaining `blocked`.
- Left CLI, backend, FastAPI, React, Electron, `agent_tasks.json` schema, and
  automation `.toml` files unchanged.

## Files Changed

- `docs/operations/agents/strategy-harness.md`: strategy lifecycle, roles,
  gates, Strategy Factory contract, verification defaults.
- `docs/operations/agents/templates/strategy-live-gate.md`: blocked live-gate
  package template.
- `docs/operations/strategy-live-gates/README.md`: folder contract for future
  packages.
- `AGENTS.md`, `docs/operations/agents/harness.md`,
  `docs/operations/agents/file-harness.md`, and `CHECKPOINTS.md`: canonical
  links and reviewer checks.
- `skills/hedge-fund-strategy-lab/SKILL.md` and
  `skills/hedge-fund-strategy-review/SKILL.md`: skill-level reads and rules.
- `docs/operations/agents/memory/shared-memory.md`: added one compact durable
  link to the strategy harness.

## Commands Run

```bash
rtk git status --short
rtk npm run agent:brief
rtk npm run agent:check
rtk npm run hf:status
rtk rg -n "strategy-harness|live-gate|Strategy Factory" AGENTS.md docs/operations/agents skills
rtk git diff --check
rtk npm run graph:status
```

## Verification Result

- Passed: `rtk npm run agent:check`.
- Passed: `rtk npm run hf:status`.
- Passed: link search for `strategy-harness`, `live-gate`, and
  `Strategy Factory`.
- Passed: `rtk git diff --check`.
- Passed with expected dirty freshness: `rtk npm run graph:status`; Graphify
  recommends `npm run graph:build`, but it was not rebuilt because v1 is
  docs-only and the graph was already dirty before this task.

## Risks And Assumptions

- The worktree had many pre-existing unrelated modified and untracked files; no
  backend, UI, Electron, CLI, task schema, or automation config changes were
  made for this task.
- v1 is documentation enforcement only. CLI or `agent:check` enforcement is
  recorded as a backlog v2.
- Live trading remains blocked behind a separate explicit human production task.

## Memory Updated

updated: `docs/operations/agents/memory/shared-memory.md` now points future
agents to `docs/operations/agents/strategy-harness.md`.

## Next Step

Add v2 enforcement in `scripts/agent_harness.py` or a stable docs check only
after deciding whether to extend `agent_tasks.json` fields or keep validation
derived from reports.
