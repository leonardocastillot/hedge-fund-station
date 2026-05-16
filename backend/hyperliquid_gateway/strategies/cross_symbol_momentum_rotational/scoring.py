"""
Cross-Symbol Momentum Rotational - Scoring and Ranking

Setup scoring for basket selection and quality assessment.
"""

from __future__ import annotations

from typing import Any

from .logic import rank_symbols, select_baskets


MOMENTUM_WEIGHT = 0.40
LIQUIDITY_WEIGHT = 0.25
DISPERSION_WEIGHT = 0.20
BASKET_COHERENCE_WEIGHT = 0.15


def score_setup(
    all_market_data: list[dict[str, Any]],
    signal_eval: dict[str, Any],
) -> dict[str, Any]:
    ranked = signal_eval.get("ranked", [])
    long_basket = signal_eval.get("long_basket", [])
    short_basket = signal_eval.get("short_basket", [])
    dispersion = signal_eval.get("dispersion", 0.0)
    confidence = signal_eval.get("confidence", 0)
    can_trade = signal_eval.get("can_trade", False)

    if not ranked or not can_trade:
        return {
            "strategy_id": "cross_symbol_momentum_rotational",
            "symbol": "BASKET",
            "rank_score": 0,
            "signal_direction": "none",
            "signal_confidence": confidence,
            "watchlist_label": "avoid",
            "priority": "low",
            "basket_size": 0,
        }

    avg_long_momentum = (
        sum(s["momentum_score"] for s in long_basket) / max(len(long_basket), 1)
    )
    avg_short_momentum = (
        sum(s["momentum_score"] for s in short_basket) / max(len(short_basket), 1)
    )
    spread = abs(avg_long_momentum - avg_short_momentum)

    top_volume = sum(s["volume24h"] or 0 for s in ranked[:3])
    total_volume = sum(s["volume24h"] or 0 for s in ranked)
    volume_concentration = top_volume / max(total_volume, 1)

    momentum_score = min(100, int(abs(spread) * 20))
    liquidity_score = min(100, int(volume_concentration * 100))
    dispersion_score = min(100, int(dispersion * 25))
    basket_coherence = min(100, confidence)

    rank_score = round(
        (momentum_score * MOMENTUM_WEIGHT)
        + (liquidity_score * LIQUIDITY_WEIGHT)
        + (dispersion_score * DISPERSION_WEIGHT)
        + (basket_coherence * BASKET_COHERENCE_WEIGHT)
    )
    rank_score = max(0, min(100, rank_score))

    watchlist_label: str = "avoid"
    priority: str = "low"

    if can_trade and confidence >= 60:
        watchlist_label = "watch-now"
        priority = "high"
    elif can_trade:
        watchlist_label = "wait-trigger"
        priority = "medium"

    return {
        "strategy_id": "cross_symbol_momentum_rotational",
        "symbol": "BASKET",
        "rank_score": rank_score,
        "signal_direction": "long-short",
        "signal_confidence": confidence,
        "momentum_score": round(momentum_score, 1),
        "liquidity_score": round(liquidity_score, 1),
        "dispersion_score": round(dispersion_score, 1),
        "basket_coherence": round(basket_coherence, 1),
        "spread": round(spread, 2),
        "dispersion": round(dispersion, 2),
        "total_qualified": len(ranked),
        "basket_size": len(long_basket),
        "watchlist_label": watchlist_label,
        "priority": priority,
        "long_symbols": [s["symbol"] for s in long_basket],
        "short_symbols": [s["symbol"] for s in short_basket],
        "reasons": signal_eval.get("reasons", []),
    }


def get_top_opportunities(
    symbols_data: list[dict[str, Any]],
) -> dict[str, Any]:
    from .logic import evaluate_signal

    signal_eval = evaluate_signal(symbols_data)
    setup = score_setup(symbols_data, signal_eval)
    return setup
