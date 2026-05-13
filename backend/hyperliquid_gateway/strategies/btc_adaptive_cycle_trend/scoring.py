"""Setup scoring for BTC Adaptive Cycle Trend."""

from __future__ import annotations

from typing import Any

from .logic import MIN_ENTRY_RSI, STRATEGY_ID


def score_setup(signal_eval: dict[str, Any]) -> dict[str, Any]:
    if not signal_eval.get("has_required_history"):
        return {
            "strategy_id": STRATEGY_ID,
            "rank_score": 0,
            "label": "insufficient-history",
            "execution_quality": 0,
        }

    close = float(signal_eval.get("close") or 0.0)
    sma150 = float(signal_eval.get("sma150") or close or 1.0)
    sma50 = float(signal_eval.get("sma50") or close or 1.0)
    rsi14 = float(signal_eval.get("rsi14") or 50.0)
    trend_spread_pct = ((sma50 - sma150) / sma150) * 100.0 if sma150 else 0.0
    price_spread_pct = ((close - sma150) / sma150) * 100.0 if sma150 else 0.0
    rsi_edge = max(0.0, rsi14 - MIN_ENTRY_RSI)
    drawdown_penalty = min(35.0, float(signal_eval.get("drawdown_180d_pct") or 0.0) * 0.5)
    strong_bonus = 12.0 if signal_eval.get("strong_regime") else 0.0
    exposure_bonus = float(signal_eval.get("target_exposure_fraction") or 0.0) * 50.0
    rank_score = max(
        0.0,
        min(100.0, 32.0 + trend_spread_pct + (price_spread_pct * 0.45) + (rsi_edge * 0.8) - drawdown_penalty + strong_bonus + exposure_bonus),
    )
    return {
        "strategy_id": STRATEGY_ID,
        "rank_score": round(rank_score, 2),
        "label": "watch-now" if signal_eval.get("signal") == "long" else "standby",
        "execution_quality": round(max(0.0, min(100.0, rank_score))),
        "trend_spread_pct": round(trend_spread_pct, 4),
        "price_spread_pct": round(price_spread_pct, 4),
        "strong_regime": bool(signal_eval.get("strong_regime")),
        "target_exposure_fraction": signal_eval.get("target_exposure_fraction"),
    }
