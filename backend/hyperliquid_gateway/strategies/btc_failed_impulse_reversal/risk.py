"""Risk helpers for BTC Failed Impulse Reversal."""

from __future__ import annotations

from typing import Any

STRATEGY_ID = "btc_failed_impulse_reversal"
MAX_CONCURRENT_POSITIONS = 1
BASE_SIZE_PCT = 10.0
STOP_LOSS_PCT = 0.65
TAKE_PROFIT_PCT = 1.75
MAX_HOLD_MINUTES = 480
COOLDOWN_MINUTES = 15
POST_LOSS_COOLDOWN_MINUTES = 30


def build_risk_plan(context: dict[str, Any], side: str | None = None) -> dict[str, Any]:
    entry_price = float(context.get("price", 0.0) or 0.0)
    resolved_side = side or str(context.get("side", context.get("signal", "long")) or "long")
    if resolved_side == "short":
        stop_loss = entry_price * (1 + STOP_LOSS_PCT / 100.0)
        take_profit = entry_price * (1 - TAKE_PROFIT_PCT / 100.0)
    else:
        stop_loss = entry_price * (1 - STOP_LOSS_PCT / 100.0)
        take_profit = entry_price * (1 + TAKE_PROFIT_PCT / 100.0)

    return {
        "strategy_id": STRATEGY_ID,
        "side": resolved_side,
        "stop_loss_pct": STOP_LOSS_PCT,
        "take_profit_pct": TAKE_PROFIT_PCT,
        "max_hold_minutes": MAX_HOLD_MINUTES,
        "cooldown_minutes": COOLDOWN_MINUTES,
        "post_loss_cooldown_minutes": POST_LOSS_COOLDOWN_MINUTES,
        "max_concurrent_positions": MAX_CONCURRENT_POSITIONS,
        "base_size_pct": BASE_SIZE_PCT,
        "stop_loss": round(stop_loss, 6) if entry_price else None,
        "take_profit": round(take_profit, 6) if entry_price else None,
        "invalidation": [
            "Exit if the 0.65% stop is touched.",
            "Exit if the 1.75% target is touched.",
            "Exit after 8 hours if neither target nor stop is reached.",
            "Run only one BTC position at a time.",
            "Pause after each exit; use a longer pause after losses.",
        ],
    }


def calculate_position_size(
    *,
    portfolio_value: float,
    market_data: dict[str, Any],
    current_positions: list[dict[str, Any]],
    signal_eval: dict[str, Any],
) -> dict[str, Any]:
    if signal_eval.get("signal") not in {"long", "short"}:
        return {"can_enter": False, "size_usd": 0.0, "size_pct": 0.0, "block_reason": "no_reversal_signal"}

    if any(position for position in current_positions):
        return {"can_enter": False, "size_usd": 0.0, "size_pct": 0.0, "block_reason": "max_one_open_position"}

    timestamp_ms = int(market_data.get("timestamp_ms", 0) or 0)
    cooldown_until_ms = int(market_data.get("cooldownUntilMs", 0) or 0)
    if cooldown_until_ms and timestamp_ms < cooldown_until_ms:
        return {"can_enter": False, "size_usd": 0.0, "size_pct": 0.0, "block_reason": "symbol_cooldown"}

    size_pct = BASE_SIZE_PCT / 100.0
    return {
        "can_enter": True,
        "size_usd": round(portfolio_value * size_pct, 2),
        "size_pct": BASE_SIZE_PCT,
        "block_reason": None,
    }
