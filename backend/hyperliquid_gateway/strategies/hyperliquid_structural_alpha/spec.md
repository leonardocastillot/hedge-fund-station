# Hyperliquid Structural Alpha

## Signal Logic

5-factor composite score (-100 to +100):

| Factor | Weight | Edge |
|---|---|---|
| Funding Score | 28% | Retail crowding extremes |
| OI Divergence | 22% | Smart money vs retail positioning |
| Setup Confluence | 22% | Regime clarity vs confusion |
| Multi-TF Momentum | 18% | Trend strength/saturation |
| Crowding Bias | 10% | Contrarian flip signal |

### Entry
- |composite| >= 50
- >= 2 timeframes agree with direction (of 5m/15m/1h/4h)
- Minimum liquidity: $10M vol, $1M OI
- No duplicate symbol or cooldown

### Exit
1. Stop loss: 0.35-1.5% (conviction-scaled, vol-adjusted)
2. Take profit: 1.5-2.5x risk
3. OI confirmation: exit if OI drops > 2.5% from entry
4. Direction reversal: 15m moves against
5. No progress: 25 min with < 0.1% move
6. Time stop: 120 min max

## Risk
- Max 3 concurrent positions
- 15 min cooldown after loss
- Size: 0.8-2.5% per position (conviction + quality scaled)
- Position count penalty: -20% per additional position
- Execution quality modifier: +/-15% for good/bad fills
