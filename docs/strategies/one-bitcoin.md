# One Bitcoin

BTC-only spot accumulation strategy whose objective is to maximize BTC owned on
a forward-looking basis, with `1.0 BTC` as the first milestone.

## Hypothesis

A disciplined BTC accumulator should use dollar-cost averaging as the baseline
and reserve a controlled share of cash for large drawdowns, because BTC's
long-term volatility can reward patient buyers while still punishing attempts to
wait forever for the perfect low.

## Market Regime

Works best in:

- Long-horizon BTC accumulation programs with recurring fiat contributions.
- Volatile BTC markets where meaningful drawdowns occur without invalidating
  the long-term ownership thesis.
- Operators who prefer no leverage, no shorting, no selling, and clear progress
  metrics.

Avoid in:

- Short windows where dip logic only measures noise.
- Periods where the operator cannot actually make the modeled monthly deposit.
- Situations that require live trading, margin, liquidation risk, or automated
  execution.
- Any interpretation that treats this as financial advice instead of research.

## Inputs

- Daily BTC/USD close history.
- Default source: CoinGecko `bitcoin` market chart range API cached under the
  backend data artifact layer.
- If CoinGecko rejects unauthenticated long-range history, the runner may fall
  back to public Binance BTCUSDT daily candles and records that source in the
  backtest artifact.
- Starting cash: `$300`.
- Monthly contribution: `$300`, deposited after the first month on the first
  available UTC daily candle of each new month.
- Fee model: `0.10%` spot buy fee.
- Slippage model: `0.05%` adverse buy slippage.

## Entry

The backtest compares multiple variants and selects the primary result by final
BTC balance, not by fixed strategy name:

- `dca_monthly`: buy available contribution immediately.
- `dip_reserve`: hold cash until a dip trigger fires.
- `hybrid_accumulator`: buy `70%` of each contribution immediately and reserve
  `30%` for dips.
- `hybrid_trend_filtered`: same as hybrid, but dip reserve buys require a basic
  recovery filter.
- `aggressive_dip_accumulator`: deploys `85%` monthly and buys dips more
  aggressively.
- `drawdown_weighted_dca`: deploys more of each monthly contribution when BTC
  is already in a drawdown.
- `cycle_harvest_accumulator`: research-only variant that may trim a small BTC
  fraction during overheated cycle conditions, then tries to rebuy more BTC on
  later dips.

Dip reserve triggers:

- Moderate dip: BTC close is at least `10%` below its trailing `180d` high;
  deploy `25%` of reserve cash.
- Deep dip: BTC close is at least `20%` below its trailing `180d` high; deploy
  `50%` of reserve cash.
- Crash dip: BTC close is at least `30%` below its trailing `180d` high or
  RSI14 is below `30`; deploy `100%` of reserve cash.
- Cooldown: at most one reserve deployment every `7` days.

## Invalidation

- The strategy does not short BTC, use leverage, or route orders.
- Any sell/rebuy behavior is research-only until a separate human-reviewed
  execution design exists.
- A backtest is invalid if BTC/USD history is missing, sparse, non-positive, or
  not daily enough to evaluate the long-horizon accumulation rules.
- A live or paper execution interpretation is invalid until a separate human
  approval and brokerage/exchange execution design exists.

## Exit

Most variants have no exit logic; acquired BTC is held. The
`cycle_harvest_accumulator` variant can sell a small fraction only inside the
backtest when BTC is extended versus its trailing 365-day low, remains near the
365-day high, RSI14 is overbought, and price begins cooling. The goal metric
records the first date the simulated balance reaches `1.0 BTC`, if it happens.

## Risk

- No leverage.
- No shorting.
- No automatic execution.
- Research-only sell variants must be evaluated against DCA on final BTC
  balance, not on narrative appeal.
- Cash may remain idle for long periods in dip-heavy variants; this is measured
  as cash drag.
- The strategy can underperform pure DCA in persistent bull markets.

## Costs

- Default buy fee: `0.10%` of deployed USD.
- Default adverse slippage: `0.05%` added to the BTC purchase price.
- Average cost basis includes cash spent, fees, and slippage.

Sources:

- Investor.gov dollar-cost averaging:
  https://www.investor.gov/introduction-investing/investing-basics/glossary/dollar-cost-averaging
- FINRA dollar-cost averaging overview:
  https://www.finra.org/investors/insights/dollar-cost-averaging
- CoinGecko market chart range API:
  https://docs.coingecko.com/reference/coins-id-market-chart-range

## Validation

Run:

```bash
npm run hf:backtest -- --strategy one_bitcoin
npm run hf:validate -- --strategy one_bitcoin --report <generated_report>
```

Validation intentionally blocks paper/live promotion by default. This strategy
is an accumulation research tool and goal tracker, not a trade execution system.

The backtest report must include:

- BTC balance.
- Percent of `1.0 BTC`.
- Primary variant selected by highest BTC balance.
- Total deposited.
- Cash left.
- Average cost basis.
- Fees and slippage paid.
- Months-to-1-BTC if reached.
- Under/overperformance versus DCA in BTC and USD value.
- Maximum USD drawdown.
- Cash-drag notes.

## Failure Modes

- Dips continue into deeper drawdowns and reserve buys happen too early.
- Waiting for dips leaves too much cash idle while BTC trends up.
- The historical data source changes granularity, coverage, or availability.
- A user treats a backtest as proof rather than as a first research filter.
- Monthly contributions are not made in real life, making the path to `1 BTC`
  mathematically different from the model.

## Backend Mapping

- `backend/hyperliquid_gateway/strategies/one_bitcoin/`
- `backend/hyperliquid_gateway/strategies/one_bitcoin/backtest.py`
- `backend/hyperliquid_gateway/backtesting/registry.py`
