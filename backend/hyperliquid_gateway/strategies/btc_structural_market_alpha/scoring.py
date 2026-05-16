from __future__ import annotations

from typing import Any

from .logic import STRATEGY_ID


def score_setup(signal_eval: dict[str, Any]) -> dict[str, Any]:
    if not signal_eval.get("has_required_history"):
        return {"strategy_id": STRATEGY_ID, "rank_score": 0, "label": "insufficient-history", "execution_quality": 0}

    composite = float(signal_eval.get("composite_score") or 0)
    components = signal_eval.get("component_scores", {}) or {}
    rsi14 = float(signal_eval.get("rsi14") or 50)
    atr_pct = float(signal_eval.get("atr_percentile") or 50)
    vol_regime = str(signal_eval.get("vol_regime") or "unknown")

    component_quality = sum(abs(v) for v in components.values()) / 4.0
    rsi_bonus = max(0, 15 - abs(50 - rsi14) * 0.3)
    vol_penalty = max(0, atr_pct - 60) * 0.3
    regime_bonus = 10 if vol_regime == "low" else 5 if vol_regime == "normal" else 0

    rank_score = max(0, min(100,
        max(0, composite) * 0.5
        + component_quality * 0.2
        + rsi_bonus
        - vol_penalty
        + regime_bonus
    ))

    return {
        "strategy_id": STRATEGY_ID,
        "rank_score": round(rank_score, 2),
        "label": "watch-now" if signal_eval.get("signal") == "long" else "standby",
        "execution_quality": round(max(0, min(100, rank_score))),
        "composite_score": composite,
        "vol_regime": vol_regime,
        "atr_percentile": round(atr_pct, 2),
    }
