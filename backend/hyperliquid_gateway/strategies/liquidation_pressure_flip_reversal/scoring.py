"""Ranking helpers for Liquidation Pressure Flip Reversal."""

from __future__ import annotations

from typing import Any

STRATEGY_ID = "liquidation_pressure_flip_reversal"


def calculate_execution_quality(market_data: dict[str, Any]) -> int:
    volume_24h = float(market_data.get("volume24h", 0.0) or 0.0)
    oi_usd = float(market_data.get("openInterestUsd", 0.0) or 0.0)
    opportunity = float(market_data.get("opportunityScore", 0.0) or 0.0)
    volume_score = min(36, int((volume_24h / 250_000_000) * 36))
    oi_score = min(34, int((oi_usd / 250_000_000) * 34))
    opportunity_score = min(30, int((opportunity / 100) * 30))
    return max(0, min(100, volume_score + oi_score + opportunity_score))


def score_setup(market_data: dict[str, Any], signal_eval: dict[str, Any] | None = None) -> dict[str, Any]:
    signal_eval = signal_eval or {}
    setup_scores = market_data.get("setupScores", {}) or {}
    fade_score = float(setup_scores.get("fade", 0.0) or 0.0)
    long_flush_score = float(setup_scores.get("longFlush", 0.0) or 0.0)
    short_squeeze_score = float(setup_scores.get("shortSqueeze", 0.0) or 0.0)
    breakout_score = float(setup_scores.get("breakoutContinuation", 0.0) or 0.0)
    signal_confidence = float(signal_eval.get("confidence", 0.0) or 0.0)
    features = signal_eval.get("features", {}) or {}
    estimated_liquidation = float(features.get("estimated_liquidation_usd", 0.0) or 0.0)
    change_5m = abs(float(market_data.get("change5m", 0.0) or 0.0))
    change_15m = abs(float(market_data.get("change15m", 0.0) or 0.0))
    pressure_score = max(long_flush_score, short_squeeze_score)
    execution_quality = calculate_execution_quality(market_data)

    stall_score = max(0.0, 100.0 - min(100.0, (change_5m * 280.0) + (change_15m * 140.0)))
    liquidation_score = min(100.0, estimated_liquidation / 50_000.0)
    breakout_penalty = breakout_score * 0.16
    rank_score = round(
        signal_confidence * 0.33
        + pressure_score * 0.22
        + fade_score * 0.17
        + execution_quality * 0.14
        + stall_score * 0.08
        + liquidation_score * 0.06
        - breakout_penalty
    )
    rank_score = max(0, min(100, rank_score))
    return {
        "strategy_id": STRATEGY_ID,
        "symbol": market_data.get("symbol", "UNKNOWN"),
        "rank_score": rank_score,
        "signal_direction": signal_eval.get("signal", "none"),
        "signal_confidence": signal_confidence,
        "execution_quality": execution_quality,
        "fade_score": round(fade_score, 2),
        "pressure_score": round(pressure_score, 2),
        "stall_score": round(stall_score, 2),
        "liquidation_score": round(liquidation_score, 2),
        "breakout_penalty": round(breakout_penalty, 2),
        "watchlist_label": "watch-now" if rank_score >= 72 else "wait-trigger" if rank_score >= 58 else "avoid",
    }
