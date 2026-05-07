# BTC Failed Impulse Paper Runtime Tick Handoff

## Objective

Create a paper-only runtime tick for the current BTC strategy leader so the
workspace can start collecting real paper ledger evidence whenever
`btc_failed_impulse_reversal` emits a backend long/short signal.

## Scope

- Strategy-owned paper runtime decision helpers.
- Gateway endpoint that applies the paper tick to SQLite.
- Stable local command for schedulable paper collection.
- Paper Lab button for operator-triggered ticks.
- Focused tests and harness tracking.

## Changes Made

- Added `build_paper_runtime_plan()` in
  `backend/hyperliquid_gateway/strategies/btc_failed_impulse_reversal/paper.py`.
  It evaluates the current BTC market history with the strategy signal,
  scoring, and risk rules.
- Added paper exit evaluation for matching open paper trades using the same
  0.65% stop, 1.75% target, and 8h time-stop contract.
- Added `/api/hyperliquid/paper/runtime/btc_failed_impulse_reversal/tick`.
  The endpoint opens a paper trade only on `long`/`short`, skips entries when
  the signal is `none` or a matching trade is already open, and closes matching
  open trades when strategy exits trigger.
- Added a SQLite 4h history fallback for runtime ticks so the strategy can
  calculate 1h/4h displacement after gateway restarts instead of relying only
  on short in-memory history.
- Added `python3 scripts/hf.py paper-runtime-tick` and package script
  `npm run hf:paper:tick`.
- Added `runPaperRuntimeTick()` to the Hyperliquid service and a `BTC Tick`
  action in the Paper Lab.

## Files Changed

- `backend/hyperliquid_gateway/strategies/btc_failed_impulse_reversal/paper.py`
- `backend/hyperliquid_gateway/app.py`
- `backend/hyperliquid_gateway/cli.py`
- `src/services/hyperliquidService.ts`
- `src/features/paper/pages/HyperliquidPaperLabPage.tsx`
- `tests/test_btc_failed_impulse_reversal.py`
- `tests/test_strategy_catalog.py`
- `package.json`
- `agent_tasks.json`
- `progress/current.md`

## Runtime Smoke

Dry-run endpoint smoke:

```json
{
  "success": true,
  "dryRun": true,
  "status": "flat-no-signal",
  "openedTradeId": null,
  "closedTradeIds": [],
  "historyPoints": 1882,
  "signal": "none",
  "blockReason": "no_reversal_signal",
  "change1h": -0.2261,
  "change15m": -0.1697,
  "change4h": 0.0
}
```

Current live BTC state did not create a paper trade. The 1h impulse is not at
the strategy threshold, so the tick correctly stayed flat.

## Verification

Commands run:

```bash
npm run agent:check
python3 -m unittest tests.test_btc_failed_impulse_reversal tests.test_strategy_catalog tests.test_backtest_filters tests.test_backtest_fees_and_scalper
npm run build
npm run gateway:restart
curl -fsS -X POST http://127.0.0.1:18001/api/hyperliquid/paper/runtime/btc_failed_impulse_reversal/tick?dry_run=true
npm run --silent hf:paper:tick -- --strategy btc_failed_impulse_reversal --dry-run
npm run gateway:probe
npm run hf:status
```

Result:

- Passed: focused Python tests, production build, gateway restart/probe,
  endpoint dry-run smoke, CLI dry-run smoke, status, and harness check.

## Risks

- This is still paper-only collection. It does not prove edge or readiness.
- Closed paper trades still need human review before readiness can advance.
- Runtime PnL uses mark-to-market gross PnL; readiness estimates fees afterward.
- A scheduler/supervisor is still needed to call the tick continuously.

## Memory Updated

Intentionally unchanged. The durable contract is in code, tests, package script,
gateway endpoint, and this handoff. Shared memory should only be updated after
real paper evidence starts accumulating.

## Next Best Step

Schedule the paper tick at a conservative cadence, for example every 5 minutes,
and monitor `/api/hyperliquid/paper/readiness/btc_failed_impulse_reversal`
until matching paper trades begin to accumulate.
