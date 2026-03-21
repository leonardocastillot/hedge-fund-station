from __future__ import annotations

import math


def sma(values: list[float], period: int) -> list[float | None]:
    result: list[float | None] = [None] * len(values)
    if period <= 0:
        return result
    rolling_sum = 0.0
    for index, value in enumerate(values):
        rolling_sum += value
        if index >= period:
            rolling_sum -= values[index - period]
        if index >= period - 1:
            result[index] = rolling_sum / period
    return result


def rolling_std(values: list[float], period: int) -> list[float | None]:
    result: list[float | None] = [None] * len(values)
    if period <= 1:
        return result
    for index in range(period - 1, len(values)):
        window = values[index - period + 1 : index + 1]
        mean = sum(window) / period
        variance = sum((value - mean) ** 2 for value in window) / period
        result[index] = math.sqrt(variance)
    return result


def atr(highs: list[float], lows: list[float], closes: list[float], period: int) -> list[float | None]:
    true_ranges: list[float] = []
    previous_close: float | None = None
    for high, low, close in zip(highs, lows, closes):
        if previous_close is None:
            true_ranges.append(high - low)
        else:
            true_ranges.append(max(high - low, abs(high - previous_close), abs(low - previous_close)))
        previous_close = close
    return wilder_smoothing(true_ranges, period)


def adx(highs: list[float], lows: list[float], closes: list[float], period: int) -> list[float | None]:
    length = len(highs)
    if period <= 1 or length == 0:
        return [None] * length

    plus_dm = [0.0] * length
    minus_dm = [0.0] * length
    tr = [0.0] * length

    for index in range(1, length):
        up_move = highs[index] - highs[index - 1]
        down_move = lows[index - 1] - lows[index]
        plus_dm[index] = up_move if up_move > down_move and up_move > 0 else 0.0
        minus_dm[index] = down_move if down_move > up_move and down_move > 0 else 0.0
        tr[index] = max(
            highs[index] - lows[index],
            abs(highs[index] - closes[index - 1]),
            abs(lows[index] - closes[index - 1]),
        )

    smoothed_tr = wilder_smoothing(tr, period)
    smoothed_plus = wilder_smoothing(plus_dm, period)
    smoothed_minus = wilder_smoothing(minus_dm, period)

    dx_values: list[float | None] = [None] * length
    for index in range(length):
        current_tr = smoothed_tr[index]
        current_plus = smoothed_plus[index]
        current_minus = smoothed_minus[index]
        if current_tr in (None, 0):
            continue
        plus_di = 100 * (current_plus / current_tr)
        minus_di = 100 * (current_minus / current_tr)
        denominator = plus_di + minus_di
        if denominator == 0:
            continue
        dx_values[index] = 100 * abs(plus_di - minus_di) / denominator

    numeric_dx = [0.0 if value is None else value for value in dx_values]
    smoothed_dx = wilder_smoothing(numeric_dx, period)
    return [None if dx_values[index] is None else smoothed_dx[index] for index in range(length)]


def wilder_smoothing(values: list[float], period: int) -> list[float | None]:
    result: list[float | None] = [None] * len(values)
    if period <= 0 or len(values) < period:
        return result

    seed = sum(values[:period])
    result[period - 1] = seed / period
    for index in range(period, len(values)):
        previous = result[index - 1]
        if previous is None:
            continue
        result[index] = ((previous * (period - 1)) + values[index]) / period
    return result
