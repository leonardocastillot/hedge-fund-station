"""Risk helpers for Liquidation Pressure Flip Reversal."""

from __future__ import annotations

from typing import Any

STRATEGY_ID = "liquidation_pressure_flip_reversal"
MAX_CONCURRENT_POSITIONS = 3
COOLDOWN_MINUTES_AFTER_LOSS = 35


def build_risk_plan(context: dict[str, Any], side: str | None = None) -> dict[str, Any]:
    entry_price = float(context.get("price", 0.0) or 0.0)
    resolved_side = side or str(context.get("side", context.get("signal", "long")) or "long")
    execution_quality = int(context.get("executionQuality", 60) or 60)
    stop_loss_pct = 0.45 if execution_quality >= 75 else 0.58 if execution_quality >= 55 else 0.72
    take_profit_pct = 0.80 if execution_quality >= 75 else 0.95 if execution_quality >= 55 else 1.10
    if resolved_side == "short":
        stop_loss = entry_price * (1 + stop_loss_pct / 100)
        take_profit = entry_price * (1 - take_profit_pct / 100)
    else:
        stop_loss = entry_price * (1 - stop_loss_pct / 100)
        take_profit = entry_price * (1 + take_profit_pct / 100)

    return {
        "strategy_id": STRATEGY_ID,
        "side": resolved_side,
        "stop_loss_pct": stop_loss_pct,
        "take_profit_pct": take_profit_pct,
        "max_hold_minutes": 60,
        "no_progress_minutes": 20,
        "cooldown_minutes_after_loss": COOLDOWN_MINUTES_AFTER_LOSS,
        "stop_loss": round(stop_loss, 6) if entry_price else None,
        "take_profit": round(take_profit, 6) if entry_price else None,
        "invalidation": [
            "Exit if the dynamic stop is touched.",
            "Exit if the original liquidation impulse reasserts.",
            "Exit if OI expands aggressively with the original impulse.",
            "Exit if the trade has no progress after 20 minutes.",
            "Exit after 60 minutes if target is not reached.",
            "Pause the symbol for 35 minutes after a loss.",
        ],
    }


def calculate_position_size(
    *,
    portfolio_value: float,
    market_data: dict[str, Any],
    current_positions: list[dict[str, Any]],
    signal_eval: dict[str, Any],
) -> dict[str, Any]:
    signal = signal_eval.get("signal")
    if signal not in {"long", "short"}:
        return {"can_enter": False, "size_usd": 0.0, "size_pct": 0.0, "block_reason": "no_signal"}

    timestamp_ms = int(market_data.get("timestamp_ms", 0) or 0)
    cooldown_until_ms = int(market_data.get("cooldownUntilMs", 0) or 0)
    if cooldown_until_ms and timestamp_ms < cooldown_until_ms:
        return {"can_enter": False, "size_usd": 0.0, "size_pct": 0.0, "block_reason": "symbol_cooldown"}

    open_positions = [position for position in current_positions if position is not None]
    if len(open_positions) >= MAX_CONCURRENT_POSITIONS:
        return {"can_enter": False, "size_usd": 0.0, "size_pct": 0.0, "block_reason": "max_concurrent_positions"}

    symbol = market_data.get("symbol")
    if any(position.get("symbol") == symbol for position in open_positions):
        return {"can_enter": False, "size_usd": 0.0, "size_pct": 0.0, "block_reason": "symbol_already_open"}

    execution_quality = int(market_data.get("executionQuality", 60) or 60)
    size_pct = 0.008 if execution_quality >= 75 else 0.006 if execution_quality >= 55 else 0.004
    if len(open_positions) >= 1:
        size_pct = min(size_pct, 0.006)
    if len(open_positions) >= 2:
        size_pct = min(size_pct, 0.004)

    return {
        "can_enter": True,
        "size_usd": round(portfolio_value * size_pct, 2),
        "size_pct": round(size_pct * 100, 2),
        "block_reason": None,
    }
