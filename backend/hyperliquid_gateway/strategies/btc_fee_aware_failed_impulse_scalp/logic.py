"""Deterministic signal logic for the BTC fee-aware failed impulse scalp."""

from __future__ import annotations

from typing import Any

STRATEGY_ID = "btc_fee_aware_failed_impulse_scalp"
MIN_VOLUME_USD = 500_000_000
MIN_OPEN_INTEREST_USD = 1_000_000_000
MIN_IMPULSE_1H_PCT = 0.30
LONG_MIN_FAILED_FOLLOWTHROUGH_15M_PCT = -0.06
SHORT_MAX_FAILED_FOLLOWTHROUGH_15M_PCT = 0.06
MAX_ABS_4H_EXTENSION_PCT = 4.0
MIN_OI_DELTA_1H_PCT = -0.10
MIN_EDGE_AFTER_ROUND_TRIP_TAKER_FEE_PCT = 0.45
DEFAULT_TAKER_ROUND_TRIP_FEE_PCT = 0.09
DEFAULT_TAKE_PROFIT_PCT = 0.90

SIGNAL_PARAM_DEFAULTS = {
    "min_volume_usd": MIN_VOLUME_USD,
    "min_open_interest_usd": MIN_OPEN_INTEREST_USD,
    "min_impulse_1h_pct": MIN_IMPULSE_1H_PCT,
    "long_min_failed_followthrough_15m_pct": LONG_MIN_FAILED_FOLLOWTHROUGH_15M_PCT,
    "short_max_failed_followthrough_15m_pct": SHORT_MAX_FAILED_FOLLOWTHROUGH_15M_PCT,
    "max_abs_4h_extension_pct": MAX_ABS_4H_EXTENSION_PCT,
    "min_oi_delta_1h_pct": MIN_OI_DELTA_1H_PCT,
    "min_edge_after_round_trip_taker_fee_pct": MIN_EDGE_AFTER_ROUND_TRIP_TAKER_FEE_PCT,
    "round_trip_taker_fee_pct": DEFAULT_TAKER_ROUND_TRIP_FEE_PCT,
    "take_profit_pct": DEFAULT_TAKE_PROFIT_PCT,
}


def signal_params(overrides: dict[str, Any] | None = None) -> dict[str, float]:
    params = {key: float(value) for key, value in SIGNAL_PARAM_DEFAULTS.items()}
    for key, value in (overrides or {}).items():
        if key in params and isinstance(value, (int, float)):
            params[key] = float(value)
    return params


def calculate_funding_percentile(current_funding: float, funding_history: list[float]) -> float:
    if not funding_history:
        return 50.0
    sorted_history = sorted(funding_history)
    count_below = sum(1 for rate in sorted_history if rate <= current_funding)
    return round((count_below / len(sorted_history)) * 100, 2)


def evaluate_signal(market_data: dict[str, Any], params: dict[str, Any] | None = None) -> dict[str, Any]:
    resolved_params = signal_params(params)
    symbol = str(market_data.get("symbol", "") or "")
    price = float(market_data.get("price", 0.0) or 0.0)
    volume_24h = float(market_data.get("volume24h", 0.0) or 0.0)
    open_interest = float(market_data.get("openInterestUsd", 0.0) or 0.0)
    change_5m = float(market_data.get("change5m", 0.0) or 0.0)
    change_15m = float(market_data.get("change15m", 0.0) or 0.0)
    change_1h = float(market_data.get("change1h", 0.0) or 0.0)
    change_4h = float(market_data.get("change4h", 0.0) or 0.0)
    oi_delta_1h = float(market_data.get("openInterestDelta1hPct", 0.0) or 0.0)
    funding_rate = float(market_data.get("fundingRate", 0.0) or 0.0)
    funding_pct = float(market_data.get("fundingPercentile", 50.0) or 50.0)
    crowding = str(market_data.get("crowdingBias", "balanced") or "balanced")
    primary_setup = str(market_data.get("primarySetup", "no-trade") or "no-trade")
    setup_scores = market_data.get("setupScores", {}) or {}
    breakout_score = float(setup_scores.get("breakoutContinuation", 0.0) or 0.0)
    short_squeeze_score = float(setup_scores.get("shortSqueeze", 0.0) or 0.0)
    long_flush_score = float(setup_scores.get("longFlush", 0.0) or 0.0)
    fade_score = float(setup_scores.get("fade", 0.0) or 0.0)
    fee_edge = resolved_params["take_profit_pct"] - resolved_params["round_trip_taker_fee_pct"]

    common_filters = {
        "btc_symbol": symbol == "BTC",
        "valid_price": price > 0,
        "liquid_volume": volume_24h >= resolved_params["min_volume_usd"],
        "meaningful_open_interest": open_interest >= resolved_params["min_open_interest_usd"],
        "not_extreme_4h_extension": abs(change_4h) <= resolved_params["max_abs_4h_extension_pct"],
        "oi_stable_or_rising": oi_delta_1h >= resolved_params["min_oi_delta_1h_pct"],
        "target_clears_taker_fee_floor": fee_edge >= resolved_params["min_edge_after_round_trip_taker_fee_pct"],
    }
    long_trapped = trapped_short_side(
        funding_percentile=funding_pct,
        crowding=crowding,
        primary_setup=primary_setup,
        short_squeeze_score=short_squeeze_score,
        fade_score=fade_score,
    )
    short_trapped = trapped_long_side(
        funding_percentile=funding_pct,
        crowding=crowding,
        primary_setup=primary_setup,
        long_flush_score=long_flush_score,
        fade_score=fade_score,
    )
    long_filters = {
        **common_filters,
        "downside_impulse_1h": change_1h <= -resolved_params["min_impulse_1h_pct"],
        "downside_followthrough_failed_15m": change_15m >= resolved_params["long_min_failed_followthrough_15m_pct"],
        "downside_not_reaccelerating_5m": change_5m >= -0.10,
        "short_side_trapped_context": long_trapped,
    }
    short_filters = {
        **common_filters,
        "upside_impulse_1h": change_1h >= resolved_params["min_impulse_1h_pct"],
        "upside_followthrough_failed_15m": change_15m <= resolved_params["short_max_failed_followthrough_15m_pct"],
        "upside_not_reaccelerating_5m": change_5m <= 0.10,
        "long_side_trapped_context": short_trapped,
    }

    long_confidence = confidence_from_filters(
        long_filters,
        impulse_abs_pct=abs(change_1h),
        followthrough_abs_pct=max(0.0, abs(change_15m)),
        oi_delta_1h_pct=oi_delta_1h,
        trapped_context=long_trapped,
        fee_edge_pct=fee_edge,
    )
    short_confidence = confidence_from_filters(
        short_filters,
        impulse_abs_pct=abs(change_1h),
        followthrough_abs_pct=max(0.0, abs(change_15m)),
        oi_delta_1h_pct=oi_delta_1h,
        trapped_context=short_trapped,
        fee_edge_pct=fee_edge,
    )

    if all(long_filters.values()) and long_confidence >= 74 and long_confidence >= short_confidence:
        signal = "long"
        chosen_filters = long_filters
        confidence = long_confidence
    elif all(short_filters.values()) and short_confidence >= 74:
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
            "open_interest_delta_1h_pct": round(oi_delta_1h, 4),
            "funding_rate": funding_rate,
            "funding_percentile": funding_pct,
            "crowding_bias": crowding,
            "primary_setup": primary_setup,
            "breakout_score": round(breakout_score, 2),
            "short_squeeze_score": round(short_squeeze_score, 2),
            "long_flush_score": round(long_flush_score, 2),
            "fade_score": round(fade_score, 2),
            "fee_edge_pct": round(fee_edge, 4),
            "variant_params": resolved_params,
        },
        "reasons": [
            f"1h impulse {change_1h:.2f}%, 15m follow-through {change_15m:.2f}%, 5m {change_5m:.2f}%",
            f"OI 1h delta {oi_delta_1h:.2f}%, funding percentile {funding_pct:.1f}, crowding {crowding}",
            f"target edge after taker fees {fee_edge:.2f}%, setup scores fade={fade_score:.1f}, shortSqueeze={short_squeeze_score:.1f}, longFlush={long_flush_score:.1f}",
        ],
    }


def trapped_short_side(
    *,
    funding_percentile: float,
    crowding: str,
    primary_setup: str,
    short_squeeze_score: float,
    fade_score: float,
) -> bool:
    context = f"{crowding} {primary_setup}".lower()
    return (
        funding_percentile <= 45.0
        or "short" in context
        or short_squeeze_score >= 52.0
        or fade_score >= 62.0
    )


def trapped_long_side(
    *,
    funding_percentile: float,
    crowding: str,
    primary_setup: str,
    long_flush_score: float,
    fade_score: float,
) -> bool:
    context = f"{crowding} {primary_setup}".lower()
    return (
        funding_percentile >= 55.0
        or "long" in context
        or long_flush_score >= 52.0
        or fade_score >= 62.0
    )


def confidence_from_filters(
    filters: dict[str, bool],
    *,
    impulse_abs_pct: float,
    followthrough_abs_pct: float,
    oi_delta_1h_pct: float,
    trapped_context: bool,
    fee_edge_pct: float,
) -> int:
    passed_ratio = sum(1 for value in filters.values() if value) / len(filters)
    impulse_component = min(100.0, impulse_abs_pct * 140.0)
    stall_component = max(0.0, 100.0 - min(100.0, followthrough_abs_pct * 360.0))
    oi_component = min(100.0, max(0.0, oi_delta_1h_pct + 0.25) * 80.0)
    trapped_component = 100.0 if trapped_context else 0.0
    fee_component = min(100.0, max(0.0, fee_edge_pct) * 100.0)
    confidence = (
        passed_ratio * 50.0
        + impulse_component * 0.16
        + stall_component * 0.14
        + oi_component * 0.08
        + trapped_component * 0.08
        + fee_component * 0.04
    )
    return max(0, min(100, round(confidence)))
