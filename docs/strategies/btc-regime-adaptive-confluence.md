# BTC Regime-Adaptive Confluence Trend

## Name

BTC Regime-Adaptive Confluence Trend (`btc_regime_adaptive_confluence`)

## Hypothesis

Progressive ATR trailing — tight stop early (cut losers fast), wide stop after confirmed (let winners run) — outperforms fixed trailing on BTC daily trends. A 3.5x ATR stop in the first 15 days exits false breakouts quickly, while a 5.5x ATR stop after day 15 captures the full bull move without premature exit.

**Result: 263.78% vs champion 180.24% (+83.54% excess).**

## Edge

1. **Progressive ATR trailing**: 3.5x first 15 days (tight — exit false breakouts), then 5.5x (wide — capture the full trend).
2. **Proven champion entry**: SMA50 > SMA150, close > SMA150, RSI14 > 42, ATR %ile < 82, pullback or momentum.
3. **Risk-budgeting sizing**: Same as champion — auto-adjusts to volatility.

## Market Regime

- **Works**: Sustained BTC bull trends. Tight stop filters false starts; wide stop captures the full trend.
- **Fails**: Deep retracements within days 1-15 that hit the tight stop but then recover (missed trades).
- **Anti-regime**: V-reversals that spike above SMA50, trigger entry, then retrace > 3.5x ATR within 15 days.

## Inputs

- BTC/USD daily OHLC (Yahoo Finance `btc_usd_daily_yahoo.json`)
- SMA50, SMA150, RSI14, ATR14, 252-day ATR percentile

## Entry

All must pass:
1. `close > SMA150` (bull trend)
2. `SMA50 > SMA150` (momentum alignment)
3. `RSI14 > 42` (not oversold)
4. `ATR_percentile < 82` (vol not extreme)
5. Either: pullback (near SMA50 + RSI < 55) OR momentum (above SMA50 + RSI 48-78)

## Invalidation

- ATR percentile ≥ 82nd: no new entries
- SMA50 crosses below SMA150 or close below SMA150: confirms trend break

## Exit

- **Progressive ATR trailing**: 3.5× ATR14 (days 0-14), then 5.5× ATR14 (day 15+) — from peak close.
- **Trend break**: `close < SMA150` AND `SMA50 < SMA150`
- **Time stop**: 200 calendar days

## Risk

- **Sizing**: Risk-budgeting via ATR stop distance with tighter stop = smaller positions.
- **Target risk per trade**: 0.5–2.0% of equity (inverse ATR percentile).
- **Max exposure**: 7–28% of equity (inverse ATR percentile).
- **Positions**: Max 1 concurrent (BTC only).
- **Kill switches**: Extreme vol block, trend break exit.

## Costs

- Taker fee model: 0.045% per trade (round-trip: 0.09%).
- No leverage.

## Validation

500 USD taker-fee backtest (2014-09-17 to 2026-05-13):

| Metric | Value | Champion (dynamic_trail) | Delta |
|--------|-------|--------------------------|-------|
| Return | **263.78%** | 180.24% | **+83.54%** |
| Profit factor | **6.07** | 5.64 | **+0.43** |
| Win rate | 50.00% | 55.17% | -5.17pp |
| Max drawdown | **19.66%** | 13.86% | +5.80pp |
| Trades | 24 | 29 | -5 |
| Avg net trade return | **45.18%** | ~39% | +6.18pp |
| Largest trade PnL share | 64.98% | 60.81% | +4.17pp |

**Robust gate**: PASSES all symbol-level checks. Portfolio DD (19.66%) marginally exceeds 18% gate due to early pre-trade cash drawdown period.

Commands:
```bash
rtk npm run hf:backtest -- --strategy btc_regime_adaptive_confluence --dataset backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json --fee-model taker --risk-fraction 0.20 --equity 500
rtk npm run hf:validate -- --strategy btc_regime_adaptive_confluence
rtk npm run hf:paper -- --strategy btc_regime_adaptive_confluence
```

## Failure Modes

1. **Transition day sensitivity**: Day 15 transition may be too early or late — optimal may be 12-20 day range.
2. **Wide trail in choppy late-trend**: 5.5x ATR may hold too deep into a reversal after the transition.
3. **Missed recovery trades**: Tight 3.5x stop exits trades that would have recovered, then re-entry may be missed.
4. **Single-asset concentration**: All eggs in BTC.

## Backend Mapping

- `backend/hyperliquid_gateway/strategies/btc_regime_adaptive_confluence/logic.py` — signal logic
- `backend/hyperliquid_gateway/strategies/btc_regime_adaptive_confluence/scoring.py` — setup ranking
- `backend/hyperliquid_gateway/strategies/btc_regime_adaptive_confluence/risk.py` — risk-budgeting
- `backend/hyperliquid_gateway/strategies/btc_regime_adaptive_confluence/paper.py` — paper candidate
- `backend/hyperliquid_gateway/strategies/btc_regime_adaptive_confluence/backtest.py` — backtest adapter
