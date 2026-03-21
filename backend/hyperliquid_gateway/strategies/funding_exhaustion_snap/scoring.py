"""
Funding Exhaustion Snap - Scoring and Ranking

Setup scoring logic for watchlist prioritization.
Ranks symbols by signal strength and execution quality.
"""

from typing import Any


def score_setup(market_data: dict[str, Any], signal_eval: dict[str, Any]) -> dict[str, Any]:
    """
    Score a setup for watchlist ranking.

    Combines:
    - Signal confidence (from logic.py)
    - Execution quality (spread, liquidity)
    - Funding extremity
    - Setup score strength

    Returns:
        {
            "strategy_id": "funding_exhaustion_snap",
            "symbol": "...",
            "rank_score": 0-100,
            "signal_direction": "long" | "short" | "none",
            "signal_confidence": 0-100,
            "execution_quality": 0-100,
            "funding_extremity": 0-100,
            "watchlist_label": "watch-now" | "wait-trigger" | "avoid",
            "priority": "high" | "medium" | "low"
        }
    """
    symbol = market_data.get("symbol", "UNKNOWN")
    signal_dir = signal_eval.get("signal", "none")
    signal_conf = signal_eval.get("confidence", 0)

    # Calculate funding extremity (distance from 50th percentile)
    funding_pct = market_data.get("fundingPercentile", 50.0)
    funding_extremity = abs(funding_pct - 50.0) * 2  # Scale 0-50 to 0-100
    funding_extremity = min(100, funding_extremity)

    # Calculate execution quality
    exec_quality = calculate_execution_quality(market_data)

    # Calculate rank score (0-100)
    # Weights: signal confidence 50%, exec quality 30%, funding extremity 20%
    rank_score = round(
        (signal_conf * 0.50) +
        (exec_quality * 0.30) +
        (funding_extremity * 0.20)
    )
    rank_score = max(0, min(100, rank_score))

    # Determine watchlist label
    watchlist_label = "avoid"
    priority = "low"

    if signal_dir in ("long", "short"):
        if rank_score >= 82 and exec_quality >= 64:
            watchlist_label = "watch-now"
            priority = "high"
        elif rank_score >= 68 and exec_quality >= 48:
            watchlist_label = "wait-trigger"
            priority = "medium"
        else:
            watchlist_label = "avoid"
            priority = "low"
    else:
        # No signal
        if rank_score >= 60:
            watchlist_label = "wait-trigger"
            priority = "low"

    return {
        "strategy_id": "funding_exhaustion_snap",
        "symbol": symbol,
        "rank_score": rank_score,
        "signal_direction": signal_dir,
        "signal_confidence": signal_conf,
        "execution_quality": exec_quality,
        "funding_extremity": round(funding_extremity, 1),
        "funding_percentile": funding_pct,
        "watchlist_label": watchlist_label,
        "priority": priority,
        "filters_passed": len(signal_eval.get("filters_passed", {})),
        "filters_total": 7,
        "reasons": signal_eval.get("reasons", [])
    }


def calculate_execution_quality(market_data: dict[str, Any]) -> int:
    """
    Calculate execution quality score (0-100).

    Factors:
    - Volume 24h (liquidity)
    - Open interest (depth)
    - Spread (if available)
    - Volatility (for fill quality)

    Higher score = better fills expected
    """
    volume_24h = market_data.get("volume24h", 0.0)
    oi_usd = market_data.get("openInterestUsd", 0.0)
    spread_pct = market_data.get("spreadPct", 0.08)  # Default assume 0.08%

    # Volume score (0-40 points)
    # $50M = 20, $100M = 30, $200M+ = 40
    if volume_24h >= 200_000_000:
        volume_score = 40
    elif volume_24h >= 100_000_000:
        volume_score = 30
    elif volume_24h >= 50_000_000:
        volume_score = 20
    else:
        volume_score = int((volume_24h / 50_000_000) * 20)

    # OI score (0-35 points)
    # $50M = 18, $100M = 26, $200M+ = 35
    if oi_usd >= 200_000_000:
        oi_score = 35
    elif oi_usd >= 100_000_000:
        oi_score = 26
    elif oi_usd >= 50_000_000:
        oi_score = 18
    else:
        oi_score = int((oi_usd / 50_000_000) * 18)

    # Spread score (0-25 points)
    # <0.05% = 25, <0.08% = 20, <0.12% = 12, >0.15% = 0
    if spread_pct <= 0.05:
        spread_score = 25
    elif spread_pct <= 0.08:
        spread_score = 20
    elif spread_pct <= 0.12:
        spread_score = 12
    else:
        spread_score = max(0, int((0.15 - spread_pct) / 0.15 * 25))

    exec_quality = volume_score + oi_score + spread_score
    return max(0, min(100, exec_quality))


def rank_symbols(symbols_data: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Rank all symbols for watchlist display.

    Args:
        symbols_data: List of dicts, each containing market_data and signal_eval

    Returns:
        Sorted list (highest rank_score first) with scoring details
    """
    from .logic import evaluate_signal

    scored = []
    for item in symbols_data:
        market_data = item.get("market_data", {})

        # Evaluate signal if not already done
        signal_eval = item.get("signal_eval")
        if not signal_eval:
            signal_eval = evaluate_signal(market_data)

        # Score the setup
        score_result = score_setup(market_data, signal_eval)
        scored.append(score_result)

    # Sort by rank_score descending
    scored.sort(key=lambda x: x["rank_score"], reverse=True)

    return scored


def filter_watchlist(ranked_symbols: list[dict[str, Any]], min_rank_score: int = 68) -> list[dict[str, Any]]:
    """
    Filter watchlist to only actionable symbols.

    Args:
        ranked_symbols: Output from rank_symbols()
        min_rank_score: Minimum rank score to include (default 68)

    Returns:
        Filtered list with watch-now and wait-trigger symbols
    """
    return [
        symbol for symbol in ranked_symbols
        if symbol["rank_score"] >= min_rank_score
        and symbol["watchlist_label"] in ("watch-now", "wait-trigger")
    ]


def get_top_opportunities(symbols_data: list[dict[str, Any]], limit: int = 10) -> list[dict[str, Any]]:
    """
    Get top N opportunities across all symbols.

    Args:
        symbols_data: Raw market data for all symbols
        limit: Max symbols to return

    Returns:
        Top opportunities sorted by rank_score
    """
    ranked = rank_symbols(symbols_data)
    filtered = filter_watchlist(ranked)
    return filtered[:limit]
