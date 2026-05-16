from __future__ import annotations

from typing import Any

from .logic import STRATEGY_ID


def calculate_execution_quality(market_data: dict[str, Any]) -> int:
    volume_24h = float(market_data.get("volume24h", 0.0) or 0.0)
    oi_usd = float(market_data.get("openInterestUsd", 0.0) or 0.0)
    opp = float(market_data.get("opportunityScore", 0.0) or 0.0)
    vol_score = min(36, int((volume_24h / 500_000_000) * 36))
    oi_score = min(34, int((oi_usd / 400_000_000) * 34))
    opp_score = min(30, int((opp / 100) * 30))
    return max(0, min(100, vol_score + oi_score + opp_score))


def score_setup(market_data: dict[str, Any], signal_eval: dict[str, Any] | None = None) -> dict[str, Any]:
    signal_eval = signal_eval or {}
    components = signal_eval.get("component_scores", {}) or {}
    features = signal_eval.get("features", {}) or {}
    conviction = int(signal_eval.get("conviction") or 0)
    eq = calculate_execution_quality(market_data)
    components_abs_sum = sum(abs(v) for v in components.values())
    conviction_from_components = min(100, components_abs_sum * 0.4)
    rank_score = max(0, min(100, int(
        conviction * 0.40
        + conviction_from_components * 0.25
        + eq * 0.20
        + features.get("opportunity_score", 0) * 0.15
    )))
    return {
        "strategy_id": STRATEGY_ID,
        "symbol": market_data.get("symbol", "UNKNOWN"),
        "rank_score": rank_score,
        "signal_direction": signal_eval.get("signal", "none"),
        "conviction": conviction,
        "execution_quality": eq,
        "composite_score": signal_eval.get("composite_score"),
        "component_scores": components,
        "tf_agreement": features.get("tf_agreement"),
        "watchlist_label": "watch-now" if rank_score >= 72 else "wait-trigger" if rank_score >= 55 else "avoid",
    }
