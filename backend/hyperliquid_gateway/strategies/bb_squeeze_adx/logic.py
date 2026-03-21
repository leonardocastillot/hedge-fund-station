"""
BB Squeeze ADX - deterministic signal evaluation.

Adapted from the donor repository's idea, but implemented against the local
backend-first backtesting engine with no TA-Lib or backtesting.py dependency.
"""

from __future__ import annotations

from typing import Any

from .backtest import build_signals
from ...backtesting.io import Candle


def evaluate_latest_signal(candles: list[Candle]) -> dict[str, Any]:
    signals = build_signals(candles)
    latest = signals[-1]
    return {
        "strategy_id": "bb_squeeze_adx",
        "status": "ready" if latest.get("entry") else "watch",
        "signal": latest.get("entry") or "none",
        "adx": latest.get("adx"),
        "squeeze_on": latest.get("squeeze_on"),
        "bars_since_squeeze": latest.get("bars_since_squeeze"),
        "stop_loss": latest.get("stop_loss"),
        "take_profit": latest.get("take_profit"),
    }
