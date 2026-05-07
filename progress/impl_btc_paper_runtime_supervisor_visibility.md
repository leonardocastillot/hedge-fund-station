# BTC Paper Runtime Supervisor Visibility

## Objective

Make the running BTC paper-only loop inspectable in the app beside paper
readiness, without changing strategy logic or trade routing.

## Scope

- `backend/hyperliquid_gateway/app.py`
- `src/services/hyperliquidService.ts`
- `src/features/strategies/pages/StrategyDetailPage.tsx`
- `tests/test_strategy_catalog.py`
- `agent_tasks.json`
- `progress/`

## Changes Made

- Added backend endpoint
  `/api/hyperliquid/paper/runtime/{strategy_id}/supervisor`.
- The endpoint reads local supervisor metadata, pid, `screen` session state,
  log tail, last event, and last tick summary from `.tmp/`.
- Added a focused unit test for supervisor metadata/log parsing.
- Added frontend service type and method for supervisor status.
- Added runtime status metrics to Strategy Detail's Paper Baseline panel:
  running/stopped, mode, cadence, started time, last tick, supervisor session,
  and log path.

## Files Changed

- `backend/hyperliquid_gateway/app.py`: supervisor status builder and API
  endpoint.
- `src/services/hyperliquidService.ts`: supervisor response type and fetcher.
- `src/features/strategies/pages/StrategyDetailPage.tsx`: runtime status
  display next to paper readiness.
- `tests/test_strategy_catalog.py`: supervisor status unit coverage.
- `agent_tasks.json`, `progress/current.md`, `progress/history.md`: harness
  state and handoff evidence.

## Verification

Commands run:

```bash
npm run agent:check
python3 -m unittest tests.test_strategy_catalog tests.test_btc_failed_impulse_reversal
npm run gateway:restart
curl -sS --max-time 30 http://127.0.0.1:18001/api/hyperliquid/paper/runtime/btc_failed_impulse_reversal/supervisor
npm run gateway:probe
npm run hf:paper:supervisor -- status
npm run hf:paper:supervisor -- tail 20
npm run build
```

Result:

- passed

Smoke result:

- Supervisor endpoint returned `running=true`, `mode=screen`,
  `screenSession=btc-paper-runtime-loop`, `pid=71918`,
  `intervalSeconds=300.0`, `dryRun=false`, and last tick `tick=2`.
- Last tick status was `managing-open-trade`, signal `long`,
  `entryBlockReason=matching_open_trade`, and no duplicate paper trade was
  opened.
- The local gateway is healthy after restart.
- The BTC paper-only loop remains running.

## Findings

- Strategy Detail can now show whether 24/7 paper collection is actually alive
  instead of relying on terminal-only status.
- Readiness remains incomplete: the strategy has 1 open paper trade and 0/30
  closed trades, with sample, drift, review, regime, risk, and operator
  sign-off blockers still active.
- This is visibility only. No live trading, credential changes, production
  routing, or strategy decision changes were made.

## Memory Updated

- intentionally unchanged: this is implementation evidence and UI visibility,
  not a new durable company rule.

## Assumptions

- The local app may inspect `.tmp/` supervisor metadata because this is a local
  operator workstation workflow.
- `screen` remains the expected local supervisor mode when available.

## Next Best Step

Keep the BTC paper-only loop running, monitor Strategy Detail readiness, and
review the open paper trade after it closes.
