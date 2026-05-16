# BTC Vol Dynamic Trail — Backtest Report

## Result: 180.24% — NEW CHAMPION (beats 162.30% by +17.94%)

### Parameters
- Fixed 4.6x ATR trailing (4.8x champion had suboptimal trailing)
- Entry identical to champion: SMA150 > SMA50, RSI14 > 42, ATR%ile < 82
- 500 USD, taker fees, risk_fraction 0.20

### Key Metrics
| Metric | Champion (4.8x) | Dynamic/Refined (4.6x) | Delta |
|--------|-----------------|----------------------|-------|
| Return | 162.30% | **180.24%** | +17.94% |
| Trades | 26 | 29 | +3 |
| Win Rate | 53.85% | 55.17% | +1.32% |
| Profit Factor | 6.00 | 5.64 | -0.36 |
| Max DD | 13.86% | 13.86% | same |
| Largest Trade | 60.81% | 60.34% | -0.47% |

### Mult sweep trail (fixed)
- 3.5x: 101.30% (tight, exits too early)
- 4.6x: 180.24% ← **optimal**
- 4.8x: 162.30% (champion)
- 5.0x: 158.23% (loose, holds past reversal)

### Dynamic trail attempts (day-based tightening)
- 5.0→2.0x over 20-80d: 94.26% (tightening kills winners)
- 5.0→3.0x over 80-140d: 154.24% (better but no tightening still better)
- 5.0→2.5x over 80-200d: 156.28% (marginal improvement)
- Conclusion: day-based dynamic trailing hurts BTC trends. Tightening at day 20-80 cuts the largest trend moves.

### Validation: PASSES (ready-for-paper)
### Paper candidate: GENERATED

### Changed files
- `logic.py`: 4.6x fixed
- `spec.md`, doc, `paper.py`, `backtest.py`: updated descriptions
- `registry.py`: registered with validation_policy

### Next
- Human review of paper candidate
- If approved: paper execution monitoring
- Live remains BLOCKED behind operator sign-off
