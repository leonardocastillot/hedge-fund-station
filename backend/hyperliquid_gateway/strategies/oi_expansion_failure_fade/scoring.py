"""Ranking helpers for OI Expansion Failure Fade."""

from __future__ import annotations

from typing import Any

STRATEGY_ID = "oi_expansion_failure_fade"


def calculate_execution_quality(market_data: dict[str, Any]) -> int:
    volume_24h = float(market_data.get("volume24h", 0.0) or 0.0)
    oi_usd = float(market_data.get("openInterestUsd", 0.0) or 0.0)
    opportunity = float(market_data.get("opportunityScore", 0.0) or 0.0)

    volume_score = min(40, int((volume_24h / 250_000_000) * 40))
    oi_score = min(35, int((oi_usd / 250_000_000) * 35))
    opportunity_score = min(25, int((opportunity / 100) * 25))
    return max(0, min(100, volume_score + oi_score + opportunity_score))


def score_setup(market_data: dict[str, Any], signal_eval: dict[str, Any] | None = None) -> dict[str, Any]:
    signal_eval = signal_eval or {}
    setup_scores = market_data.get("setupScores", {}) or {}
    fade_score = float(setup_scores.get("fade", 0.0) or 0.0)
    long_flush_score = float(setup_scores.get("longFlush", 0.0) or 0.0)
    short_squeeze_score = float(setup_scores.get("shortSqueeze", 0.0) or 0.0)
    breakout_score = float(setup_scores.get("breakoutContinuation", 0.0) or 0.0)
    signal_confidence = float(signal_eval.get("confidence", 0.0) or 0.0)
    execution_quality = calculate_execution_quality(market_data)
    features = signal_eval.get("features", {}) or {}
    oi_delta_pct = float(features.get("oi_delta_1h_pct", 0.0) or 0.0)
    change_5m = abs(float(market_data.get("change5m", 0.0) or 0.0))
    change_15m = abs(float(market_data.get("change15m", 0.0) or 0.0))

    stall_score = max(0.0, 100.0 - min(100.0, (change_5m * 250.0) + (change_15m * 120.0)))
    oi_score = min(100.0, max(0.0, oi_delta_pct * 35.0))
    continuation_penalty = max(long_flush_score, short_squeeze_score, breakout_score) * 0.18
    rank_score = round(
        signal_confidence * 0.36
        + fade_score * 0.22
        + execution_quality * 0.20
        + stall_score * 0.12
        + oi_score * 0.10
        - continuation_penalty
    )
    rank_score = max(0, min(100, rank_score))
    watchlist_label = "watch-now" if rank_score >= 72 else "wait-trigger" if rank_score >= 58 else "avoid"
    return {
        "strategy_id": STRATEGY_ID,
        "symbol": market_data.get("symbol", "UNKNOWN"),
        "rank_score": rank_score,
        "signal_direction": signal_eval.get("signal", "none"),
        "signal_confidence": signal_confidence,
        "execution_quality": execution_quality,
        "fade_score": round(fade_score, 2),
        "oi_delta_1h_pct": round(oi_delta_pct, 4),
        "stall_score": round(stall_score, 2),
        "continuation_penalty": round(continuation_penalty, 2),
        "watchlist_label": watchlist_label,
    }
