# Daily Strategy Factory Automation

## Objective

Create and test a recurring strategy factory automation that continuously mines
local strategy evidence for new backend-first strategy candidates.

## Scope

- Codex automation store:
  `/Users/optimus/.codex/automations/daily-hedge-fund-strategy-factory/automation.toml`
- Existing nightly automation:
  `/Users/optimus/.codex/automations/nightly-hedge-fund-station-improvement/automation.toml`
- Agent operating docs and memory:
  `docs/operations/agents/automation-system.md`,
  `docs/operations/agents/memory/decisions.md`
- File harness:
  `progress/current.md`, `progress/history.md`

## Changes Made

- Created `Daily Hedge Fund Strategy Factory` as an active daily 02:30 worktree
  automation using `gpt-5.5` with `xhigh` reasoning.
- Moved `Nightly Hedge Fund Strategy Improvement` to daily 03:30 to avoid two
  worktree agents writing at the same time.
- Updated agent automation docs and curated decisions to make the new cadence
  durable for future agents.
- Cleaned `progress/current.md` so the live harness no longer advertises the
  completed `btc_adaptive_cycle_trend` task as active.

## Factory Behavior Test

The factory was not run as a live strategy-generation job. Instead, its startup
and safety behavior were tested with the same required checks it will use during
scheduled runs:

```bash
rtk git status --short
rtk npm run agent:brief
rtk npm run agent:check
rtk npm run graph:status
rtk npm run hf:status
```

Expected behavior on the current worktree: report-only. The worktree is dirty
with a large strategy package ready for review/commit, so the factory should not
create another strategy on top of it.

## Verification

Commands run:

```bash
rtk npm run agent:brief
rtk npm run agent:check
rtk npm run graph:status
rtk npm run hf:status
```

Result:

- passed: harness brief and check
- passed: `hf:status` found 16 available strategies and current strategy
  evidence
- passed: Graphify was rebuilt and `rtk npm run graph:check` passed with 4,748
  nodes, 7,605 edges, and 282 communities

## Findings

- `agent_tasks.json` is already queue-clean: 20 tasks are done, one future live
  production gate task is blocked, and no task is pending or in progress.
- `progress/current.md` was stale and still showed `btc_adaptive_cycle_trend` as
  `ready_for_review`; it is now reset to no active implementation task.
- No strategy memory events exist yet under
  `backend/hyperliquid_gateway/data/strategy_memory/`, so the factory will rely
  first on backtests, validations, paper candidates, audits, agent runs, docs,
  backend modules, and progress handoffs.

## Memory Updated

updated: `docs/operations/agents/memory/decisions.md` now records the accepted
02:30 Strategy Factory, 03:30 improvement agent, and Sunday 09:00 health report
cadence.

## Assumptions

- The local Codex automation store is the source of truth for scheduled
  automations; the repo records the durable operating decision and handoff.
- The factory should not generate a real strategy while unrelated uncommitted
  strategy work is present.

## Next Best Step

Commit and push the current strategy package plus automation documentation so
future scheduled runs start from a cleaner repo baseline.
