# Funding Exhaustion Snap

## Name

Funding Exhaustion Snap - Mean reversion strategy exploiting funding rate extremes with momentum exhaustion

## Hypothesis

When funding rates reach extreme percentiles (>85th or <15th) AND price momentum shows signs of exhaustion or reversal, the crowded side often unwinds rapidly within 15 minutes to 4 hours, creating exploitable short-horizon mean-reversion opportunities.

**Source of Edge:**
1. **Behavioral**: Overleveraged positions at funding extremes create unstable equilibrium where trapped capital bleeds via funding payments
2. **Structural**: 8-hour funding cycles force position evaluation and unwinding decisions
3. **Cascading**: Initial unwinding triggers stop-losses and liquidations, accelerating the move
4. **Short-lived**: Edge decays quickly as market normalizes, perfect for sub-4hr holding periods
5. **Counter-narrative**: Most traders chase momentum; we exploit exhaustion

## Market Regime

**Works best in:**
- High volatility regimes with frequent funding extremes
- Trending markets that attract overleveraged participation
- High OI environments where unwinding creates meaningful pressure
- Liquid symbols (volume >$50M/24h) with tight spreads

**Avoid in:**
- Low volatility / range-bound chop with minimal funding variance
- Post-event disorder with unstable liquidity and gapping
- Symbols with thin orderbooks (<$100k top-3 bid/ask)
- During major news events (macro, protocol updates) with sustained directional pressure
- Market-wide cascade events (avoid catching falling knives)

**Regime Filters:**
- Funding must be in top 15% or bottom 15% of 7-day rolling distribution
- Volume 24h must be >$50M
- Open Interest must show stability or growth (not collapsing)
- Bid-ask spread must be <0.08% for execution quality

## Inputs

**Required Data:**
- Funding rate (current + 7-day history for percentile calculation)
- Price (current + 1hr, 4hr, 24hr change)
- Open Interest (current + delta over last hour)
- Volume 24h
- Crowding bias (shorts-at-risk / longs-at-risk / balanced)
- Liquidation pressure estimate (from existing pressure_metrics)
- Opportunity score (from existing scoring framework)
- Signal label (from existing build_signal logic)

**Derived Features:**
- Funding percentile (0-100, computed from 7-day rolling window)
- Price momentum score (weighted: 1hr = 50%, 4hr = 30%, 24hr = 20%)
- OI stability (OI delta over last hour must be >-5%)
- Momentum-funding divergence (price up + funding high = fade, price down + funding low = reversal)

## Entry

**Long Entry (Fade Longs / Buy Exhaustion):**
Must satisfy ALL conditions:
1. **Funding Extreme**: Funding percentile ≥85 (high positive funding = longs paying shorts)
2. **Crowding Confirmation**: `crowdingBias == "longs-at-risk"`
3. **Momentum Exhaustion**:
   - 1hr price change <0.8% (stalling) OR
   - 1hr price change negative (reversing)
4. **OI Stability**: OI delta last hour ≥-5% (no collapse)
5. **Liquidity Filter**: Volume 24h ≥$50M
6. **Setup Score**: `longFlush` score ≥65 OR `fade` score ≥70
7. **Decision Threshold**: `opportunityScore` ≥68

**Short Entry (Fade Shorts / Sell Exhaustion):**
Must satisfy ALL conditions:
1. **Funding Extreme**: Funding percentile ≤15 (high negative funding = shorts paying longs)
2. **Crowding Confirmation**: `crowdingBias == "shorts-at-risk"`
3. **Momentum Exhaustion**:
   - 1hr price change <0.8% (stalling) OR
   - 1hr price change positive (reversing)
4. **OI Stability**: OI delta last hour ≥-5%
5. **Liquidity Filter**: Volume 24h ≥$50M
6. **Setup Score**: `shortSqueeze` score ≥65 OR `fade` score ≥70
7. **Decision Threshold**: `opportunityScore` ≥68

**Entry Timing:**
- Wait for next 5-minute candle to confirm momentum stall/reversal
- Enter on break of 15-min high (shorts) or 15-min low (longs)
- Do NOT enter in first 2 minutes after funding payment (allow settlement)

## Invalidation

**Structural Invalidation (Exit Immediately):**
- Price moves against position by >1.2% (hard stop)
- Funding normalizes (percentile moves toward 40-60 range)
- OI starts collapsing (-8% drop from entry)
- Volume dries up mid-trade (<30% of entry volume)
- Spread widens beyond 0.15% (liquidity crisis)

**Time-Based Invalidation:**
- If no movement in first 45 minutes, exit at breakeven or small loss
- Maximum hold time: 4 hours (edge decays)
- Must exit before next funding cycle if not profitable

**Signal Invalidation:**
- Crowding bias flips (e.g., from "longs-at-risk" to "shorts-at-risk")
- Momentum re-accelerates in original trend direction
- Market-wide alert spike (>5 high-severity alerts in 10 minutes)

## Exit

**Profit Target:**
- Primary target: 1.2% - 2.5% depending on volatility regime
- Scale out at 0.8% (1/3 position), 1.5% (1/3), 2.2%+ (remainder)

**Trailing Stop:**
- Activate trailing stop after 1.2% profit
- Trail by 0.5% from high water mark

**Time Stop:**
- Exit at 4 hours regardless of P&L
- Exit at 3.5 hours if P&L between -0.3% and +0.5% (no conviction)

**Dynamic Exit:**
- Exit if funding percentile moves back toward 50th (normalization = edge gone)
- Exit if opposing setup scores rise (e.g., holding long but `breakoutContinuation` score jumps to >75)
- Exit if `opportunityScore` drops below 55 (regime shift)

## Risk

**Sizing:**
- Base size: 1.5% of portfolio per trade
- Reduce to 1.0% if execution quality score <60
- Reduce to 0.8% if this is 2nd+ correlated position
- Maximum 3 concurrent positions
- Maximum 2 positions in same direction (long or short)

**Position Limits:**
- No more than 2 trades per symbol per day (avoid overtrading)
- Max portfolio heat: 4.5% (sum of all position sizes)
- Max single-symbol allocation: 2.5%

**Session Kill-Switches:**
- Stop trading if 3 consecutive losses
- Stop trading if daily drawdown >2.5%
- Stop trading if slippage consistently >0.12% (execution deteriorating)
- Pause 2 hours after any loss >0.8%

**Correlation Risk:**
- Do NOT take correlated positions (e.g., BTC + ETH in same direction)
- Monitor aggregate exposure by sector (DeFi, L1, meme)

## Costs

**Fee Assumptions:**
- Maker: 0.0150% (Hyperliquid perps Tier 0)
- Taker: 0.0450% (Hyperliquid perps Tier 0)
- Default backtests are conservative taker/taker unless maker or mixed fees are explicitly configured
- Round-trip cost: ~0.088%

**Slippage Assumptions:**
- Entry slippage: 0.05% - 0.10% depending on execution quality score
- Exit slippage: 0.06% - 0.12% (worse on panic exits)
- Total slippage budget: 0.15% per round-trip

**Total Friction:**
- Fees: 0.088%
- Slippage: 0.15%
- **Total: 0.238% per round-trip**
- **Break-even target: 0.25%+**
- **Profit target: 1.2%+ to achieve 3:1 reward:cost ratio**

**Latency Assumptions:**
- Signal-to-order: <500ms (local execution)
- Order-to-fill: 1-3 seconds (market conditions dependent)
- Total execution lag: <5 seconds

## Validation

### Phase 1: Historical Replay (1 week)
**Objective**: Prove signal quality without execution
- Replay last 7 days of market_snapshots from database
- Identify all entry signals that met criteria
- Track theoretical P&L with perfect fills
- Measure signal frequency (expect 2-5 per day across all symbols)
- **Success Criteria**:
  - Win rate >52%
  - Avg winner >1.5%
  - Avg loser <0.8%
  - Profit factor >1.4

### Phase 2: Paper Trading (2 weeks)
**Objective**: Prove edge survives realistic execution
- Run paper executor in real-time
- Simulate taker orders with slippage model
- Track signal-to-fill delays
- Log all invalidations and exits
- **Success Criteria**:
  - Win rate >48%
  - Avg P&L >0.35% per trade after costs
  - Max drawdown <3.5%
  - Sharpe ratio >1.2 (annualized)

### Phase 3: By-Regime Analysis
**Objective**: Understand where strategy fails
- Segment results by:
  - Funding extremity (85th vs 90th vs 95th percentile)
  - Volatility regime (ATR percentile)
  - Time-of-day (funding cycle alignment)
  - Symbol liquidity tier
- **Success Criteria**:
  - Clear regime where strategy outperforms
  - Clear regime where strategy fails (avoid zones)
  - Edge persists across at least 3 liquid symbols

### Phase 4: Stress Testing
**Objective**: Survive adverse conditions
- Test during:
  - Market-wide cascade events
  - Low liquidity periods (weekends, holidays)
  - Extreme volatility spikes (>80th percentile ATR)
  - Funding normalization whipsaws
- **Success Criteria**:
  - Max single-trade loss stays <1.2%
  - Kill-switches activate appropriately
  - No position-sizing violations
  - Recovery within 24 hours of drawdown

## Failure Modes

**High-Probability Failure Scenarios:**

1. **False Exhaustion / "V-Bottom" Trap**
   - Risk: Momentum stalls briefly but resumes, stops us out
   - Mitigation: Require 15-min confirmation candle before entry
   - Detection: Monitor `breakoutContinuation` or `shortSqueeze` score spiking >75

2. **Funding Stays Extreme Longer**
   - Risk: Funding remains high/low for multiple cycles, slow bleed
   - Mitigation: 4-hour max hold time, exit on no progress
   - Detection: Funding percentile not normalizing toward 50

3. **Liquidity Crunch / Gapping**
   - Risk: Wide spreads cause excessive slippage and poor fills
   - Mitigation: Execution quality filter ≥55, monitor spread <0.08%
   - Detection: Real-time spread monitoring, abort if >0.15%

4. **Correlated Cascade**
   - Risk: Market-wide event causes all positions to move against us
   - Mitigation: Max 3 concurrent, max 2 same direction, correlation check
   - Detection: Market-wide alert spike, kill-switch triggers

5. **OI Collapse (Position Unwind Too Fast)**
   - Risk: OI drops -15%, trapped capital exits, no continuation
   - Mitigation: OI stability filter at entry, -8% invalidation
   - Detection: Monitor OI delta every 5 minutes

6. **Reversion Overshoot**
   - Risk: Mean reversion goes too far, turns into new trend
   - Mitigation: 2.5% max target, trailing stop after 1.2%
   - Detection: Opposing setup scores rising sharply

7. **Late Cycle Entry**
   - Risk: Enter near end of funding cycle, miss the unwind window
   - Mitigation: Avoid entries <30min before funding payment
   - Detection: Time-check before entry signal

## Backend Mapping

Implementation folder:
- `backend/hyperliquid_gateway/strategies/funding_exhaustion_snap/`

Required modules:
- `logic.py` - Entry signal evaluation with all filters
- `scoring.py` - Setup ranking across symbols
- `risk.py` - Invalidation checks and sizing calculation
- `paper.py` - Paper execution simulator with slippage model
- `spec.md` - This document (mirrored)

API Endpoints (to be added):
- `GET /api/strategies/funding-exhaustion-snap/signals` - Current active signals
- `GET /api/strategies/funding-exhaustion-snap/watchlist` - Ranked candidates
- `POST /api/strategies/funding-exhaustion-snap/paper/entry` - Log paper entry
- `GET /api/strategies/funding-exhaustion-snap/analytics` - Performance metrics

## Expected Performance

**Trade Frequency:**
- 2-5 signals per day across 8-12 liquid symbols
- 10-25 trades per week (strategy-wide)
- Hold time: 45min - 4hr (avg ~2hr)

**P&L Targets:**
- Win rate: 50-55% (mean reversion is hard)
- Avg winner: 1.5-2.2%
- Avg loser: 0.6-0.9%
- Profit factor: 1.5-2.0
- Daily return target: 0.8-1.5% (on deployed capital)
- Max drawdown: <4%

**Risk Profile:**
- Strategy Sharpe: 1.5-2.2 (if edge holds)
- Max portfolio heat: 4.5%
- Typical heat: 2-3% (1-2 positions active)

## Next Steps

1. ✅ Strategy specification complete (this document)
2. ⏳ Implement backend logic modules
3. ⏳ Add funding percentile calculator (7-day rolling window)
4. ⏳ Build paper executor with slippage model
5. ⏳ Replay validation on historical data
6. ⏳ 2-week paper trading trial
7. ⏳ By-regime analysis and refinement
8. ⏳ Add app visualization (watchlist + paper journal)
9. ⏳ Final review before considering live execution

---

**Document Version**: 1.0
**Created**: 2026-03-10
**Status**: Draft - Awaiting Backend Implementation
