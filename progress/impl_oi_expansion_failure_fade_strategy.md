# OI Expansion Failure Fade Strategy Implementation

## Objective

Create a backend-first OI Expansion Failure Fade strategy, run the requested
backtests, validate the primary report, and leave evidence for refinement.

## Scope

- `docs/strategies/`
- `backend/hyperliquid_gateway/strategies/oi_expansion_failure_fade/`
- `backend/hyperliquid_gateway/backtesting/registry.py`
- `backend/hyperliquid_gateway/data/backtests/`
- `backend/hyperliquid_gateway/data/validations/`
- `tests/`
- `agent_tasks.json`
- `progress/`

## Changes Made

- Added `docs/strategies/oi-expansion-failure-fade.md` with hypothesis,
  regime, inputs, entry, invalidation, risk, costs, validation, and failure
  modes.
- Added backend package `oi_expansion_failure_fade` with deterministic signal
  logic, scoring, risk sizing/cooldown, paper candidate payload, and SQLite
  replay.
- Registered `oi_expansion_failure_fade` in the backtesting registry with
  validation policy:
  - min trades: 30
  - min return: 0.10%
  - min profit factor: 1.20
  - min win rate: 42%
  - max drawdown: 5.0%
- Added unit tests covering long/short/no-trade signal behavior, scoring
  penalties, risk blocks, loader filters, synthetic backtest trade generation,
  and registry visibility.
- Registered the strategy mission in `agent_tasks.json` and updated
  `progress/current.md`.

## Files Changed

- `docs/strategies/oi-expansion-failure-fade.md`: strategy research/spec.
- `backend/hyperliquid_gateway/strategies/oi_expansion_failure_fade/`: backend
  implementation.
- `backend/hyperliquid_gateway/backtesting/registry.py`: strategy registration.
- `tests/test_oi_expansion_failure_fade.py`: focused strategy tests.
- `agent_tasks.json`, `progress/current.md`: file harness state.

## Verification

Commands run:

```bash
npm run agent:check
python3 -m unittest tests.test_oi_expansion_failure_fade
python3 -m unittest tests.test_backtest_filters tests.test_backtest_fees_and_scalper tests.test_strategy_catalog tests.test_oi_expansion_failure_fade
npm run hf:backtest -- --strategy oi_expansion_failure_fade --symbols BTC,SOL,HYPE --fee-model taker --lookback-days 3
npm run hf:backtest -- --strategy oi_expansion_failure_fade --symbols BTC,SOL,HYPE --fee-model mixed --maker-ratio 0.35 --lookback-days 3
npm run hf:validate -- --strategy oi_expansion_failure_fade --report backend/hyperliquid_gateway/data/backtests/oi_expansion_failure_fade-hyperliquid-20260505T182148Z.json
npm run hf:status
```

Results:

- `npm run agent:check`: passed after adding explicit operator gate language to
  the task notes.
- Unit tests: passed, 21 tests.
- Taker backtest artifact:
  `backend/hyperliquid_gateway/data/backtests/oi_expansion_failure_fade-hyperliquid-20260505T182148Z.json`
  - trades: 97
  - return: -0.12%
  - win rate: 14.43%
  - profit factor: 0.26
  - max drawdown: 0.12%
  - robust status: blocked
- Mixed-fee backtest artifact:
  `backend/hyperliquid_gateway/data/backtests/oi_expansion_failure_fade-hyperliquid-20260505T182154Z.json`
  - trades: 97
  - return: -0.10%
  - win rate: 15.46%
  - profit factor: 0.30
  - max drawdown: 0.10%
  - robust status: blocked
- Validation artifact:
  `backend/hyperliquid_gateway/data/validations/oi_expansion_failure_fade-20260505T182201Z.json`
  - status: blocked
  - blocking reasons: `min_return_pct`, `min_profit_factor`,
    `min_win_rate_pct`, `robust_gate`, `robust:positive_net_return`,
    `robust:min_profit_factor`, `robust:min_avg_net_trade_return_pct`
- Paper candidate: skipped because validation did not reach
  `ready-for-paper`.
- `npm run hf:status`: strategy appears in docs, backend package, registry,
  backtest artifacts, and validation artifacts with promotion stage
  `validation_blocked`.

## Findings

- The initial thesis is falsified under current v1 rules and the local
  2026-05-02 to 2026-05-05 snapshot window.
- Main weakness: too many `no_progress` exits and low win rate across all
  default symbols.
- Mixed fees reduce losses but do not change the edge conclusion.
- BTC, SOL, and HYPE all remain negative in the symbol leaderboard, so this is
  not a single-symbol artifact.
- The strategy should not generate a paper candidate until refined and
  revalidated.

## Memory Updated

intentionally unchanged: this implementation created strategy-specific evidence
under backend artifacts and this handoff. No new durable operating rule belongs
in shared memory.

## Assumptions

- This is research and backtesting only.
- No live trading, credentials, production routing, or promotion is allowed.
- The conservative taker backtest is the primary validation report.
- Validation failure is a useful result and should not be bypassed by loosening
  gates.

## Next Best Step

Refine v2 by adding a stricter entry confirmation: require a real reversal tick
or 15m structure break after the failed impulse, then compare against the v1
artifacts above on the same `BTC,SOL,HYPE` window.
