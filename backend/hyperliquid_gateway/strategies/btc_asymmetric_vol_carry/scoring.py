"""Setup scoring for BTC Asymmetric Vol Carry."""

from __future__ import annotations

from typing import Any

from .logic import STRATEGY_ID


def score_setup(signal_eval: dict[str, Any]) -> dict[str, Any]:
    if not signal_eval.get("has_required_history"):
        return {
            "strategy_id": STRATEGY_ID,
            "rank_score": 0,
            "label": "insufficient-history",
            "execution_quality": 0,
        }

    signal = signal_eval.get("signal", "none")
    setup_type = signal_eval.get("setup_type")
    atr_pct = float(signal_eval.get("atr_percentile") or 50.0)
    rsi14 = float(signal_eval.get("rsi14") or 50.0)
    dd_180d = float(signal_eval.get("drawdown_180d_pct") or 0.0)
    target_frac = float(signal_eval.get("target_exposure_fraction") or 0.0)

    score = 0.0

    if setup_type == "panic_long":
        vol_contrib = (100.0 - atr_pct) * 0.3
        rsi_contrib = max(0, 50.0 - rsi14) * 0.5
        dd_contrib = min(dd_180d * 0.15, 15.0)
        score = 40.0 + vol_contrib + rsi_contrib + dd_contrib

    elif setup_type == "compression_long":
        vol_contrib = (30.0 - atr_pct) * 0.5
        rsi_contrib = max(0, rsi14 - 50.0) * 0.3
        score = 50.0 + vol_contrib + rsi_contrib

    elif setup_type == "euphoria_short":
        vol_contrib = (30.0 - atr_pct) * 0.4
        rsi_contrib = max(0, rsi14 - 70.0) * 0.6
        score = 45.0 + vol_contrib + rsi_contrib

    elif setup_type == "breakdown_short":
        vol_contrib = atr_pct * 0.25
        rsi_contrib = max(0, 50.0 - rsi14) * 0.4
        score = 35.0 + vol_contrib + rsi_contrib

    else:
        score = max(0.0, 50.0 - dd_180d * 0.3)

    exposure_bonus = target_frac * 60.0
    score = max(0.0, min(100.0, score + exposure_bonus))

    return {
        "strategy_id": STRATEGY_ID,
        "rank_score": round(score, 2),
        "label": "enter" if signal in ("long", "short") else "standby",
        "execution_quality": round(max(0.0, min(100.0, score))),
        "setup_type": setup_type,
        "atr_percentile": round(atr_pct, 4),
        "rsi14": round(rsi14, 4),
        "target_exposure_fraction": round(target_frac, 4),
    }
