# One Bitcoin - Backend Implementation

Full spec:
- `docs/strategies/one-bitcoin.md`

Implementation notes:

- `logic.py` owns deterministic contribution, dip trigger, RSI, and variant
  defaults.
- `backtest.py` owns BTC/USD daily history loading, CoinGecko caching, variant
  simulation, and report payloads.
- `scoring.py` ranks accumulation variants against DCA.
- `risk.py` states the no-leverage/no-selling guardrails.
- The backtest selects the primary variant by final BTC balance so the report
  optimizes for maximum BTC owned rather than a fixed named strategy.
- Research-only sell/rebuy variants can be evaluated, but `paper.py` deliberately
  blocks execution promotion because v1 is research and goal tracking only.
