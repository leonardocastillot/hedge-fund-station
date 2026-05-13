# One Bitcoin - Backend Implementation

Full spec:
- `docs/strategies/one-bitcoin.md`

Implementation notes:

- `logic.py` owns deterministic contribution, dip trigger, RSI, and variant
  defaults.
- `backtest.py` reuses the shared BTC/USD daily history loader, then owns
  variant simulation and report payloads. Yahoo Finance `BTC-USD` is the
  primary fetch source; Binance BTCUSDT daily candles are the fallback.
- `scoring.py` ranks accumulation variants against DCA.
- `risk.py` states the no-leverage/no-selling guardrails.
- The backtest selects the primary variant by final BTC balance so the report
  optimizes for maximum BTC owned rather than a fixed named strategy.
- Research-only sell/rebuy variants can be evaluated, but `paper.py` deliberately
  blocks execution promotion because v1 is research and goal tracking only.
