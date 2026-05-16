"""Deterministic BTC daily volatility-regime dynamic trail trend logic."""

from __future__ import annotations

from typing import Any

STRATEGY_ID = "btc_vol_dynamic_trail_trend"
SYMBOL = "BTC"

SMA_FAST_DAYS = 50
SMA_SLOW_DAYS = 150
ATR_PERIOD = 14
ATR_PERCENTILE_DAYS = 252
MAX_VOL_PERCENTILE = 82.0
MIN_ENTRY_BOUNCE_RSI = 42.0
TIMESTOP_DAYS = 200

DYNAMIC_TRAIL_INITIAL_MULT = 4.6
DYNAMIC_TRAIL_FINAL_MULT = 4.6
DYNAMIC_TRAIL_TIGHTEN_START_DAY = 9999
DYNAMIC_TRAIL_TIGHTEN_END_DAY = 9999


def dynamic_atr_multiplier(days_in_trade: int) -> float:
    if days_in_trade < DYNAMIC_TRAIL_TIGHTEN_START_DAY:
        return DYNAMIC_TRAIL_INITIAL_MULT
    if days_in_trade >= DYNAMIC_TRAIL_TIGHTEN_END_DAY:
        return DYNAMIC_TRAIL_FINAL_MULT
    progress = (days_in_trade - DYNAMIC_TRAIL_TIGHTEN_START_DAY) / (
        DYNAMIC_TRAIL_TIGHTEN_END_DAY - DYNAMIC_TRAIL_TIGHTEN_START_DAY
    )
    return DYNAMIC_TRAIL_INITIAL_MULT - progress * (
        DYNAMIC_TRAIL_INITIAL_MULT - DYNAMIC_TRAIL_FINAL_MULT
    )


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
            "dynamic_multiplier": 0.0,
            "reasons": ["Waiting for enough daily history to compute SMA150 and ATR."],
        }

    close = ctx["close"]
    sma150 = ctx["sma150"]
    sma50 = ctx["sma50"]
    atr = ctx["atr"]
    atr_pct = ctx["atr_percentile"]
    days_in = ctx["days_in_trade"]

    vol_regime = "extreme" if atr_pct >= MAX_VOL_PERCENTILE else "elevated" if atr_pct >= 70 else "normal" if atr_pct >= 30 else "low"

    safe_entry = (
        not in_position
        and close > sma150
        and sma50 > sma150
        and ctx["rsi14"] > MIN_ENTRY_BOUNCE_RSI
        and atr_pct < MAX_VOL_PERCENTILE
    )

    pullback_entry = bool(
        safe_entry
        and close <= sma50 * 1.01
        and close >= sma50 * 0.96
        and ctx["rsi14"] < 55
    )
    momentum_entry = bool(
        safe_entry
        and close > sma50
        and ctx["rsi14"] >= 48
        and ctx["rsi14"] <= 78
    )
    entry_trigger = bool(pullback_entry or momentum_entry)

    current_mult = dynamic_atr_multiplier(days_in)
    atr_stop_dist_pct = atr_stop_pct(atr, close, current_mult)

    trailing_exit = bool(in_position and ctx["trade_drawdown_pct"] >= atr_stop_dist_pct)
    trend_exit = bool(in_position and close < sma150 and sma50 < sma150)
    time_exit = bool(in_position and days_in >= TIMESTOP_DAYS)
    exit_reason = None
    if trailing_exit:
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
        "dynamic_multiplier": round(current_mult, 2),
        "atr_stop_distance_pct": round(atr_stop_dist_pct, 4),
        "target_risk_pct": round(risk_pct, 4),
        "max_exposure_fraction": round(max_lev, 4),
        "target_exposure_fraction": round(max_lev if entry_trigger else 0.0, 4),
        "target_position_size_pct": round(
            (risk_pct / atr_stop_dist_pct * 100.0) if atr_stop_dist_pct > 0 else 0.0,
            4,
        ),
        "filters_passed": {
            "close_above_sma150": close > sma150,
            "sma50_above_sma150": sma50 > sma150,
            "rsi_above_floor": ctx["rsi14"] > MIN_ENTRY_BOUNCE_RSI,
            "vol_not_extreme": atr_pct < MAX_VOL_PERCENTILE,
            "pullback_entry": pullback_entry,
            "momentum_entry": momentum_entry,
            "atr_trailing_stop_clear": not trailing_exit,
            "trend_break_clear": not trend_exit,
            "time_stop_clear": not time_exit,
        },
    }
    result["reasons"] = build_reasons(result, entry_trigger=entry_trigger, exit_reason=exit_reason, vol_regime=vol_regime, current_mult=current_mult, days_in=days_in)
    return result


def atr_stop_pct(atr: float, close: float, multiplier: float) -> float:
    if close <= 0:
        return 0.0
    return round((multiplier * atr) / close * 100.0, 4)


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
    sma150 = simple_moving_average(rows, index, SMA_SLOW_DAYS)
    rsi14 = calculate_rsi(rows, index)
    atr = average_true_range(rows, index, ATR_PERIOD)
    atr_percentile = atr_percentile_rank(rows, index, atr, ATR_PERCENTILE_DAYS)
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
        "sma150": round(sma150, 8) if sma150 is not None else None,
        "rsi14": round(rsi14, 4),
        "atr": round(atr, 8) if atr is not None else None,
        "atr_percentile": round(atr_percentile, 4),
        "trailing_high_180d": round(high180, 8),
        "drawdown_180d_pct": round(drawdown_180d_pct, 4),
        "trade_peak_close": round(peak, 8),
        "trade_drawdown_pct": round(trade_drawdown_pct, 4),
        "days_in_trade": days_in_trade,
        "has_required_history": sma50 is not None and sma150 is not None and atr is not None,
    }


def build_reasons(
    context: dict[str, Any],
    *,
    entry_trigger: bool,
    exit_reason: str | None,
    vol_regime: str,
    current_mult: float,
    days_in: int,
) -> list[str]:
    if exit_reason == "atr_trailing_stop":
        return [f"Close is {context['trade_drawdown_pct']:.2f}% below trade peak (dynamic ATR stop: {current_mult}x, {context['atr_stop_distance_pct']:.2f}%)."]
    if exit_reason == "trend_break":
        return ["Close broke SMA150 with SMA50 below SMA150."]
    if exit_reason == "time_stop":
        return [f"Position held {days_in} days (max {TIMESTOP_DAYS})."]
    if entry_trigger:
        return [
            f"BTC in {vol_regime} vol regime. "
            f"ATR={context.get('atr', 0):.2f}, "
            f"dynamic_stop={current_mult}x (day {days_in}), "
            f"target_size={context.get('target_position_size_pct', 0):.2f}% of equity."
        ]
    if vol_regime == "extreme":
        return [f"Vol regime extreme (ATR percentile {context['atr_percentile']:.0f}%). No entry."]
    return [f"No entry trigger. Vol regime: {vol_regime}."]


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
        raise ValueError("BTC dynamic trail rows require close or price.")
    return float(value)
