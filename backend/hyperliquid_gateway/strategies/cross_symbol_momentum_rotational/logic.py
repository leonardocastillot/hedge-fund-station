"""
Cross-Symbol Momentum Rotational - Signal Logic

Ranks all symbols by multi-timeframe momentum and selects long/short baskets.
Market-neutral by construction.
"""

from __future__ import annotations

from typing import Any


MOMENTUM_1H_WEIGHT = 0.50
MOMENTUM_4H_WEIGHT = 0.30
MOMENTUM_24H_WEIGHT = 0.20

MIN_VOLUME_24H = 10_000_000
MIN_OPPORTUNITY_SCORE = 30
BASKET_SIZE = 3
MAX_BASKET_SIZE = 5
MIN_SYMBOLS_FOR_TRADE = 8
REBALANCE_INTERVAL_MINUTES = 15
MAX_HOLD_MINUTES = 120

LONG_SIGNAL_CONFIDENCE_BASE = 70
SHORT_SIGNAL_CONFIDENCE_BASE = 70


def compute_momentum_score(market_data: dict[str, Any]) -> float:
    change_1h = market_data.get("change1h", 0.0) or 0.0
    change_4h = market_data.get("change4h", 0.0) or 0.0
    change_24h = market_data.get("change24hPct", 0.0) or 0.0

    score = (
        change_1h * MOMENTUM_1H_WEIGHT
        + change_4h * MOMENTUM_4H_WEIGHT
        + change_24h * MOMENTUM_24H_WEIGHT
    )
    return round(score, 4)


def rank_symbols(
    all_market_data: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    scored: list[dict[str, Any]] = []
    for data in all_market_data:
        symbol = data.get("symbol", "UNKNOWN")
        volume = data.get("volume24h", 0.0) or 0.0
        opp_score = data.get("opportunityScore", 0) or 0

        if volume < MIN_VOLUME_24H:
            continue
        if opp_score < MIN_OPPORTUNITY_SCORE:
            continue

        momentum = compute_momentum_score(data)
        scored.append({
            "symbol": symbol,
            "momentum_score": momentum,
            "volume24h": volume,
            "opportunity_score": opp_score,
            "change1h": data.get("change1h", 0.0),
            "change4h": data.get("change4h", 0.0),
            "change24h": data.get("change24hPct", 0.0),
            "funding_rate": data.get("fundingRate"),
            "open_interest_usd": data.get("openInterestUsd"),
            "price": data.get("price"),
        })

    scored.sort(key=lambda x: x["momentum_score"], reverse=True)
    return scored


def select_baskets(
    ranked: list[dict[str, Any]],
    basket_size: int = BASKET_SIZE,
) -> dict[str, Any]:
    if len(ranked) < MIN_SYMBOLS_FOR_TRADE:
        return {
            "can_trade": False,
            "reason": f"Only {len(ranked)} symbols qualified (need {MIN_SYMBOLS_FOR_TRADE})",
            "long_basket": [],
            "short_basket": [],
            "all_ranked": ranked,
            "dispersion": 0.0,
        }

    if len(ranked) > 0:
        top_momentum = ranked[0]["momentum_score"]
        bottom_momentum = ranked[-1]["momentum_score"]
        dispersion = abs(top_momentum - bottom_momentum)
    else:
        dispersion = 0.0

    if dispersion < 0.5:
        return {
            "can_trade": False,
            "reason": f"Cross-sectional dispersion too low: {dispersion:.2f}%",
            "long_basket": [],
            "short_basket": [],
            "all_ranked": ranked,
            "dispersion": round(dispersion, 2),
        }

    actual_size = min(basket_size, len(ranked) // 3)
    actual_size = max(1, actual_size)

    long_basket = ranked[:actual_size]
    short_basket = ranked[-actual_size:]

    return {
        "can_trade": True,
        "reason": "",
        "long_basket": long_basket,
        "short_basket": short_basket,
        "all_ranked": ranked,
        "dispersion": round(dispersion, 2),
        "basket_size": actual_size,
    }


def evaluate_signal(all_market_data: list[dict[str, Any]]) -> dict[str, Any]:
    ranked = rank_symbols(all_market_data)
    baskets = select_baskets(ranked)

    result: dict[str, Any] = {
        "signal": "none" if not baskets["can_trade"] else "active",
        "confidence": 0,
        "reasons": [],
        "ranked": ranked[:20],
        "long_basket": baskets["long_basket"],
        "short_basket": baskets["short_basket"],
        "dispersion": baskets["dispersion"],
        "total_qualified": len(ranked),
        "can_trade": baskets["can_trade"],
        "block_reason": baskets["reason"],
    }

    if not baskets["can_trade"]:
        result["reasons"] = [baskets["reason"]]
        return result

    long_momentum = sum(s["momentum_score"] for s in baskets["long_basket"]) / len(baskets["long_basket"])
    short_momentum = sum(s["momentum_score"] for s in baskets["short_basket"]) / len(baskets["short_basket"])
    spread = long_momentum - short_momentum

    confidence = min(100, 60 + int(spread * 10) + int(baskets["dispersion"] * 5))
    result["confidence"] = confidence
    result["signal"] = "active"
    result["reasons"] = [
        f"Long: {[s['symbol'] for s in baskets['long_basket']]} (avg mom: {long_momentum:.2f}%)",
        f"Short: {[s['symbol'] for s in baskets['short_basket']]} (avg mom: {short_momentum:.2f}%)",
        f"Spread: {spread:.2f}%, Dispersion: {baskets['dispersion']:.2f}%, Confidence: {confidence}",
    ]

    return result
