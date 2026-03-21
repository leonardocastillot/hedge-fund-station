from __future__ import annotations

from ...backtesting.indicators import adx, atr, rolling_std, sma
from ...backtesting.io import Candle


DEFAULTS = {
    "bb_window": 20,
    "bb_std": 2.0,
    "keltner_window": 20,
    "keltner_atr_mult": 1.5,
    "adx_period": 14,
    "adx_threshold": 25.0,
    "take_profit_pct": 0.05,
    "stop_loss_pct": 0.03,
}


def build_signals(candles: list[Candle]) -> list[dict[str, float | bool | None]]:
    closes = [candle.close for candle in candles]
    highs = [candle.high for candle in candles]
    lows = [candle.low for candle in candles]

    bb_middle = sma(closes, DEFAULTS["bb_window"])
    bb_std = rolling_std(closes, DEFAULTS["bb_window"])
    atr_values = atr(highs, lows, closes, DEFAULTS["keltner_window"])
    keltner_middle = sma(closes, DEFAULTS["keltner_window"])
    adx_values = adx(highs, lows, closes, DEFAULTS["adx_period"])

    signals: list[dict[str, float | bool | None]] = []
    squeeze_released = False
    squeeze_release_index: int | None = None

    for index, candle in enumerate(candles):
        middle = bb_middle[index]
        deviation = bb_std[index]
        keltner_center = keltner_middle[index]
        atr_value = atr_values[index]
        adx_value = adx_values[index]

        if None in (middle, deviation, keltner_center, atr_value, adx_value):
            signals.append(_empty_signal())
            continue

        upper_bb = float(middle) + DEFAULTS["bb_std"] * float(deviation)
        lower_bb = float(middle) - DEFAULTS["bb_std"] * float(deviation)
        upper_kc = float(keltner_center) + DEFAULTS["keltner_atr_mult"] * float(atr_value)
        lower_kc = float(keltner_center) - DEFAULTS["keltner_atr_mult"] * float(atr_value)

        squeeze_now = upper_bb < upper_kc and lower_bb > lower_kc
        prev_squeeze = bool(signals[index - 1]["squeeze_on"]) if index > 0 and signals[index - 1]["squeeze_on"] is not None else False
        if prev_squeeze and not squeeze_now:
            squeeze_released = True
            squeeze_release_index = index

        entry: str | None = None
        stop_loss: float | None = None
        take_profit: float | None = None
        bars_since_release = 0 if squeeze_release_index is None else index - squeeze_release_index

        if squeeze_released and float(adx_value) >= DEFAULTS["adx_threshold"]:
            if candle.close > upper_bb:
                entry = "long"
                stop_loss = candle.close * (1 - DEFAULTS["stop_loss_pct"])
                take_profit = candle.close * (1 + DEFAULTS["take_profit_pct"])
                squeeze_released = False
                squeeze_release_index = None
            elif candle.close < lower_bb:
                entry = "short"
                stop_loss = candle.close * (1 + DEFAULTS["stop_loss_pct"])
                take_profit = candle.close * (1 - DEFAULTS["take_profit_pct"])
                squeeze_released = False
                squeeze_release_index = None

        signals.append(
            {
                "entry": entry,
                "stop_loss": stop_loss,
                "take_profit": take_profit,
                "squeeze_on": squeeze_now,
                "squeeze_released": squeeze_released,
                "bars_since_squeeze": bars_since_release,
                "adx": round(float(adx_value), 4),
                "upper_bb": round(upper_bb, 6),
                "lower_bb": round(lower_bb, 6),
                "upper_kc": round(upper_kc, 6),
                "lower_kc": round(lower_kc, 6),
            }
        )

    return signals


def _empty_signal() -> dict[str, float | bool | None]:
    return {
        "entry": None,
        "stop_loss": None,
        "take_profit": None,
        "squeeze_on": None,
        "squeeze_released": False,
        "bars_since_squeeze": 0,
        "adx": None,
        "upper_bb": None,
        "lower_bb": None,
        "upper_kc": None,
        "lower_kc": None,
    }
