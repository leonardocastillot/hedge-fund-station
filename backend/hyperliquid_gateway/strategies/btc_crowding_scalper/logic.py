"""Deterministic signal logic for the BTC crowding scalper."""

from __future__ import annotations

from typing import Any


def calculate_funding_percentile(current_funding: float, funding_history: list[float]) -> float:
    if not funding_history:
        return 50.0
    sorted_history = sorted(funding_history)
    count_below = sum(1 for rate in sorted_history if rate <= current_funding)
    return round((count_below / len(sorted_history)) * 100, 2)


def evaluate_signal(market_data: dict[str, Any]) -> dict[str, Any]:
    funding_pct = float(market_data.get("fundingPercentile", 50.0) or 50.0)
    funding_rate = float(market_data.get("fundingRate", 0.0) or 0.0)
    crowding = str(market_data.get("crowdingBias", "balanced") or "balanced")
    change_5m = float(market_data.get("change5m", 0.0) or 0.0)
    change_15m = float(market_data.get("change15m", 0.0) or 0.0)
    change_1h = float(market_data.get("change1h", 0.0) or 0.0)
    change_4h = float(market_data.get("change4h", 0.0) or 0.0)
    oi_current = float(market_data.get("openInterestUsd", 0.0) or 0.0)
    oi_1h_ago = float(market_data.get("openInterestUsd1hAgo", oi_current) or oi_current)
    volume_24h = float(market_data.get("volume24h", 0.0) or 0.0)
    setup_scores = market_data.get("setupScores", {}) or {}
    short_squeeze_score = float(setup_scores.get("shortSqueeze", 0.0) or 0.0)
    breakout_score = float(setup_scores.get("breakoutContinuation", 0.0) or 0.0)
    opportunity_score = float(market_data.get("opportunityScore", 0.0) or 0.0)
    oi_delta_pct = ((oi_current - oi_1h_ago) / oi_1h_ago) * 100 if oi_1h_ago else 0.0

    filters = {
        "liquid_market": volume_24h >= 50_000_000,
        "crowding_tailwind": crowding == "shorts-at-risk" or funding_pct <= 45.0 or funding_rate < 0,
        "micro_impulse": change_5m >= 0.03 or change_15m >= 0.08 or change_1h >= 0.18,
        "not_overextended": change_1h <= 2.25 and change_4h <= 5.0,
        "oi_not_collapsing": oi_delta_pct >= -2.5,
        "setup_confirms": short_squeeze_score >= 45.0 or breakout_score >= 50.0 or opportunity_score >= 50.0,
    }
    passed = [key for key, value in filters.items() if value]
    raw_score = max(short_squeeze_score, breakout_score, opportunity_score)
    confidence = min(100, int((len(passed) / len(filters)) * 68 + raw_score * 0.32))
    signal = "long" if len(passed) >= 5 and confidence >= 62 else "none"
    return {
        "strategy_id": "btc_crowding_scalper",
        "symbol": market_data.get("symbol"),
        "signal": signal,
        "direction": "long",
        "confidence": confidence,
        "filters_passed": {key: True for key in passed},
        "filters_failed": {key: False for key, value in filters.items() if not value},
        "reasons": [
            f"funding percentile {funding_pct:.1f}",
            f"crowding {crowding}",
            f"5m {change_5m:.2f}%, 15m {change_15m:.2f}%, 1h {change_1h:.2f}%",
            f"OI delta {oi_delta_pct:.2f}%, setup score {raw_score:.1f}",
        ],
    }
