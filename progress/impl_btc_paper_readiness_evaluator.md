# BTC Paper Readiness Evaluator Handoff

## Objective

Evaluate actual BTC Failed Impulse paper trades against the paper baseline so
the candidate cannot be promoted on backtest evidence alone.

## Scope

- Backend readiness helper and gateway endpoint.
- BTC Failed Impulse paper baseline trade matching.
- Strategy Detail paper readiness display.
- Focused tests and harness tracking.

## Changes Made

- Added `build_paper_readiness()` to evaluate matching paper trades against
  `paper_baseline` sample and drift rules.
- Added `paperTradeMatch` to new paper baselines so the backend can map paper
  trades to the strategy by symbol and setup tag.
- Added `/api/hyperliquid/paper/readiness/{strategy_id}` to load the latest
  paper artifact, filter matching paper trades, estimate fee-adjusted paper
  metrics, evaluate drift checks, and return current blockers.
- Added `getPaperReadiness()` to the Hyperliquid service and made Strategy
  Detail show readiness status, closed paper trade progress, net paper return
  after estimated fees, review coverage, check pass/fail state, and current
  blockers.
- Regenerated the BTC Failed Impulse paper artifact so it includes
  `paperTradeMatch`.

## Files Changed

- `backend/hyperliquid_gateway/backtesting/doubling.py`: paper readiness
  evaluator and paper trade match metadata.
- `backend/hyperliquid_gateway/app.py`: readiness endpoint and paper trade
  filtering.
- `src/services/hyperliquidService.ts`: readiness response type and client.
- `src/features/strategies/pages/StrategyDetailPage.tsx`: readiness panel.
- `tests/test_strategy_catalog.py`: readiness sample/drift tests.
- `agent_tasks.json`, `progress/current.md`: harness tracking.

## Generated Evidence

- Paper artifact:
  `backend/hyperliquid_gateway/data/paper/btc_failed_impulse_reversal-20260506T221801Z.json`

Readiness endpoint smoke:

```json
{
  "strategyId": "btc_failed_impulse_reversal",
  "status": "collecting-paper-trades",
  "closedTrades": 0,
  "requiredClosedTrades": 30,
  "paperNetReturnPct": 0.0,
  "nextAction": "Wait for matching paper trades, then close and review every trade."
}
```

Current blockers include missing calendar sample, closed paper trades, review
coverage, positive fee-adjusted paper return, PF floor, average trade drift,
paper review coverage, regime review, risk review, and operator sign-off.

## Verification

Commands run:

```bash
npm run agent:check
python3 -m unittest tests.test_strategy_catalog tests.test_backtest_filters tests.test_backtest_fees_and_scalper tests.test_btc_failed_impulse_reversal
npm run build
npm run hf:paper -- --strategy btc_failed_impulse_reversal --report backend/hyperliquid_gateway/data/backtests/btc_failed_impulse_reversal-hyperliquid-20260506T220313Z.json --validation backend/hyperliquid_gateway/data/validations/btc_failed_impulse_reversal-20260506T220348Z.json
npm run gateway:restart
curl -fsS http://127.0.0.1:18001/api/hyperliquid/paper/readiness/btc_failed_impulse_reversal
npm run gateway:probe
npm run hf:status
```

Result:

- Passed: focused Python tests, production build, paper artifact regeneration,
  gateway restart/probe, readiness endpoint smoke, status, and harness check.

## Findings

- The strategy remains in evidence collection, not promotion. There are no
  matching closed paper trades yet.
- Paper readiness uses estimated round-trip fees from the baseline fee model,
  so paper drift is evaluated after estimated fees rather than gross PnL.
- Readiness can reach human review only after sample and drift checks pass, and
  still keeps regime review, risk review, and operator sign-off as blockers.

## Memory Updated

Intentionally unchanged: the readiness contract is captured in code, tests, the
paper artifact, and this handoff. It should be promoted to shared memory only
after real paper evidence starts accumulating.

## Assumptions

- Matching BTC Failed Impulse paper trades should use symbol `BTC` and setup
  tags including `btc_failed_impulse_reversal`,
  `btc-failed-impulse-reversal`, `failed_impulse_reversal`, and
  `failed-impulse-reversal`.
- Paper PnL currently lacks stored fee fields, so readiness estimates round-trip
  fees from the paper baseline fee model.

## Next Best Step

Add or wire the paper execution loop so actual `btc_failed_impulse_reversal`
paper trades are created only when the strategy emits a long/short signal, then
let the readiness endpoint accumulate evidence.
