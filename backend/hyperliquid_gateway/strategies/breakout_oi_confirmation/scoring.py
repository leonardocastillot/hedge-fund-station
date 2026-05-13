"""Ranking helpers for Breakout OI Confirmation."""

from __future__ import annotations

from typing import Any

STRATEGY_ID = "breakout_oi_confirmation"


def calculate_execution_quality(market_data: dict[str, Any]) -> int:
    volume_24h = float(market_data.get("volume24h", 0.0) or 0.0)
    oi_usd = float(market_data.get("openInterestUsd", 0.0) or 0.0)
    opportunity = float(market_data.get("opportunityScore", 0.0) or 0.0)
    volume_score = min(38, int((volume_24h / 300_000_000) * 38))
    oi_score = min(34, int((oi_usd / 250_000_000) * 34))
    opportunity_score = min(28, int((opportunity / 100) * 28))
    return max(0, min(100, volume_score + oi_score + opportunity_score))


def score_setup(market_data: dict[str, Any], signal_eval: dict[str, Any] | None = None) -> dict[str, Any]:
    signal_eval = signal_eval or {}
    setup_scores = market_data.get("setupScores", {}) or {}
    breakout_score = float(setup_scores.get("breakoutContinuation", 0.0) or 0.0)
    fade_score = float(setup_scores.get("fade", 0.0) or 0.0)
    short_squeeze_score = float(setup_scores.get("shortSqueeze", 0.0) or 0.0)
    long_flush_score = float(setup_scores.get("longFlush", 0.0) or 0.0)
    signal_confidence = float(signal_eval.get("confidence", 0.0) or 0.0)
    features = signal_eval.get("features", {}) or {}
    oi_delta_pct = float(features.get("oi_delta_1h_pct", 0.0) or 0.0)
    change_15m = abs(float(market_data.get("change15m", 0.0) or 0.0))
    change_1h = abs(float(market_data.get("change1h", 0.0) or 0.0))
    execution_quality = calculate_execution_quality(market_data)

    impulse_score = min(100.0, (change_15m * 120.0) + (change_1h * 45.0))
    oi_score = min(100.0, max(0.0, oi_delta_pct * 45.0))
    crowding_bonus = max(short_squeeze_score, long_flush_score) * 0.05
    fade_penalty = fade_score * 0.12
    rank_score = round(
        signal_confidence * 0.34
        + breakout_score * 0.25
        + execution_quality * 0.19
        + oi_score * 0.12
        + impulse_score * 0.10
        + crowding_bonus
        - fade_penalty
    )
    rank_score = max(0, min(100, rank_score))
    return {
        "strategy_id": STRATEGY_ID,
        "symbol": market_data.get("symbol", "UNKNOWN"),
        "rank_score": rank_score,
        "signal_direction": signal_eval.get("signal", "none"),
        "signal_confidence": signal_confidence,
        "execution_quality": execution_quality,
        "breakout_score": round(breakout_score, 2),
        "oi_delta_1h_pct": round(oi_delta_pct, 4),
        "impulse_score": round(impulse_score, 2),
        "fade_penalty": round(fade_penalty, 2),
        "watchlist_label": "watch-now" if rank_score >= 74 else "wait-trigger" if rank_score >= 60 else "avoid",
    }
