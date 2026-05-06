"""Deterministic signal logic for BTC Failed Impulse Reversal."""

from __future__ import annotations

from typing import Any

STRATEGY_ID = "btc_failed_impulse_reversal"
MIN_VOLUME_USD = 500_000_000
MIN_OPEN_INTEREST_USD = 1_000_000_000
MIN_IMPULSE_1H_PCT = 0.30
LONG_MIN_FAILED_FOLLOWTHROUGH_15M_PCT = -0.08
SHORT_MAX_FAILED_FOLLOWTHROUGH_15M_PCT = -0.18
MAX_ABS_4H_EXTENSION_PCT = 5.0


def calculate_funding_percentile(current_funding: float, funding_history: list[float]) -> float:
    if not funding_history:
        return 50.0
    sorted_history = sorted(funding_history)
    count_below = sum(1 for rate in sorted_history if rate <= current_funding)
    return round((count_below / len(sorted_history)) * 100, 2)


def evaluate_signal(market_data: dict[str, Any]) -> dict[str, Any]:
    symbol = str(market_data.get("symbol", "") or "")
    price = float(market_data.get("price", 0.0) or 0.0)
    volume_24h = float(market_data.get("volume24h", 0.0) or 0.0)
    open_interest = float(market_data.get("openInterestUsd", 0.0) or 0.0)
    change_5m = float(market_data.get("change5m", 0.0) or 0.0)
    change_15m = float(market_data.get("change15m", 0.0) or 0.0)
    change_1h = float(market_data.get("change1h", 0.0) or 0.0)
    change_4h = float(market_data.get("change4h", 0.0) or 0.0)
    funding_rate = float(market_data.get("fundingRate", 0.0) or 0.0)
    funding_pct = float(market_data.get("fundingPercentile", 50.0) or 50.0)
    crowding = str(market_data.get("crowdingBias", "balanced") or "balanced")
    primary_setup = str(market_data.get("primarySetup", "no-trade") or "no-trade")
    setup_scores = market_data.get("setupScores", {}) or {}
    breakout_score = float(setup_scores.get("breakoutContinuation", 0.0) or 0.0)
    short_squeeze_score = float(setup_scores.get("shortSqueeze", 0.0) or 0.0)
    long_flush_score = float(setup_scores.get("longFlush", 0.0) or 0.0)
    fade_score = float(setup_scores.get("fade", 0.0) or 0.0)

    common_filters = {
        "btc_symbol": symbol == "BTC",
        "valid_price": price > 0,
        "liquid_volume": volume_24h >= MIN_VOLUME_USD,
        "meaningful_open_interest": open_interest >= MIN_OPEN_INTEREST_USD,
        "not_extreme_4h_extension": abs(change_4h) <= MAX_ABS_4H_EXTENSION_PCT,
    }
    long_filters = {
        **common_filters,
        "downside_impulse_1h": change_1h <= -MIN_IMPULSE_1H_PCT,
        "downside_followthrough_failed_15m": change_15m >= LONG_MIN_FAILED_FOLLOWTHROUGH_15M_PCT,
    }
    short_filters = {
        **common_filters,
        "upside_impulse_1h": change_1h >= MIN_IMPULSE_1H_PCT,
        "upside_followthrough_reversed_15m": change_15m <= SHORT_MAX_FAILED_FOLLOWTHROUGH_15M_PCT,
    }

    long_confidence = confidence_from_filters(long_filters, abs(change_1h), abs(change_15m))
    short_confidence = confidence_from_filters(short_filters, abs(change_1h), abs(change_15m))

    if all(long_filters.values()) and long_confidence >= 70 and long_confidence >= short_confidence:
        signal = "long"
        chosen_filters = long_filters
        confidence = long_confidence
    elif all(short_filters.values()) and short_confidence >= 70:
        signal = "short"
        chosen_filters = short_filters
        confidence = short_confidence
    else:
        signal = "none"
        chosen_filters = long_filters if long_confidence >= short_confidence else short_filters
        confidence = max(long_confidence, short_confidence)

    return {
        "strategy_id": STRATEGY_ID,
        "symbol": symbol,
        "signal": signal,
        "direction": signal,
        "confidence": confidence,
        "filters_passed": {key: True for key, value in chosen_filters.items() if value},
        "filters_failed": {key: False for key, value in chosen_filters.items() if not value},
        "features": {
            "change5m_pct": round(change_5m, 4),
            "change15m_pct": round(change_15m, 4),
            "change1h_pct": round(change_1h, 4),
            "change4h_pct": round(change_4h, 4),
            "funding_rate": funding_rate,
            "funding_percentile": funding_pct,
            "crowding_bias": crowding,
            "primary_setup": primary_setup,
            "breakout_score": round(breakout_score, 2),
            "short_squeeze_score": round(short_squeeze_score, 2),
            "long_flush_score": round(long_flush_score, 2),
            "fade_score": round(fade_score, 2),
        },
        "reasons": [
            f"1h impulse {change_1h:.2f}%, 15m follow-through {change_15m:.2f}%, 5m {change_5m:.2f}%",
            f"4h extension {change_4h:.2f}%, funding percentile {funding_pct:.1f}, crowding {crowding}",
            f"setup scores breakout={breakout_score:.1f}, shortSqueeze={short_squeeze_score:.1f}, longFlush={long_flush_score:.1f}, fade={fade_score:.1f}",
        ],
    }


def confidence_from_filters(filters: dict[str, bool], impulse_abs_pct: float, followthrough_abs_pct: float) -> int:
    passed_ratio = sum(1 for value in filters.values() if value) / len(filters)
    impulse_component = min(100.0, impulse_abs_pct * 120.0)
    stall_component = max(0.0, 100.0 - min(100.0, followthrough_abs_pct * 320.0))
    confidence = passed_ratio * 58.0 + impulse_component * 0.22 + stall_component * 0.20
    return max(0, min(100, round(confidence)))
