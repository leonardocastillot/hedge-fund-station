"""Risk helpers for the BTC fee-aware failed impulse scalp."""

from __future__ import annotations

from typing import Any

STRATEGY_ID = "btc_fee_aware_failed_impulse_scalp"
MAX_CONCURRENT_POSITIONS = 1
BASE_SIZE_PCT = 6.0
STOP_LOSS_PCT = 0.45
TAKE_PROFIT_PCT = 0.90
MAX_HOLD_MINUTES = 90
NO_PROGRESS_MINUTES = 20
MIN_PROGRESS_PCT = 0.12
COOLDOWN_MINUTES = 15
POST_LOSS_COOLDOWN_MINUTES = 30

RISK_PARAM_DEFAULTS = {
    "base_size_pct": BASE_SIZE_PCT,
    "stop_loss_pct": STOP_LOSS_PCT,
    "take_profit_pct": TAKE_PROFIT_PCT,
    "max_hold_minutes": MAX_HOLD_MINUTES,
    "no_progress_minutes": NO_PROGRESS_MINUTES,
    "min_progress_pct": MIN_PROGRESS_PCT,
    "cooldown_minutes": COOLDOWN_MINUTES,
    "post_loss_cooldown_minutes": POST_LOSS_COOLDOWN_MINUTES,
    "max_concurrent_positions": MAX_CONCURRENT_POSITIONS,
}


def risk_params(overrides: dict[str, Any] | None = None) -> dict[str, float]:
    params = {key: float(value) for key, value in RISK_PARAM_DEFAULTS.items()}
    for key, value in (overrides or {}).items():
        if key in params and isinstance(value, (int, float)):
            params[key] = float(value)
    return params


def build_risk_plan(context: dict[str, Any], side: str | None = None, params: dict[str, Any] | None = None) -> dict[str, Any]:
    resolved_params = risk_params(params)
    stop_loss_pct = resolved_params["stop_loss_pct"]
    take_profit_pct = resolved_params["take_profit_pct"]
    entry_price = float(context.get("price", 0.0) or 0.0)
    resolved_side = side or str(context.get("side", context.get("signal", "long")) or "long")
    if resolved_side == "short":
        stop_loss = entry_price * (1 + stop_loss_pct / 100.0)
        take_profit = entry_price * (1 - take_profit_pct / 100.0)
    else:
        stop_loss = entry_price * (1 - stop_loss_pct / 100.0)
        take_profit = entry_price * (1 + take_profit_pct / 100.0)

    return {
        "strategy_id": STRATEGY_ID,
        "side": resolved_side,
        "stop_loss_pct": stop_loss_pct,
        "take_profit_pct": take_profit_pct,
        "max_hold_minutes": int(resolved_params["max_hold_minutes"]),
        "no_progress_minutes": int(resolved_params["no_progress_minutes"]),
        "min_progress_pct": resolved_params["min_progress_pct"],
        "cooldown_minutes": int(resolved_params["cooldown_minutes"]),
        "post_loss_cooldown_minutes": int(resolved_params["post_loss_cooldown_minutes"]),
        "max_concurrent_positions": int(resolved_params["max_concurrent_positions"]),
        "base_size_pct": resolved_params["base_size_pct"],
        "stop_loss": round(stop_loss, 6) if entry_price else None,
        "take_profit": round(take_profit, 6) if entry_price else None,
        "invalidation": [
            f"Exit if the {stop_loss_pct:.2f}% stop is touched.",
            f"Exit if the {take_profit_pct:.2f}% target is touched.",
            f"Exit after {int(resolved_params['no_progress_minutes'])} minutes without {resolved_params['min_progress_pct']:.2f}% favorable progress.",
            f"Exit after {int(resolved_params['max_hold_minutes'])} minutes if neither target nor stop is reached.",
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
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    resolved_params = risk_params(params)
    if signal_eval.get("signal") not in {"long", "short"}:
        return {"can_enter": False, "size_usd": 0.0, "size_pct": 0.0, "block_reason": "no_fee_aware_failed_impulse_signal"}

    max_positions = int(resolved_params["max_concurrent_positions"])
    if len([position for position in current_positions if position]) >= max_positions:
        return {"can_enter": False, "size_usd": 0.0, "size_pct": 0.0, "block_reason": "max_one_open_position"}

    timestamp_ms = int(market_data.get("timestamp_ms", 0) or 0)
    cooldown_until_ms = int(market_data.get("cooldownUntilMs", 0) or 0)
    if cooldown_until_ms and timestamp_ms < cooldown_until_ms:
        return {"can_enter": False, "size_usd": 0.0, "size_pct": 0.0, "block_reason": "symbol_cooldown"}

    execution_quality = int(market_data.get("executionQuality", 0) or 0)
    if execution_quality < 45:
        return {"can_enter": False, "size_usd": 0.0, "size_pct": 0.0, "block_reason": "weak_execution_quality"}

    size_pct = resolved_params["base_size_pct"] / 100.0
    return {
        "can_enter": True,
        "size_usd": round(portfolio_value * size_pct, 2),
        "size_pct": resolved_params["base_size_pct"],
        "block_reason": None,
    }
