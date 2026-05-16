# BTC Vol ATR Trend

## Name

BTC Volatility-Regime ATR Trend (`btc_vol_atr_trend`)

## Hypothesis

BTC daily trends persist longer than expected in low-volatility regimes and can be captured with ATR-based trailing stops that dynamically adjust to market conditions. Risk-budgeting position sizing (size = target risk / ATR-stop distance) naturally contracts exposure when volatility is high and expands when volatility is low, providing adaptive risk management without parameter switching.

## Edge

1. **Volatility-regime awareness**: Entries are blocked above the 82nd ATR percentile, avoiding choppy high-vol environments where trend-following underperforms.
2. **ATR-based trailing stops**: 4.8× ATR from trade peak — dynamically adjusts to vol; wider in high vol, tighter in low vol.
3. **Risk-budgeting sizing**: Position size = `equity × target_risk_pct / atr_stop_distance_pct`. Target risk (0.5–2.0%) adjusts inversely with ATR percentile, so high vol → smaller risk per trade → smaller positions automatically.
4. **SMA200 trend filter**: Stronger bull/bear separation than SMA150 used by existing cycle trend family.

## Market Regime

- **Works**: Sustained BTC bull trends with normal-to-low volatility — ATR trailing captures majority of the move.
- **Fails**: Sudden crash reversals, extreme vol spike entries (filtered above 82nd ATR percentile), long sideways chop.
- **Anti-regime**: Sharp V-reversals that trigger ATR stop then immediately recover.

## Inputs

- BTC/USD daily OHLC (Yahoo Finance `btc_usd_daily_yahoo.json`)
- SMA50, SMA200, RSI14, ATR14, 252-day ATR percentile

## Entry

All must pass:
1. `close > SMA200` (bull trend)
2. `SMA50 > SMA200` (momentum alignment)
3. `RSI14 > 42` (not oversold)
4. `ATR_percentile < 82` (vol not extreme)
5. Either: `close within 1% below or above SMA50 + RSI < 55` (pullback entry) OR `close > SMA50 + RSI 48–78` (momentum entry)

## Invalidation

- ATR percentile ≥ 82nd: no new entries
- SMA50 crosses below SMA200 or close below SMA200: confirms trend break

## Exit

- **ATR trailing stop**: `4.8 × ATR14` from highest close since entry. Dynamic — wider when vol spikes, tighter when vol drops.
- **Trend break**: `close < SMA200` AND `SMA50 < SMA200`
- **Time stop**: 200 calendar days

## Risk

- **Sizing method**: Risk-budgeting via ATR stop distance.
- **Target risk per trade**: 0.5–2.0% of equity (varies inversely with ATR percentile).
- **Max exposure**: 7–28% of equity (varies inversely with ATR percentile).
- **Positions**: Max 1 concurrent (BTC only).
- **Kill switches**: Extreme vol block, trend break exit.

## Costs

- Taker fee model: 0.045% per trade (round-trip: 0.09%).
- No leverage.
- Total fees paid in backtest (500 USD taker, 26 trades): $2.77.

## Validation

| Metric | Value | Champion | Delta |
|--------|-------|----------|-------|
| Return (500 USD taker) | **162.30%** | 115.78% | **+46.52%** |
| Profit factor | **6.00** | 2.93 | **2.05×** |
| Win rate | 53.85% | ~50% | +3.85pp |
| Max drawdown | **13.86%** | 8.79% | +5.07pp |
| Trades | 26 | 48 | -22 |
| Avg net trade return | **45.54%** | 2.41% | **18.9×** |
| Largest trade PnL share | 60.81% | — | — |

**Robust gate**: PASSES (8 min trades ✓, 115.78% min return ✓, 2.0 min profit factor ✓, 18% max drawdown ✓, 2% avg trade return ✓, 65% max concentration ✓)

**Validation status**: `ready-for-paper`

## Failure Modes

1. **Concentrated returns**: 60.81% of PnL from one trade. Trend following inherently concentrated — need sufficient trades to validate statistical edge.
2. **Higher drawdown than SMA150 variants**: SMA200 is more restrictive, entering later and potentially closer to trend exhaustion.
3. **ATR lag in sudden vol expansion**: ATR is a lagging indicator; a sudden vol spike may not be caught in time, leading to wider-than-expected stops.

## Backend Mapping

- `backend/hyperliquid_gateway/strategies/btc_vol_atr_trend/logic.py` — signal logic
- `backend/hyperliquid_gateway/strategies/btc_vol_atr_trend/scoring.py` — setup ranking
- `backend/hyperliquid_gateway/strategies/btc_vol_atr_trend/risk.py` — ATR risk-budgeting
- `backend/hyperliquid_gateway/strategies/btc_vol_atr_trend/paper.py` — paper candidate
- `backend/hyperliquid_gateway/strategies/btc_vol_atr_trend/backtest.py` — backtest adapter
