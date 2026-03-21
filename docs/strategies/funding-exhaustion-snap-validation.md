# Funding Exhaustion Snap - Validation Plan

## Overview

This document outlines the complete validation workflow for the Funding Exhaustion Snap strategy before any live execution consideration.

**Validation Philosophy:**
- Prove edge exists with historical replay
- Prove edge survives realistic execution costs via paper trading
- Understand failure modes and regime dependencies
- Stress test against adverse conditions
- Build operator confidence through transparency

## Validation Phases

### Phase 1: Historical Replay (Week 1)

**Objective**: Prove signal quality and theoretical edge

#### Setup
1. Extract 7 days of historical market_snapshots from database
2. For each symbol, calculate funding percentiles using rolling 7-day window
3. Enrich snapshots with 1hr, 4hr change data (from price history)
4. Run strategy logic.evaluate_signal() on each snapshot
5. Log all entry signals that meet criteria

#### Metrics to Collect
- **Signal Frequency**: How many signals per day (expect 2-5)
- **Signal Distribution**: By symbol, by time-of-day, by funding extremity
- **Theoretical P&L**: Assuming perfect fills at mark price
  - Entry at signal price
  - Exit based on invalidation rules or profit targets
  - Track hold time distribution
- **Win Rate**: % of trades that would have been profitable
- **Avg Winner / Loser**: Size of wins vs losses
- **Profit Factor**: (Sum of winners) / (Sum of losers)
- **Max Drawdown**: Worst peak-to-trough equity drop

#### Success Criteria (Phase 1)
- ✅ Signal frequency: 2-5 per day across all symbols
- ✅ Win rate: >52% (without execution costs)
- ✅ Avg winner: >1.5%
- ✅ Avg loser: <0.8%
- ✅ Profit factor: >1.4
- ✅ Max drawdown: <5%

#### Deliverables
- `replay_results.json` - All signals and theoretical outcomes
- `replay_analysis.md` - Summary with charts and key insights
- Decision: Proceed to Phase 2 or refine entry rules

---

### Phase 2: Paper Trading (Weeks 2-3)

**Objective**: Prove edge survives realistic execution

#### Setup
1. Deploy paper executor in real-time backend
2. Monitor all liquid symbols (volume >$50M)
3. Calculate funding percentiles from rolling 7-day DB history
4. Run strategy evaluation every 30 seconds
5. Simulate entries when signals trigger
6. Apply realistic slippage model (from paper.py)
7. Apply taker fees (0.055% per side)
8. Track signal-to-fill delays
9. Monitor invalidations and exits in real-time

#### Execution Model
**Entry**:
- Taker order (0.055% fee)
- Slippage: 0.05-0.10% (based on exec quality score)
- Latency: 1-3 seconds
- Size: Paper position (no real capital)

**Exit**:
- Taker order (0.055% fee)
- Slippage: 0.06-0.12% (worse on stops, panic)
- Latency: 1-3 seconds
- Check invalidations every 60 seconds

**Cost Budget Per Trade**:
- Fees: 0.11% (round-trip)
- Slippage: ~0.15-0.20% (round-trip)
- **Total friction: 0.26-0.31%**

#### Metrics to Collect
- **Trade Frequency**: Actual signals generated
- **Fill Rate**: % of signals that would have filled
- **Avg Slippage**: Entry + exit slippage
- **Hold Time Distribution**: Minutes held per trade
- **P&L After Costs**:
  - Net P&L per trade (after fees + slippage)
  - Win rate (net)
  - Avg net winner / loser
  - Profit factor (net)
  - Sharpe ratio (annualized)
  - Max drawdown
- **Invalidation Breakdown**: Which invalidations triggered most often
- **By-Symbol Performance**: Best/worst symbols
- **Time-of-Day Performance**: Best/worst times

#### Success Criteria (Phase 2)
- ✅ Win rate: >48% (after costs)
- ✅ Avg net P&L: >0.35% per trade
- ✅ Profit factor: >1.3 (net)
- ✅ Sharpe ratio: >1.2 (annualized)
- ✅ Max drawdown: <3.5%
- ✅ No kill-switch violations (session limits respected)
- ✅ Execution quality stable (slippage <0.12% on 80%+ of trades)

#### Deliverables
- `paper_trades.json` - All paper trades with full details
- `paper_analytics.json` - Performance metrics
- `paper_journal.md` - Human-readable trade log
- Decision: Proceed to Phase 3 or refine risk rules

---

### Phase 3: By-Regime Analysis (Week 4)

**Objective**: Understand where strategy works and fails

#### Segmentation Axes

1. **Funding Extremity**
   - 85-89th percentile vs 90-94th vs 95th+
   - 11-15th percentile vs 6-10th vs <5th
   - Does edge increase with more extreme funding?

2. **Volatility Regime**
   - Low volatility (ATR <50th percentile)
   - Medium volatility (ATR 50-80th)
   - High volatility (ATR >80th)
   - Does strategy perform better in high vol?

3. **Liquidity Tier**
   - Tier 1: Volume >$200M
   - Tier 2: Volume $100-200M
   - Tier 3: Volume $50-100M
   - Does edge hold in lower liquidity?

4. **Time-of-Day**
   - Funding cycle alignment (before/after payment)
   - US hours vs Asia hours vs Europe hours
   - Weekend vs weekday
   - Are certain times more profitable?

5. **Market Regime**
   - Trending up (BTC >+2% 7-day)
   - Trending down (BTC <-2% 7-day)
   - Range-bound (BTC ±2% 7-day)
   - Does strategy work in all market regimes?

#### Metrics Per Segment
- Trade count
- Win rate
- Avg P&L
- Sharpe ratio
- Max drawdown
- Best/worst trades

#### Success Criteria (Phase 3)
- ✅ Identify at least 1 regime with Sharpe >1.5
- ✅ Identify at least 1 regime to avoid (negative edge)
- ✅ Edge persists across at least 3 liquid symbols
- ✅ No single symbol contributes >50% of profits (diversification)
- ✅ Funding extremity correlation: More extreme = better edge

#### Deliverables
- `regime_analysis.json` - Performance by segment
- `regime_heatmap.png` - Visual performance matrix
- `regime_report.md` - Narrative insights
- `regime_filters.json` - Recommended filters to add

---

### Phase 4: Stress Testing (Week 4)

**Objective**: Survive adverse conditions

#### Stress Scenarios

**Scenario 1: Market-Wide Cascade**
- Simulate during historical cascade events (e.g., FTX collapse, Luna crash)
- Check:
  - Did stop losses activate?
  - Did kill-switches prevent overtrading?
  - Max single-trade loss within 1.2% limit?
  - Recovery time after drawdown?

**Scenario 2: Low Liquidity Periods**
- Focus on weekends, holidays
- Check:
  - Execution quality degradation
  - Slippage exceeding assumptions
  - Volume dried up invalidations working?

**Scenario 3: Extreme Volatility Spikes**
- Focus on >80th percentile ATR days
- Check:
  - Did momentum invalidation work?
  - Stops hit too often?
  - P&L distribution (more variance?)

**Scenario 4: Funding Normalization Whipsaws**
- Identify periods where funding oscillated rapidly
- Check:
  - False signals (funding extreme but quickly normalized)
  - Premature exits?
  - Hold time too short?

**Scenario 5: Correlation Risk**
- Simultaneous BTC + ETH positions
- Check:
  - Would position limits prevent?
  - Aggregate drawdown controlled?
  - Correlation rules working?

#### Success Criteria (Phase 4)
- ✅ No single-trade loss >1.2%
- ✅ Kill-switches activate appropriately (no overrides)
- ✅ Position sizing never violates limits
- ✅ Recovery within 24 hours of max drawdown
- ✅ Strategy survives all 5 scenarios without catastrophic loss

#### Deliverables
- `stress_test_results.json` - Outcomes per scenario
- `stress_test_report.md` - Failure analysis
- `risk_rules_assessment.md` - Are risk rules sufficient?

---

## Validation Workflow (Gantt Chart)

```
Week 1:  [Phase 1: Historical Replay]
Week 2:  [Phase 2: Paper Trading - Part 1]
Week 3:  [Phase 2: Paper Trading - Part 2]
Week 4:  [Phase 3: By-Regime Analysis] + [Phase 4: Stress Testing]
Week 5:  [Final Review + Decision]
```

---

## Required Infrastructure

### Database Enhancements
1. **Funding History Table** (if not exists):
   ```sql
   CREATE TABLE funding_history (
       symbol TEXT,
       timestamp_ms INTEGER,
       funding_rate REAL,
       PRIMARY KEY (symbol, timestamp_ms)
   );
   ```

2. **Paper Replay Results Table**:
   ```sql
   CREATE TABLE replay_results (
       id INTEGER PRIMARY KEY,
       symbol TEXT,
       signal_time_ms INTEGER,
       direction TEXT,
       entry_price REAL,
       exit_price REAL,
       hold_time_minutes INTEGER,
       pnl_pct REAL,
       invalidation_reason TEXT,
       metadata_json TEXT
   );
   ```

### Scripts to Build

1. **`replay_runner.py`**
   - Loads market_snapshots from DB
   - Calculates funding percentiles
   - Runs strategy evaluation
   - Simulates entries/exits
   - Outputs `replay_results.json`

2. **`paper_executor.py`**
   - Real-time monitoring loop
   - Calls strategy every 30s
   - Simulates entries with slippage
   - Tracks open positions
   - Checks invalidations every 60s
   - Logs to `paper_trades` DB table

3. **`regime_analyzer.py`**
   - Loads paper trade results
   - Segments by regime axes
   - Calculates metrics per segment
   - Generates heatmaps and reports

4. **`stress_tester.py`**
   - Loads historical crisis periods
   - Re-runs strategy with crisis data
   - Validates risk rules
   - Reports failure modes

---

## Success Gates

**Gate 1: Phase 1 Complete**
- ❓ Signal frequency acceptable?
- ❓ Win rate >52% (theoretical)?
- ❓ Profit factor >1.4?
- **Decision**: ✅ Proceed to Phase 2 | ❌ Refine entry logic

**Gate 2: Phase 2 Complete**
- ❓ Win rate >48% (net)?
- ❓ Sharpe >1.2?
- ❓ Avg P&L >0.35% per trade?
- **Decision**: ✅ Proceed to Phase 3 | ❌ Refine risk/exit logic

**Gate 3: Phase 3 Complete**
- ❓ Regime edge identified?
- ❓ Avoid zones identified?
- ❓ Edge persists across multiple symbols?
- **Decision**: ✅ Proceed to Phase 4 | ❌ Add regime filters

**Gate 4: Phase 4 Complete**
- ❓ Stress tests passed?
- ❓ Risk rules sufficient?
- ❓ No catastrophic failures?
- **Decision**: ✅ Proceed to Final Review | ❌ Strengthen risk management

**Final Gate: Ready for Live Consideration?**
- ❓ All 4 phases passed?
- ❓ Operator confidence high?
- ❓ Documentation complete?
- ❓ Visualization ready?
- **Decision**: ✅ Consider micro-live test (0.1% capital) | ❌ Continue paper trading

---

## Cost Model Validation

**Assumed Costs** (from strategy spec):
- Maker: 0.02%
- Taker: 0.055%
- Avg per side: 0.044% (70% taker, 30% maker)
- Round-trip fee: 0.088%
- Entry slippage: 0.05-0.10%
- Exit slippage: 0.06-0.12%
- Total friction: ~0.24-0.31%

**Reality Check** (via paper trading):
- Measure actual slippage from simulation
- Compare to assumptions
- Adjust if slippage consistently higher

**Profitability Threshold**:
- Break-even: >0.25% per trade
- Target: >0.8% (3:1 reward:cost)
- Stretch: >1.5% (5:1 reward:cost)

---

## Expected Timeline

- **Week 1**: Historical replay + analysis
- **Week 2-3**: Live paper trading (2 weeks minimum)
- **Week 4**: Regime analysis + stress testing
- **Week 5**: Final review, documentation, decision

**Total: 5 weeks before considering any live execution**

---

## Operator Review Protocol

After each phase, the operator (trader) must review:
1. **Quantitative Metrics**: All success criteria met?
2. **Qualitative Review**: Do trades make sense? Any red flags?
3. **Risk Assessment**: Are failure modes acceptable?
4. **Confidence Level**: High/Medium/Low confidence in strategy?

**No phase should be skipped or rushed.**

If confidence is not HIGH after Phase 4, continue paper trading or refine strategy.

---

## Next Steps After Validation

If all phases pass:
1. Add app visualization (watchlist page, paper journal)
2. Micro-live test with 0.1% of capital (10-20 trades)
3. Monitor closely, compare live vs paper
4. Gradually scale if performance matches paper
5. Never go above 2% portfolio allocation without extended live track record

**Live automation should NEVER be considered before completing all 4 validation phases.**

---

## Document Version

- **Version**: 1.0
- **Created**: 2026-03-10
- **Status**: Ready for Phase 1 Implementation
