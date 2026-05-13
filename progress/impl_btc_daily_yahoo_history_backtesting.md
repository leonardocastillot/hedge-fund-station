# BTC Daily Yahoo History Backtesting Handoff

## Objective

Add backend-owned BTC/USD daily history fetching so long-horizon backtests can
use years of daily BTC data from Yahoo Finance or a public fallback.

## Scope

- Backend backtesting data loaders.
- Stable `hf` CLI.
- Existing One Bitcoin daily backtest.
- Data artifact docs and strategy docs.
- Focused unit tests.

## Changes Made

- Added `backend/hyperliquid_gateway/backtesting/btc_daily_history.py`.
- Added Yahoo Finance `BTC-USD` daily chart fetching as the primary source.
- Added Binance BTCUSDT daily klines as fallback when `--source auto` is used.
- Added cache/read support for JSON and CSV daily BTC datasets.
- Added exact date filtering through existing `BacktestConfig` start/end/
  lookback fields.
- Added CLI command:
  `npm run hf:market-data:btc-daily -- --start 2014-09-17 --force`.
- Added package script:
  `hf:market-data:btc-daily`.
- Updated `one_bitcoin` to reuse the shared loader instead of owning stale
  inline market-data fetch code.
- Updated docs to explain that daily BTC candles are useful for daily/
  long-horizon backtests and benchmarks, not as a substitute for intraday
  Hyperliquid snapshot validation.

## Files Changed

- `backend/hyperliquid_gateway/backtesting/btc_daily_history.py`: shared daily
  BTC loader/fetch/cache module.
- `backend/hyperliquid_gateway/cli.py`: new `market-data btc-daily` command.
- `package.json`: new npm script for the command.
- `backend/hyperliquid_gateway/strategies/one_bitcoin/backtest.py`: delegates
  daily BTC loading to the shared module.
- `backend/hyperliquid_gateway/strategies/one_bitcoin/spec.md`: source update.
- `docs/strategies/one-bitcoin.md`: source, command, and validation notes.
- `backend/hyperliquid_gateway/data/README.md`: cache policy note.
- `tests/test_btc_daily_history.py`: loader/fetch/cache/fallback tests.

## Verification

Commands run:

```bash
rtk python3 -m unittest tests.test_btc_daily_history tests.test_one_bitcoin
rtk python3 -m unittest tests.test_strategy_catalog tests.test_btc_daily_history tests.test_one_bitcoin
rtk python3 -m py_compile backend/hyperliquid_gateway/backtesting/btc_daily_history.py backend/hyperliquid_gateway/cli.py backend/hyperliquid_gateway/strategies/one_bitcoin/backtest.py
rtk npm run hf:market-data:btc-daily -- --start 2020-01-01 --end 2020-01-10 --output backend/hyperliquid_gateway/data/tmp-btc-daily-test.json --force
rtk npm run hf:backtest -- --strategy one_bitcoin --dataset backend/hyperliquid_gateway/data/tmp-btc-daily-test.json
rtk npm run hf:market-data:btc-daily -- --start 2014-09-17 --force
rtk npm run hf:backtest -- --strategy one_bitcoin --dataset backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json
rtk npm run hf:status
rtk npm run agent:check
rtk git diff --check
```

Result:

- Tests passed: 35 tests including catalog, BTC daily loader, and One Bitcoin.
- Yahoo test fetch passed for 2020-01-01 through 2020-01-10 with 10 rows.
- Multi-year Yahoo cache generated:
  `backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json`.
- Multi-year cache covers 4,257 daily rows from 2014-09-17 through 2026-05-13.
- One Bitcoin backtest consumed the multi-year Yahoo cache and wrote:
  `backend/hyperliquid_gateway/data/backtests/one_bitcoin-btc_usd_daily_yahoo-20260513T152722Z.json`.
- Harness check, status, py_compile, and diff check passed.

## Findings

- Yahoo Finance `BTC-USD` has usable daily BTC coverage from 2014-09-17 in this
  environment.
- Daily BTC history is useful for long-horizon daily strategies and BTC
  benchmarks. It does not contain OI, funding, crowding, order book, or
  intraday replay fields, so it cannot validate scalp strategies by itself.
- Generated market-data caches and timestamped backtest reports are ignored by
  git, as intended.

## Memory Updated

intentionally unchanged: the durable rule is documented in the shared loader,
strategy docs, data README, and this handoff.

## Assumptions

- No live trading, credentials, production promotion, or paper runtime changes.
- Yahoo Finance chart data is a public research input, not an execution feed.
- Binance fallback is acceptable as a public daily candle source when Yahoo is
  unavailable.

## Next Best Step

Use the daily BTC cache for long-horizon BTC benchmark comparisons, while
continuing to collect Hyperliquid snapshots for real 30/60/90 day scalp
validation.
