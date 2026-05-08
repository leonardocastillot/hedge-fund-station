"""Deterministic accumulation logic for One Bitcoin."""

from __future__ import annotations

from typing import Any

STRATEGY_ID = "one_bitcoin"
GOAL_BTC = 1.0
STARTING_CASH_USD = 300.0
MONTHLY_DEPOSIT_USD = 300.0
SPOT_BUY_FEE_RATE = 0.001
ADVERSE_SLIPPAGE_RATE = 0.0005
TRAILING_HIGH_DAYS = 180
RSI_PERIOD = 14
RESERVE_COOLDOWN_DAYS = 7
MIN_PURCHASE_USD = 1.0

CONFIG_DEFAULTS = {
    "goal_btc": GOAL_BTC,
    "starting_cash_usd": STARTING_CASH_USD,
    "monthly_deposit_usd": MONTHLY_DEPOSIT_USD,
    "spot_buy_fee_rate": SPOT_BUY_FEE_RATE,
    "adverse_slippage_rate": ADVERSE_SLIPPAGE_RATE,
    "trailing_high_days": TRAILING_HIGH_DAYS,
    "rsi_period": RSI_PERIOD,
    "reserve_cooldown_days": RESERVE_COOLDOWN_DAYS,
    "min_purchase_usd": MIN_PURCHASE_USD,
}

VARIANT_DEFINITIONS = {
    "dca_monthly": {
        "label": "Monthly DCA",
        "monthly_deploy_pct": 1.0,
        "dip_enabled": False,
        "dip_requires_trend": False,
        "sell_enabled": False,
    },
    "dip_reserve": {
        "label": "Dip Reserve",
        "monthly_deploy_pct": 0.0,
        "dip_enabled": True,
        "dip_requires_trend": False,
        "dip_deploy_multiplier": 1.0,
        "sell_enabled": False,
    },
    "hybrid_accumulator": {
        "label": "Hybrid Accumulator",
        "monthly_deploy_pct": 0.70,
        "dip_enabled": True,
        "dip_requires_trend": False,
        "dip_deploy_multiplier": 1.0,
        "sell_enabled": False,
    },
    "hybrid_trend_filtered": {
        "label": "Hybrid Trend Filtered",
        "monthly_deploy_pct": 0.70,
        "dip_enabled": True,
        "dip_requires_trend": True,
        "dip_deploy_multiplier": 1.0,
        "sell_enabled": False,
    },
    "aggressive_dip_accumulator": {
        "label": "Aggressive Dip Accumulator",
        "monthly_deploy_pct": 0.85,
        "dip_enabled": True,
        "dip_requires_trend": False,
        "dip_deploy_multiplier": 1.50,
        "sell_enabled": False,
    },
    "drawdown_weighted_dca": {
        "label": "Drawdown Weighted DCA",
        "monthly_deploy_pct": 0.50,
        "monthly_drawdown_boost": True,
        "dip_enabled": True,
        "dip_requires_trend": False,
        "dip_deploy_multiplier": 1.20,
        "sell_enabled": False,
    },
    "cycle_harvest_accumulator": {
        "label": "Cycle Harvest Accumulator",
        "monthly_deploy_pct": 0.85,
        "dip_enabled": True,
        "dip_requires_trend": False,
        "dip_deploy_multiplier": 1.50,
        "sell_enabled": True,
        "sell_fraction": 0.08,
        "sell_cooldown_days": 30,
    },
}


def strategy_config(overrides: dict[str, Any] | None = None) -> dict[str, float]:
    config = {key: float(value) for key, value in CONFIG_DEFAULTS.items()}
    for key, value in (overrides or {}).items():
        if key in config and isinstance(value, (int, float)) and not isinstance(value, bool):
            config[key] = float(value)
    return config


def variant_definition(variant_id: str) -> dict[str, Any]:
    try:
        return VARIANT_DEFINITIONS[variant_id]
    except KeyError as exc:
        raise ValueError(f"Unsupported One Bitcoin variant: {variant_id}") from exc


def variant_ids() -> list[str]:
    return list(VARIANT_DEFINITIONS.keys())


def evaluate_dip_signal(
    rows: list[dict[str, Any]],
    index: int,
    *,
    config: dict[str, float] | None = None,
    require_trend: bool = False,
) -> dict[str, Any]:
    resolved = strategy_config(config)
    if index < 0 or index >= len(rows):
        raise IndexError("index is outside the BTC history window")

    close = float(rows[index]["close"])
    trailing_high = trailing_high_close(rows, index, int(resolved["trailing_high_days"]))
    drawdown_pct = 0.0 if trailing_high <= 0 else max(0.0, ((trailing_high - close) / trailing_high) * 100.0)
    rsi14 = calculate_rsi(rows, index, int(resolved["rsi_period"]))
    trend_confirmed = recovery_trend_confirmed(rows, index)

    severity = "none"
    deploy_fraction = 0.0
    trigger = False
    if drawdown_pct >= 30.0 or rsi14 < 30.0:
        severity = "crash"
        deploy_fraction = 1.0
        trigger = True
    elif drawdown_pct >= 20.0:
        severity = "deep"
        deploy_fraction = 0.50
        trigger = True
    elif drawdown_pct >= 10.0:
        severity = "moderate"
        deploy_fraction = 0.25
        trigger = True

    trend_blocked = bool(require_trend and trigger and not trend_confirmed)
    if trend_blocked:
        trigger = False
        deploy_fraction = 0.0

    return {
        "strategy_id": STRATEGY_ID,
        "signal": "buy_dip" if trigger else "standby",
        "severity": severity,
        "trigger": trigger,
        "deploy_fraction": deploy_fraction,
        "drawdown_pct": round(drawdown_pct, 4),
        "trailing_high": round(trailing_high, 8),
        "rsi14": round(rsi14, 4),
        "trend_required": require_trend,
        "trend_confirmed": trend_confirmed,
        "filters_passed": {
            "moderate_drawdown": drawdown_pct >= 10.0,
            "deep_drawdown": drawdown_pct >= 20.0,
            "crash_drawdown_or_rsi": drawdown_pct >= 30.0 or rsi14 < 30.0,
            "trend_confirmed": (not require_trend) or trend_confirmed,
        },
        "filters_failed": {
            "trend_filter": trend_blocked,
            "no_dip_trigger": severity == "none",
        },
        "reasons": [
            f"Close is {drawdown_pct:.2f}% below trailing {int(resolved['trailing_high_days'])}d high.",
            f"RSI{int(resolved['rsi_period'])} is {rsi14:.2f}.",
            "Recovery trend filter passed." if trend_confirmed else "Recovery trend filter not confirmed.",
        ],
    }


def evaluate_sell_signal(rows: list[dict[str, Any]], index: int) -> dict[str, Any]:
    if index < 0 or index >= len(rows):
        raise IndexError("index is outside the BTC history window")

    close = float(rows[index]["close"])
    trailing_low = trailing_low_close(rows, index, 365)
    trailing_high = trailing_high_close(rows, index, 365)
    rsi14 = calculate_rsi(rows, index, RSI_PERIOD)
    expansion_from_low_pct = 0.0 if trailing_low <= 0 else ((close - trailing_low) / trailing_low) * 100.0
    drawdown_from_high_pct = 0.0 if trailing_high <= 0 else max(0.0, ((trailing_high - close) / trailing_high) * 100.0)
    overheated = expansion_from_low_pct >= 180.0 and drawdown_from_high_pct <= 12.0 and rsi14 >= 72.0
    trend_break = index >= 3 and close < float(rows[index - 1]["close"]) < float(rows[index - 2]["close"])
    trigger = bool(overheated and trend_break)

    return {
        "strategy_id": STRATEGY_ID,
        "signal": "sell_cycle_trim" if trigger else "hold",
        "trigger": trigger,
        "sell_fraction": 0.08 if trigger else 0.0,
        "trailing_low_365d": round(trailing_low, 8),
        "trailing_high_365d": round(trailing_high, 8),
        "expansion_from_low_pct": round(expansion_from_low_pct, 4),
        "drawdown_from_high_pct": round(drawdown_from_high_pct, 4),
        "rsi14": round(rsi14, 4),
        "filters_passed": {
            "expanded_from_365d_low": expansion_from_low_pct >= 180.0,
            "near_cycle_high": drawdown_from_high_pct <= 12.0,
            "overbought_rsi": rsi14 >= 72.0,
            "three_day_cooling": trend_break,
        },
        "filters_failed": {
            "not_overheated": not overheated,
            "no_cooling_trigger": not trend_break,
        },
        "reasons": [
            f"Price is {expansion_from_low_pct:.2f}% above trailing 365d low.",
            f"Price is {drawdown_from_high_pct:.2f}% below trailing 365d high.",
            f"RSI14 is {rsi14:.2f}.",
        ],
    }


def trailing_high_close(rows: list[dict[str, Any]], index: int, window_days: int) -> float:
    start = max(0, index - max(1, window_days) + 1)
    return max(float(row["close"]) for row in rows[start : index + 1])


def trailing_low_close(rows: list[dict[str, Any]], index: int, window_days: int) -> float:
    start = max(0, index - max(1, window_days) + 1)
    return min(float(row["close"]) for row in rows[start : index + 1])


def calculate_rsi(rows: list[dict[str, Any]], index: int, period: int = RSI_PERIOD) -> float:
    if index <= 0 or index < period:
        return 50.0

    gains = 0.0
    losses = 0.0
    start = max(1, index - period + 1)
    for item_index in range(start, index + 1):
        current = float(rows[item_index]["close"])
        previous = float(rows[item_index - 1]["close"])
        delta = current - previous
        if delta >= 0:
            gains += delta
        else:
            losses += abs(delta)

    periods = max(1, index - start + 1)
    average_gain = gains / periods
    average_loss = losses / periods
    if average_loss == 0:
        return 100.0 if average_gain > 0 else 50.0
    relative_strength = average_gain / average_loss
    return 100.0 - (100.0 / (1.0 + relative_strength))


def recovery_trend_confirmed(rows: list[dict[str, Any]], index: int) -> bool:
    if index < 7:
        return False
    close = float(rows[index]["close"])
    previous = float(rows[index - 1]["close"])
    sma_7 = sum(float(row["close"]) for row in rows[index - 6 : index + 1]) / 7.0
    return close > previous and close >= sma_7


def should_deposit_month(previous_date: str | None, current_date: str) -> bool:
    if previous_date is None:
        return False
    previous_month = previous_date[:7]
    current_month = current_date[:7]
    return previous_month != current_month
