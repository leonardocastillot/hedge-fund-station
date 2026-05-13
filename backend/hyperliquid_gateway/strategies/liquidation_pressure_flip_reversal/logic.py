"""Deterministic signal logic for Liquidation Pressure Flip Reversal."""

from __future__ import annotations

from typing import Any

STRATEGY_ID = "liquidation_pressure_flip_reversal"
MIN_VOLUME_USD = 20_000_000
MIN_OPEN_INTEREST_USD = 2_000_000
MIN_ESTIMATED_LIQUIDATION_USD = 250_000
MIN_FADE_SCORE = 64.0
MIN_PRESSURE_SCORE = 68.0
MIN_IMPULSE_1H_PCT = 0.35
MAX_STALL_15M_PCT = 0.16
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
    change_4h = float(market_data.get("change4h", 0.0) or 0.0)
    primary_setup = str(market_data.get("primarySetup", "no-trade") or "no-trade")
    crowding = str(market_data.get("crowdingBias", "balanced") or "balanced")
    funding_rate = float(market_data.get("fundingRate", 0.0) or 0.0)
    funding_pct = float(market_data.get("fundingPercentile", 50.0) or 50.0)
    estimated_liquidation = float(market_data.get("estimatedTotalLiquidationUsd", 0.0) or 0.0)
    setup_scores = market_data.get("setupScores", {}) or {}
    fade_score = float(setup_scores.get("fade", 0.0) or 0.0)
    long_flush_score = float(setup_scores.get("longFlush", 0.0) or 0.0)
    short_squeeze_score = float(setup_scores.get("shortSqueeze", 0.0) or 0.0)
    breakout_score = float(setup_scores.get("breakoutContinuation", 0.0) or 0.0)

    common_filters = {
        "valid_price": price > 0,
        "liquid_volume": volume_24h >= MIN_VOLUME_USD,
        "meaningful_open_interest": oi_current >= MIN_OPEN_INTEREST_USD,
        "liquidation_pressure_visible": estimated_liquidation >= MIN_ESTIMATED_LIQUIDATION_USD,
        "fade_or_pressure_setup": primary_setup in {"fade", "long-flush", "short-squeeze"} or fade_score >= MIN_FADE_SCORE,
        "not_extreme_breakout": breakout_score < EXTREME_BREAKOUT_SCORE,
    }
    long_filters = {
        **common_filters,
        "downside_pressure": crowding == "longs-at-risk" or long_flush_score >= MIN_PRESSURE_SCORE,
        "downside_impulse": change_1h <= -MIN_IMPULSE_1H_PCT or change_4h <= -0.90,
        "downside_stalling": change_5m >= -0.05 or change_15m >= -MAX_STALL_15M_PCT,
        "funding_not_short_crowded": funding_pct >= 35.0 or funding_rate >= -0.00008,
        "oi_not_expanding_into_flush": oi_delta_pct <= 1.8,
    }
    short_filters = {
        **common_filters,
        "upside_pressure": crowding == "shorts-at-risk" or short_squeeze_score >= MIN_PRESSURE_SCORE,
        "upside_impulse": change_1h >= MIN_IMPULSE_1H_PCT or change_4h >= 0.90,
        "upside_stalling": change_5m <= 0.05 or change_15m <= MAX_STALL_15M_PCT,
        "funding_not_long_crowded": funding_pct <= 65.0 or funding_rate <= 0.00008,
        "oi_not_expanding_into_squeeze": oi_delta_pct <= 1.8,
    }

    long_confidence = confidence_from_filters(long_filters, fade_score, long_flush_score, estimated_liquidation, abs(change_15m))
    short_confidence = confidence_from_filters(short_filters, fade_score, short_squeeze_score, estimated_liquidation, abs(change_15m))
    long_passed = sum(1 for value in long_filters.values() if value)
    short_passed = sum(1 for value in short_filters.values() if value)

    if (
        long_passed >= 9
        and long_confidence >= 66
        and long_confidence >= short_confidence
        and long_filters["liquidation_pressure_visible"]
        and long_filters["downside_pressure"]
    ):
        signal = "long"
        direction = "long"
        chosen_filters = long_filters
        confidence = long_confidence
        pressure_score = long_flush_score
    elif (
        short_passed >= 9
        and short_confidence >= 66
        and short_filters["liquidation_pressure_visible"]
        and short_filters["upside_pressure"]
    ):
        signal = "short"
        direction = "short"
        chosen_filters = short_filters
        confidence = short_confidence
        pressure_score = short_squeeze_score
    else:
        signal = "none"
        direction = "none"
        chosen_filters = long_filters if long_confidence >= short_confidence else short_filters
        confidence = max(long_confidence, short_confidence)
        pressure_score = max(long_flush_score, short_squeeze_score)

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
            "estimated_liquidation_usd": round(estimated_liquidation, 2),
            "fade_score": round(fade_score, 2),
            "pressure_score": round(pressure_score, 2),
            "breakout_score": round(breakout_score, 2),
            "funding_rate": funding_rate,
            "funding_percentile": funding_pct,
            "crowding_bias": crowding,
            "primary_setup": primary_setup,
        },
        "reasons": [
            f"1h impulse {change_1h:.2f}%, 15m {change_15m:.2f}%, 5m {change_5m:.2f}%",
            f"estimated liquidation ${estimated_liquidation:,.0f}, pressure score {pressure_score:.1f}",
            f"fade score {fade_score:.1f}, breakout score {breakout_score:.1f}, OI delta {oi_delta_pct:.2f}%",
            f"funding percentile {funding_pct:.1f}, crowding {crowding}",
        ],
    }


def confidence_from_filters(
    filters: dict[str, bool],
    fade_score: float,
    pressure_score: float,
    estimated_liquidation: float,
    stall_15m_abs: float,
) -> int:
    passed_ratio = sum(1 for value in filters.values() if value) / len(filters)
    liquidation_component = min(100.0, estimated_liquidation / 50_000.0)
    stall_component = max(0.0, 100.0 - min(100.0, stall_15m_abs * 220.0))
    confidence = (
        passed_ratio * 55.0
        + min(100.0, pressure_score) * 0.20
        + min(100.0, fade_score) * 0.12
        + liquidation_component * 0.08
        + stall_component * 0.05
    )
    return max(0, min(100, round(confidence)))
