from __future__ import annotations

from typing import Any

from .logic import MIN_ENTRY_BOUNCE_RSI, STRATEGY_ID


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
    atr_pct = float(signal_eval.get("atr_percentile") or 50.0)
    vol_regime = str(signal_eval.get("vol_regime") or "unknown")
    atr_stop_dist = float(signal_eval.get("atr_stop_distance_pct") or 5.0)

    trend_spread = ((sma50 - sma150) / sma150) * 100.0 if sma150 else 0.0
    rsi_edge = max(0.0, rsi14 - MIN_ENTRY_BOUNCE_RSI)
    vol_score = max(0.0, 100.0 - atr_pct) * 0.15
    regime_bonus = 10.0 if vol_regime == "low" else 5.0 if vol_regime == "normal" else 0.0
    stop_quality = min(20.0, max(0.0, 20.0 - atr_stop_dist * 0.8))
    drawdown_penalty = min(30.0, float(signal_eval.get("drawdown_180d_pct") or 0.0) * 0.4)

    rank_score = max(
        0.0,
        min(
            100.0,
            25.0
            + trend_spread * 0.8
            + rsi_edge * 0.6
            + vol_score
            + regime_bonus
            + stop_quality
            - drawdown_penalty,
        ),
    )

    return {
        "strategy_id": STRATEGY_ID,
        "rank_score": round(rank_score, 2),
        "label": "watch-now" if signal_eval.get("signal") == "long" else "standby",
        "execution_quality": round(max(0.0, min(100.0, rank_score))),
        "vol_regime": vol_regime,
        "atr_percentile": round(atr_pct, 2),
        "atr_stop_distance_pct": round(atr_stop_dist, 4),
        "trend_spread_pct": round(trend_spread, 4),
    }
