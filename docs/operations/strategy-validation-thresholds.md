# Strategy Validation Thresholds

This document mirrors the backend `ValidationPolicy` registry so agents can see
the current validation gates without opening Python first. The backend registry
remains the executable source of truth.

Passing these gates only permits paper review. It never permits live trading or
production routing.

## Registered Strategy Thresholds

| Strategy | Min Trades | Min Return | Min Profit Factor | Min Win Rate | Max Drawdown | Dataset Contract | Stage Meaning |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `bb_squeeze_adx` | 3 | 0.50% | 1.05 | 30.00% | 20.00% | OHLCV CSV | donor-compatible smoke/paper example |
| `breakout_oi_confirmation` | 20 | 0.15% | 1.15 | 40.00% | 6.00% | gateway snapshot DB | research/backtest candidate |
| `btc_adaptive_cycle_trend` | 10 | 90.00% | 2.00 | 40.00% | 20.00% | BTC USD daily history | daily trend paper candidate |
| `btc_convex_cycle_trend` | 10 | 95.00% | 2.00 | 40.00% | 20.00% | BTC USD daily history | daily trend paper candidate |
| `btc_crowding_scalper` | 60 | 0.00% | 1.30 | 40.00% | 3.50% | gateway snapshot DB | scalper validation candidate |
| `btc_guarded_cycle_trend` | 10 | 50.00% | 2.00 | 40.00% | 25.00% | BTC USD daily history | daily trend paper candidate |
| `btc_fee_aware_failed_impulse_scalp` | 60 | 0.00% | 1.30 | 40.00% | 3.50% | gateway snapshot DB | fee-aware scalper validation candidate |
| `btc_failed_impulse_balanced_fast` | 8 | 0.25% | 1.50 | 50.00% | 4.00% | gateway snapshot DB | validation candidate |
| `btc_failed_impulse_reversal` | 8 | 0.50% | 1.50 | 55.00% | 4.00% | gateway snapshot DB | paper candidate only after validation |
| `funding_exhaustion_snap` | 8 | 0.25% | 1.10 | 35.00% | 8.00% | gateway snapshot DB | validation candidate |
| `long_flush_continuation` | 5 | 0.10% | 1.02 | 35.00% | 8.00% | gateway snapshot DB | research/backtest candidate |
| `liquidation_pressure_flip_reversal` | 15 | 0.10% | 1.20 | 42.00% | 5.50% | gateway snapshot DB | research/backtest candidate |
| `oi_expansion_failure_fade` | 30 | 0.10% | 1.20 | 42.00% | 5.00% | gateway snapshot DB | validation candidate |
| `one_bitcoin` | 1 | -100.00% | 0.00 | 0.00% | 1000.00% | BTC USD daily fixture | accumulation research only |
| `polymarket_btc_5m_maker_basis_skew` | 2 | 0.10% | 1.05 | 50.00% | 4.00% | Polymarket snapshot DB | maker replay candidate |
| `polymarket_btc_updown_5m_oracle_lag` | 3 | 0.10% | 1.05 | 45.00% | 6.00% | Polymarket snapshot DB | sparse paper/research candidate |
| `short_squeeze_continuation` | 5 | 0.10% | 1.02 | 35.00% | 8.00% | gateway snapshot DB | research/backtest candidate |

## Research-Only Or Docs-Only Items

- `one_bitcoin` deliberately blocks paper/live execution even when a backtest is
  profitable. It is a BTC accumulation research and goal-tracking tool.
- `polymarket_btc_updown_5m` is a research note, not a backend strategy package
  and not registered for backtest.
- Runtime rows with IDs like `runtime:<symbol>::<setup>` are live gateway
  observations. They are evidence rows, not standalone strategy packages.

## Update Rule

When changing a threshold, update both:

1. `backend/hyperliquid_gateway/backtesting/registry.py`
2. this document and `docs/operations/strategy-readiness-matrix.md`

Then run:

```bash
npm run agent:check
python3 -m unittest tests.test_strategy_catalog
npm run hf:status
```
