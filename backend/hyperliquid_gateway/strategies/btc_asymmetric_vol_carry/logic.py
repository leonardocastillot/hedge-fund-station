"""Deterministic BTC daily asymmetric volatility carry logic.

Long-only strategy (v3) that exploits volatility regime extremes:
- LONG on panic (high vol + deeply oversold below trend)
- LONG on compression breakout (extreme calm + new high)
- Exits on RSI profit target or time stop (no trailing stops)

Different from all existing strategies: entry is volatility-regime-first
(not SMA crossover, not momentum, not trend-following).
"""

from __future__ import annotations

from typing import Any

STRATEGY_ID = "btc_asymmetric_vol_carry"
SYMBOL = "BTC"

SMA20_DAYS = 20
SMA50_DAYS = 50
SMA200_DAYS = 200
RSI_PERIOD = 14
ATR_PERIOD = 14
ATR_PERCENTILE_DAYS = 180
MOMENTUM_LOOKBACK_DAYS = 30

PANIC_ATR_PCT = 75.0
PANIC_MAX_RSI = 35.0

COMPRESSION_ATR_PCT = 20.0
COMPRESSION_LOOKBACK_DAYS = 20

LONG_EXIT_RSI = 39.0
LONG_TIME_STOP_DAYS = 90

COOLDOWN_BARS = 10

PANIC_EXPOSURE = 0.15
COMPRESSION_EXPOSURE = 0.25

SIDE_LONG = "long"


def evaluate_signal(
    rows: list[dict[str, Any]],
    index: int,
    *,
    in_position: bool = False,
    trade_peak_close: float | None = None,
    trade_entry_idx: int | None = None,
    bars_since_last_exit: int | None = None,
) -> dict[str, Any]:
    if index < 0 or index >= len(rows):
        raise IndexError("index outside BTC daily history window")

    ctx = indicator_context(rows, index, trade_peak_close=trade_peak_close, trade_entry_idx=trade_entry_idx)
    if not ctx["has_required_history"]:
        return {**ctx, "strategy_id": STRATEGY_ID, "symbol": SYMBOL, "signal": "hold" if in_position else "none",
                "entry_trigger": False, "exit_trigger": False, "exit_reason": None, "vol_regime": "unknown",
                "setup_type": None, "target_exposure_fraction": 0.0,
                "reasons": ["Waiting for enough daily history."]}

    close = ctx["close"]
    atr_pct = ctx["atr_percentile"]
    rsi14 = ctx["rsi14"]
    sma50 = ctx["sma50"]
    sma200 = ctx["sma200"]
    vol_regime = classify_vol_regime(atr_pct)

    on_cooldown = bool(not in_position and bars_since_last_exit is not None and bars_since_last_exit < COOLDOWN_BARS)

    setup, entry_trigger = evaluate_entry(close, atr_pct, rsi14, sma50, sma200, ctx)
    if on_cooldown:
        entry_trigger = False

    exit_reason = evaluate_exit(in_position, rsi14, ctx) if in_position else None

    if entry_trigger and not in_position:
        signal = "long"
    elif in_position and exit_reason:
        signal = "exit"
    elif in_position:
        signal = "hold"
    else:
        signal = "none"

    target_frac = setup["exposure_fraction"] if (entry_trigger and not in_position) else 0.0

    return {
        **ctx,
        "strategy_id": STRATEGY_ID,
        "symbol": SYMBOL,
        "signal": signal,
        "entry_trigger": entry_trigger,
        "exit_trigger": exit_reason is not None,
        "exit_reason": exit_reason,
        "vol_regime": vol_regime,
        "setup_type": setup["type"] if entry_trigger else None,
        "target_exposure_fraction": round(target_frac, 4),
        "on_cooldown": on_cooldown,
        "filters_passed": {
            "panic_long": bool(not in_position and atr_pct >= PANIC_ATR_PCT and rsi14 <= PANIC_MAX_RSI
                              and close < sma50 and close < sma200),
            "compression_long": bool(not in_position and atr_pct <= COMPRESSION_ATR_PCT
                                     and rsi14 > 55 and close >= ctx["high_20d"]),
            "long_exit_trend_fail": bool(in_position and rsi14 < LONG_EXIT_RSI),
            "long_exit_time": bool(in_position and ctx["days_in_trade"] >= LONG_TIME_STOP_DAYS),
            "on_cooldown": on_cooldown,
        },
        "reasons": build_reasons(setup, entry_trigger, exit_reason, in_position, ctx, on_cooldown),
    }


def evaluate_entry(
    close: float, atr_pct: float, rsi14: float,
    sma50: float, sma200: float, ctx: dict[str, Any],
) -> tuple[dict[str, Any], bool]:
    if atr_pct >= PANIC_ATR_PCT and rsi14 <= PANIC_MAX_RSI and close < sma50 and close < sma200:
        return {"type": "panic_long", "exposure_fraction": PANIC_EXPOSURE}, True

    if atr_pct <= COMPRESSION_ATR_PCT and rsi14 > 55 and close >= ctx["high_20d"]:
        return {"type": "compression_long", "exposure_fraction": COMPRESSION_EXPOSURE}, True

    return {"type": None, "exposure_fraction": 0.0}, False


def evaluate_exit(in_position: bool, rsi14: float, ctx: dict[str, Any]) -> str | None:
    if not in_position:
        return None
    if rsi14 < LONG_EXIT_RSI:
        return "long_trend_fail"
    if ctx["days_in_trade"] >= LONG_TIME_STOP_DAYS:
        return "long_time_stop"
    return None


def classify_vol_regime(atr_pct: float) -> str:
    if atr_pct >= PANIC_ATR_PCT:
        return "panic"
    if atr_pct >= 60:
        return "elevated"
    if atr_pct >= 30:
        return "normal"
    return "compression"


def indicator_context(
    rows: list[dict[str, Any]], index: int,
    *,
    trade_peak_close: float | None = None,
    trade_entry_idx: int | None = None,
) -> dict[str, Any]:
    close = row_close(rows[index])
    sma20 = simple_moving_average(rows, index, SMA20_DAYS)
    sma50 = simple_moving_average(rows, index, SMA50_DAYS)
    sma200 = simple_moving_average(rows, index, SMA200_DAYS)
    rsi14 = calculate_rsi(rows, index)
    atr = average_true_range(rows, index, ATR_PERIOD)
    atr_pct = atr_percentile_rank(rows, index, atr, ATR_PERCENTILE_DAYS) if atr is not None else 50.0
    momentum_30d = rate_of_change(rows, index, MOMENTUM_LOOKBACK_DAYS)
    high180 = trailing_high_close(rows, index, 180)
    high_20d = trailing_high_close(rows, index, COMPRESSION_LOOKBACK_DAYS)
    drawdown_180d = 0.0 if high180 <= 0 else max(0.0, ((high180 - close) / high180) * 100.0)
    peak = max(close, float(trade_peak_close or close))
    trade_dd = 0.0 if peak <= 0 else max(0.0, ((peak - close) / peak) * 100.0)
    days_in = 0
    if trade_entry_idx is not None:
        days_in = max(0, index - trade_entry_idx)

    return {
        "date": str(rows[index].get("date") or rows[index].get("timestamp") or ""),
        "close": round(close, 8),
        "sma20": round(sma20, 8) if sma20 is not None else None,
        "sma50": round(sma50, 8) if sma50 is not None else None,
        "sma200": round(sma200, 8) if sma200 is not None else None,
        "rsi14": round(rsi14, 4),
        "atr": round(atr, 8) if atr is not None else None,
        "atr_percentile": round(atr_pct, 4),
        "momentum_30d_pct": round(momentum_30d, 4) if momentum_30d is not None else 0.0,
        "trailing_high_180d": round(high180, 8),
        "high_20d": round(high_20d, 8),
        "drawdown_180d_pct": round(drawdown_180d, 4),
        "trade_peak_close": round(peak, 8),
        "trade_drawdown_pct": round(trade_dd, 4),
        "days_in_trade": days_in,
        "has_required_history": all(v is not None for v in [sma50, sma200, atr, sma20]),
    }


def build_reasons(
    setup: dict[str, Any], entry_trigger: bool, exit_reason: str | None,
    in_position: bool, ctx: dict[str, Any],
    on_cooldown: bool = False,
) -> list[str]:
    if exit_reason == "long_trend_fail":
        return [f"Trend fail: RSI={ctx['rsi14']:.1f} < {LONG_EXIT_RSI}."]
    if exit_reason == "long_time_stop":
        return [f"Time stop: {ctx['days_in_trade']}d >= {LONG_TIME_STOP_DAYS}."]
    if entry_trigger:
        return [f"{setup['type']}: vol={ctx['atr_percentile']:.0f}% RSI={ctx['rsi14']:.1f} size={setup['exposure_fraction']:.0%}"]
    if on_cooldown:
        return [f"Cooldown: vol={ctx['atr_percentile']:.0f}% RSI={ctx['rsi14']:.1f}"]
    if in_position:
        return [f"Holding: RSI={ctx['rsi14']:.1f} dd={ctx['trade_drawdown_pct']:.1f}% d={ctx['days_in_trade']}"]
    return [f"Standby: vol={ctx['atr_percentile']:.0f}% RSI={ctx['rsi14']:.1f} {classify_vol_regime(ctx['atr_percentile'])}."]


def simple_moving_average(rows: list[dict[str, Any]], index: int, window: int) -> float | None:
    if index + 1 < window:
        return None
    return sum(row_close(row) for row in rows[index - window + 1 : index + 1]) / window


def trailing_high_close(rows: list[dict[str, Any]], index: int, window: int) -> float:
    start = max(0, index - window + 1)
    return max(row_close(row) for row in rows[start : index + 1])


def trailing_low_close(rows: list[dict[str, Any]], index: int, window: int) -> float:
    start = max(0, index - window + 1)
    return min(row_close(row) for row in rows[start : index + 1])


def rate_of_change(rows: list[dict[str, Any]], index: int, period: int) -> float | None:
    if index < period:
        return None
    now = row_close(rows[index])
    prev = row_close(rows[index - period])
    return ((now - prev) / prev) * 100.0 if prev else 0.0


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
    hist: list[float] = []
    for i in range(start, index + 1):
        v = average_true_range(rows, i, ATR_PERIOD)
        if v is not None and v > 0:
            hist.append(v)
    if not hist:
        return 50.0
    count_below = sum(1 for v in hist if v <= current_atr)
    return (count_below / len(hist)) * 100.0


def calculate_rsi(rows: list[dict[str, Any]], index: int, period: int = RSI_PERIOD) -> float:
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
        raise ValueError("BTC asymmetric vol carry rows require close or price.")
    return float(value)
