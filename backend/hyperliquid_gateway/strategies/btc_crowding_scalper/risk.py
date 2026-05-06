"""Risk helpers for the BTC crowding scalper."""

from __future__ import annotations

from typing import Any


def build_risk_plan(context: dict[str, Any]) -> dict[str, Any]:
    entry_price = float(context.get("price", 0.0) or 0.0)
    return {
        "strategy_id": "btc_crowding_scalper",
        "side": "long",
        "stop_loss_pct": 0.25,
        "take_profit_pct": 0.35,
        "max_hold_minutes": 20,
        "no_progress_minutes": 10,
        "cooldown_minutes": 10,
        "post_loss_cooldown_minutes": 30,
        "stop_loss": round(entry_price * 0.9975, 6) if entry_price else None,
        "take_profit": round(entry_price * 1.0035, 6) if entry_price else None,
        "invalidation": [
            "Exit if price loses 0.25% from entry.",
            "Exit if the trade has no progress after 10 minutes.",
            "Exit after 20 minutes if target is not reached.",
            "Pause the symbol for 30 minutes after a losing scalp.",
        ],
    }


def calculate_position_size(
    *,
    portfolio_value: float,
    market_data: dict[str, Any],
    current_positions: list[dict[str, Any]],
    signal_eval: dict[str, Any],
) -> dict[str, Any]:
    if signal_eval.get("signal") != "long":
        return {"can_enter": False, "size_usd": 0.0, "block_reason": "no_long_signal"}
    if current_positions:
        return {"can_enter": False, "size_usd": 0.0, "block_reason": "max_one_open_position"}
    execution_quality = int(market_data.get("executionQuality", 60) or 60)
    size_pct = 0.006 if execution_quality >= 75 else 0.004
    return {
        "can_enter": True,
        "size_usd": round(portfolio_value * size_pct, 2),
        "size_pct": round(size_pct * 100, 2),
        "block_reason": None,
    }
