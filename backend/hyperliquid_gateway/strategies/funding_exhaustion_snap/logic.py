"""
Funding Exhaustion Snap - Signal Logic

Entry signal evaluation with all filter conditions.
Deterministic, inspectable, testable.
"""

from __future__ import annotations

from typing import Any


def calculate_funding_percentile(current_funding: float, funding_history: list[float]) -> float:
    """
    Calculate funding rate percentile from 7-day rolling history.

    Args:
        current_funding: Current funding rate
        funding_history: List of funding rates from last 7 days

    Returns:
        Percentile 0-100 (0 = lowest, 100 = highest)
    """
    if not funding_history or current_funding is None:
        return 50.0  # Default to neutral if no history

    sorted_history = sorted(funding_history)
    count_below = sum(1 for rate in sorted_history if rate <= current_funding)
    percentile = (count_below / len(sorted_history)) * 100
    return round(percentile, 2)


def calculate_momentum_score(
    change_1h: float | None,
    change_4h: float | None,
    change_24h: float | None
) -> float:
    """
    Calculate weighted momentum score.

    Weights: 1hr=50%, 4hr=30%, 24hr=20%

    Returns:
        Momentum score (can be negative for downtrends)
    """
    c1h = change_1h or 0.0
    c4h = change_4h or 0.0
    c24h = change_24h or 0.0

    score = (c1h * 0.5) + (c4h * 0.3) + (c24h * 0.2)
    return round(score, 4)


def check_oi_stability(oi_current: float, oi_1h_ago: float) -> tuple[bool, float]:
    """
    Check if OI is stable (not collapsing).

    Args:
        oi_current: Current open interest USD
        oi_1h_ago: Open interest 1 hour ago

    Returns:
        (is_stable, delta_pct)
    """
    if oi_1h_ago == 0 or oi_current is None or oi_1h_ago is None:
        return False, 0.0

    delta_pct = ((oi_current - oi_1h_ago) / oi_1h_ago) * 100
    is_stable = delta_pct >= -5.0  # Must not drop >5%
    return is_stable, round(delta_pct, 2)


def evaluate_long_entry(market_data: dict[str, Any]) -> dict[str, Any]:
    """
    Evaluate long entry signal (fade longs / buy exhaustion).

    Entry when:
    - Funding >=85th percentile (longs paying shorts)
    - Crowding bias = "longs-at-risk"
    - Momentum exhaustion (1hr change <0.8% or negative)
    - OI stable (delta >=-5%)
    - Volume >=50M
    - Setup scores confirm (longFlush >=65 or fade >=70)
    - Opportunity score >=68

    Returns:
        {
            "signal": "long" | "none",
            "confidence": 0-100,
            "reasons": [...],
            "filters_passed": {...},
            "filters_failed": {...}
        }
    """
    result = {
        "signal": "none",
        "direction": "long",
        "confidence": 0,
        "reasons": [],
        "filters_passed": {},
        "filters_failed": {}
    }

    # Extract data
    funding_pct = market_data.get("fundingPercentile", 50.0)
    crowding = market_data.get("crowdingBias", "balanced")
    change_1h = market_data.get("change1h", 0.0)
    oi_current = market_data.get("openInterestUsd", 0.0)
    oi_1h_ago = market_data.get("openInterestUsd1hAgo", oi_current)
    volume_24h = market_data.get("volume24h", 0.0)
    setup_scores = market_data.get("setupScores", {})
    opp_score = market_data.get("opportunityScore", 0)

    # Filter 1: Funding extreme (>=85th percentile)
    if funding_pct >= 85.0:
        result["filters_passed"]["funding_extreme"] = f"{funding_pct:.1f}th percentile"
    else:
        result["filters_failed"]["funding_extreme"] = f"Only {funding_pct:.1f}th percentile (need >=85)"

    # Filter 2: Crowding confirmation
    if crowding == "longs-at-risk":
        result["filters_passed"]["crowding"] = crowding
    else:
        result["filters_failed"]["crowding"] = f"Wrong bias: {crowding} (need longs-at-risk)"

    # Filter 3: Momentum exhaustion
    momentum_exhausted = change_1h < 0.8
    if momentum_exhausted:
        result["filters_passed"]["momentum_exhaustion"] = f"1h change: {change_1h:.2f}%"
    else:
        result["filters_failed"]["momentum_exhaustion"] = f"Too strong: {change_1h:.2f}% (need <0.8%)"

    # Filter 4: OI stability
    oi_stable, oi_delta = check_oi_stability(oi_current, oi_1h_ago)
    if oi_stable:
        result["filters_passed"]["oi_stability"] = f"Delta: {oi_delta:.2f}%"
    else:
        result["filters_failed"]["oi_stability"] = f"Collapsing: {oi_delta:.2f}%"

    # Filter 5: Liquidity
    if volume_24h >= 50_000_000:
        result["filters_passed"]["liquidity"] = f"Vol: ${volume_24h/1_000_000:.1f}M"
    else:
        result["filters_failed"]["liquidity"] = f"Too low: ${volume_24h/1_000_000:.1f}M (need >=50M)"

    # Filter 6: Setup scores
    long_flush_score = setup_scores.get("longFlush", 0)
    fade_score = setup_scores.get("fade", 0)
    setup_confirms = long_flush_score >= 65 or fade_score >= 70
    if setup_confirms:
        result["filters_passed"]["setup_score"] = f"LongFlush: {long_flush_score}, Fade: {fade_score}"
    else:
        result["filters_failed"]["setup_score"] = f"Too weak - LongFlush: {long_flush_score}, Fade: {fade_score}"

    # Filter 7: Opportunity threshold
    if opp_score >= 68:
        result["filters_passed"]["opportunity"] = f"Score: {opp_score}"
    else:
        result["filters_failed"]["opportunity"] = f"Too low: {opp_score} (need >=68)"

    # Calculate confidence and signal
    filters_passed_count = len(result["filters_passed"])
    total_filters = 7

    if filters_passed_count == total_filters:
        result["signal"] = "long"
        result["confidence"] = min(100, 70 + int(funding_pct - 85) + max(long_flush_score, fade_score) // 5)
        result["reasons"] = [
            f"Funding at {funding_pct:.1f}th percentile (longs trapped)",
            f"Momentum exhausted: {change_1h:.2f}% (1hr)",
            f"OI stable, setup confirms",
            f"Opportunity score: {opp_score}"
        ]
    else:
        result["confidence"] = int((filters_passed_count / total_filters) * 60)
        result["reasons"] = [f"Only {filters_passed_count}/{total_filters} filters passed"]

    return result


def evaluate_short_entry(market_data: dict[str, Any]) -> dict[str, Any]:
    """
    Evaluate short entry signal (fade shorts / sell exhaustion).

    Entry when:
    - Funding <=15th percentile (shorts paying longs)
    - Crowding bias = "shorts-at-risk"
    - Momentum exhaustion (1hr change <0.8% or positive reversal)
    - OI stable (delta >=-5%)
    - Volume >=50M
    - Setup scores confirm (shortSqueeze >=65 or fade >=70)
    - Opportunity score >=68

    Returns:
        Same structure as evaluate_long_entry
    """
    result = {
        "signal": "none",
        "direction": "short",
        "confidence": 0,
        "reasons": [],
        "filters_passed": {},
        "filters_failed": {}
    }

    # Extract data
    funding_pct = market_data.get("fundingPercentile", 50.0)
    crowding = market_data.get("crowdingBias", "balanced")
    change_1h = market_data.get("change1h", 0.0)
    oi_current = market_data.get("openInterestUsd", 0.0)
    oi_1h_ago = market_data.get("openInterestUsd1hAgo", oi_current)
    volume_24h = market_data.get("volume24h", 0.0)
    setup_scores = market_data.get("setupScores", {})
    opp_score = market_data.get("opportunityScore", 0)

    # Filter 1: Funding extreme (<=15th percentile)
    if funding_pct <= 15.0:
        result["filters_passed"]["funding_extreme"] = f"{funding_pct:.1f}th percentile"
    else:
        result["filters_failed"]["funding_extreme"] = f"Only {funding_pct:.1f}th percentile (need <=15)"

    # Filter 2: Crowding confirmation
    if crowding == "shorts-at-risk":
        result["filters_passed"]["crowding"] = crowding
    else:
        result["filters_failed"]["crowding"] = f"Wrong bias: {crowding} (need shorts-at-risk)"

    # Filter 3: Momentum exhaustion (for short, we want price not crashing too fast)
    momentum_exhausted = change_1h > -0.8
    if momentum_exhausted:
        result["filters_passed"]["momentum_exhaustion"] = f"1h change: {change_1h:.2f}%"
    else:
        result["filters_failed"]["momentum_exhaustion"] = f"Too strong down: {change_1h:.2f}% (need >-0.8%)"

    # Filter 4: OI stability
    oi_stable, oi_delta = check_oi_stability(oi_current, oi_1h_ago)
    if oi_stable:
        result["filters_passed"]["oi_stability"] = f"Delta: {oi_delta:.2f}%"
    else:
        result["filters_failed"]["oi_stability"] = f"Collapsing: {oi_delta:.2f}%"

    # Filter 5: Liquidity
    if volume_24h >= 50_000_000:
        result["filters_passed"]["liquidity"] = f"Vol: ${volume_24h/1_000_000:.1f}M"
    else:
        result["filters_failed"]["liquidity"] = f"Too low: ${volume_24h/1_000_000:.1f}M (need >=50M)"

    # Filter 6: Setup scores
    short_squeeze_score = setup_scores.get("shortSqueeze", 0)
    fade_score = setup_scores.get("fade", 0)
    setup_confirms = short_squeeze_score >= 65 or fade_score >= 70
    if setup_confirms:
        result["filters_passed"]["setup_score"] = f"ShortSqueeze: {short_squeeze_score}, Fade: {fade_score}"
    else:
        result["filters_failed"]["setup_score"] = f"Too weak - ShortSqueeze: {short_squeeze_score}, Fade: {fade_score}"

    # Filter 7: Opportunity threshold
    if opp_score >= 68:
        result["filters_passed"]["opportunity"] = f"Score: {opp_score}"
    else:
        result["filters_failed"]["opportunity"] = f"Too low: {opp_score} (need >=68)"

    # Calculate confidence and signal
    filters_passed_count = len(result["filters_passed"])
    total_filters = 7

    if filters_passed_count == total_filters:
        result["signal"] = "short"
        result["confidence"] = min(100, 70 + int(15 - funding_pct) + max(short_squeeze_score, fade_score) // 5)
        result["reasons"] = [
            f"Funding at {funding_pct:.1f}th percentile (shorts trapped)",
            f"Momentum exhausted: {change_1h:.2f}% (1hr)",
            f"OI stable, setup confirms",
            f"Opportunity score: {opp_score}"
        ]
    else:
        result["confidence"] = int((filters_passed_count / total_filters) * 60)
        result["reasons"] = [f"Only {filters_passed_count}/{total_filters} filters passed"]

    return result


def evaluate_signal(market_data: dict[str, Any]) -> dict[str, Any]:
    """
    Main entry point: evaluate both long and short signals.

    Args:
        market_data: Dict with all required market data fields

    Returns:
        Best signal (long, short, or none) with full details
    """
    long_eval = evaluate_long_entry(market_data)
    short_eval = evaluate_short_entry(market_data)

    # Return strongest signal
    if long_eval["signal"] == "long" and short_eval["signal"] == "short":
        # Both triggered (rare) - return higher confidence
        return long_eval if long_eval["confidence"] >= short_eval["confidence"] else short_eval
    elif long_eval["signal"] == "long":
        return long_eval
    elif short_eval["signal"] == "short":
        return short_eval
    else:
        # No signal - return best partial
        return long_eval if long_eval["confidence"] >= short_eval["confidence"] else short_eval
