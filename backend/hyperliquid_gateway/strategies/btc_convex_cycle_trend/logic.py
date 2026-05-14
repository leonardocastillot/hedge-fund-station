"""Deterministic BTC daily convex cycle trend logic."""

from __future__ import annotations

from typing import Any

STRATEGY_ID = "btc_convex_cycle_trend"
SYMBOL = "BTC"
FAST_SMA_DAYS = 50
SLOW_SMA_DAYS = 150
RSI_PERIOD_DAYS = 14
MOMENTUM_DAYS = 30
TRAILING_HIGH_DAYS = 180
MIN_ENTRY_RSI = 42.0
CONVEX_MIN_RSI = 48.0
CONVEX_MAX_RSI = 76.0
CONVEX_MAX_DRAWDOWN_180D_PCT = 28.0
CONVEX_MIN_MOMENTUM_30D_PCT = -4.0
BASE_EXPOSURE_FRACTION = 0.12
CONVEX_EXPOSURE_FRACTION = 0.25
TRAILING_EXIT_DRAWDOWN_PCT = 15.0
SLOW_TREND_EXIT_BAND = 0.96
CRASH_DRAWDOWN_PCT = 45.0
CRASH_RSI = 35.0


def evaluate_signal(
    rows: list[dict[str, Any]],
    index: int,
    *,
    in_position: bool = False,
    trade_peak_close: float | None = None,
) -> dict[str, Any]:
    if index < 0 or index >= len(rows):
        raise IndexError("index is outside the BTC daily history window")

    context = indicator_context(rows, index, trade_peak_close=trade_peak_close)
    if not context["has_required_history"]:
        return {
            **context,
            "strategy_id": STRATEGY_ID,
            "symbol": SYMBOL,
            "signal": "hold" if in_position else "none",
            "entry_trigger": False,
            "exit_trigger": False,
            "exit_reason": None,
            "convex_regime": False,
            "target_exposure_fraction": 0.0,
            "reasons": ["Waiting for enough daily history to compute SMA150."],
        }

    base_entry = (
        not in_position
        and context["close"] > context["sma150"]
        and context["sma50"] > context["sma150"]
        and context["rsi14"] > MIN_ENTRY_RSI
    )
    convex_regime = bool(
        base_entry
        and context["close"] > context["sma50"]
        and CONVEX_MIN_RSI <= context["rsi14"] <= CONVEX_MAX_RSI
        and context["drawdown_180d_pct"] <= CONVEX_MAX_DRAWDOWN_180D_PCT
        and context["momentum_30d_pct"] >= CONVEX_MIN_MOMENTUM_30D_PCT
    )
    target_exposure = CONVEX_EXPOSURE_FRACTION if convex_regime else BASE_EXPOSURE_FRACTION if base_entry else 0.0

    trailing_exit = bool(in_position and context["trade_drawdown_pct"] >= TRAILING_EXIT_DRAWDOWN_PCT)
    trend_exit = bool(
        in_position
        and context["close"] < context["sma150"] * SLOW_TREND_EXIT_BAND
        and context["sma50"] < context["sma150"]
    )
    crash_exit = bool(
        in_position
        and context["drawdown_180d_pct"] > CRASH_DRAWDOWN_PCT
        and context["rsi14"] < CRASH_RSI
    )
    exit_reason = None
    if trailing_exit:
        exit_reason = "trailing_stop"
    elif trend_exit:
        exit_reason = "trend_break"
    elif crash_exit:
        exit_reason = "crash_guard"

    signal = "hold"
    if base_entry:
        signal = "long"
    elif in_position and exit_reason:
        signal = "exit"
    elif not in_position:
        signal = "none"

    return {
        **context,
        "strategy_id": STRATEGY_ID,
        "symbol": SYMBOL,
        "signal": signal,
        "entry_trigger": base_entry,
        "exit_trigger": exit_reason is not None,
        "exit_reason": exit_reason,
        "convex_regime": convex_regime,
        "target_exposure_fraction": round(target_exposure, 4),
        "filters_passed": {
            "close_above_sma150": context["close"] > context["sma150"],
            "sma50_above_sma150": context["sma50"] > context["sma150"],
            "rsi_above_entry_floor": context["rsi14"] > MIN_ENTRY_RSI,
            "close_above_sma50": context["close"] > context["sma50"],
            "rsi_in_convex_band": CONVEX_MIN_RSI <= context["rsi14"] <= CONVEX_MAX_RSI,
            "drawdown_180d_convex_clear": context["drawdown_180d_pct"] <= CONVEX_MAX_DRAWDOWN_180D_PCT,
            "momentum_30d_clear": context["momentum_30d_pct"] >= CONVEX_MIN_MOMENTUM_30D_PCT,
            "trailing_stop_clear": not trailing_exit,
            "trend_break_clear": not trend_exit,
            "crash_guard_clear": not crash_exit,
        },
        "reasons": build_reasons(context, entry_trigger=base_entry, convex_regime=convex_regime, exit_reason=exit_reason),
    }


def indicator_context(rows: list[dict[str, Any]], index: int, *, trade_peak_close: float | None = None) -> dict[str, Any]:
    close = row_close(rows[index])
    sma50 = simple_moving_average(rows, index, FAST_SMA_DAYS)
    sma150 = simple_moving_average(rows, index, SLOW_SMA_DAYS)
    rsi14 = calculate_rsi(rows, index, RSI_PERIOD_DAYS)
    high180 = trailing_high_close(rows, index, TRAILING_HIGH_DAYS)
    drawdown_180d_pct = 0.0 if high180 <= 0 else max(0.0, ((high180 - close) / high180) * 100.0)
    momentum_30d_pct = calculate_momentum(rows, index, MOMENTUM_DAYS)
    peak = max(close, float(trade_peak_close or close))
    trade_drawdown_pct = 0.0 if peak <= 0 else max(0.0, ((peak - close) / peak) * 100.0)
    return {
        "date": str(rows[index].get("date") or rows[index].get("timestamp") or ""),
        "close": round(close, 8),
        "sma50": round(sma50, 8) if sma50 is not None else None,
        "sma150": round(sma150, 8) if sma150 is not None else None,
        "rsi14": round(rsi14, 4),
        "momentum_30d_pct": round(momentum_30d_pct, 4),
        "trailing_high_180d": round(high180, 8),
        "drawdown_180d_pct": round(drawdown_180d_pct, 4),
        "trade_peak_close": round(peak, 8),
        "trade_drawdown_pct": round(trade_drawdown_pct, 4),
        "has_required_history": sma50 is not None and sma150 is not None,
    }


def build_reasons(context: dict[str, Any], *, entry_trigger: bool, convex_regime: bool, exit_reason: str | None) -> list[str]:
    if exit_reason == "trailing_stop":
        return [f"Close is {context['trade_drawdown_pct']:.2f}% below trade peak."]
    if exit_reason == "trend_break":
        return ["Close broke the slow trend band while SMA50 is below SMA150."]
    if exit_reason == "crash_guard":
        return [f"BTC is {context['drawdown_180d_pct']:.2f}% below the 180d high with weak RSI."]
    if convex_regime:
        return ["BTC is in a clean convex cycle uptrend; target exposure is 25% of equity."]
    if entry_trigger:
        return ["BTC is in a base cycle uptrend; target exposure is 12% of equity."]
    return ["No convex cycle trend entry or exit trigger."]


def simple_moving_average(rows: list[dict[str, Any]], index: int, window: int) -> float | None:
    if index + 1 < window:
        return None
    return sum(row_close(row) for row in rows[index - window + 1 : index + 1]) / window


def trailing_high_close(rows: list[dict[str, Any]], index: int, window: int) -> float:
    start = max(0, index - window + 1)
    return max(row_close(row) for row in rows[start : index + 1])


def calculate_momentum(rows: list[dict[str, Any]], index: int, window: int) -> float:
    if index < window:
        return 0.0
    previous = row_close(rows[index - window])
    if previous <= 0:
        return 0.0
    return ((row_close(rows[index]) - previous) / previous) * 100.0


def calculate_rsi(rows: list[dict[str, Any]], index: int, period: int = RSI_PERIOD_DAYS) -> float:
    if index <= 0 or index < period:
        return 50.0
    gains = 0.0
    losses = 0.0
    for item_index in range(index - period + 1, index + 1):
        delta = row_close(rows[item_index]) - row_close(rows[item_index - 1])
        if delta >= 0:
            gains += delta
        else:
            losses -= delta
    if losses == 0:
        return 100.0
    relative_strength = gains / losses
    return 100.0 - (100.0 / (1.0 + relative_strength))


def row_close(row: dict[str, Any]) -> float:
    value = row.get("close", row.get("price"))
    if value is None:
        raise ValueError("BTC convex cycle rows require close or price.")
    return float(value)
