"""BTC Trend Cascade — momentum conviction strategy.

Genuinely different from SMA50/SMA150 champion approaches:
  - No SMA crossover trend filter. Uses ROC momentum cascade + ADX trend strength.
  - Momentum collapse exit (ROC10 turning negative) for quick stop-loss on trend death.
  - Conviction-based sizing tied to momentum intensity.
  - Progressive ATR trailing: tight first 10d, wider after.
"""

from __future__ import annotations

from typing import Any

STRATEGY_ID = "btc_trend_cascade"
SYMBOL = "BTC"

ADX_PERIOD = 14
ATR_PERIOD = 14
ATR_PERCENTILE_DAYS = 252
MAX_VOL_PERCENTILE = 85.0
TIMESTOP_DAYS = 150

TIGHT_TRAIL_MULT = 2.5
WIDE_TRAIL_MULT = 4.5
TRAIL_TRANSITION_DAY = 10

MIN_ADX_ENTRY = 18.0
MOMENTUM_COLLAPSE_THRESH = -3.0
MOMENTUM_COLLAPSE_STRONG = -5.0
ADX_STRONG_THRESH = 30.0
ADX_FADE_THRESH = 15.0


def evaluate_signal(
    rows: list[dict[str, Any]],
    index: int,
    *,
    in_position: bool = False,
    trade_peak_close: float | None = None,
    trade_entry_idx: int | None = None,
) -> dict[str, Any]:
    if index < 0 or index >= len(rows):
        raise IndexError("index out of range")

    ctx = indicator_context(rows, index,
                            trade_peak_close=trade_peak_close,
                            trade_entry_idx=trade_entry_idx)

    if not ctx["has_required_history"]:
        return idle_return(ctx, in_position)

    close = ctx["close"]
    adx = ctx["adx"]
    atr_pct = ctx["atr_percentile"]
    days_in = ctx["days_in_trade"]
    roc5 = ctx.get("roc5") or 0.0
    roc10 = ctx.get("roc10") or 0.0
    roc20 = ctx.get("roc20") or 0.0
    sma50 = ctx.get("sma50")

    vol_regime = regime_label(atr_pct)

    # -- Entry --
    trending = adx is not None and float(adx) >= MIN_ADX_ENTRY
    vol_ok = atr_pct < MAX_VOL_PERCENTILE
    above_sma50 = sma50 is not None and close > sma50
    positive_momentum = roc10 > 0.0 or roc20 > 1.0
    new_high = ctx.get("new_5day_high", False)

    entry_trigger = bool(
        not in_position
        and trending
        and vol_ok
        and above_sma50
        and (positive_momentum or new_high)
    )

    # -- Adaptive exit: stronger trends can tolerate larger corrections --
    collapse_thresh = MOMENTUM_COLLAPSE_STRONG if (adx is not None and float(adx) >= ADX_STRONG_THRESH) else MOMENTUM_COLLAPSE_THRESH

    current_mult = TIGHT_TRAIL_MULT if days_in < TRAIL_TRANSITION_DAY else WIDE_TRAIL_MULT
    atr_stop_dist_pct = atr_stop_pct(ctx["atr"], close, current_mult) if ctx["atr"] else 0.0

    trailing_exit = bool(in_position and ctx["trade_drawdown_pct"] >= atr_stop_dist_pct)
    momentum_collapse = bool(in_position and roc10 < collapse_thresh)
    trend_exit = bool(in_position and adx is not None and float(adx) < ADX_FADE_THRESH)
    time_exit = bool(in_position and days_in >= TIMESTOP_DAYS)

    exit_reason = None
    if momentum_collapse:
        exit_reason = "momentum_collapse"
    elif trailing_exit:
        exit_reason = "atr_trailing_stop"
    elif trend_exit:
        exit_reason = "trend_fade"
    elif time_exit:
        exit_reason = "time_stop"

    signal = "hold"
    if entry_trigger:
        signal = "long"
    elif in_position and exit_reason:
        signal = "exit"
    elif not in_position:
        signal = "none"

    conviction = max(0.0, min(1.0, max(roc10, roc20) / 6.0))
    max_pos = position_size_pct(atr_pct)
    pos_pct = max_pos * (0.5 + conviction * 0.7)

    return {
        **ctx, "strategy_id": STRATEGY_ID, "symbol": SYMBOL,
        "signal": signal, "entry_trigger": entry_trigger,
        "exit_trigger": exit_reason is not None, "exit_reason": exit_reason,
        "vol_regime": vol_regime,
        "conviction": round(conviction, 4),
        "trail_phase": "tight" if days_in < TRAIL_TRANSITION_DAY else "wide",
        "dynamic_multiplier": round(current_mult, 2),
        "atr_stop_distance_pct": round(atr_stop_dist_pct, 4),
        "target_position_size_pct": round(pos_pct * 100, 4),
        "filters_passed": {
            "trending": trending, "vol_ok": vol_ok,
            "above_sma50": above_sma50, "positive_momentum": positive_momentum,
            "new_high": new_high,
            "momentum_collapse": momentum_collapse,
            "trailing_stop_clear": not trailing_exit,
            "trend_fade_clear": not trend_exit,
            "time_stop_clear": not time_exit,
        },
    }


def idle_return(ctx: dict[str, Any], in_position: bool) -> dict[str, Any]:
    return {
        **ctx, "strategy_id": STRATEGY_ID, "symbol": SYMBOL,
        "signal": "hold" if in_position else "none",
        "entry_trigger": False, "exit_trigger": False, "exit_reason": None,
        "vol_regime": "unknown", "conviction": 0.0,
        "target_position_size_pct": 0.0,
        "reasons": ["Waiting for indicator warmup."],
    }


def regime_label(atr_pct: float) -> str:
    if atr_pct >= 85: return "extreme"
    if atr_pct >= 70: return "elevated"
    if atr_pct >= 30: return "normal"
    return "low"


def position_size_pct(atr_pct: float) -> float:
    if atr_pct >= 80: return 0.22
    if atr_pct >= 65: return 0.32
    if atr_pct >= 45: return 0.38
    if atr_pct >= 25: return 0.42
    return 0.45


def atr_stop_pct(atr: float | None, close: float, mult: float) -> float:
    if atr is None or close <= 0: return 0.0
    return round((mult * atr) / close * 100.0, 4)


def indicator_context(
    rows: list[dict[str, Any]],
    index: int,
    *,
    trade_peak_close: float | None = None,
    trade_entry_idx: int | None = None,
) -> dict[str, Any]:
    close = row_close(rows[index])
    roc5 = rate_of_change(rows, index, 5)
    roc10 = rate_of_change(rows, index, 10)
    roc20 = rate_of_change(rows, index, 20)
    adx_val = compute_adx(rows, index, ADX_PERIOD)
    atr_val = average_true_range(rows, index, ATR_PERIOD)
    atr_pct = atr_percentile_rank(rows, index, atr_val, ATR_PERCENTILE_DAYS)
    sma20 = simple_moving_average(rows, index, 20)
    sma50 = simple_moving_average(rows, index, 50)
    sma200 = simple_moving_average(rows, index, 200)

    new_5d = index >= 5 and close == max(row_close(rows[i]) for i in range(max(0, index - 5), index + 1))
    peak = max(close, float(trade_peak_close or close))
    trade_dd = 0.0 if peak <= 0 else max(0.0, ((peak - close) / peak) * 100.0)
    days_in = 0 if trade_entry_idx is None else max(0, index - trade_entry_idx)
    has_hist = all(v is not None for v in [sma50, sma200, atr_val, adx_val])

    return {
        "date": str(rows[index].get("date", "")),
        "close": round(close, 8),
        "roc5": round(roc5, 4) if roc5 is not None else None,
        "roc10": round(roc10, 4) if roc10 is not None else None,
        "roc20": round(roc20, 4) if roc20 is not None else None,
        "adx": round(adx_val, 4) if adx_val is not None else None,
        "atr": round(atr_val, 8) if atr_val is not None else None,
        "atr_percentile": round(atr_pct, 4),
        "sma20": round(sma20, 8) if sma20 is not None else None,
        "sma50": round(sma50, 8) if sma50 is not None else None,
        "sma200": round(sma200, 8) if sma200 is not None else None,
        "new_5day_high": new_5d,
        "trade_peak_close": round(peak, 8),
        "trade_drawdown_pct": round(trade_dd, 4),
        "days_in_trade": days_in,
        "has_required_history": has_hist,
    }


def rate_of_change(rows: list[dict[str, Any]], index: int, period: int) -> float | None:
    if index < period: return None
    prev = row_close(rows[index - period])
    curr = row_close(rows[index])
    if prev == 0: return None
    return (curr - prev) / prev * 100.0


def compute_adx(rows: list[dict[str, Any]], index: int, period: int) -> float | None:
    if index < period + 1: return None
    start = max(0, index - period - 4)
    highs = [float(r.get("high") or r.get("close")) for r in rows[start:index + 1]]
    lows = [float(r.get("low") or r.get("close")) for r in rows[start:index + 1]]
    closes = [float(r.get("close")) for r in rows[start:index + 1]]
    try:
        from ...backtesting.indicators import adx
    except ImportError:
        from backtesting.indicators import adx
    values = adx(highs, lows, closes, period)
    return values[-1] if values else None


def simple_moving_average(rows: list[dict[str, Any]], index: int, window: int) -> float | None:
    if index + 1 < window: return None
    return sum(row_close(r) for r in rows[index - window + 1: index + 1]) / window


def average_true_range(rows: list[dict[str, Any]], index: int, period: int) -> float | None:
    if index < 1 or index + 1 < period + 1: return None
    tr_values = []
    for i in range(index - period + 1, index + 1):
        high = float(rows[i].get("high") or rows[i].get("close"))
        low = float(rows[i].get("low") or rows[i].get("close"))
        pc = float(rows[i - 1].get("close") or rows[i - 1].get("price"))
        tr_values.append(max(high - low, abs(high - pc), abs(low - pc)))
    return sum(tr_values) / len(tr_values) if tr_values else None


def atr_percentile_rank(rows: list[dict[str, Any]], index: int, current_atr: float | None, lb: int) -> float:
    if current_atr is None or current_atr <= 0 or index < 1: return 50.0
    start = max(1, index - lb + 1)
    hist = []
    for i in range(start, index + 1):
        v = average_true_range(rows, i, ATR_PERIOD)
        if v is not None and v > 0:
            hist.append(v)
    if not hist: return 50.0
    return sum(1 for v in hist if v <= current_atr) / len(hist) * 100.0


def row_close(row: dict[str, Any]) -> float:
    value = row.get("close", row.get("price"))
    if value is None:
        raise ValueError("BTC rows require close or price.")
    return float(value)
