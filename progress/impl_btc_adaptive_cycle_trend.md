# BTC Adaptive Cycle Trend

- Task: `btc_adaptive_cycle_trend`
- Date: 2026-05-13
- Agent: `codex`
- Mission class: strategy research
- Status: ready for review

## Summary

Implemented `btc_adaptive_cycle_trend`, a backend-first BTC daily strategy that
uses the same broad cycle guard as `btc_guarded_cycle_trend` and increases
exposure only when the daily regime is cleaner. The official 500 USD taker-fee
backtest returned `94.39%`, beating the existing paper-ready benchmark
(`89.53%`) by `4.86` percentage points.

## Changed Files

- `docs/strategies/btc-adaptive-cycle-trend.md`
- `backend/hyperliquid_gateway/strategies/btc_adaptive_cycle_trend/`
- `backend/hyperliquid_gateway/backtesting/registry.py`
- `backend/hyperliquid_gateway/app.py`
- `docs/operations/strategy-validation-thresholds.md`
- `docs/operations/strategy-readiness-matrix.md`
- `tests/test_btc_adaptive_cycle_trend.py`
- `.gitignore`
- `agent_tasks.json`
- `progress/current.md`
- `progress/history.md`

## Official Evidence

- Data refresh:
  `backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json`
  with `4,257` rows from `2014-09-17` through `2026-05-13`
- Benchmark backtest:
  `backend/hyperliquid_gateway/data/backtests/btc_guarded_cycle_trend-btc_usd_daily_yahoo-20260513T183751Z.json`
- New strategy backtest:
  `backend/hyperliquid_gateway/data/backtests/btc_adaptive_cycle_trend-btc_usd_daily_yahoo-20260513T183755Z.json`
- Validation:
  `backend/hyperliquid_gateway/data/validations/btc_adaptive_cycle_trend-20260513T183803Z.json`
- Paper candidate:
  `backend/hyperliquid_gateway/data/paper/btc_adaptive_cycle_trend-20260513T183807Z.json`
- Stability audit:
  `backend/hyperliquid_gateway/data/audits/btc_adaptive_cycle_trend-doubling-stability-20260513T183812Z.json`

## Results

- Initial equity: `500 USD`
- Final equity: `971.97 USD`
- Net profit: `471.97 USD`
- Return: `94.39%`
- Benchmark return: `89.53%`
- Excess return: `4.86` percentage points
- Trades: `48`
- Win rate: `41.67%`
- Profit factor: `2.59`
- Max drawdown: `11.13%`
- Fees paid: `4.30 USD`
- Validation: `ready-for-paper`
- Stability audit: `stable`, `100.0%` positive slices, largest positive slice
  PnL share `42.26%`

## Commands Run

- `rtk npm run agent:brief`
- `rtk npm run agent:check`
- `rtk python3 -m unittest tests.test_btc_adaptive_cycle_trend`
- `rtk python3 -m py_compile backend/hyperliquid_gateway/strategies/btc_adaptive_cycle_trend/logic.py backend/hyperliquid_gateway/strategies/btc_adaptive_cycle_trend/backtest.py backend/hyperliquid_gateway/strategies/btc_adaptive_cycle_trend/paper.py backend/hyperliquid_gateway/backtesting/registry.py backend/hyperliquid_gateway/app.py`
- `rtk python3 -m unittest tests.test_strategy_catalog tests.test_btc_guarded_cycle_trend tests.test_btc_adaptive_cycle_trend`
- `rtk npm run hf:market-data:btc-daily -- --start 2014-09-17 --force`
- `rtk npm run hf:backtest -- --strategy btc_guarded_cycle_trend --dataset backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json --fee-model taker --risk-fraction 0.10 --equity 500`
- `rtk npm run hf:backtest -- --strategy btc_adaptive_cycle_trend --dataset backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json --fee-model taker --risk-fraction 0.20 --equity 500`
- `rtk npm run hf:validate -- --strategy btc_adaptive_cycle_trend --report backend/hyperliquid_gateway/data/backtests/btc_adaptive_cycle_trend-btc_usd_daily_yahoo-20260513T183755Z.json`
- `rtk npm run hf:paper -- --strategy btc_adaptive_cycle_trend --report backend/hyperliquid_gateway/data/backtests/btc_adaptive_cycle_trend-btc_usd_daily_yahoo-20260513T183755Z.json --validation backend/hyperliquid_gateway/data/validations/btc_adaptive_cycle_trend-20260513T183803Z.json`
- `rtk npm run hf:doubling:stability -- --strategy btc_adaptive_cycle_trend --report backend/hyperliquid_gateway/data/backtests/btc_adaptive_cycle_trend-btc_usd_daily_yahoo-20260513T183755Z.json --validation backend/hyperliquid_gateway/data/validations/btc_adaptive_cycle_trend-20260513T183803Z.json`
- `rtk npm run hf:paper:loop -- --strategy btc_adaptive_cycle_trend --dry-run --portfolio-value 500 --max-ticks 1 --interval-seconds 1`
- `rtk npm run gateway:restart`
- `rtk npm run hf:status`

## Notes And Risks

- The first paper runtime dry-run hit a stale local gateway and returned 400.
  After `rtk npm run gateway:restart`, the same dry-run passed and returned
  `flat-no-signal` with no opened trade.
- The latest signal is currently `none`; paper review should wait for a fresh
  daily signal or run scheduled dry-runs.
- This is still daily BTC history evidence, not live execution proof. Production
  remains blocked behind paper journal evidence, regime review, risk review,
  operator sign-off, monitoring, and rollback planning.
- Memory was intentionally unchanged; this handoff plus strategy docs are the
  durable evidence for this mission.

## Next Action

Run paper dry-runs daily with `portfolio_value=500` and review the first real
entry signal before any non-dry-run paper loop.
