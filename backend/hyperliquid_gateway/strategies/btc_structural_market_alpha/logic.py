from __future__ import annotations

from typing import Any

STRATEGY_ID = "btc_structural_market_alpha"
SYMBOL = "BTC"

ATR_PERIOD = 14
ATR_PERCENTILE_DAYS = 252
TIMESTOP_DAYS = 200


def evaluate_signal(
    rows: list[dict[str, Any]],
    index: int,
    *,
    in_position: bool = False,
    trade_peak_close: float | None = None,
    trade_entry_idx: int | None = None,
) -> dict[str, Any]:
    if index < 0 or index >= len(rows):
        raise IndexError("index outside BTC daily history window")

    ctx = indicator_context(rows, index, trade_peak_close=trade_peak_close, trade_entry_idx=trade_entry_idx)
    if not ctx["has_required_history"]:
        return {**ctx, "strategy_id": STRATEGY_ID, "symbol": SYMBOL, "signal": "hold" if in_position else "none",
                "entry_trigger": False, "exit_trigger": False, "exit_reason": None, "vol_regime": "unknown",
                "target_exposure_fraction": 0.0, "reasons": ["Waiting for enough daily history."]}

    close = ctx["close"]
    atr = ctx["atr"]
    atr_pct = ctx["atr_percentile"]
    days_in = ctx["days_in_trade"]

    vol_score = compute_volatility_cycle_score(atr_pct, ctx["atr_trend"])
    volume_score = compute_volume_structure_score(rows, index, close)
    momentum_score = compute_momentum_quality_score(rows, index, close)
    phase_score = compute_market_phase_score(ctx["drawdown_180d_pct"], ctx["ath_distance_pct"])

    scores = [vol_score, volume_score, momentum_score, phase_score]
    dominant = max(scores, key=abs)
    agreement = sum(1 for s in scores if abs(s) > 20)
    composite = abs(dominant) * (0.5 + agreement * 0.12)
    if sum(1 for s in scores if s > 0) >= 3:
        composite *= 1.15
    elif sum(1 for s in scores if s < 0) >= 3:
        composite *= -1.15
    else:
        composite = composite if dominant > 0 else -composite

    sma50 = ctx["sma50"]
    sma200 = ctx["sma200"]
    rsi14 = ctx["rsi14"]

    trend_bull = bool(close > (sma200 or float("inf")) and (sma50 or 0) > (sma200 or float("inf")))
    entry_trigger = False
    if not in_position and trend_bull and composite >= 45:
        rsi_window = 40 <= rsi14 <= 72
        vol_window = atr_pct < 83
        pullback = bool(close < (sma50 or 0) * 1.02 and close > (sma50 or 0) * 0.95 and rsi14 < 58)
        momentum = bool(close > (sma50 or 0) and rsi14 >= 48)
        entry_trigger = bool(rsi_window and vol_window and (pullback or momentum))

    trail_mult = 2.5 + atr_pct * 0.03
    atr_stop_dist_pct = atr_stop_pct(atr, close, trail_mult) if atr and close > 0 else 0.0
    trailing_exit = bool(in_position and ctx["trade_drawdown_pct"] >= atr_stop_dist_pct)
    trend_exit = bool(in_position and not trend_bull)
    time_exit = bool(in_position and days_in >= TIMESTOP_DAYS)
    exit_reason = None
    if trailing_exit:
        exit_reason = "atr_trailing"
    elif trend_exit:
        exit_reason = "trend_broken"
    elif time_exit:
        exit_reason = "time_stop"

    signal = "hold"
    if entry_trigger:
        signal = "long"
    elif in_position and exit_reason:
        signal = "exit"
    elif not in_position:
        signal = "none"

    risk_pct = smooth_risk_pct(atr_pct, composite)
    max_frac = smooth_exposure_fraction(atr_pct, composite)

    return {
        **ctx,
        "strategy_id": STRATEGY_ID,
        "symbol": SYMBOL,
        "signal": signal,
        "entry_trigger": entry_trigger,
        "exit_trigger": exit_reason is not None,
        "exit_reason": exit_reason,
        "vol_regime": ctx["vol_regime"],
        "composite_score": round(composite, 2),
        "component_scores": {
            "volatility": round(vol_score, 2),
            "volume_structure": round(volume_score, 2),
            "momentum_quality": round(momentum_score, 2),
            "market_phase": round(phase_score, 2),
        },
        "trail_multiplier": round(trail_mult, 2),
        "atr_stop_distance_pct": round(atr_stop_dist_pct, 4),
        "target_risk_pct": round(risk_pct, 4),
        "max_exposure_fraction": round(max_frac, 4),
        "target_exposure_fraction": round(max_frac if entry_trigger else 0.0, 4),
        "target_position_size_pct": round((risk_pct / atr_stop_dist_pct * 100.0) if atr_stop_dist_pct > 0 else 0.0, 4),
        "filters_passed": {
            "trend_bull": trend_bull,
            "composite_above_45": composite >= 45,
            "rsi_in_window": 40 <= rsi14 <= 72,
            "vol_not_extreme": atr_pct < 83,
            "pullback_entry": bool(not in_position and trend_bull and close < (ctx.get("sma50") or 0) * 1.02 and close > (ctx.get("sma50") or 0) * 0.95 and rsi14 < 58),
            "momentum_entry": bool(not in_position and trend_bull and close > (ctx.get("sma50") or 0) and rsi14 >= 48),
        },
        "reasons": build_reasons(composite, vol_score, volume_score, momentum_score, phase_score, ctx["vol_regime"], agreement, entry_trigger, exit_reason, days_in),
    }


def atr_stop_pct(atr: float, close: float, multiplier: float) -> float:
    return round((multiplier * atr) / close * 100.0, 4) if close > 0 else 0.0


def smooth_risk_pct(atr_percentile: float, composite: float) -> float:
    base = 2.0 * (1.0 - atr_percentile / 100.0 * 0.6)
    conv = 0.8 + max(0, composite - 30) * 0.005
    return max(0.3, min(2.5, base * conv))


def smooth_exposure_fraction(atr_percentile: float, composite: float) -> float:
    base = 0.25 * (1.0 - atr_percentile / 100.0 * 0.6)
    conv = 0.8 + max(0, composite - 30) * 0.004
    return max(0.03, min(0.28, base * conv))


def compute_volatility_cycle_score(atr_pct: float, atr_trend: float) -> float:
    score = 0.0
    if atr_pct < 25:
        score += 50.0
    elif atr_pct < 40:
        score += 25.0
    elif atr_pct > 75:
        score -= 30.0
    elif atr_pct > 60:
        score -= 15.0
    if atr_trend < -0.05:
        score += 20.0
    elif atr_trend > 0.05:
        score -= 15.0
    return max(-100.0, min(100.0, score))


def compute_volume_structure_score(rows: list[dict[str, Any]], index: int, close: float) -> float:
    vol = row_volume(rows[index])
    vol_ma50 = simple_moving_average_volume(rows, index, 50)
    if vol_ma50 is None or vol_ma50 <= 0:
        return 0.0
    vol_ratio = vol / vol_ma50
    vol_ma10 = simple_moving_average_volume(rows, index, 10)
    vol_trend = ((vol_ma10 or vol) - vol_ma50) / vol_ma50 if vol_ma10 else 0.0
    score = 0.0
    if vol_ratio < 0.6:
        score += 40.0
    elif vol_ratio > 2.0:
        score -= 25.0
    if -0.1 < vol_trend < 0.1:
        score += 15.0
    elif vol_trend > 0.3:
        score -= 10.0
    return max(-50.0, min(80.0, score))


def compute_momentum_quality_score(rows: list[dict[str, Any]], index: int, close: float) -> float:
    roc_10 = rate_of_change(rows, index, 10)
    roc_21 = rate_of_change(rows, index, 21)
    roc_63 = rate_of_change(rows, index, 63)
    if roc_10 is None or roc_21 is None or roc_63 is None:
        return 0.0
    short_ok = roc_10 > 0
    med_ok = roc_21 > 0
    long_ok = roc_63 > 0
    aligned = sum([short_ok, med_ok, long_ok])
    if aligned >= 2:
        base = 35.0
        if roc_10 > roc_21:
            base += 15.0
        if roc_21 > roc_63:
            base += 10.0
        return min(100.0, base + roc_10 * 2.0)
    return max(-60.0, -30.0 + roc_10 * 3.0 if roc_10 else -30.0)


def compute_market_phase_score(drawdown_pct: float, ath_distance_pct: float) -> float:
    score = 0.0
    if drawdown_pct > 30:
        score += 40.0
    elif drawdown_pct > 15:
        score += 20.0
    if ath_distance_pct < 5:
        score += 10.0
    elif ath_distance_pct > 40:
        score += 20.0
    if drawdown_pct < 5 and ath_distance_pct < 10:
        score += 15.0
    return min(80.0, score)


def indicator_context(rows: list[dict[str, Any]], index: int, *, trade_peak_close: float | None = None, trade_entry_idx: int | None = None) -> dict[str, Any]:
    close = row_close(rows[index])
    sma50 = simple_moving_average(rows, index, 50)
    sma200 = simple_moving_average(rows, index, 200)
    rsi14 = calculate_rsi(rows, index)
    atr = average_true_range(rows, index, ATR_PERIOD)
    atr_pct = atr_percentile_rank(rows, index, atr, ATR_PERCENTILE_DAYS)
    atr_10d = average_true_range(rows, index, 10)
    atr_trend = ((atr_10d or 0) - (atr or 0)) / (atr or 1)
    high180 = trailing_high_close(rows, index, 180)
    drawdown_pct = 0.0 if high180 <= 0 else max(0.0, ((high180 - close) / high180) * 100.0)
    ath = trailing_high_close(rows, index, index + 1)
    ath_distance = 0.0 if ath <= 0 else ((ath - close) / ath) * 100.0
    peak = max(close, float(trade_peak_close or close))
    trade_drawdown = 0.0 if peak <= 0 else max(0.0, ((peak - close) / peak) * 100.0)
    days_in = 0
    if trade_entry_idx is not None:
        days_in = max(0, index - trade_entry_idx)

    vol_regime = "extreme" if atr_pct >= 83 else "elevated" if atr_pct >= 70 else "normal" if atr_pct >= 30 else "low"

    return {
        "date": str(rows[index].get("date") or rows[index].get("timestamp") or ""),
        "close": round(close, 8),
        "sma50": round(sma50, 8) if sma50 is not None else None,
        "sma200": round(sma200, 8) if sma200 is not None else None,
        "rsi14": round(rsi14, 4),
        "atr": round(atr, 8) if atr is not None else None,
        "atr_percentile": round(atr_pct, 4),
        "atr_trend": round(atr_trend, 6),
        "trailing_high_180d": round(high180, 8),
        "drawdown_180d_pct": round(drawdown_pct, 4),
        "ath_distance_pct": round(ath_distance, 4),
        "trade_peak_close": round(peak, 8),
        "trade_drawdown_pct": round(trade_drawdown, 4),
        "days_in_trade": days_in,
        "vol_regime": vol_regime,
        "has_required_history": sma50 is not None and sma200 is not None and atr is not None,
    }


def build_reasons(composite: float, vol_score: float, volume_score: float, momentum_score: float, phase_score: float, vol_regime: str, agreement: int, entry_trigger: bool, exit_reason: str | None, days_in: int) -> list[str]:
    parts = []
    if exit_reason == "atr_trailing":
        parts.append(f"ATR trailing stop hit at day {days_in}")
    elif exit_reason == "trend_broken":
        parts.append(f"Trend structure broken (close < SMA200 or SMA50 < SMA200)")
    elif exit_reason == "time_stop":
        parts.append(f"Time stop at {days_in} days")
    elif entry_trigger:
        parts.append(f"Entry: composite={composite:.0f} agreement={agreement}/4 vol={vol_regime}")
    else:
        parts.append(f"No entry: composite={composite:.0f} agreement={agreement}/4")
    parts.append(f"V:{vol_score:.0f} Vol:{volume_score:.0f} M:{momentum_score:.0f} P:{phase_score:.0f}")
    return parts


def simple_moving_average(rows: list[dict[str, Any]], index: int, window: int) -> float | None:
    if index + 1 < window:
        return None
    return sum(row_close(row) for row in rows[index - window + 1 : index + 1]) / window


def simple_moving_average_volume(rows: list[dict[str, Any]], index: int, window: int) -> float | None:
    if index + 1 < window:
        return None
    return sum(row_volume(row) for row in rows[index - window + 1 : index + 1]) / window


def rate_of_change(rows: list[dict[str, Any]], index: int, period: int) -> float | None:
    if index < period:
        return None
    now = row_close(rows[index])
    prev = row_close(rows[index - period])
    return ((now - prev) / prev) * 100.0 if prev else 0.0


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
    return sum(tr_values) / len(tr_values)


def atr_percentile_rank(rows: list[dict[str, Any]], index: int, current_atr: float | None, lookback: int) -> float:
    if current_atr is None or current_atr <= 0 or index < 1:
        return 50.0
    start = max(1, index - lookback + 1)
    hist = []
    for i in range(start, index + 1):
        v = average_true_range(rows, i, ATR_PERIOD)
        if v is not None and v > 0:
            hist.append(v)
    if not hist:
        return 50.0
    count_below = sum(1 for v in hist if v <= current_atr)
    return (count_below / len(hist)) * 100.0


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
    return 100.0 - (100.0 / (1.0 + gains / losses))


def row_close(row: dict[str, Any]) -> float:
    value = row.get("close", row.get("price"))
    if value is None:
        raise ValueError("BTC structural rows require close or price.")
    return float(value)


def row_volume(row: dict[str, Any]) -> float:
    return float(row.get("volume", row.get("Volume", 0)) or 0)
