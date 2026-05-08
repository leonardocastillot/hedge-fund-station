# Long Flush Continuation Strategy Handoff

## Objective

Create a backend-first research strategy for a short-side continuation setup
after long pressure begins failing.

## Scope

- `agent_tasks.json`
- `progress/`
- `docs/strategies/`
- `backend/hyperliquid_gateway/strategies/long_flush_continuation/`
- `backend/hyperliquid_gateway/backtesting/registry.py`
- `backend/hyperliquid_gateway/data/backtests/`
- `backend/hyperliquid_gateway/data/validations/`
- `tests/`

## Changes Made

- Registered and claimed `long_flush_continuation_strategy`.
- Scaffolded `long_flush_continuation` through `npm run hf:strategy:new`.
- Added strategy documentation and backend spec.
- Implemented deterministic signal logic for short entries when long-pressure
  scores or `longs-at-risk` crowding align with positive/high funding,
  downside impulse, OI stability, liquidity, and opportunity score.
- Added ranking, risk, paper candidate helper, backtest adapter, and registry
  integration.
- Added focused unit tests with a synthetic market snapshot database.
- Generated taker and mixed-fee backtest artifacts plus a validation artifact.

## Files Changed

- `docs/strategies/long-flush-continuation.md`: research thesis, rules,
  validation plan, and failure modes.
- `backend/hyperliquid_gateway/strategies/long_flush_continuation/`: backend
  strategy package.
- `backend/hyperliquid_gateway/backtesting/registry.py`: registered strategy,
  validation policy, default dataset, and paper builder.
- `tests/test_long_flush_continuation.py`: deterministic unit and synthetic
  backtest coverage.
- `agent_tasks.json` and `progress/current.md`: harness state.

## Verification

Commands run:

```bash
npm run agent:check
python3 -m unittest tests.test_long_flush_continuation
python3 -m unittest tests.test_backtest_filters tests.test_backtest_fees_and_scalper tests.test_strategy_catalog tests.test_long_flush_continuation
npm run hf:backtest -- --strategy long_flush_continuation --symbols BTC,SOL,HYPE --fee-model taker --lookback-days 3
npm run hf:backtest -- --strategy long_flush_continuation --symbols BTC,SOL,HYPE --fee-model mixed --maker-ratio 0.35 --lookback-days 3
npm run hf:validate -- --strategy long_flush_continuation --report backend/hyperliquid_gateway/data/backtests/long_flush_continuation-hyperliquid-20260507T010749Z.json
npm run hf:status
npm run agent:check
```

Result:

- Passed: `npm run agent:check`.
- Passed: focused new strategy tests, 6 tests.
- Passed: required focused suite, 38 tests.
- Passed: taker-fee backtest generated
  `backend/hyperliquid_gateway/data/backtests/long_flush_continuation-hyperliquid-20260507T010749Z.json`.
- Passed: mixed-fee backtest generated
  `backend/hyperliquid_gateway/data/backtests/long_flush_continuation-hyperliquid-20260507T010757Z.json`.
- Validation artifact generated at
  `backend/hyperliquid_gateway/data/validations/long_flush_continuation-20260507T010806Z.json`, but the command exited non-zero because validation status is `blocked`.
- Passed: `npm run hf:status` lists `long_flush_continuation` as docs +
  backend + registered + backtest + validation, with promotion stage
  `validation_blocked`.

## Findings

- The first strict `longs-at-risk` version produced 0 trades on BTC/SOL/HYPE
  because the local 3-day sample labeled those symbols `balanced`.
- HYPE showed positive funding, negative 24h displacement, and high
  `longFlush`/`fade` scores, so the strategy now accepts a score-derived
  long-pressure proxy before the crowding label flips.
- Primary taker-fee result is not promotable: 1 HYPE trade, -$2.77 net PnL,
  0.0% win rate, 0.0 profit factor, insufficient sample, and robust gate
  blockers for trade count, positive return, profit factor, and average net
  trade return.
- Mixed-fee result is also blocked: 1 HYPE trade, -$2.51 net PnL, insufficient
  sample.
- Paper candidate generation was intentionally skipped because validation did
  not reach `ready-for-paper`.

## Memory Updated

Intentionally unchanged: this creates strategy-specific evidence and a handoff,
not a durable architecture decision or shared agent memory item.

## Assumptions

- `longFlush` plus `fade` plus positive funding is an acceptable backend proxy
  for long pressure when `crowdingBias` has not yet flipped to
  `longs-at-risk`.
- BTC/SOL/HYPE remain the initial verification universe because the task was
  scoped to a small Hyperliquid replay, not a broad optimizer pass.

## Next Best Step

Run a parameter/data-quality audit for `long_flush_continuation`: inspect more
symbols and longer windows, then decide whether score-derived pressure should
be tightened, loosened, or replaced with a better crowding classifier before
any further paper discussion.
