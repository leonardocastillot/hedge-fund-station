"""Ranking helpers for the BTC fee-aware failed impulse scalp."""

from __future__ import annotations

from typing import Any

STRATEGY_ID = "btc_fee_aware_failed_impulse_scalp"


def calculate_execution_quality(market_data: dict[str, Any]) -> int:
    volume_24h = float(market_data.get("volume24h", 0.0) or 0.0)
    open_interest = float(market_data.get("openInterestUsd", 0.0) or 0.0)
    opportunity = float(market_data.get("opportunityScore", 0.0) or 0.0)

    volume_score = min(40, int((volume_24h / 3_000_000_000) * 40))
    oi_score = min(38, int((open_interest / 2_500_000_000) * 38))
    opportunity_score = min(22, int((opportunity / 100.0) * 22))
    return max(0, min(100, volume_score + oi_score + opportunity_score))


def score_setup(market_data: dict[str, Any], signal_eval: dict[str, Any] | None = None) -> dict[str, Any]:
    signal_eval = signal_eval or {}
    features = signal_eval.get("features", {}) or {}
    signal_confidence = float(signal_eval.get("confidence", 0.0) or 0.0)
    execution_quality = calculate_execution_quality(market_data)
    change_1h = abs(float(features.get("change1h_pct", market_data.get("change1h", 0.0)) or 0.0))
    change_15m = abs(float(features.get("change15m_pct", market_data.get("change15m", 0.0)) or 0.0))
    change_4h = abs(float(features.get("change4h_pct", market_data.get("change4h", 0.0)) or 0.0))
    oi_delta_1h = float(features.get("open_interest_delta_1h_pct", market_data.get("openInterestDelta1hPct", 0.0)) or 0.0)
    fee_edge = float(features.get("fee_edge_pct", 0.0) or 0.0)

    impulse_score = min(100.0, change_1h * 145.0)
    failed_followthrough_score = max(0.0, 100.0 - min(100.0, change_15m * 380.0))
    oi_score = min(100.0, max(0.0, oi_delta_1h + 0.25) * 85.0)
    fee_score = min(100.0, max(0.0, fee_edge) * 110.0)
    extension_penalty = min(34.0, max(0.0, change_4h - 2.0) * 9.0)
    rank_score = round(
        signal_confidence * 0.32
        + execution_quality * 0.22
        + impulse_score * 0.18
        + failed_followthrough_score * 0.16
        + oi_score * 0.07
        + fee_score * 0.05
        - extension_penalty
    )
    rank_score = max(0, min(100, rank_score))
    return {
        "strategy_id": STRATEGY_ID,
        "symbol": market_data.get("symbol", "BTC"),
        "rank_score": rank_score,
        "signal_direction": signal_eval.get("signal", "none"),
        "signal_confidence": signal_confidence,
        "execution_quality": execution_quality,
        "impulse_score": round(impulse_score, 2),
        "failed_followthrough_score": round(failed_followthrough_score, 2),
        "oi_score": round(oi_score, 2),
        "fee_score": round(fee_score, 2),
        "extension_penalty": round(extension_penalty, 2),
        "watchlist_label": "watch-now" if rank_score >= 76 else "wait-trigger" if rank_score >= 60 else "avoid",
    }
