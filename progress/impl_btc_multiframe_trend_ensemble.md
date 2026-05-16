# Implementation Report: btc_multiframe_trend_ensemble

## Strategy: BTC Multi-Timeframe Trend Ensemble

**Concept**: 4 independent MA pairs vote on trend quality. Entry via ensemble consensus with pullback/momentum confirmation. Exit via smooth vol-scaled ATR trail, structure breakdown, or time stop.

## Changed Files

| File | Action |
|---|---|
| `backend/.../strategies/btc_multiframe_trend_ensemble/__init__.py` | Created |
| `backend/.../strategies/btc_multiframe_trend_ensemble/logic.py` | Created |
| `backend/.../strategies/btc_multiframe_trend_ensemble/scoring.py` | Created |
| `backend/.../strategies/btc_multiframe_trend_ensemble/risk.py` | Created |
| `backend/.../strategies/btc_multiframe_trend_ensemble/backtest.py` | Created |
| `backend/.../strategies/btc_multiframe_trend_ensemble/paper.py` | Created |
| `backend/.../strategies/btc_multiframe_trend_ensemble/spec.md` | Created |
| `backend/.../backtesting/registry.py` | Edited (added imports + StrategyDefinition) |
| `docs/strategies/btc-multiframe-trend-ensemble.md` | Created |

## Commands Run

```bash
rtk npm run hf:backtest -- --strategy btc_multiframe_trend_ensemble --equity 500 --fee-model taker
rtk npm run hf:validate -- --strategy btc_multiframe_trend_ensemble
rtk npm run hf:paper -- --strategy btc_multiframe_trend_ensemble
rtk npm run hf:doubling:stability -- --strategy btc_multiframe_trend_ensemble
```

## Results

| Metric | Value |
|---|---|
| Return (500 USD taker) | **229.64%** |
| Profit Factor | **5.85** |
| Max Drawdown | **19.8%** |
| Win Rate | 43.59% |
| Total Trades | 39 |
| Largest Trade Share | 26.38% |
| Doubling Stability | **STABLE** (100% positive slices) |
| Validation Status | **ready-for-paper** |
| Paper Candidate | **eligible-for-paper-review** |

## Anti-Overfitting Design

- **Ensemble voting**: No single MA pair dominates. 4 pairs (20/50, 50/100, 100/200, close/200) vote independently.
- **Smooth parameters**: No step functions. Trail multiplier, risk%, and exposure are continuous functions of ATR percentile and trend score.
- **Structure exit via consensus**: Exit when ALL trend signals collapse (score = 0) plus close < MA50, not arbitrary price levels.
- **Doubling stability**: 100% positive in every 3.9-year slice. No period-dependent performance.

## Risks

- Dominant exit reason (ATR trailing) accounts for 83.89% of PnL — concentration risk if that exit mechanism fails.
- Still trails champion (263.78%) by 34%. Not a replacement, but a genuinely different approach.
- No intraday data tested — daily only.

## Next

- Review paper candidate for paper execution
- Consider regime review across different market conditions
- Could combine with champion for ensemble-of-ensembles

## Handoff

Strategy lives at `backend/hyperliquid_gateway/strategies/btc_multiframe_trend_ensemble/`.
Paper at `backend/hyperliquid_gateway/data/paper/btc_multiframe_trend_ensemble-20260516T030036Z.json`.
