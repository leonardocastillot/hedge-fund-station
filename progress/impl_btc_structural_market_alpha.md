# Implementation Report: btc_structural_market_alpha

## Strategy Thesis
Structural market alpha using four independent factors grounded in market mechanics:
1. **Volatility cycle**: Buy low vol (compression phase), avoid high vol (climax)
2. **Volume structure**: Favor quiet accumulation (low vol ratio), avoid volume climax
3. **Momentum quality**: Aligned multi-TF ROC + acceleration
4. **Market phase**: Buy drawdowns, buy near ATH, buy recovery

Composite scoring: dominant factor weighted by agreement bonus (no hardcoded weights).

## Files
- `logic.py` — signal evaluation, indicator context, entry/exit logic
- `scoring.py` — setup quality scoring
- `risk.py` — position sizing, risk plan
- `paper.py` — paper candidate builder
- `backtest.py` — full backtest adapter
- `__init__.py` — package marker

## Backtest Results
| Metric | Value |
|---|---|
| Return | 186.39% |
| Profit Factor | 7.49 |
| Win Rate | 44.83% |
| Max Drawdown | 13.43% |
| Total Trades | 29 |
| Avg Net Trade Return | 29.59% |
| Largest Trade Share | 63.66% |
| Robust Gate | ✅ passes |

## Doubling Stability (3 slices)
| Slice | Trades | Return | PF | Status |
|---|---|---|---|---|
| 1 (2014-2018) | 11 | 52.12% | 12.76 | positive |
| 2 (2018-2022) | 7 | 115.77% | 16.20 | positive |
| 3 (2022-2026) | 11 | 18.50% | 2.11 | positive |

100% positive slices. Status: `fragile` (return_concentration 62.11%).

Paper candidate: `candidate` (when validated).
Doubling estimate: `candidate` ~2803 days to double (~7.7 years).

## Commands
```bash
rtk python3.11 -c "from backend.hyperliquid_gateway.backtesting.registry import run_registered_backtest; from backend.hyperliquid_gateway.backtesting.engine import BacktestConfig; from pathlib import Path; r = run_registered_backtest('btc_structural_market_alpha', Path('backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json'), BacktestConfig(initial_equity=500.0, fee_model='taker')); print(r['summary']['return_pct'], r['summary']['profit_factor'])"
```

## Risks
- Return concentration in middle slice (2017/2021 bull runs)
- Recent 2025 trades are all losses (range-bound market)
- Only long-biased; no short side
- Volatility cycle factor may underperform in persistently high-vol regimes

## Next Actions
1. Run `hf:validate --strategy-id btc_structural_market_alpha`
2. Generate paper candidate evidence if validation passes
3. Monitor 2025-2026 performance; consider regime filters for range-bound markets
