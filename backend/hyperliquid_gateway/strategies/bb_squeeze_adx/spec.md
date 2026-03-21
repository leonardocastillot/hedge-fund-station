# BB Squeeze ADX - Backend Implementation

This module adapts the donor idea into the Hyperliquid gateway research flow.

Files:
- `backtest.py` for deterministic indicator and entry generation
- `logic.py` for latest-signal evaluation
- `scoring.py` for watchlist ranking
- `risk.py` for backtest risk envelope
- `paper.py` for paper-trade handoff metadata

The implementation intentionally avoids copying donor scripts verbatim and
avoids external TA-Lib/backtesting.py dependencies so agents can operate the
strategy from a plain terminal environment.
