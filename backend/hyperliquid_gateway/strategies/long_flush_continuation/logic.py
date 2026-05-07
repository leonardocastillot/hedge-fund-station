"""Deterministic long flush continuation signal logic."""

from __future__ import annotations

from typing import Any

STRATEGY_ID = "long_flush_continuation"


def calculate_funding_percentile(current_funding: float, funding_history: list[float]) -> float:
    if not funding_history:
        return 50.0
    sorted_history = sorted(funding_history)
    count_below = sum(1 for rate in sorted_history if rate <= current_funding)
    return round((count_below / len(sorted_history)) * 100, 2)


def evaluate_signal(market_data: dict[str, Any]) -> dict[str, Any]:
    """Evaluate a short continuation after crowded longs start failing."""
    funding_rate = float(market_data.get("fundingRate", 0.0) or 0.0)
    funding_pct = float(market_data.get("fundingPercentile", 50.0) or 50.0)
    crowding = str(market_data.get("crowdingBias", "balanced") or "balanced")
    change_1h = float(market_data.get("change1h", 0.0) or 0.0)
    change_4h = float(market_data.get("change4h", 0.0) or 0.0)
    change_24h = float(market_data.get("change24h", 0.0) or 0.0)
    oi_current = float(market_data.get("openInterestUsd", 0.0) or 0.0)
    oi_1h_ago = float(market_data.get("openInterestUsd1hAgo", oi_current) or oi_current)
    volume_24h = float(market_data.get("volume24h", 0.0) or 0.0)
    setup_scores = market_data.get("setupScores", {}) or {}
    long_flush_score = float(setup_scores.get("longFlush", 0.0) or 0.0)
    fade_score = float(setup_scores.get("fade", 0.0) or 0.0)
    opportunity_score = float(market_data.get("opportunityScore", 0.0) or 0.0)
    oi_delta_pct = ((oi_current - oi_1h_ago) / oi_1h_ago) * 100 if oi_1h_ago else 0.0
    score_pressure = long_flush_score >= 64.0 and fade_score >= 70.0 and funding_rate > 0

    filters = {
        "positive_or_high_funding": funding_pct >= 65.0 or funding_rate > 0 or crowding == "longs-at-risk",
        "long_pressure": crowding == "longs-at-risk" or score_pressure,
        "negative_impulse": change_1h <= -0.35 or change_4h <= -0.9 or change_24h <= -1.0,
        "oi_not_collapsing": oi_delta_pct >= -3.0,
        "liquid_market": volume_24h >= 500_000,
        "setup_confirms": long_flush_score >= 58.0 or fade_score >= 62.0,
        "opportunity_threshold": opportunity_score >= 55.0,
    }
    passed = [key for key, value in filters.items() if value]
    continuation_score = max(long_flush_score, fade_score)
    confidence = min(100, int((len(passed) / len(filters)) * 72 + continuation_score * 0.28))
    core_filters = filters["long_pressure"] and filters["negative_impulse"] and filters["setup_confirms"]
    signal = "short" if core_filters and len(passed) >= 6 and confidence >= 72 else "none"
    return {
        "strategy_id": STRATEGY_ID,
        "symbol": market_data.get("symbol"),
        "signal": signal,
        "direction": "short",
        "confidence": confidence,
        "filters_passed": {key: True for key in passed},
        "filters_failed": {key: False for key, value in filters.items() if not value},
        "metrics": {
            "funding_percentile": round(funding_pct, 2),
            "funding_rate": funding_rate,
            "change_1h_pct": round(change_1h, 4),
            "change_4h_pct": round(change_4h, 4),
            "change_24h_pct": round(change_24h, 4),
            "oi_delta_1h_pct": round(oi_delta_pct, 4),
            "long_flush_score": round(long_flush_score, 2),
            "fade_score": round(fade_score, 2),
        },
        "reasons": [
            f"funding percentile {funding_pct:.1f}, funding {funding_rate:.6f}",
            f"crowding {crowding}",
            f"1h move {change_1h:.2f}%, 24h move {change_24h:.2f}%, OI delta {oi_delta_pct:.2f}%",
            f"long flush score {long_flush_score:.1f}, fade score {fade_score:.1f}",
        ],
    }
