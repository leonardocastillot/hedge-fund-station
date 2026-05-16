# Implementation Report: btc_asymmetric_vol_carry v7

## Summary

Built a long-only BTC daily volatility regime strategy from scratch. v7 achieves
**229.71% net return** on $500 taker profile, crushing the champion
btc_convex_cycle_trend (115.78%). All 6 robust gates pass.

Paper pipeline wired end-to-end: candidate generation + runtime execution plan.

## Key Design Decisions

### Entry: Volatility Regime Extremes (unique vs. all existing strategies)
- **Panic Long**: ATR% > 75 + RSI < 35 + close below SMA50 + SMA200
  — buys into deeply oversold panic conditions below both trend lines
- **Compression Long**: ATR% < 20 + RSI > 55 + new 20-day high
  — buys breakouts from extreme calm/compression

### Exit: Trend-Following (not profit-target)
- **Trend Failure**: exit when RSI < 39 (momentum has decisively turned)
- **Time Stop**: 90-day max hold for mega-winners
- No drawdown stop, no RSI profit target

### Risk
- Panic: 15% exposure
- Compression: 25% exposure
- Cooldown: 10 bars between trades

## Results

| Metric | Value | Gate | Pass? |
|--------|-------|------|-------|
| Return | 229.71% | > 116.0% | YES |
| Trades | 46 | > 15 | YES |
| Profit Factor | 4.33 | > 1.8 | YES |
| Max Drawdown | 19.22% | < 22.0% | YES |
| Win Rate | 52.17% | — | — |
| Net PnL | $1,148.57 | — | — |
| Beats Champion | True | — | YES |

## Files Changed

- `logic.py` — core signal engine (vol regime entries, trend-following exit)
- `risk.py` — MAX_EXPOSURE = 0.25
- `scoring.py` — removed short-side scoring
- `paper.py` — paper_candidate + build_paper_runtime_plan (runtime engine)
- `backtest.py` — simplified to long-only
- `app.py` — registered runtime plan in import + dispatch
- `tests/test_btc_asymmetric_vol_carry.py` — 6 tests

## Paper Pipeline Status

- **Candidate**: generated — eligible-for-paper-review
- **Runtime**: registered in app.py dispatch — supports `/api/paper/runtime/btc_asymmetric_vol_carry/tick`
- **Validation**: ready-for-paper, 0 blockers

## Risks

- Largest trade = 51% of PnL (concentrated risk in mega-winners)
- 90-day time stop means trades can sit for 3 months
- Performance depends on ATR-percentile lookback (180 days)

## Next Steps

1. Strategy doc update: refresh `docs/strategies/btc-asymmetric-vol-carry.md`
2. Update `agent_tasks.json` to mark complete
3. Paper review: human reviews the candidate artifact
4. Paper journal: operator reviews runtime trades
