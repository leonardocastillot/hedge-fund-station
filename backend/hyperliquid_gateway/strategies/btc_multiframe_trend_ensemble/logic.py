from __future__ import annotations

from typing import Any

STRATEGY_ID = "btc_multiframe_trend_ensemble"
SYMBOL = "BTC"

ATR_PERIOD = 14
ATR_PERCENTILE_LOOKBACK = 252
TIMESTOP_DAYS = 250

MA_PAIRS = [(20, 50), (50, 100), (100, 200)]
SLOPE_LOOKBACK = 5


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
            "target_exposure_fraction": 0.0,
            "reasons": ["Waiting for enough daily history."],
        }

    close = ctx["close"]
    atr = ctx["atr"]
    atr_pct = ctx["atr_percentile"]
    days_in = ctx["days_in_trade"]
    trend_score = ctx["trend_score"]
    ma20 = ctx["ma20"]
    ma50 = ctx["ma50"]
    vol_regime = ctx["vol_regime"]

    entry_trigger = False
    if not in_position and trend_score >= 2:
        rsi_ok = 40 <= ctx["rsi14"] <= 75
        vol_ok = atr_pct < 85
        pullback = bool(ma20 is not None and ma50 is not None and ma20 < close < ma50 and ctx["rsi14"] < 58)
        slope = ma_slope(rows, index, 20, SLOPE_LOOKBACK)
        momentum = bool(close > (ma20 or 0) and (slope or 0) > 0.001 and ctx["rsi14"] >= 48)
        entry_trigger = bool(rsi_ok and vol_ok and (pullback or momentum))

    trail_mult = 2.0 + atr_pct * 0.035
    atr_stop_dist_pct = atr_stop_pct(atr, close, trail_mult) if atr and close > 0 else 0.0
    trailing_exit = bool(in_position and ctx["trade_drawdown_pct"] >= atr_stop_dist_pct)
    structure_exit = bool(
        in_position
        and days_in >= 5
        and trend_score <= 0
        and close < (ma50 or 0)
    )
    time_exit = bool(in_position and days_in >= TIMESTOP_DAYS)
    exit_reason = None
    if trailing_exit:
        exit_reason = "atr_trailing_stop"
    elif structure_exit:
        exit_reason = "structure_break"
    elif time_exit:
        exit_reason = "time_stop"

    signal = "hold"
    if entry_trigger:
        signal = "long"
    elif in_position and exit_reason:
        signal = "exit"
    elif not in_position:
        signal = "none"

    risk_pct = smooth_risk_pct(atr_pct, trend_score)
    max_lev = smooth_exposure_fraction(atr_pct, trend_score)

    result = {
        **ctx,
        "strategy_id": STRATEGY_ID,
        "symbol": SYMBOL,
        "signal": signal,
        "entry_trigger": entry_trigger,
        "exit_trigger": exit_reason is not None,
        "exit_reason": exit_reason,
        "vol_regime": vol_regime,
        "trail_multiplier": round(trail_mult, 2),
        "atr_stop_distance_pct": round(atr_stop_dist_pct, 4),
        "target_risk_pct": round(risk_pct, 4),
        "max_exposure_fraction": round(max_lev, 4),
        "target_exposure_fraction": round(max_lev if entry_trigger else 0.0, 4),
        "target_position_size_pct": round(
            (risk_pct / atr_stop_dist_pct * 100.0) if atr_stop_dist_pct > 0 else 0.0,
            4,
        ),
        "filters_passed": {
            "trend_score_above_2": trend_score >= 2,
            "rsi_in_range": 40 <= ctx["rsi14"] <= 75,
            "vol_not_extreme": atr_pct < 85,
            "pullback_entry": bool(ma20 is not None and ma50 is not None and ma20 < close < ma50 and ctx["rsi14"] < 58),
            "momentum_entry": bool(close > (ma20 or 0) and (ma_slope(rows, index, 20, SLOPE_LOOKBACK) or 0) > 0.001 and ctx["rsi14"] >= 48),
            "atr_trailing_stop_clear": not trailing_exit,
            "structure_break_clear": not structure_exit,
            "time_stop_clear": not time_exit,
        },
    }
    result["reasons"] = build_reasons(result, entry_trigger, exit_reason, vol_regime, trend_score, days_in)
    return result


def ma_slope(rows: list[dict[str, Any]], index: int, period: int, lookback: int) -> float | None:
    if index < lookback:
        return None
    current = simple_moving_average(rows, index, period)
    prev = simple_moving_average(rows, index - lookback, period)
    if current is None or prev is None or prev == 0:
        return None
    return (current - prev) / prev


def atr_stop_pct(atr: float, close: float, multiplier: float) -> float:
    if close <= 0:
        return 0.0
    return round((multiplier * atr) / close * 100.0, 4)


def smooth_risk_pct(atr_percentile: float, trend_score: int) -> float:
    base = 2.2 * (1.0 - atr_percentile / 100.0 * 0.7)
    conv = 0.8 + (trend_score - 2) * 0.2
    return max(0.3, min(2.5, base * conv))


def smooth_exposure_fraction(atr_percentile: float, trend_score: int) -> float:
    base = 0.28 * (1.0 - atr_percentile / 100.0 * 0.65)
    conv = 0.8 + (trend_score - 2) * 0.15
    return max(0.03, min(0.30, base * conv))


def compute_trend_score(
    rows: list[dict[str, Any]],
    index: int,
    close: float,
    ma20: float | None,
    ma50: float | None,
    ma100: float | None,
    ma200: float | None,
) -> int:
    score = 0
    if ma20 is not None and ma50 is not None:
        slope20 = ma_slope(rows, index, 20, SLOPE_LOOKBACK)
        if ma20 > ma50 and (slope20 or 0) > 0:
            score += 1
    if ma50 is not None and ma100 is not None:
        slope50 = ma_slope(rows, index, 50, SLOPE_LOOKBACK)
        if ma50 > ma100 and (slope50 or 0) > 0:
            score += 1
    if ma100 is not None and ma200 is not None:
        slope100 = ma_slope(rows, index, 100, SLOPE_LOOKBACK)
        if ma100 > ma200 and (slope100 or 0) > 0:
            score += 1
    if close > (ma200 or float("inf")):
        score += 1
    return score


def indicator_context(
    rows: list[dict[str, Any]],
    index: int,
    *,
    trade_peak_close: float | None = None,
    trade_entry_idx: int | None = None,
) -> dict[str, Any]:
    close = row_close(rows[index])
    ma20 = simple_moving_average(rows, index, 20)
    ma50 = simple_moving_average(rows, index, 50)
    ma100 = simple_moving_average(rows, index, 100)
    ma200 = simple_moving_average(rows, index, 200)
    rsi14 = calculate_rsi(rows, index)
    atr = average_true_range(rows, index, ATR_PERIOD)
    atr_percentile = atr_percentile_rank(rows, index, atr, ATR_PERCENTILE_LOOKBACK)

    trend_score = compute_trend_score(rows, index, close, ma20, ma50, ma100, ma200)

    high180 = trailing_high_close(rows, index, 180)
    drawdown_180d_pct = 0.0 if high180 <= 0 else max(0.0, ((high180 - close) / high180) * 100.0)
    peak = max(close, float(trade_peak_close or close))
    trade_drawdown_pct = 0.0 if peak <= 0 else max(0.0, ((peak - close) / peak) * 100.0)
    days_in_trade = 0
    if trade_entry_idx is not None:
        days_in_trade = max(0, index - trade_entry_idx)

    vol_regime = (
        "extreme" if atr_percentile >= 85 else
        "elevated" if atr_percentile >= 70 else
        "normal" if atr_percentile >= 30 else
        "low"
    )

    return {
        "date": str(rows[index].get("date") or rows[index].get("timestamp") or ""),
        "close": round(close, 8),
        "ma20": round(ma20, 8) if ma20 is not None else None,
        "ma50": round(ma50, 8) if ma50 is not None else None,
        "ma100": round(ma100, 8) if ma100 is not None else None,
        "ma200": round(ma200, 8) if ma200 is not None else None,
        "trend_score": trend_score,
        "rsi14": round(rsi14, 4),
        "atr": round(atr, 8) if atr is not None else None,
        "atr_percentile": round(atr_percentile, 4),
        "trailing_high_180d": round(high180, 8),
        "drawdown_180d_pct": round(drawdown_180d_pct, 4),
        "trade_peak_close": round(peak, 8),
        "trade_drawdown_pct": round(trade_drawdown_pct, 4),
        "days_in_trade": days_in_trade,
        "vol_regime": vol_regime,
        "has_required_history": (
            ma20 is not None
            and ma50 is not None
            and ma100 is not None
            and ma200 is not None
            and atr is not None
        ),
    }


def build_reasons(
    context: dict[str, Any],
    entry_trigger: bool,
    exit_reason: str | None,
    vol_regime: str,
    trend_score: int,
    days_in: int,
) -> list[str]:
    if exit_reason == "atr_trailing_stop":
        return [
            f"Trailing stop hit: {context['trade_drawdown_pct']:.2f}% below peak "
            f"(trail: {context.get('trail_multiplier', 0):.1f}x, "
            f"stop dist: {context.get('atr_stop_distance_pct', 0):.2f}%)."
        ]
    if exit_reason == "structure_break":
        return [
            f"Trend structure broken. Trend score dropped to {trend_score}/4 "
            f"(below MA50, consensus collapsed)."
        ]
    if exit_reason == "time_stop":
        return [f"Position held {days_in} days (max {TIMESTOP_DAYS})."]
    if entry_trigger:
        return [
            f"Entry triggered. Trend score: {trend_score}/4, "
            f"vol: {vol_regime}, trail: {context.get('trail_multiplier', 0):.1f}x ATR, "
            f"target size: {context.get('target_position_size_pct', 0):.2f}%."
        ]
    return [
        f"No entry. Trend score: {trend_score}/4, vol: {vol_regime}, "
        f"RSI: {context.get('rsi14', 50):.1f}."
    ]


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
        raise ValueError("BTC multi-frame rows require close or price.")
    return float(value)
