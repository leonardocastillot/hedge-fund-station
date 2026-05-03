"""Deterministic short squeeze continuation signal logic."""

from __future__ import annotations

from typing import Any


def calculate_funding_percentile(current_funding: float, funding_history: list[float]) -> float:
    if not funding_history:
        return 50.0
    sorted_history = sorted(funding_history)
    count_below = sum(1 for rate in sorted_history if rate <= current_funding)
    return round((count_below / len(sorted_history)) * 100, 2)


def evaluate_signal(market_data: dict[str, Any]) -> dict[str, Any]:
    """Evaluate a long continuation after shorts are trapped."""
    funding_pct = float(market_data.get("fundingPercentile", 50.0) or 50.0)
    crowding = market_data.get("crowdingBias", "balanced")
    change_1h = float(market_data.get("change1h", 0.0) or 0.0)
    change_4h = float(market_data.get("change4h", 0.0) or 0.0)
    change_24h = float(market_data.get("change24h", 0.0) or 0.0)
    oi_current = float(market_data.get("openInterestUsd", 0.0) or 0.0)
    oi_1h_ago = float(market_data.get("openInterestUsd1hAgo", oi_current) or oi_current)
    volume_24h = float(market_data.get("volume24h", 0.0) or 0.0)
    setup_scores = market_data.get("setupScores", {}) or {}
    short_squeeze_score = float(setup_scores.get("shortSqueeze", 0.0) or 0.0)
    breakout_score = float(setup_scores.get("breakoutContinuation", 0.0) or 0.0)
    opportunity_score = float(market_data.get("opportunityScore", 0.0) or 0.0)
    oi_delta_pct = ((oi_current - oi_1h_ago) / oi_1h_ago) * 100 if oi_1h_ago else 0.0

    filters = {
        "negative_or_low_funding": funding_pct <= 35.0 or float(market_data.get("fundingRate", 0.0) or 0.0) < 0 or crowding == "shorts-at-risk",
        "shorts_at_risk": crowding == "shorts-at-risk",
        "positive_impulse": change_1h >= 0.35 or change_4h >= 0.9 or change_24h >= 1.0,
        "oi_not_collapsing": oi_delta_pct >= -3.0,
        "liquid_market": volume_24h >= 500_000,
        "setup_confirms": short_squeeze_score >= 58.0 or breakout_score >= 62.0,
        "opportunity_threshold": opportunity_score >= 55.0,
    }
    passed = [key for key, value in filters.items() if value]
    confidence = min(100, int((len(passed) / len(filters)) * 72 + max(short_squeeze_score, breakout_score) * 0.28))
    signal = "long" if len(passed) >= 6 and confidence >= 72 else "none"
    return {
        "strategy_id": "short_squeeze_continuation",
        "symbol": market_data.get("symbol"),
        "signal": signal,
        "direction": "long",
        "confidence": confidence,
        "filters_passed": {key: True for key in passed},
        "filters_failed": {key: False for key, value in filters.items() if not value},
        "reasons": [
            f"funding percentile {funding_pct:.1f}",
            f"crowding {crowding}",
            f"1h move {change_1h:.2f}%, 24h move {change_24h:.2f}%, OI delta {oi_delta_pct:.2f}%",
            f"short squeeze score {short_squeeze_score:.1f}, breakout score {breakout_score:.1f}",
        ],
    }
