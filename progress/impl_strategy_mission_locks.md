# Strategy Mission Locks Handoff

## Objective

Implement one-strategy-per-LLM mission locks so Strategy Factory and external
CLIs reserve a `strategy_id` before implementation starts.

## Scope

- Backend claim flow, CLI, API, harness validation, Strategy Factory UI, and
  strategy pod inspector.
- No backend strategy logic, credentials, order routing, live trading, or
  production promotion changed.

## Changes Made

- Added `backend/hyperliquid_gateway/strategy_claims.py` for shared claim,
  list, and release behavior.
- Added `hf:strategy:claim`, `hf:strategy:claims`, and
  `hf:strategy:release` CLI scripts plus API endpoints under
  `/api/hyperliquid/strategies/claims`.
- Added `progress/strategy_claims.json` and harness validation for duplicate
  active claims per asset, active task alignment, and required strategy scope.
- Updated Strategy Factory to reserve an editable `strategy_id` before draft
  approval, update the strategy pod, and pass a stable claim id into terminal
  metadata.
- Updated Strategy Inspector to show the active claim and move it to review,
  done, or blocked.
- Fixed current harness debt: `btc_dual_momentum_trend` now uses a valid
  `blocked` status, and `btc_regime_adaptive_confluence` names operator
  sign-off in live-gate notes.

## Files Changed

- `backend/hyperliquid_gateway/strategy_claims.py`: claim ledger, scaffold,
  task, current-session, and release logic.
- `backend/hyperliquid_gateway/cli.py`, `backend/hyperliquid_gateway/app.py`,
  `package.json`: CLI/API command surface.
- `scripts/agent_harness.py`, `progress/strategy_claims.json`: harness
  enforcement.
- `src/features/strategies/components/StrategyFactoryModal.tsx`,
  `src/features/desks/components/StrategyInspectorPanel.tsx`,
  `src/utils/strategyFactoryMission.ts`,
  `src/utils/missionDraftLaunch.ts`, `src/utils/agentOrchestration.ts`,
  `src/types/tasks.ts`, `src/services/hyperliquidService.ts`: app flow and
  metadata.
- `tests/test_strategy_claims.py`: claim and harness unit coverage.

## Verification

Commands run:

```bash
rtk python3 -m unittest tests.test_strategy_claims
rtk python3 -m py_compile backend/hyperliquid_gateway/strategy_claims.py backend/hyperliquid_gateway/cli.py scripts/agent_harness.py
rtk npm run agent:check
rtk python3 -m unittest tests.test_strategy_catalog tests.test_strategy_claims
rtk npm run build
```

Result:

- passed

## Findings

- The old harness debt was real: one invalid `cancelled` task status and one
  strategy task missing operator sign-off wording blocked `agent:check`.
- Existing terminal grouping used timestamp session ids; Strategy Factory now
  passes stable claim-backed strategy session metadata.

## Memory Updated

intentionally unchanged: the durable rule was promoted into `AGENTS.md`,
`docs/operations/agents/file-harness.md`, and
`docs/operations/agents/strategy-harness.md` instead of adding another memory
bullet.

## Assumptions

- Blocking is per asset.
- No override button in v1.
- Strategy work stays in the normal repo package/doc layout, not a worktree.

## Next Best Step

Use Strategy Factory once from the BTC pod to create a real claim and confirm
the Inspector release buttons match the operator workflow in the running app.
