"""Risk rules for long flush continuation."""

from __future__ import annotations

from typing import Any

STRATEGY_ID = "long_flush_continuation"


def build_risk_plan(context: dict[str, Any]) -> dict[str, Any]:
    entry_price = float(context.get("price", 0.0) or 0.0)
    return {
        "strategy_id": STRATEGY_ID,
        "side": "short",
        "stop_loss_pct": 0.8,
        "take_profit_pct": 1.4,
        "max_hold_minutes": 120,
        "stop_loss": round(entry_price * 1.008, 6) if entry_price else None,
        "take_profit": round(entry_price * 0.986, 6) if entry_price else None,
        "invalidation": [
            "Exit if price rises 0.8% from entry.",
            "Exit if OI drops more than 6% from entry.",
            "Exit if long-pressure scores and crowding support fade.",
            "Exit after 120 minutes if target is not reached.",
        ],
    }


def calculate_position_size(
    *,
    portfolio_value: float,
    market_data: dict[str, Any],
    current_positions: list[dict[str, Any]],
    signal_eval: dict[str, Any],
) -> dict[str, Any]:
    if signal_eval.get("signal") != "short":
        return {"can_enter": False, "size_usd": 0.0, "block_reason": "no_short_signal"}
    if len(current_positions) >= 3:
        return {"can_enter": False, "size_usd": 0.0, "block_reason": "max_concurrent_positions"}
    execution_quality = int(market_data.get("executionQuality", 60) or 60)
    size_pct = 0.012 if execution_quality >= 70 else 0.008
    return {
        "can_enter": True,
        "size_usd": round(portfolio_value * size_pct, 2),
        "size_pct": round(size_pct * 100, 2),
        "block_reason": None,
    }
