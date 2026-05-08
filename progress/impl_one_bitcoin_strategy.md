# One Bitcoin Strategy Implementation Handoff

## Objective

Create `one_bitcoin`, a BTC-only spot accumulation strategy that measures
progress toward owning `1.0 BTC` with `$300` starting cash and `$300` monthly
deposits.

## Scope

Inspected the strategy harness, stable `hf:*` workflow, backtesting registry,
existing backend strategy packages, local BTC data coverage, and agent file
harness state.

## Changes Made

- Added `docs/strategies/one-bitcoin.md` with thesis, regime, anti-regime,
  inputs, DCA/dip triggers, costs, validation, and failure modes.
- Added `backend/hyperliquid_gateway/strategies/one_bitcoin/` with:
  deterministic accumulation triggers, no-leverage risk rules, variant scoring,
  blocked paper candidate helper, and a registered backtest adapter. Follow-up
  refinement selects the highest-BTC variant as primary and adds aggressive dip,
  drawdown-weighted DCA, and research-only cycle-harvest variants.
- Registered `one_bitcoin` in the shared strategy registry with a BTC/USD daily
  default dataset cache under `backend/hyperliquid_gateway/data/market_data/`.
- Added `tests/test_one_bitcoin.py` covering fee/slippage math, dip thresholds,
  reserve cooldown, 1 BTC goal metrics, variant comparison, risk/paper blocking,
  and registry visibility.
- Updated `agent_tasks.json` and `progress/current.md` for the active harness
  task.

## Files Changed

- `docs/strategies/one-bitcoin.md`: research/spec layer for the strategy.
- `backend/hyperliquid_gateway/strategies/one_bitcoin/`: backend source of
  truth for accumulation logic and backtesting.
- `backend/hyperliquid_gateway/backtesting/registry.py`: registers the strategy
  for `hf:backtest` and `hf:validate`.
- `tests/test_one_bitcoin.py`: focused regression tests.
- `agent_tasks.json`, `progress/current.md`, `progress/history.md`: harness
  state and handoff evidence.

## Verification

Commands run:

```bash
npm run agent:check
python3 -m py_compile backend/hyperliquid_gateway/strategies/one_bitcoin/*.py backend/hyperliquid_gateway/backtesting/registry.py
python3 -m unittest tests.test_one_bitcoin
python3 -m unittest tests.test_one_bitcoin tests.test_strategy_catalog
npm run hf:backtest -- --strategy one_bitcoin
npm run hf:validate -- --strategy one_bitcoin --report backend/hyperliquid_gateway/data/backtests/one_bitcoin-one_bitcoin_btc_usd_daily-20260507T211002Z.json
npm run hf:status
git diff --check
npm run agent:check
```

Result:

- Passed: agent check, py compile, focused tests, combined strategy tests,
  backtest, status, and whitespace check.
- Expected blocked result: `npm run hf:validate` wrote
  `backend/hyperliquid_gateway/data/validations/one_bitcoin-20260507T211009Z.json`
  and exited nonzero because `robust_gate` is intentionally blocked for this
  research-only accumulation strategy.

## Backtest Result

- Report:
  `backend/hyperliquid_gateway/data/backtests/one_bitcoin-one_bitcoin_btc_usd_daily-20260507T211002Z.json`
- Data cache:
  `backend/hyperliquid_gateway/data/market_data/one_bitcoin_btc_usd_daily.json`
- Data source used locally: CoinGecko was attempted first but returned
  `HTTP Error 401: Unauthorized`; the runner fell back to real public Binance
  BTCUSDT daily candles from `2017-08-17` through `2026-05-07`.
- Primary variant: `dca_monthly`, selected by highest final BTC balance.
- Final BTC balance: `2.20097648 BTC`, or `220.0976%` of the 1 BTC goal.
- First reached 1 BTC: `2019-03-01`, `18.43` months after the dataset start.
- Total deposited: `$31,800`.
- Final value: `$176,468.33`.
- Average cost basis: `$14,448.13`.
- Variant BTC leaderboard: `dca_monthly` `2.20097648 BTC`,
  `aggressive_dip_accumulator` `2.18889102 BTC`,
  `hybrid_accumulator` `2.16633135 BTC`, `drawdown_weighted_dca`
  `2.15978742 BTC`, `hybrid_trend_filtered` `2.14843348 BTC`,
  `cycle_harvest_accumulator` `2.12009621 BTC`, and `dip_reserve`
  `2.08549264 BTC`.
- Validation status: blocked by design; no paper or order-routing promotion.

## Findings

- The current no-key CoinGecko long-range call may return `401`; the strategy
  supports `COINGECKO_API_KEY` or `COINGECKO_DEMO_API_KEY` and otherwise records
  fallback source metadata.
- For the real Binance fallback sample, pure monthly DCA still outperformed
  every improved dip and research-only sell/rebuy variant on final BTC balance.
  The current best rule is therefore simple: buy the next available
  contribution immediately, while continuing to use dip context as review
  evidence rather than a reason to hold cash.
- Max drawdown on marked-to-market portfolio value was high (`75.0317%`), which
  is expected for BTC spot accumulation but important for operator expectations.

## Memory Updated

Intentionally unchanged: this work created a strategy doc and implementation
handoff, but did not add a cross-project rule that needs curated shared memory.

## Assumptions

- `$300` starting cash is deployed at the first available daily candle according
  to each variant rule.
- `$300` monthly deposits begin after the first month, on the first available
  candle of each new UTC month.
- No selling, leverage, shorting, credentials, or order routing is in scope.

## Next Best Step

Add a rolling walk-forward optimizer that can choose different accumulation
rules by market cycle instead of picking one all-history winner.
