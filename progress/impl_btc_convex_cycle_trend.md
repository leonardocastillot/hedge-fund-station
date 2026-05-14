# BTC Convex Cycle Trend

## Objective

Run a manual Strategy Factory smoke test now: create one real backend-first
strategy candidate, compare it against the current BTC daily champion, and carry
it through tests, backtest, validation, paper candidate generation, and
stability audit.

## Benchmark Champion

- Champion: `btc_adaptive_cycle_trend`
- Profile: `500 USD`, taker fees, `risk_fraction=0.20`, BTC daily Yahoo dataset
- Champion result rerun: `94.39%` net return, final equity `971.97 USD`,
  `48` trades, `2.59` profit factor, `11.13%` max drawdown.

## Strategy Created

- Strategy ID: `btc_convex_cycle_trend`
- Thesis: BTC daily cycle upside is concentrated in clean uptrends; larger
  partial exposure should be allowed only when trend, RSI, drawdown, and
  30-day momentum filters align.
- Sizing: `25%` equity in convex regime, `12%` in base regime.
- Risk: long-only, BTC-only, no leverage, one position, no live routing.

## Changed Files

- `agent_tasks.json`
- `progress/current.md`
- `progress/history.md`
- `progress/impl_btc_convex_cycle_trend.md`
- `docs/strategies/btc-convex-cycle-trend.md`
- `docs/operations/strategy-validation-thresholds.md`
- `docs/operations/strategy-readiness-matrix.md`
- `backend/hyperliquid_gateway/backtesting/registry.py`
- `backend/hyperliquid_gateway/strategies/btc_convex_cycle_trend/`
- `tests/test_btc_convex_cycle_trend.py`

## Artifacts

- Champion backtest:
  `backend/hyperliquid_gateway/data/backtests/btc_adaptive_cycle_trend-btc_usd_daily_yahoo-20260514T145140Z.json`
- New strategy backtest:
  `backend/hyperliquid_gateway/data/backtests/btc_convex_cycle_trend-btc_usd_daily_yahoo-20260514T145140Z.json`
- Validation:
  `backend/hyperliquid_gateway/data/validations/btc_convex_cycle_trend-20260514T145222Z.json`
- Paper candidate:
  `backend/hyperliquid_gateway/data/paper/btc_convex_cycle_trend-20260514T145241Z.json`
- Doubling stability:
  `backend/hyperliquid_gateway/data/audits/btc_convex_cycle_trend-doubling-stability-20260514T145241Z.json`

## Results

`btc_convex_cycle_trend` official 500 USD taker-fee backtest:

- Final equity: `1,078.89 USD`
- Net return: `115.78%`
- Excess return vs `btc_adaptive_cycle_trend`: `21.39` percentage points
- Trades: `48`
- Win rate: `41.67%`
- Profit factor: `2.39`
- Max drawdown: `13.63%`
- Fees paid: `5.92 USD`
- Robust gate: `passes`
- Validation: `ready-for-paper`
- Paper candidate: generated
- Doubling stability: `stable`

## Commands Run

```bash
rtk npm run agent:brief
rtk npm run agent:check
rtk npm run hf:doctor
rtk npm run graph:status
rtk npm run hf:status
rtk npm run hf:strategy:new -- --strategy-id btc_convex_cycle_trend --title "BTC Convex Cycle Trend"
rtk python3 -m py_compile backend/hyperliquid_gateway/strategies/btc_convex_cycle_trend/*.py backend/hyperliquid_gateway/backtesting/registry.py
rtk npm run hf:backtest -- --strategy btc_adaptive_cycle_trend --dataset backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json --fee-model taker --risk-fraction 0.20 --equity 500
rtk npm run hf:backtest -- --strategy btc_convex_cycle_trend --dataset backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json --fee-model taker --risk-fraction 0.25 --equity 500
rtk npm run hf:validate -- --strategy btc_convex_cycle_trend --report backend/hyperliquid_gateway/data/backtests/btc_convex_cycle_trend-btc_usd_daily_yahoo-20260514T145140Z.json
rtk npm run hf:paper -- --strategy btc_convex_cycle_trend --report backend/hyperliquid_gateway/data/backtests/btc_convex_cycle_trend-btc_usd_daily_yahoo-20260514T145140Z.json --validation backend/hyperliquid_gateway/data/validations/btc_convex_cycle_trend-20260514T145222Z.json
rtk npm run hf:doubling:stability -- --strategy btc_convex_cycle_trend --report backend/hyperliquid_gateway/data/backtests/btc_convex_cycle_trend-btc_usd_daily_yahoo-20260514T145140Z.json --validation backend/hyperliquid_gateway/data/validations/btc_convex_cycle_trend-20260514T145222Z.json
rtk python3 -m unittest tests.test_strategy_catalog tests.test_btc_convex_cycle_trend
```

## Risks And Blockers

- This is still a backtest/paper candidate, not a live strategy.
- It improves return by increasing partial exposure; drawdown is still inside
  gates, but paper review must confirm the larger sizing is acceptable.
- Paper runtime dry-run support was not wired into `app.py` for this smoke.
  The paper candidate exists and live remains blocked.
- The result uses BTC daily Yahoo history; it should be reviewed for regime
  overfit before live-gate discussion.

## Memory Action

intentionally unchanged. Strategy evidence is in backend artifacts and this
handoff; no curated memory update is needed yet.

## Next Best Step

Use the 03:30 improvement automation to add bounded dry-run paper runtime
support for `btc_convex_cycle_trend` or to create the first paper-review
checklist from the generated paper candidate.
