# BTC Strategy Doubling Leaderboard Handoff

## Objective

Create inspectable BTC-only strategy ranking evidence for the fastest credible
capital-doubling candidate, and surface that evidence in Strategy Pipeline.

## Scope

- Strategy research and validation loop for registered local BTC candidates.
- Backend catalog evidence in `backend/hyperliquid_gateway/app.py`.
- New backend metric helper in `backend/hyperliquid_gateway/backtesting/`.
- Strategy Pipeline rendering in `src/features/strategies/pages/StrategyLibraryPage.tsx`.
- Type normalization in `src/services/hyperliquidService.ts`.

## Changes Made

- Added `build_doubling_estimate()` to derive a backend-owned estimate from
  backtest artifacts, sample window, return, trade count, fee model, robust gate,
  and matching validation status.
- Strategy catalog cards now include `doublingEstimate`; backtest artifact
  summaries also include the estimate.
- Strategy Pipeline now shows a `Fastest 2x` summary metric and a per-card
  `2x ETA` metric. The card ETA is shown only for validated candidates, so
  blocked or unvalidated positive artifacts do not look actionable.
- Added focused unit coverage for candidate and blocked doubling estimates,
  catalog card exposure, and artifact summary inclusion.

## Files Changed

- `backend/hyperliquid_gateway/backtesting/doubling.py`: new projection helper.
- `backend/hyperliquid_gateway/app.py`: attaches doubling evidence to catalog
  and artifact payloads.
- `src/services/hyperliquidService.ts`: adds `HyperliquidDoublingEstimate`
  typing and normalization.
- `src/features/strategies/pages/StrategyLibraryPage.tsx`: renders fastest 2x
  evidence in Pipeline.
- `tests/test_strategy_catalog.py`: focused backend tests.
- `agent_tasks.json`, `progress/current.md`: harness task tracking.

## Backtest Evidence

Comparable BTC-only taker-fee 3-day local backtests generated:

- `backend/hyperliquid_gateway/data/backtests/btc_failed_impulse_reversal-hyperliquid-20260506T220313Z.json`
- `backend/hyperliquid_gateway/data/backtests/btc_crowding_scalper-hyperliquid-20260506T220313Z.json`
- `backend/hyperliquid_gateway/data/backtests/short_squeeze_continuation-hyperliquid-20260506T220335Z.json`
- `backend/hyperliquid_gateway/data/backtests/funding_exhaustion_snap-hyperliquid-20260506T220335Z.json`
- `backend/hyperliquid_gateway/data/backtests/oi_expansion_failure_fade-hyperliquid-20260506T220335Z.json`
- `backend/hyperliquid_gateway/data/backtests/polymarket_btc_updown_5m_oracle_lag-hyperliquid-20260506T220356Z.json`
- `backend/hyperliquid_gateway/data/backtests/polymarket_btc_5m_maker_basis_skew-hyperliquid-20260506T220356Z.json`

Validation artifacts generated:

- `backend/hyperliquid_gateway/data/validations/btc_failed_impulse_reversal-20260506T220348Z.json`
- `backend/hyperliquid_gateway/data/validations/btc_crowding_scalper-20260506T220348Z.json`
- `backend/hyperliquid_gateway/data/validations/short_squeeze_continuation-20260506T220348Z.json`
- `backend/hyperliquid_gateway/data/validations/funding_exhaustion_snap-20260506T220356Z.json`
- `backend/hyperliquid_gateway/data/validations/oi_expansion_failure_fade-20260506T220356Z.json`

Current ranking from `/api/hyperliquid/strategies/catalog`:

- `btc_failed_impulse_reversal`: candidate, 0.99% return, 9 trades, robust
  passes, validation `ready-for-paper`, projected 2x ETA `211.0` days.
- `btc_crowding_scalper`: blocked, -0.08% return, validation blocked.
- `short_squeeze_continuation`: blocked, -0.07% return, validation blocked.
- `oi_expansion_failure_fade`: blocked, -0.05% return, validation blocked.
- `funding_exhaustion_snap`: blocked/no positive return, 0 trades.
- Polymarket BTC 5m strategies: no trades in the 3-day local window.

## Verification

Commands run:

```bash
npm run agent:check
python3 -m unittest tests.test_strategy_catalog
python3 -m unittest tests.test_strategy_catalog tests.test_backtest_filters tests.test_backtest_fees_and_scalper tests.test_btc_failed_impulse_reversal
npm run hf:backtest -- --strategy btc_failed_impulse_reversal --symbol BTC --fee-model taker --lookback-days 3
npm run hf:backtest -- --strategy btc_crowding_scalper --symbol BTC --fee-model taker --lookback-days 3
npm run hf:backtest -- --strategy short_squeeze_continuation --symbol BTC --fee-model taker --lookback-days 3
npm run hf:backtest -- --strategy funding_exhaustion_snap --symbol BTC --fee-model taker --lookback-days 3
npm run hf:backtest -- --strategy oi_expansion_failure_fade --symbol BTC --fee-model taker --lookback-days 3
npm run hf:backtest -- --strategy polymarket_btc_updown_5m_oracle_lag --fee-model taker --lookback-days 3
npm run hf:backtest -- --strategy polymarket_btc_5m_maker_basis_skew --fee-model taker --lookback-days 3
npm run hf:validate -- --strategy btc_failed_impulse_reversal --report backend/hyperliquid_gateway/data/backtests/btc_failed_impulse_reversal-hyperliquid-20260506T220313Z.json
npm run hf:validate -- --strategy btc_crowding_scalper --report backend/hyperliquid_gateway/data/backtests/btc_crowding_scalper-hyperliquid-20260506T220313Z.json
npm run hf:validate -- --strategy short_squeeze_continuation --report backend/hyperliquid_gateway/data/backtests/short_squeeze_continuation-hyperliquid-20260506T220335Z.json
npm run hf:validate -- --strategy funding_exhaustion_snap --report backend/hyperliquid_gateway/data/backtests/funding_exhaustion_snap-hyperliquid-20260506T220335Z.json
npm run hf:validate -- --strategy oi_expansion_failure_fade --report backend/hyperliquid_gateway/data/backtests/oi_expansion_failure_fade-hyperliquid-20260506T220335Z.json
npm run gateway:restart
npm run gateway:probe
npm run build
npm run hf:status
```

Result:

- Passed: harness, focused tests, build, gateway probe, status, and HTTP catalog
  smoke for `doublingEstimate`.
- Expected non-zero validations: blocked strategies correctly exited non-zero
  while writing validation artifacts.
- Browser smoke skipped: the Browser plugin's Node REPL control surface was not
  available via tool discovery, and the Electron dev server did not expose
  `127.0.0.1:5173` reliably for a curl smoke in this run.

## Findings

- `btc_failed_impulse_reversal` remains the only local BTC candidate that is
  positive, robust, and `ready-for-paper`.
- The projected 211-day doubling ETA is a short-window research projection from
  3 days of local data. It is not production evidence.
- The fast scalper-style BTC strategies are currently fee-negative after taker
  costs. Their repair path is likely filter quality and fee/slippage reduction,
  not more UI.
- The next production/live step remains blocked behind paper evidence, risk
  review, operator sign-off, monitoring, rollback, and a production runbook.

## Memory Updated

Intentionally unchanged: the current finding is captured in this handoff and
backend artifacts, but it is not durable enough for shared memory until paper
evidence confirms or rejects it.

## Assumptions

- The comparable ranking should use BTC-only taker-fee backtests on the local
  Hyperliquid snapshot because the objective is BTC and 24/7 operation.
- A doubling estimate is useful only when robust and validation gates pass;
  blocked artifacts should be visible but not presented as actionable.

## Next Best Step

Run paper-trade evidence collection for `btc_failed_impulse_reversal` and add a
paper review criterion that compares live/paper drift against the 211-day
research projection.
