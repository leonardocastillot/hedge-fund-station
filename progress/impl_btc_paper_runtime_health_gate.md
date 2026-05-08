# BTC Paper Runtime Health Gate

## Objective

Add a read-only health gate for the BTC paper-only runtime so stale or
misconfigured 24/7 collection is visible in the app.

## Scope

- `backend/hyperliquid_gateway/app.py`
- `src/services/hyperliquidService.ts`
- `src/features/strategies/pages/StrategyDetailPage.tsx`
- `tests/test_strategy_catalog.py`
- `agent_tasks.json`
- `progress/`

## Changes Made

- Extended the paper runtime supervisor endpoint with:
  - `healthStatus`
  - `healthBlockers`
  - `healthChecks`
  - `lastLogAt`, `lastLogAtMs`, `lastLogAgeSeconds`
  - `staleAfterSeconds`
- Health states now identify unsupported strategy, stopped supervisor, wrong
  strategy metadata, dry-run mode, missing log, missing tick, stale tick, and
  tick errors.
- Added unit tests for healthy supervisor state and blocker reporting.
- Updated Strategy Detail's Paper Baseline panel to show Health, Runtime,
  Cadence, Started, Last Tick, and stale threshold details.

## Files Changed

- `backend/hyperliquid_gateway/app.py`: health status and stale detection for
  the supervisor endpoint.
- `src/services/hyperliquidService.ts`: typed health fields on supervisor
  response.
- `src/features/strategies/pages/StrategyDetailPage.tsx`: health gate UI beside
  runtime status.
- `tests/test_strategy_catalog.py`: focused health gate coverage.
- `agent_tasks.json`, `progress/current.md`, `progress/history.md`: harness
  state and evidence.

## Verification

Commands run:

```bash
npm run agent:check
python3 -m unittest tests.test_strategy_catalog tests.test_btc_failed_impulse_reversal
npm run build
npm run gateway:restart
curl -sS --max-time 30 http://127.0.0.1:18001/api/hyperliquid/paper/runtime/btc_failed_impulse_reversal/supervisor
npm run gateway:probe
npm run hf:paper:supervisor -- tail 20
```

Result:

- passed

Current health smoke:

- `running=true`
- `healthStatus=healthy`
- `healthBlockers=[]`
- `intervalSeconds=300.0`
- `lastLogAgeSeconds=197.492`
- `staleAfterSeconds=900.0`
- `dryRun=false`
- last tick `tick=2`, `status=managing-open-trade`, `signal=long`,
  `entryBlockReason=matching_open_trade`

## Findings

- The paper loop is currently healthy and not stale.
- Readiness remains incomplete because there is still only 1 open paper trade
  and 0 closed paper trades toward the 30-trade / 14-day baseline.
- This is read-only observability. No live trading, credential changes,
  production routing, or strategy logic changes were made.

## Memory Updated

- intentionally unchanged: the durable operational behavior is documented in
  code, runbook, and this handoff; no new company rule needs memory promotion.

## Assumptions

- A runtime is stale when the supervisor is running but the log has not been
  updated for at least 3 cadence intervals, with a 900 second floor.
- The local supervisor log mtime is a sufficient heartbeat signal for the local
  workstation paper loop.

## Next Best Step

Keep the paper loop running and review the BTC paper trade after the loop closes
it through stop, target, or time-stop logic.
