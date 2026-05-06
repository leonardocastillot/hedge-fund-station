# Strategy Pipeline Stabilization

## Objective

Stabilize `/strategies` and strategy detail evidence so the pipeline loads fast,
uses correct gate actions, and lets reviewers compare backtest artifacts.

## Scope

- Local Hyperliquid gateway API on `127.0.0.1:18001`.
- Strategy Pipeline board, Strategy Detail, and Hyperliquid frontend service.
- Backend catalog evidence, validation, and backtest artifact contracts.
- Focused strategy catalog tests.

## Changes Made

- Made the strategy catalog lightweight by skipping database summaries and
  paper-trade mark-to-market enrichment for catalog cards.
- Replaced default database table counts with a cheap/cached DB summary; exact
  counts are available only through `exact_db_counts=true` on strategy audit.
- Added backtest artifact list/detail APIs keyed by `artifact_id`, with
  strategy mismatch rejection.
- Added a validation rerun API that validates the latest backtest by default.
- Updated Pipeline blocked-gate actions so validation-blocked rows rerun
  validation instead of launching a full backtest.
- Added a compact Strategy Detail artifact selector and loads selected reports
  into the Trades Ledger.

## Files Changed

- `backend/hyperliquid_gateway/app.py`: lightweight catalog, cheap DB summary,
  validation endpoint, and artifact APIs.
- `src/services/hyperliquidService.ts`: artifact and validation client methods,
  types, and cache invalidation.
- `src/features/strategies/pages/StrategyLibraryPage.tsx`: validation-blocked
  gate action routing.
- `src/features/strategies/pages/StrategyDetailPage.tsx`: backtest artifact
  selector and selected artifact loading.
- `tests/test_strategy_catalog.py`: tests for lightweight catalog, artifact
  ordering/mismatch, and validation endpoint behavior.
- `agent_tasks.json` and `progress/current.md`: active harness task state.

## Verification

Commands run:

```bash
npm run agent:check
python3 -m unittest tests.test_strategy_catalog
python3 -m unittest tests.test_strategy_catalog tests.test_backtest_filters tests.test_backtest_fees_and_scalper
npm run build
npm run hf:status
npm run gateway:restart
npm run gateway:probe
curl -sS -o /dev/null -w 'catalog http=%{http_code} total=%{time_total}s ttfb=%{time_starttransfer}s\n' --max-time 30 'http://127.0.0.1:18001/api/hyperliquid/strategies/catalog?limit=500'
curl -sS -o /dev/null -w 'health http=%{http_code} total=%{time_total}s ttfb=%{time_starttransfer}s\n' --max-time 30 'http://127.0.0.1:18001/health'
curl -sS -o /dev/null -w 'artifacts http=%{http_code} total=%{time_total}s\n' --max-time 30 'http://127.0.0.1:18001/api/hyperliquid/backtests/bb_squeeze_adx/artifacts?limit=20'
```

Result:

- passed: harness check after task note wording fix, 5 tasks and 0 warnings.
- passed: 24 focused backend tests.
- passed: production build.
- passed: `hf:status`.
- passed: gateway restart and probe.
- performance: catalog returned HTTP 200 in `0.340786s`; health returned HTTP
  200 in `0.002113s`.
- repeated/parallel check: catalog `0.119913s`, health `0.118904s`.
- artifact endpoint: `bb_squeeze_adx` artifact list returned HTTP 200 in
  `0.352135s`.
- browser smoke: `/strategies` showed the Strategy Pipeline with no `Not Found`,
  module error, or fallback warning.
- browser smoke: `/strategy/bb_squeeze_adx/paper` showed `Backtest Artifacts`,
  artifact id, `Trades Ledger`, `203 expected`, and `backtest loaded`, with no
  registration error.

## Findings

- The old catalog latency was dominated by exact SQLite `COUNT(*)` calls on a
  local database around 1.8 GB, especially `market_snapshots` and
  `aggregate_snapshots`.
- The catalog also did unnecessary paper-trade mark-to-market enrichment, which
  can touch overview refresh state. That is useful for audit, not for card
  loading.
- Existing generated backtests all have `artifact_id`, so using it as the
  selector key is viable for the current evidence tree.

## Memory Updated

intentionally unchanged: this was a focused local contract/performance fix; the
existing backend connectivity runbook already covers restart and endpoint
checks.

## Assumptions

- Strategy catalog cards do not need exact DB table counts.
- Strategy audit may keep richer paper-trade evidence, while catalog prioritizes
  fast operator review.
- Validation reruns should not create paper candidates.
- No trading execution, credential changes, or promotion routing were in scope.

## Next Best Step

Add a tiny diagnostics affordance to Strategy Audit for operators who explicitly
want exact SQLite table counts, with a warning that it can be slow on large DBs.
