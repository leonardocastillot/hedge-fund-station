from __future__ import annotations

from typing import Any

try:
    from .ai_provider import AIProviderError, complete_json
except ImportError:
    from ai_provider import AIProviderError, complete_json


SUPPORTED_PREVIEW_KINDS = {
    "sma",
    "ema",
    "rsi",
    "macd",
    "bollinger",
    "atr",
    "supertrend",
    "volume_threshold",
    "crossover",
    "crossunder",
}


def deterministic_pine_indicator(request: str, indicator_type: str | None = None) -> dict[str, Any]:
    normalized = f"{request} {indicator_type or ''}".lower()
    if "rsi" in normalized or "vol" in normalized:
        return _rsi_volume_breakout()
    if "boll" in normalized or "band" in normalized:
        return _bollinger_squeeze()
    if "macd" in normalized:
        return _macd_momentum()
    return _sma_crossover()


async def generate_pine_indicator(payload: dict[str, Any]) -> dict[str, Any]:
    system_prompt = (
        "You generate TradingView Pine Script v6 indicators for hedge fund research. "
        "Return strict JSON only. The Pine code must be ready to paste into TradingView, "
        "begin with //@version=6, use indicator(), and avoid live execution or broker actions. "
        "Also return a constrained previewRecipe using only supported kinds: "
        f"{', '.join(sorted(SUPPORTED_PREVIEW_KINDS))}. "
        "When unsure, choose a simple supported recipe rather than inventing unsupported preview logic."
    )
    user_payload = {
        "request": payload.get("request", ""),
        "symbol": payload.get("symbol", "BTC"),
        "interval": payload.get("interval", "1h"),
        "lookbackHours": payload.get("lookback_hours", 72),
        "indicatorType": payload.get("indicator_type"),
        "requiredJsonShape": {
            "title": "string",
            "description": "string",
            "pineCode": "string",
            "inputs": ["string"],
            "plots": ["string"],
            "alerts": ["string"],
            "warnings": ["string"],
            "previewRecipe": {
                "kind": "supported kind",
                "fastPeriod": "optional integer",
                "slowPeriod": "optional integer",
                "period": "optional integer",
                "threshold": "optional number",
                "multiplier": "optional number",
                "source": "close",
            },
        },
    }
    try:
        generated, meta = await complete_json(system_prompt=system_prompt, user_payload=user_payload, max_tokens=2200)
    except AIProviderError as exc:
        generated = deterministic_pine_indicator(str(payload.get("request", "")), payload.get("indicator_type"))
        meta = {
            "provider": "deterministic",
            "model": None,
            "fallbackUsed": True,
            "errors": [{"provider": exc.provider, "message": exc.message}],
        }

    normalized = normalize_generated_indicator(generated)
    normalized["ai"] = meta
    return normalized


def normalize_generated_indicator(generated: dict[str, Any]) -> dict[str, Any]:
    title = str(generated.get("title") or "Pine Research Indicator").strip()
    description = str(generated.get("description") or "Generated Pine Script indicator for research review.").strip()
    pine_code = str(generated.get("pineCode") or generated.get("pine_code") or "").strip()
    if not pine_code.startswith("//@version=6"):
        pine_code = _sma_crossover()["pineCode"]
    return {
        "title": title,
        "description": description,
        "pineCode": pine_code,
        "inputs": _string_list(generated.get("inputs")),
        "plots": _string_list(generated.get("plots")),
        "alerts": _string_list(generated.get("alerts")),
        "warnings": _string_list(generated.get("warnings")),
        "previewRecipe": normalize_preview_recipe(generated.get("previewRecipe") or generated.get("preview_recipe")),
    }


def normalize_preview_recipe(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {"kind": "unsupported", "reason": "No structured preview recipe was returned."}
    kind = str(raw.get("kind") or "").strip().lower().replace("-", "_")
    if kind not in SUPPORTED_PREVIEW_KINDS:
        return {"kind": "unsupported", "reason": f"Unsupported preview kind: {kind or 'missing'}."}

    recipe: dict[str, Any] = {"kind": kind, "source": "close"}
    for key in ("fastPeriod", "slowPeriod", "signalPeriod", "period", "threshold"):
        value = raw.get(key)
        if value is None:
            continue
        try:
            recipe[key] = int(value)
        except (TypeError, ValueError):
            continue
    for key in ("multiplier", "volumeMultiplier"):
        value = raw.get(key)
        if value is None:
            continue
        try:
            recipe[key] = float(value)
        except (TypeError, ValueError):
            continue
    return recipe


def build_preview(candles: list[dict[str, Any]], recipe: dict[str, Any]) -> dict[str, Any]:
    if recipe.get("kind") == "unsupported":
        return {"supported": False, "reason": recipe.get("reason", "Unsupported preview recipe."), "overlays": [], "oscillators": [], "markers": []}
    valid = [c for c in candles if _number(c.get("close")) is not None and _number(c.get("time")) is not None]
    if len(valid) < 5:
        return {"supported": False, "reason": "Not enough candles for preview.", "overlays": [], "oscillators": [], "markers": []}

    closes = [_number(c.get("close")) or 0.0 for c in valid]
    highs = [_number(c.get("high")) or closes[index] for index, c in enumerate(valid)]
    lows = [_number(c.get("low")) or closes[index] for index, c in enumerate(valid)]
    volumes = [_number(c.get("volume")) or 0.0 for c in valid]
    times = [int(_number(c.get("time")) or 0) for c in valid]
    kind = recipe.get("kind")
    overlays: list[dict[str, Any]] = []
    oscillators: list[dict[str, Any]] = []
    markers: list[dict[str, Any]] = []

    if kind in {"sma", "crossover", "crossunder"}:
        fast = _bounded_int(recipe.get("fastPeriod"), 9, 2, 200)
        slow = _bounded_int(recipe.get("slowPeriod"), 21, fast + 1, 400)
        fast_values = sma(closes, fast)
        slow_values = sma(closes, slow)
        overlays.extend([_line("SMA Fast", times, fast_values, "#22d3ee"), _line("SMA Slow", times, slow_values, "#f59e0b")])
        markers.extend(cross_markers(times, fast_values, slow_values, "above" if kind == "crossunder" else "below"))
    elif kind == "ema":
        fast = _bounded_int(recipe.get("fastPeriod") or recipe.get("period"), 12, 2, 200)
        slow = _bounded_int(recipe.get("slowPeriod"), 26, fast + 1, 400)
        overlays.extend([_line("EMA Fast", times, ema(closes, fast), "#22d3ee"), _line("EMA Slow", times, ema(closes, slow), "#f59e0b")])
    elif kind == "rsi":
        period = _bounded_int(recipe.get("period"), 14, 2, 100)
        threshold = _bounded_int(recipe.get("threshold"), 55, 1, 99)
        values = rsi(closes, period)
        oscillators.append(_line("RSI", times, values, "#a78bfa"))
        markers.extend(threshold_markers(times, closes, values, threshold))
    elif kind == "macd":
        fast = _bounded_int(recipe.get("fastPeriod"), 12, 2, 100)
        slow = _bounded_int(recipe.get("slowPeriod"), 26, fast + 1, 200)
        signal = _bounded_int(recipe.get("signalPeriod"), 9, 2, 100)
        macd_line, signal_line, hist = macd(closes, fast, slow, signal)
        oscillators.extend([_line("MACD", times, macd_line, "#22d3ee"), _line("Signal", times, signal_line, "#f59e0b"), _line("Histogram", times, hist, "#94a3b8")])
        markers.extend(cross_markers(times, macd_line, signal_line, "below"))
    elif kind == "bollinger":
        period = _bounded_int(recipe.get("period"), 20, 2, 200)
        mult = _bounded_float(recipe.get("multiplier"), 2.0, 0.5, 5.0)
        mid, upper, lower = bollinger(closes, period, mult)
        overlays.extend([_line("BB Mid", times, mid, "#94a3b8"), _line("BB Upper", times, upper, "#22c55e"), _line("BB Lower", times, lower, "#ef4444")])
    elif kind == "atr":
        period = _bounded_int(recipe.get("period"), 14, 2, 100)
        oscillators.append(_line("ATR", times, atr(highs, lows, closes, period), "#38bdf8"))
    elif kind == "supertrend":
        period = _bounded_int(recipe.get("period"), 10, 2, 100)
        mult = _bounded_float(recipe.get("multiplier"), 3.0, 0.5, 10.0)
        upper, lower = supertrend_bands(highs, lows, closes, period, mult)
        overlays.extend([_line("Supertrend Upper", times, upper, "#ef4444"), _line("Supertrend Lower", times, lower, "#22c55e")])
    elif kind == "volume_threshold":
        period = _bounded_int(recipe.get("period"), 20, 2, 200)
        mult = _bounded_float(recipe.get("volumeMultiplier"), 1.5, 0.5, 10.0)
        markers.extend(volume_markers(times, closes, volumes, period, mult))

    return {"supported": True, "reason": None, "overlays": overlays, "oscillators": oscillators, "markers": markers}


def sma(values: list[float], period: int) -> list[float | None]:
    result: list[float | None] = [None] * len(values)
    if period <= 0:
        return result
    running = 0.0
    for index, value in enumerate(values):
        running += value
        if index >= period:
            running -= values[index - period]
        if index >= period - 1:
            result[index] = running / period
    return result


def ema(values: list[float], period: int) -> list[float | None]:
    result: list[float | None] = [None] * len(values)
    if period <= 0 or not values:
        return result
    alpha = 2 / (period + 1)
    current: float | None = None
    for index, value in enumerate(values):
        current = value if current is None else value * alpha + current * (1 - alpha)
        if index >= period - 1:
            result[index] = current
    return result


def rsi(values: list[float], period: int) -> list[float | None]:
    result: list[float | None] = [None] * len(values)
    if period <= 0 or len(values) <= period:
        return result
    gains: list[float] = []
    losses: list[float] = []
    for index in range(1, len(values)):
        change = values[index] - values[index - 1]
        gains.append(max(change, 0.0))
        losses.append(max(-change, 0.0))
        if index < period:
            continue
        if index == period:
            avg_gain = sum(gains[:period]) / period
            avg_loss = sum(losses[:period]) / period
        else:
            previous = result[index - 1]
            avg_gain = ((avg_gain * (period - 1)) + gains[-1]) / period
            avg_loss = ((avg_loss * (period - 1)) + losses[-1]) / period
        result[index] = 100.0 if avg_loss == 0 else 100 - (100 / (1 + (avg_gain / avg_loss)))
    return result


def macd(values: list[float], fast: int, slow: int, signal: int) -> tuple[list[float | None], list[float | None], list[float | None]]:
    fast_ema = ema(values, fast)
    slow_ema = ema(values, slow)
    macd_line = [None if f is None or s is None else f - s for f, s in zip(fast_ema, slow_ema)]
    numeric = [0.0 if value is None else value for value in macd_line]
    signal_line = ema(numeric, signal)
    hist = [None if m is None or s is None else m - s for m, s in zip(macd_line, signal_line)]
    return macd_line, signal_line, hist


def bollinger(values: list[float], period: int, multiplier: float) -> tuple[list[float | None], list[float | None], list[float | None]]:
    mid = sma(values, period)
    upper: list[float | None] = [None] * len(values)
    lower: list[float | None] = [None] * len(values)
    for index in range(period - 1, len(values)):
        window = values[index - period + 1 : index + 1]
        mean = mid[index]
        if mean is None:
            continue
        variance = sum((value - mean) ** 2 for value in window) / period
        width = (variance**0.5) * multiplier
        upper[index] = mean + width
        lower[index] = mean - width
    return mid, upper, lower


def atr(highs: list[float], lows: list[float], closes: list[float], period: int) -> list[float | None]:
    ranges: list[float] = []
    for index, high in enumerate(highs):
        previous_close = closes[index - 1] if index > 0 else closes[index]
        ranges.append(max(high - lows[index], abs(high - previous_close), abs(lows[index] - previous_close)))
    return ema(ranges, period)


def supertrend_bands(highs: list[float], lows: list[float], closes: list[float], period: int, multiplier: float) -> tuple[list[float | None], list[float | None]]:
    atr_values = atr(highs, lows, closes, period)
    upper: list[float | None] = []
    lower: list[float | None] = []
    for high, low, atr_value in zip(highs, lows, atr_values):
        if atr_value is None:
            upper.append(None)
            lower.append(None)
            continue
        hl2 = (high + low) / 2
        upper.append(hl2 + multiplier * atr_value)
        lower.append(hl2 - multiplier * atr_value)
    return upper, lower


def cross_markers(times: list[int], first: list[float | None], second: list[float | None], default_position: str) -> list[dict[str, Any]]:
    markers: list[dict[str, Any]] = []
    for index in range(1, len(times)):
        a0, b0, a1, b1 = first[index - 1], second[index - 1], first[index], second[index]
        if None in (a0, b0, a1, b1):
            continue
        if a0 <= b0 and a1 > b1:
            markers.append(_marker(times[index], "bull cross", "below", "#22c55e", "arrowUp"))
        elif a0 >= b0 and a1 < b1:
            markers.append(_marker(times[index], "bear cross", "above" if default_position == "above" else "above", "#ef4444", "arrowDown"))
    return markers


def threshold_markers(times: list[int], closes: list[float], values: list[float | None], threshold: int) -> list[dict[str, Any]]:
    markers: list[dict[str, Any]] = []
    for index in range(1, len(times)):
        previous, current = values[index - 1], values[index]
        if previous is None or current is None:
            continue
        if previous <= threshold < current:
            markers.append(_marker(times[index], f"RSI > {threshold}", "below", "#22c55e", "arrowUp", closes[index]))
        elif previous >= 100 - threshold > current:
            markers.append(_marker(times[index], f"RSI < {100 - threshold}", "above", "#ef4444", "arrowDown", closes[index]))
    return markers


def volume_markers(times: list[int], closes: list[float], volumes: list[float], period: int, multiplier: float) -> list[dict[str, Any]]:
    baseline = sma(volumes, period)
    markers: list[dict[str, Any]] = []
    for index, average in enumerate(baseline):
        if average is None or volumes[index] <= average * multiplier:
            continue
        markers.append(_marker(times[index], "volume spike", "below", "#f59e0b", "circle", closes[index]))
    return markers


def _line(name: str, times: list[int], values: list[float | None], color: str) -> dict[str, Any]:
    return {
        "name": name,
        "color": color,
        "points": [
            {"time": int(time / 1000), "value": round(value, 6)}
            for time, value in zip(times, values)
            if value is not None
        ],
    }


def _marker(time_ms: int, text: str, position: str, color: str, shape: str, price: float | None = None) -> dict[str, Any]:
    marker = {"time": int(time_ms / 1000), "text": text, "position": f"{position}Bar", "color": color, "shape": shape}
    if price is not None:
        marker["price"] = price
    return marker


def _number(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _bounded_int(value: Any, fallback: int, low: int, high: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = fallback
    return max(low, min(parsed, high))


def _bounded_float(value: Any, fallback: float, low: float, high: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        parsed = fallback
    return max(low, min(parsed, high))


def _sma_crossover() -> dict[str, Any]:
    return {
        "title": "SMA Crossover Research Indicator",
        "description": "Marks fast/slow SMA crosses for manual TradingView review.",
        "pineCode": """//@version=6
indicator("HFS SMA Crossover Research", overlay=true)
fastLen = input.int(9, "Fast SMA", minval=1)
slowLen = input.int(21, "Slow SMA", minval=2)
fast = ta.sma(close, fastLen)
slow = ta.sma(close, slowLen)
bull = ta.crossover(fast, slow)
bear = ta.crossunder(fast, slow)
plot(fast, "Fast SMA", color=color.aqua)
plot(slow, "Slow SMA", color=color.orange)
plotshape(bull, "Bull cross", shape.triangleup, location.belowbar, color=color.lime, size=size.tiny)
plotshape(bear, "Bear cross", shape.triangledown, location.abovebar, color=color.red, size=size.tiny)
alertcondition(bull, "Bull SMA cross", "Fast SMA crossed above slow SMA")
alertcondition(bear, "Bear SMA cross", "Fast SMA crossed below slow SMA")""",
        "inputs": ["Fast SMA length", "Slow SMA length"],
        "plots": ["Fast SMA", "Slow SMA", "Bull/bear markers"],
        "alerts": ["Bull SMA cross", "Bear SMA cross"],
        "warnings": ["Research-only indicator; validate in backend before strategy use."],
        "previewRecipe": {"kind": "crossover", "fastPeriod": 9, "slowPeriod": 21},
    }


def _rsi_volume_breakout() -> dict[str, Any]:
    return {
        "title": "RSI Volume Breakout Research Indicator",
        "description": "Marks candles where RSI confirms upside pressure with elevated volume.",
        "pineCode": """//@version=6
indicator("HFS RSI Volume Breakout Research", overlay=true)
rsiLen = input.int(14, "RSI Length", minval=2)
rsiTrigger = input.int(55, "Bull RSI Trigger", minval=1, maxval=99)
volLen = input.int(20, "Volume Average", minval=2)
volMult = input.float(1.5, "Volume Spike Multiplier", minval=0.1, step=0.1)
rsiValue = ta.rsi(close, rsiLen)
volAverage = ta.sma(volume, volLen)
bullBreakout = ta.crossover(rsiValue, rsiTrigger) and volume > volAverage * volMult and close > high[1]
plotshape(bullBreakout, "RSI volume breakout", shape.triangleup, location.belowbar, color=color.lime, size=size.small)
plot(rsiValue, "RSI", color=color.purple, display=display.pane)
hline(rsiTrigger, "Bull trigger", color=color.new(color.lime, 35))
alertcondition(bullBreakout, "RSI volume breakout", "RSI and volume breakout confirmed")""",
        "inputs": ["RSI length", "Bull RSI trigger", "Volume average length", "Volume spike multiplier"],
        "plots": ["RSI pane", "Breakout markers"],
        "alerts": ["RSI volume breakout"],
        "warnings": ["TradingView compile check still happens in Pine Editor."],
        "previewRecipe": {"kind": "rsi", "period": 14, "threshold": 55},
    }


def _bollinger_squeeze() -> dict[str, Any]:
    return {
        "title": "Bollinger Band Research Indicator",
        "description": "Plots Bollinger Bands and marks closes outside the bands for manual review.",
        "pineCode": """//@version=6
indicator("HFS Bollinger Band Research", overlay=true)
length = input.int(20, "Band Length", minval=2)
mult = input.float(2.0, "StdDev Multiplier", minval=0.1, step=0.1)
basis = ta.sma(close, length)
dev = mult * ta.stdev(close, length)
upper = basis + dev
lower = basis - dev
breakUp = ta.crossover(close, upper)
breakDown = ta.crossunder(close, lower)
plot(basis, "Basis", color=color.gray)
plot(upper, "Upper Band", color=color.lime)
plot(lower, "Lower Band", color=color.red)
plotshape(breakUp, "Upper break", shape.triangleup, location.belowbar, color=color.lime, size=size.tiny)
plotshape(breakDown, "Lower break", shape.triangledown, location.abovebar, color=color.red, size=size.tiny)
alertcondition(breakUp, "Upper band break", "Close crossed above upper Bollinger Band")
alertcondition(breakDown, "Lower band break", "Close crossed below lower Bollinger Band")""",
        "inputs": ["Band length", "StdDev multiplier"],
        "plots": ["Basis", "Upper band", "Lower band", "Break markers"],
        "alerts": ["Upper band break", "Lower band break"],
        "warnings": ["Research-only indicator; validate any strategy version in backend."],
        "previewRecipe": {"kind": "bollinger", "period": 20, "multiplier": 2.0},
    }


def _macd_momentum() -> dict[str, Any]:
    return {
        "title": "MACD Momentum Research Indicator",
        "description": "Plots MACD momentum and marks signal-line crosses.",
        "pineCode": """//@version=6
indicator("HFS MACD Momentum Research", overlay=false)
fastLen = input.int(12, "Fast EMA", minval=1)
slowLen = input.int(26, "Slow EMA", minval=2)
signalLen = input.int(9, "Signal EMA", minval=1)
[macdLine, signalLine, hist] = ta.macd(close, fastLen, slowLen, signalLen)
bull = ta.crossover(macdLine, signalLine)
bear = ta.crossunder(macdLine, signalLine)
plot(macdLine, "MACD", color=color.aqua)
plot(signalLine, "Signal", color=color.orange)
plot(hist, "Histogram", style=plot.style_columns, color=hist >= 0 ? color.lime : color.red)
plotshape(bull, "Bull MACD cross", shape.triangleup, location.bottom, color=color.lime, size=size.tiny)
plotshape(bear, "Bear MACD cross", shape.triangledown, location.top, color=color.red, size=size.tiny)
alertcondition(bull, "Bull MACD cross", "MACD crossed above signal")
alertcondition(bear, "Bear MACD cross", "MACD crossed below signal")""",
        "inputs": ["Fast EMA", "Slow EMA", "Signal EMA"],
        "plots": ["MACD", "Signal", "Histogram", "Cross markers"],
        "alerts": ["Bull MACD cross", "Bear MACD cross"],
        "warnings": ["Research-only indicator; validate any strategy version in backend."],
        "previewRecipe": {"kind": "macd", "fastPeriod": 12, "slowPeriod": 26, "signalPeriod": 9},
    }
