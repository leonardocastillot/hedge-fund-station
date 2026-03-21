"""BB Squeeze ADX risk helpers."""

from __future__ import annotations

from typing import Any


def build_risk_plan(signal: dict[str, Any]) -> dict[str, Any]:
    if signal.get("signal") == "none":
        return {
            "strategy_id": "bb_squeeze_adx",
            "allowed": False,
            "reason": "No breakout confirmed after squeeze release.",
        }
    return {
        "strategy_id": "bb_squeeze_adx",
        "allowed": True,
        "max_position_fraction": 0.10,
        "stop_loss": signal.get("stop_loss"),
        "take_profit": signal.get("take_profit"),
        "reason": "One-position backtest baseline. Portfolio heat rules still belong in gateway orchestration.",
    }
