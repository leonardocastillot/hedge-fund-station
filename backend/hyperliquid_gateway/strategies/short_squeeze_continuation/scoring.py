"""Ranking helpers for short squeeze continuation."""

from __future__ import annotations

from typing import Any


def calculate_execution_quality(market_data: dict[str, Any]) -> int:
    volume_24h = float(market_data.get("volume24h", 0.0) or 0.0)
    oi_usd = float(market_data.get("openInterestUsd", 0.0) or 0.0)
    opportunity = float(market_data.get("opportunityScore", 0.0) or 0.0)
    volume_score = min(35, int((volume_24h / 200_000_000) * 35))
    oi_score = min(35, int((oi_usd / 200_000_000) * 35))
    opportunity_score = min(30, int((opportunity / 100) * 30))
    return max(0, min(100, volume_score + oi_score + opportunity_score))


def score_setup(market_data: dict[str, Any], signal_eval: dict[str, Any] | None = None) -> dict[str, Any]:
    signal_eval = signal_eval or {}
    setup_scores = market_data.get("setupScores", {}) or {}
    squeeze_score = float(setup_scores.get("shortSqueeze", 0.0) or 0.0)
    breakout_score = float(setup_scores.get("breakoutContinuation", 0.0) or 0.0)
    signal_confidence = float(signal_eval.get("confidence", 0.0) or 0.0)
    execution_quality = calculate_execution_quality(market_data)
    rank_score = round(signal_confidence * 0.48 + max(squeeze_score, breakout_score) * 0.32 + execution_quality * 0.20)
    return {
        "strategy_id": "short_squeeze_continuation",
        "symbol": market_data.get("symbol", "UNKNOWN"),
        "rank_score": max(0, min(100, rank_score)),
        "signal_direction": signal_eval.get("signal", "none"),
        "signal_confidence": signal_confidence,
        "execution_quality": execution_quality,
        "squeeze_score": squeeze_score,
        "breakout_score": breakout_score,
        "watchlist_label": "watch-now" if rank_score >= 76 else "wait-trigger" if rank_score >= 62 else "avoid",
    }
