"""Deterministic signal logic for Breakout OI Confirmation."""

from __future__ import annotations

from typing import Any

STRATEGY_ID = "breakout_oi_confirmation"
MIN_VOLUME_USD = 20_000_000
MIN_OPEN_INTEREST_USD = 2_000_000
MIN_BREAKOUT_SCORE = 70.0
MIN_OPPORTUNITY_SCORE = 55.0
MIN_OI_EXPANSION_1H_PCT = 0.12
MIN_15M_IMPULSE_PCT = 0.20
MIN_1H_IMPULSE_PCT = 0.45
EXTREME_FADE_SCORE = 86.0


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
    change_4h = float(market_data.get("change4h", 0.0) or 0.0)
    primary_setup = str(market_data.get("primarySetup", "no-trade") or "no-trade")
    crowding = str(market_data.get("crowdingBias", "balanced") or "balanced")
    funding_rate = float(market_data.get("fundingRate", 0.0) or 0.0)
    funding_pct = float(market_data.get("fundingPercentile", 50.0) or 50.0)
    opportunity_score = float(market_data.get("opportunityScore", 0.0) or 0.0)
    setup_scores = market_data.get("setupScores", {}) or {}
    breakout_score = float(setup_scores.get("breakoutContinuation", 0.0) or 0.0)
    fade_score = float(setup_scores.get("fade", 0.0) or 0.0)
    long_flush_score = float(setup_scores.get("longFlush", 0.0) or 0.0)
    short_squeeze_score = float(setup_scores.get("shortSqueeze", 0.0) or 0.0)

    common_filters = {
        "valid_price": price > 0,
        "liquid_volume": volume_24h >= MIN_VOLUME_USD,
        "meaningful_open_interest": oi_current >= MIN_OPEN_INTEREST_USD,
        "oi_confirms_breakout": oi_delta_pct >= MIN_OI_EXPANSION_1H_PCT,
        "breakout_score_confirms": breakout_score >= MIN_BREAKOUT_SCORE,
        "opportunity_threshold": opportunity_score >= MIN_OPPORTUNITY_SCORE,
        "not_fade_dominant": fade_score < EXTREME_FADE_SCORE,
    }
    long_filters = {
        **common_filters,
        "upside_impulse": change_15m >= MIN_15M_IMPULSE_PCT or change_1h >= MIN_1H_IMPULSE_PCT,
        "higher_timeframe_not_down": change_4h >= -0.30,
        "not_longs_at_risk": crowding != "longs-at-risk",
        "not_extreme_positive_funding": funding_pct <= 88.0 or funding_rate <= 0.00012,
    }
    short_filters = {
        **common_filters,
        "downside_impulse": change_15m <= -MIN_15M_IMPULSE_PCT or change_1h <= -MIN_1H_IMPULSE_PCT,
        "higher_timeframe_not_up": change_4h <= 0.30,
        "not_shorts_at_risk": crowding != "shorts-at-risk",
        "not_extreme_negative_funding": funding_pct >= 12.0 or funding_rate >= -0.00012,
    }

    long_confidence = confidence_from_filters(long_filters, breakout_score, oi_delta_pct, abs(change_15m), short_squeeze_score)
    short_confidence = confidence_from_filters(short_filters, breakout_score, oi_delta_pct, abs(change_15m), long_flush_score)
    long_passed = sum(1 for value in long_filters.values() if value)
    short_passed = sum(1 for value in short_filters.values() if value)

    if (
        long_passed >= 9
        and long_confidence >= 68
        and long_confidence >= short_confidence
        and long_filters["breakout_score_confirms"]
        and long_filters["oi_confirms_breakout"]
    ):
        signal = "long"
        direction = "long"
        chosen_filters = long_filters
        confidence = long_confidence
        continuation_score = short_squeeze_score
    elif (
        short_passed >= 9
        and short_confidence >= 68
        and short_filters["breakout_score_confirms"]
        and short_filters["oi_confirms_breakout"]
    ):
        signal = "short"
        direction = "short"
        chosen_filters = short_filters
        confidence = short_confidence
        continuation_score = long_flush_score
    else:
        signal = "none"
        direction = "none"
        chosen_filters = long_filters if long_confidence >= short_confidence else short_filters
        confidence = max(long_confidence, short_confidence)
        continuation_score = max(short_squeeze_score, long_flush_score)

    return {
        "strategy_id": STRATEGY_ID,
        "symbol": symbol,
        "signal": signal,
        "direction": direction,
        "confidence": confidence,
        "filters_passed": {key: True for key, value in chosen_filters.items() if value},
        "filters_failed": {key: False for key, value in chosen_filters.items() if not value},
        "features": {
            "change5m_pct": round(change_5m, 4),
            "change15m_pct": round(change_15m, 4),
            "change1h_pct": round(change_1h, 4),
            "change4h_pct": round(change_4h, 4),
            "oi_delta_1h_pct": round(oi_delta_pct, 4),
            "breakout_score": round(breakout_score, 2),
            "continuation_score": round(continuation_score, 2),
            "fade_score": round(fade_score, 2),
            "funding_rate": funding_rate,
            "funding_percentile": funding_pct,
            "crowding_bias": crowding,
            "primary_setup": primary_setup,
        },
        "reasons": [
            f"15m impulse {change_15m:.2f}%, 1h impulse {change_1h:.2f}%, 4h context {change_4h:.2f}%",
            f"OI delta 1h {oi_delta_pct:.2f}%, breakout score {breakout_score:.1f}",
            f"fade score {fade_score:.1f}, continuation score {continuation_score:.1f}",
            f"funding percentile {funding_pct:.1f}, crowding {crowding}",
        ],
    }


def confidence_from_filters(
    filters: dict[str, bool],
    breakout_score: float,
    oi_delta_pct: float,
    impulse_15m_abs: float,
    continuation_score: float,
) -> int:
    passed_ratio = sum(1 for value in filters.values() if value) / len(filters)
    oi_component = min(100.0, max(0.0, oi_delta_pct * 45.0))
    impulse_component = min(100.0, impulse_15m_abs * 120.0)
    confidence = (
        passed_ratio * 56.0
        + min(100.0, breakout_score) * 0.24
        + oi_component * 0.10
        + impulse_component * 0.06
        + min(100.0, continuation_score) * 0.04
    )
    return max(0, min(100, round(confidence)))
