from __future__ import annotations

from typing import Any

from .logic import STRATEGY_ID

MAX_CONCURRENT = 3
COOLDOWN_MIN = 15


def build_risk_plan(context: dict[str, Any], side: str | None = None) -> dict[str, Any]:
    entry_price = float(context.get("price", 0.0) or 0.0)
    resolved_side = side or str(context.get("side", context.get("signal", "long")) or "long")
    conviction = int(context.get("conviction") or 50)
    eq = int(context.get("executionQuality") or 60)
    change_1h = abs(float(context.get("change1h", 0.0) or 0.0))
    volatility = max(0.3, min(2.0, change_1h * 2.0))

    stop_pct = max(0.35, 0.70 - (conviction - 50) * 0.004 + volatility * 0.15)
    rr_ratio = 1.5 + (conviction / 100.0) * 1.0
    take_pct = stop_pct * rr_ratio

    if eq >= 75:
        stop_pct *= 0.85
    elif eq < 55:
        stop_pct *= 1.15

    if resolved_side == "short":
        stop_loss = entry_price * (1 + stop_pct / 100)
        take_profit = entry_price * (1 - take_pct / 100)
    else:
        stop_loss = entry_price * (1 - stop_pct / 100)
        take_profit = entry_price * (1 + take_pct / 100)

    return {
        "strategy_id": STRATEGY_ID,
        "side": resolved_side,
        "entry_price": round(entry_price, 6),
        "stop_loss_pct": round(stop_pct, 4),
        "take_profit_pct": round(take_pct, 4),
        "reward_risk_ratio": round(rr_ratio, 2),
        "max_hold_minutes": 120,
        "no_progress_minutes": 25,
        "cooldown_minutes_after_loss": COOLDOWN_MIN,
        "stop_loss": round(stop_loss, 6) if entry_price else None,
        "take_profit": round(take_profit, 6) if entry_price else None,
        "oi_exit_threshold_pct": -2.5,
        "invalidation": [
            "Exit if stop loss touched.",
            "Exit if take profit reached.",
            "Exit if OI contracts > 2.5% from entry.",
            "Exit if 15m direction reverses against trade.",
            "Exit if no progress after 25 minutes.",
            "Exit after 120 minutes max hold.",
            "15 min cooldown after a loss.",
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
        return {"can_enter": False, "size_usd": 0.0, "size_pct": 0.0, "block_reason": "cooldown"}

    open_positions = [p for p in current_positions if p is not None]
    if len(open_positions) >= MAX_CONCURRENT:
        return {"can_enter": False, "size_usd": 0.0, "size_pct": 0.0, "block_reason": "max_concurrent"}

    symbol = market_data.get("symbol")
    if any(p.get("symbol") == symbol for p in open_positions):
        return {"can_enter": False, "size_usd": 0.0, "size_pct": 0.0, "block_reason": "duplicate_symbol"}

    conviction = int(signal_eval.get("conviction") or 50)
    eq = int(market_data.get("executionQuality") or 60)

    base_pct = 0.008 + (conviction / 100.0) * 0.012
    if eq >= 75:
        base_pct *= 1.15
    elif eq < 55:
        base_pct *= 0.80
    position_count_penalty = 1.0 - len(open_positions) * 0.20
    base_pct *= max(0.5, position_count_penalty)
    base_pct = min(base_pct, 0.025)

    return {
        "can_enter": True,
        "size_usd": round(portfolio_value * base_pct, 2),
        "size_pct": round(base_pct * 100, 4),
        "block_reason": None,
        "conviction": conviction,
        "execution_quality": eq,
    }
