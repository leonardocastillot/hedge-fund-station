"""Ranking helpers for the BTC crowding scalper."""

from __future__ import annotations

from typing import Any


def calculate_execution_quality(market_data: dict[str, Any]) -> int:
    volume_24h = float(market_data.get("volume24h", 0.0) or 0.0)
    oi_usd = float(market_data.get("openInterestUsd", 0.0) or 0.0)
    opportunity = float(market_data.get("opportunityScore", 0.0) or 0.0)
    volume_score = min(40, int((volume_24h / 300_000_000) * 40))
    oi_score = min(35, int((oi_usd / 300_000_000) * 35))
    opportunity_score = min(25, int((opportunity / 100) * 25))
    return max(0, min(100, volume_score + oi_score + opportunity_score))


def score_setup(market_data: dict[str, Any], signal_eval: dict[str, Any] | None = None) -> dict[str, Any]:
    signal_eval = signal_eval or {}
    setup_scores = market_data.get("setupScores", {}) or {}
    squeeze_score = float(setup_scores.get("shortSqueeze", 0.0) or 0.0)
    breakout_score = float(setup_scores.get("breakoutContinuation", 0.0) or 0.0)
    opportunity = float(market_data.get("opportunityScore", 0.0) or 0.0)
    signal_confidence = float(signal_eval.get("confidence", 0.0) or 0.0)
    execution_quality = calculate_execution_quality(market_data)
    impulse_score = min(100.0, max(0.0, float(market_data.get("change15m", 0.0) or 0.0) * 120))
    rank_score = round(
        signal_confidence * 0.36
        + max(squeeze_score, breakout_score, opportunity) * 0.28
        + execution_quality * 0.24
        + impulse_score * 0.12
    )
    return {
        "strategy_id": "btc_crowding_scalper",
        "symbol": market_data.get("symbol", "UNKNOWN"),
        "rank_score": max(0, min(100, rank_score)),
        "signal_direction": signal_eval.get("signal", "none"),
        "signal_confidence": signal_confidence,
        "execution_quality": execution_quality,
        "squeeze_score": squeeze_score,
        "breakout_score": breakout_score,
        "watchlist_label": "scalp-now" if rank_score >= 70 else "wait-trigger" if rank_score >= 58 else "avoid",
    }
