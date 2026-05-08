# BTC Failed Impulse Paper Baseline Handoff

## Objective

Make the current best BTC candidate measurable in paper against its backtest and
doubling projection before any 24/7 or live discussion.

## Scope

- `btc_failed_impulse_reversal` paper candidate workflow.
- Generic backend paper baseline helper.
- Strategy Detail paper evidence surface.
- Harness task/progress files.

## Changes Made

- Added `build_paper_baseline()` beside the doubling helper. It derives a
  paper baseline from the matched backtest, validation, candidate signal, and
  doubling estimate.
- `build_paper_workflow()` now writes `paper_baseline` into paper candidate
  artifacts.
- Strategy Detail now renders a Paper Baseline panel with status, research 2x
  ETA, required paper sample, review coverage, backtest benchmark, drift checks,
  promotion blockers, and kill switches.
- Added focused unit coverage for the paper baseline sample/drift/blocker
  contract.
- Regenerated the BTC Failed Impulse paper candidate from the latest report and
  validation.

## Files Changed

- `backend/hyperliquid_gateway/backtesting/doubling.py`: adds paper baseline
  contract.
- `backend/hyperliquid_gateway/backtesting/workflow.py`: includes
  `paper_baseline` in paper artifacts.
- `src/features/strategies/pages/StrategyDetailPage.tsx`: displays paper
  baseline in the strategy detail evidence view.
- `tests/test_strategy_catalog.py`: validates baseline requirements and drift
  checks.
- `agent_tasks.json`, `progress/current.md`: harness tracking.

## Generated Evidence

- Paper artifact:
  `backend/hyperliquid_gateway/data/paper/btc_failed_impulse_reversal-20260506T221259Z.json`

Key artifact fields:

- `paper_baseline.status`: `collect-paper-evidence`
- `projection.projectedDaysToDouble`: `211.0`
- `projection.projectedTradesToDouble`: `634`
- `minimumPaperSample.calendarDays`: `14`
- `minimumPaperSample.closedTrades`: `30`
- `minimumPaperSample.reviewCoveragePct`: `90`
- `promotionBlockers`: `paper_minimum_sample`, `paper_drift_checks`,
  `paper_trade_reviews`, `regime_review`, `risk_review`, `operator_sign_off`

The candidate remains `standby` because latest signal is `none`.

## Verification

Commands run:

```bash
python3 -m unittest tests.test_strategy_catalog tests.test_backtest_filters tests.test_backtest_fees_and_scalper tests.test_btc_failed_impulse_reversal
npm run build
npm run hf:paper -- --strategy btc_failed_impulse_reversal --report backend/hyperliquid_gateway/data/backtests/btc_failed_impulse_reversal-hyperliquid-20260506T220313Z.json --validation backend/hyperliquid_gateway/data/validations/btc_failed_impulse_reversal-20260506T220348Z.json
npm run gateway:restart
npm run gateway:probe
npm run hf:status
npm run agent:check
```

Result:

- Passed: focused tests, production build, paper candidate generation, gateway
  restart/probe, status, harness check, and HTTP smoke for latest backtest paper
  baseline.

## Findings

- The BTC strategy now has a measurable paper gate, but no paper trade evidence
  yet.
- The latest signal remains `none`, so the correct state is standby and collect
  evidence only when the trigger appears.
- The 211-day 2x estimate is explicitly marked `paper-drift-baseline-only` and
  should not be treated as an expected outcome.
- Any future live/production path remains blocked behind paper sample, drift
  checks, trade reviews, regime review, risk review, operator sign-off,
  monitoring, rollback, and a production runbook.

## Memory Updated

Intentionally unchanged: this is implementation/report evidence and belongs in
the paper artifact plus handoff, not curated shared memory yet.

## Assumptions

- A short-window BTC backtest should require at least two weeks and at least 30
  reviewed closed paper trades before promotion review.
- Paper drift should be checked after fees, not against gross PnL.

## Next Best Step

Add a paper-readiness view or endpoint that aggregates actual paper trades for
`btc_failed_impulse_reversal` against `paper_baseline.driftChecks` once the
strategy starts producing paper trades.
