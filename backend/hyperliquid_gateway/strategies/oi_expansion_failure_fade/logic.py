"""Deterministic signal logic for OI Expansion Failure Fade."""

from __future__ import annotations

from typing import Any

STRATEGY_ID = "oi_expansion_failure_fade"
MIN_VOLUME_USD = 10_000_000
MIN_OPEN_INTEREST_USD = 1_000_000
MIN_FADE_SCORE = 68.0
MIN_IMPULSE_1H_PCT = 0.20
MIN_OI_EXPANSION_1H_PCT = 0.05
EXTREME_CONTINUATION_SCORE = 84.0
EXTREME_BREAKOUT_SCORE = 88.0


def calculate_funding_percentile(current_funding: float, funding_history: list[float]) -> float:
    if not funding_history:
        return 50.0
    sorted_history = sorted(funding_history)
    count_below = sum(1 for rate in sorted_history if rate <= current_funding)
    return round((count_below / len(sorted_history)) * 100, 2)


def evaluate_signal(market_data: dict[str, Any]) -> dict[str, Any]:
    symbol = market_data.get("symbol")
    price = float(market_data.get("price", 0.0) or 0.0)
    volume_24h = float(market_data.get("volume24h", 0.0) or 0.0)
    oi_current = float(market_data.get("openInterestUsd", 0.0) or 0.0)
    oi_1h_ago = float(market_data.get("openInterestUsd1hAgo", oi_current) or oi_current)
    oi_delta_pct = ((oi_current - oi_1h_ago) / oi_1h_ago) * 100 if oi_1h_ago else 0.0
    change_5m = float(market_data.get("change5m", 0.0) or 0.0)
    change_15m = float(market_data.get("change15m", 0.0) or 0.0)
    change_1h = float(market_data.get("change1h", 0.0) or 0.0)
    primary_setup = str(market_data.get("primarySetup", "no-trade") or "no-trade")
    crowding = str(market_data.get("crowdingBias", "balanced") or "balanced")
    funding_rate = float(market_data.get("fundingRate", 0.0) or 0.0)
    funding_pct = float(market_data.get("fundingPercentile", 50.0) or 50.0)
    setup_scores = market_data.get("setupScores", {}) or {}
    fade_score = float(setup_scores.get("fade", 0.0) or 0.0)
    long_flush_score = float(setup_scores.get("longFlush", 0.0) or 0.0)
    short_squeeze_score = float(setup_scores.get("shortSqueeze", 0.0) or 0.0)
    breakout_score = float(setup_scores.get("breakoutContinuation", 0.0) or 0.0)

    common_filters = {
        "valid_price": price > 0,
        "liquid_volume": volume_24h >= MIN_VOLUME_USD,
        "meaningful_open_interest": oi_current >= MIN_OPEN_INTEREST_USD,
        "oi_expanding_1h": oi_delta_pct >= MIN_OI_EXPANSION_1H_PCT,
        "fade_setup": primary_setup == "fade" or fade_score >= MIN_FADE_SCORE,
    }

    long_filters = {
        **common_filters,
        "downside_impulse_1h": change_1h <= -MIN_IMPULSE_1H_PCT,
        "downside_followthrough_failing": change_5m >= -0.08 or change_15m >= -0.12,
        "not_extreme_downside_continuation": long_flush_score < EXTREME_CONTINUATION_SCORE,
        "not_extreme_breakout": breakout_score < EXTREME_BREAKOUT_SCORE,
    }
    short_filters = {
        **common_filters,
        "upside_impulse_1h": change_1h >= MIN_IMPULSE_1H_PCT,
        "upside_followthrough_failing": change_5m <= 0.08 or change_15m <= 0.12,
        "not_extreme_upside_continuation": short_squeeze_score < EXTREME_CONTINUATION_SCORE,
        "not_extreme_breakout": breakout_score < EXTREME_BREAKOUT_SCORE,
    }

    long_confidence = confidence_from_filters(long_filters, fade_score, oi_delta_pct)
    short_confidence = confidence_from_filters(short_filters, fade_score, oi_delta_pct)
    long_passed = sum(1 for value in long_filters.values() if value)
    short_passed = sum(1 for value in short_filters.values() if value)

    if long_passed >= 8 and long_confidence >= 62 and long_confidence >= short_confidence:
        signal = "long"
        direction = "long"
        chosen_filters = long_filters
        confidence = long_confidence
        continuation_score = long_flush_score
    elif short_passed >= 8 and short_confidence >= 62:
        signal = "short"
        direction = "short"
        chosen_filters = short_filters
        confidence = short_confidence
        continuation_score = max(short_squeeze_score, breakout_score)
    else:
        signal = "none"
        direction = "none"
        chosen_filters = long_filters if long_confidence >= short_confidence else short_filters
        confidence = max(long_confidence, short_confidence)
        continuation_score = max(long_flush_score, short_squeeze_score, breakout_score)

    passed = {key: True for key, value in chosen_filters.items() if value}
    failed = {key: False for key, value in chosen_filters.items() if not value}
    return {
        "strategy_id": STRATEGY_ID,
        "symbol": symbol,
        "signal": signal,
        "direction": direction,
        "confidence": confidence,
        "filters_passed": passed,
        "filters_failed": failed,
        "features": {
            "change5m_pct": round(change_5m, 4),
            "change15m_pct": round(change_15m, 4),
            "change1h_pct": round(change_1h, 4),
            "oi_delta_1h_pct": round(oi_delta_pct, 4),
            "fade_score": round(fade_score, 2),
            "continuation_score": round(continuation_score, 2),
            "funding_rate": funding_rate,
            "funding_percentile": funding_pct,
            "crowding_bias": crowding,
            "primary_setup": primary_setup,
        },
        "reasons": [
            f"1h impulse {change_1h:.2f}%, 15m {change_15m:.2f}%, 5m {change_5m:.2f}%",
            f"OI delta 1h {oi_delta_pct:.2f}%, fade score {fade_score:.1f}",
            f"continuation scores longFlush={long_flush_score:.1f}, shortSqueeze={short_squeeze_score:.1f}, breakout={breakout_score:.1f}",
            f"funding percentile {funding_pct:.1f}, crowding {crowding}",
        ],
    }


def confidence_from_filters(filters: dict[str, bool], fade_score: float, oi_delta_pct: float) -> int:
    passed_ratio = sum(1 for value in filters.values() if value) / len(filters)
    fade_component = min(100.0, max(0.0, fade_score))
    oi_component = min(100.0, max(0.0, oi_delta_pct * 35.0))
    confidence = passed_ratio * 64.0 + fade_component * 0.26 + oi_component * 0.10
    return max(0, min(100, round(confidence)))
