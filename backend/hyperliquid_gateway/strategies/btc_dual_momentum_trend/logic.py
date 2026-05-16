"""Deterministic BTC daily Dual Momentum Trend logic."""

from __future__ import annotations

import math
from typing import Any

STRATEGY_ID = "btc_dual_momentum_trend"
SYMBOL = "BTC"

SMA_FAST_DAYS = 50
SMA_SLOW_DAYS = 200
ROC_FAST_DAYS = 20
ROC_SLOW_DAYS = 90
ATR_PERIOD = 14
ATR_PERCENTILE_DAYS = 252
ATR_STOP_MULTIPLIER = 4.0
MAX_VOL_PERCENTILE = 85.0
MIN_ENTRY_RSI = 40.0
MIN_ROC_FAST_PCT = -2.0
TIMESTOP_DAYS = 200
MOMENTUM_BONUS_THRESHOLD = 2.0


def evaluate_signal(
    rows: list[dict[str, Any]],
    index: int,
    *,
    in_position: bool = False,
    trade_peak_close: float | None = None,
    trade_entry_idx: int | None = None,
) -> dict[str, Any]:
    if index < 0 or index >= len(rows):
        raise IndexError("index is outside the BTC daily history window")

    ctx = indicator_context(
        rows, index,
        trade_peak_close=trade_peak_close,
        trade_entry_idx=trade_entry_idx,
    )
    if not ctx["has_required_history"]:
        return {
            **ctx,
            "strategy_id": STRATEGY_ID,
            "symbol": SYMBOL,
            "signal": "hold" if in_position else "none",
            "entry_trigger": False,
            "exit_trigger": False,
            "exit_reason": None,
            "vol_regime": "unknown",
            "momentum_accelerating": False,
            "target_exposure_fraction": 0.0,
            "momentum_bonus_active": False,
            "reasons": ["Waiting for enough daily history to compute SMA200 and ATR."],
        }

    close = ctx["close"]
    sma200 = ctx["sma200"]
    sma50 = ctx["sma50"]
    atr_pct = ctx["atr_percentile"]
    roc_fast = ctx["roc_fast_pct"]
    roc_slow = ctx["roc_slow_pct"]

    vol_regime = "extreme" if atr_pct >= MAX_VOL_PERCENTILE else "elevated" if atr_pct >= 70 else "normal" if atr_pct >= 30 else "low"
    momentum_accelerating = roc_fast > roc_slow
    momentum_bonus = bool(momentum_accelerating and roc_slow > 0 and roc_fast > MOMENTUM_BONUS_THRESHOLD * max(0.01, roc_slow))

    safe_entry = (
        not in_position
        and close > sma200
        and sma50 > sma200
        and ctx["rsi14"] > MIN_ENTRY_RSI
        and atr_pct < MAX_VOL_PERCENTILE
        and momentum_accelerating
        and roc_fast > MIN_ROC_FAST_PCT
    )
    entry_trigger = bool(safe_entry)

    atr_stop_dist_pct = atr_stop_pct(ctx["atr"], close)
    momentum_divergence = bool(in_position and roc_fast < 0 and roc_fast < roc_slow)
    trailing_exit = bool(in_position and ctx["trade_drawdown_pct"] >= atr_stop_dist_pct)
    trend_exit = bool(in_position and close < sma200 and sma50 < sma200)
    time_exit = bool(in_position and ctx["days_in_trade"] >= TIMESTOP_DAYS)

    exit_reason = None
    if momentum_divergence:
        exit_reason = "momentum_divergence"
    elif trailing_exit:
        exit_reason = "atr_trailing_stop"
    elif trend_exit:
        exit_reason = "trend_break"
    elif time_exit:
        exit_reason = "time_stop"

    signal = "hold"
    if entry_trigger:
        signal = "long"
    elif in_position and exit_reason:
        signal = "exit"
    elif not in_position:
        signal = "none"

    risk_pct = target_risk_pct(atr_pct)
    if momentum_bonus:
        risk_pct = risk_pct * 1.3
    max_lev = max_exposure_fraction(atr_pct)

    result = {
        **ctx,
        "strategy_id": STRATEGY_ID,
        "symbol": SYMBOL,
        "signal": signal,
        "entry_trigger": entry_trigger,
        "exit_trigger": exit_reason is not None,
        "exit_reason": exit_reason,
        "vol_regime": vol_regime,
        "momentum_accelerating": momentum_accelerating,
        "momentum_bonus_active": momentum_bonus,
        "atr_stop_distance_pct": round(atr_stop_dist_pct, 4),
        "target_risk_pct": round(risk_pct, 4),
        "max_exposure_fraction": round(max_lev, 4),
        "target_exposure_fraction": round(max_lev if entry_trigger else 0.0, 4),
        "target_position_size_pct": round(
            (risk_pct / atr_stop_dist_pct * 100.0) if atr_stop_dist_pct > 0 else 0.0,
            4,
        ),
        "filters_passed": {
            "close_above_sma200": close > sma200,
            "sma50_above_sma200": sma50 > sma200,
            "rsi_above_floor": ctx["rsi14"] > MIN_ENTRY_RSI,
            "vol_not_extreme": atr_pct < MAX_VOL_PERCENTILE,
            "momentum_accelerating": momentum_accelerating,
            "roc_fast_above_floor": roc_fast > MIN_ROC_FAST_PCT,
            "momentum_divergence_clear": not momentum_divergence,
            "atr_trailing_stop_clear": not trailing_exit,
            "trend_break_clear": not trend_exit,
            "time_stop_clear": not time_exit,
        },
    }
    result["reasons"] = build_reasons(result, entry_trigger=entry_trigger, exit_reason=exit_reason, vol_regime=vol_regime, momentum_accelerating=momentum_accelerating, momentum_bonus=momentum_bonus)
    return result


def atr_stop_pct(atr: float | None, close: float) -> float:
    if atr is None or close <= 0:
        return 0.0
    return round((ATR_STOP_MULTIPLIER * atr) / close * 100.0, 4)


def target_risk_pct(atr_percentile: float) -> float:
    if atr_percentile >= 80:
        return 0.6
    if atr_percentile >= 65:
        return 1.2
    if atr_percentile >= 45:
        return 1.5
    if atr_percentile >= 25:
        return 1.8
    return 2.2


def max_exposure_fraction(atr_percentile: float) -> float:
    if atr_percentile >= 80:
        return 0.07
    if atr_percentile >= 65:
        return 0.14
    if atr_percentile >= 45:
        return 0.20
    if atr_percentile >= 25:
        return 0.24
    return 0.28


def indicator_context(
    rows: list[dict[str, Any]],
    index: int,
    *,
    trade_peak_close: float | None = None,
    trade_entry_idx: int | None = None,
) -> dict[str, Any]:
    close = row_close(rows[index])
    sma50 = simple_moving_average(rows, index, SMA_FAST_DAYS)
    sma200 = simple_moving_average(rows, index, SMA_SLOW_DAYS)
    rsi14 = calculate_rsi(rows, index)
    atr = average_true_range(rows, index, ATR_PERIOD)
    atr_percentile = atr_percentile_rank(rows, index, atr, ATR_PERCENTILE_DAYS)
    roc_fast = rate_of_change(rows, index, ROC_FAST_DAYS)
    roc_slow = rate_of_change(rows, index, ROC_SLOW_DAYS)
    high180 = trailing_high_close(rows, index, 180)
    drawdown_180d_pct = 0.0 if high180 <= 0 else max(0.0, ((high180 - close) / high180) * 100.0)
    peak = max(close, float(trade_peak_close or close))
    trade_drawdown_pct = 0.0 if peak <= 0 else max(0.0, ((peak - close) / peak) * 100.0)
    days_in_trade = 0
    if trade_entry_idx is not None:
        days_in_trade = max(0, index - trade_entry_idx)
    return {
        "date": str(rows[index].get("date") or rows[index].get("timestamp") or ""),
        "close": round(close, 8),
        "sma50": round(sma50, 8) if sma50 is not None else None,
        "sma200": round(sma200, 8) if sma200 is not None else None,
        "rsi14": round(rsi14, 4),
        "atr": round(atr, 8) if atr is not None else None,
        "atr_percentile": round(atr_percentile, 4),
        "roc_fast_pct": round(roc_fast, 4),
        "roc_slow_pct": round(roc_slow, 4),
        "trailing_high_180d": round(high180, 8),
        "drawdown_180d_pct": round(drawdown_180d_pct, 4),
        "trade_peak_close": round(peak, 8),
        "trade_drawdown_pct": round(trade_drawdown_pct, 4),
        "days_in_trade": days_in_trade,
        "has_required_history": sma50 is not None and sma200 is not None and atr is not None,
    }


def build_reasons(
    context: dict[str, Any],
    *,
    entry_trigger: bool,
    exit_reason: str | None,
    vol_regime: str,
    momentum_accelerating: bool,
    momentum_bonus: bool,
) -> list[str]:
    if exit_reason == "momentum_divergence":
        return [
            f"ROC20 ({context['roc_fast_pct']:.2f}%) turned negative while below ROC90 "
            f"({context['roc_slow_pct']:.2f}%). Momentum divergence exit."
        ]
    if exit_reason == "atr_trailing_stop":
        return [f"Close is {context['trade_drawdown_pct']:.2f}% below trade peak (ATR stop: {context['atr_stop_distance_pct']:.2f}%)."]
    if exit_reason == "trend_break":
        return ["Close broke SMA200 with SMA50 below SMA200."]
    if exit_reason == "time_stop":
        return [f"Position held {context['days_in_trade']} days (max {TIMESTOP_DAYS})."]
    if entry_trigger:
        bonus_msg = " Momentum bonus active (1.3x risk)." if momentum_bonus else ""
        return [
            f"Momentum accelerating: ROC20 ({context['roc_fast_pct']:.2f}%) > ROC90 ({context['roc_slow_pct']:.2f}%). "
            f"Vol={vol_regime}, ATR stop={context.get('atr_stop_distance_pct', 0):.2f}%, "
            f"target size={context.get('target_position_size_pct', 0):.2f}%.{bonus_msg}"
        ]
    if vol_regime == "extreme":
        return [f"Vol regime extreme (ATR percentile {context['atr_percentile']:.0f}%). No entry."]
    if not momentum_accelerating:
        return [
            f"Momentum NOT accelerating: ROC20 ({context['roc_fast_pct']:.2f}%) <= ROC90 "
            f"({context['roc_slow_pct']:.2f}%). Waiting for acceleration."
        ]
    return [f"No entry trigger. ROC20={context['roc_fast_pct']:.2f}%, ROC90={context['roc_slow_pct']:.2f}%, vol={vol_regime}."]


def rate_of_change(rows: list[dict[str, Any]], index: int, window: int) -> float:
    if index < window:
        return 0.0
    previous = row_close(rows[index - window])
    if previous <= 0:
        return 0.0
    return ((row_close(rows[index]) - previous) / previous) * 100.0


def simple_moving_average(rows: list[dict[str, Any]], index: int, window: int) -> float | None:
    if index + 1 < window:
        return None
    return sum(row_close(row) for row in rows[index - window + 1 : index + 1]) / window


def trailing_high_close(rows: list[dict[str, Any]], index: int, window: int) -> float:
    start = max(0, index - window + 1)
    return max(row_close(row) for row in rows[start : index + 1])


def average_true_range(rows: list[dict[str, Any]], index: int, period: int) -> float | None:
    if index < 1 or index + 1 < period + 1:
        return None
    tr_values: list[float] = []
    for i in range(index - period + 1, index + 1):
        high = float(rows[i].get("high") or rows[i].get("close"))
        low = float(rows[i].get("low") or rows[i].get("close"))
        prev_close = float(rows[i - 1].get("close") or rows[i - 1].get("price"))
        tr = max(high - low, abs(high - prev_close), abs(low - prev_close))
        tr_values.append(tr)
    if not tr_values:
        return None
    return sum(tr_values) / len(tr_values)


def atr_percentile_rank(rows: list[dict[str, Any]], index: int, current_atr: float | None, lookback: int) -> float:
    if current_atr is None or current_atr <= 0 or index < 1:
        return 50.0
    start = max(1, index - lookback + 1)
    hist_atr_values: list[float] = []
    for i in range(start, index + 1):
        atr_val = average_true_range(rows, i, ATR_PERIOD)
        if atr_val is not None and atr_val > 0:
            hist_atr_values.append(atr_val)
    if not hist_atr_values:
        return 50.0
    count_below = sum(1 for v in hist_atr_values if v <= current_atr)
    return (count_below / len(hist_atr_values)) * 100.0


def calculate_rsi(rows: list[dict[str, Any]], index: int, period: int = 14) -> float:
    if index <= 0 or index < period:
        return 50.0
    gains = 0.0
    losses = 0.0
    for i in range(index - period + 1, index + 1):
        delta = row_close(rows[i]) - row_close(rows[i - 1])
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
        raise ValueError("BTC Dual Momentum Trend rows require close or price.")
    return float(value)
