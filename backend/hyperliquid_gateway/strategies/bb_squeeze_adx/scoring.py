"""BB Squeeze ADX scoring helpers."""

from __future__ import annotations

from typing import Any


def score_signal(signal: dict[str, Any]) -> dict[str, Any]:
    adx_value = float(signal.get("adx") or 0.0)
    base_score = min(100, max(0, int(adx_value * 2.5)))
    action = "watch"
    if signal.get("signal") in {"long", "short"}:
        action = "watch-now" if base_score >= 65 else "wait-trigger"
    return {
        "strategy_id": "bb_squeeze_adx",
        "signal": signal.get("signal", "none"),
        "rank_score": base_score,
        "watchlist_label": action,
        "adx": adx_value,
    }
