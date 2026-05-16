from __future__ import annotations

from typing import Any

STRATEGY_ID = "hyperliquid_structural_alpha"

MIN_VOLUME_USD = 5_000_000
MIN_OPEN_INTEREST_USD = 500_000
ENTRY_THRESHOLD = 40


def evaluate_signal(market_data: dict[str, Any]) -> dict[str, Any]:
    price = float(market_data.get("price", 0.0) or 0.0)
    volume_24h = float(market_data.get("volume24h", 0.0) or 0.0)
    oi_current = float(market_data.get("openInterestUsd", 0.0) or 0.0)
    oi_1h_ago = float(market_data.get("openInterestUsd1hAgo", oi_current) or oi_current)
    oi_delta_pct = ((oi_current - oi_1h_ago) / oi_1h_ago) * 100.0 if oi_1h_ago else 0.0
    funding_pct = float(market_data.get("fundingPercentile", 50.0) or 50.0)
    crowding = str(market_data.get("crowdingBias", "balanced") or "balanced")
    setup_scores = market_data.get("setupScores", {}) or {}
    breakout = float(setup_scores.get("breakoutContinuation", 0.0) or 0.0)
    fade = float(setup_scores.get("fade", 0.0) or 0.0)
    short_squeeze = float(setup_scores.get("shortSqueeze", 0.0) or 0.0)
    long_flush = float(setup_scores.get("longFlush", 0.0) or 0.0)
    change_5m = float(market_data.get("change5m", 0.0) or 0.0)
    change_15m = float(market_data.get("change15m", 0.0) or 0.0)
    change_1h = float(market_data.get("change1h", 0.0) or 0.0)
    change_4h = float(market_data.get("change4h", 0.0) or 0.0)

    funding_score = compute_funding_score(funding_pct)
    oi_divergence_score = compute_oi_divergence_score(change_1h, oi_delta_pct)
    setup_score = compute_setup_confluence_score(breakout, fade, short_squeeze, long_flush)
    momentum_score = compute_momentum_score(change_5m, change_15m, change_1h, change_4h)
    crowding_score = compute_crowding_score(crowding, funding_pct, change_1h)

    scores = [funding_score, oi_divergence_score, setup_score, momentum_score, crowding_score]
    dominant = max(scores, key=abs)
    agreement = sum(1 for s in scores if abs(s) > 25)
    comp_raw = abs(dominant) * (0.55 + agreement * 0.10)
    composite = comp_raw if dominant > 0 else -comp_raw

    tfs = [change_5m, change_15m, change_1h, change_4h]
    agreement_count = sum(1 for tf in tfs if abs(tf) > 0.1)
    tf_dir = sum(1 for tf in tfs if tf > 0)
    momentum_bullish = tf_dir >= 2
    momentum_bearish = (4 - tf_dir) >= 2

    liquid = volume_24h >= MIN_VOLUME_USD and oi_current >= MIN_OPEN_INTEREST_USD
    signal = "none"
    direction = "none"
    conviction = 0
    reasons = []

    if liquid and abs(composite) >= ENTRY_THRESHOLD:
        if composite > 0 and momentum_bullish:
            signal = "long"
            direction = "long"
            conviction = int(min(100, abs(composite) * (1.0 + agreement * 0.08)))
            reasons = build_reasons_long(funding_score, oi_divergence_score, setup_score, momentum_score, crowding_score, composite, agreement)
        elif composite < 0 and momentum_bearish:
            signal = "short"
            direction = "short"
            conviction = int(min(100, abs(composite) * (1.0 + agreement * 0.08)))
            reasons = build_reasons_long(funding_score, oi_divergence_score, setup_score, momentum_score, crowding_score, composite, agreement)
        else:
            reasons = build_reasons_no_trade(funding_score, oi_divergence_score, setup_score, momentum_score, composite, agreement)
    elif liquid:
        reasons = build_reasons_no_trade(funding_score, oi_divergence_score, setup_score, momentum_score, composite, agreement)

    return {
        "strategy_id": STRATEGY_ID,
        "symbol": market_data.get("symbol"),
        "signal": signal,
        "direction": direction,
        "conviction": conviction,
        "composite_score": round(composite, 2),
        "component_scores": {
            "funding": round(funding_score, 2),
            "oi_divergence": round(oi_divergence_score, 2),
            "setup_confluence": round(setup_score, 2),
            "momentum": round(momentum_score, 2),
            "crowding": round(crowding_score, 2),
        },
        "features": {
            "funding_percentile": round(funding_pct, 2),
            "oi_delta_1h_pct": round(oi_delta_pct, 4),
            "breakout_score": round(breakout, 2),
            "fade_score": round(fade, 2),
            "crowding_bias": crowding,
            "change5m_pct": round(change_5m, 4),
            "change15m_pct": round(change_15m, 4),
            "change1h_pct": round(change_1h, 4),
            "change4h_pct": round(change_4h, 4),
            "tf_agreement": agreement,
        },
        "filters_passed": {
            "liquid": liquid,
            "above_threshold": abs(composite) >= ENTRY_THRESHOLD,
            "momentum_matches": (composite > 0 and momentum_bullish) or (composite < 0 and momentum_bearish),
        },
        "reasons": reasons,
    }


def compute_funding_score(funding_pct: float) -> float:
    if funding_pct < 15:
        return 80.0
    if funding_pct < 30:
        return 60.0 * (30 - funding_pct) / 15.0
    if funding_pct > 85:
        return -80.0
    if funding_pct > 70:
        return -60.0 * (funding_pct - 70) / 15.0
    if funding_pct < 40:
        return 15.0
    if funding_pct > 60:
        return -15.0
    return 0.0


def compute_oi_divergence_score(change_1h: float, oi_delta_pct: float) -> float:
    price_up = change_1h > 0.1
    price_down = change_1h < -0.1
    oi_up = oi_delta_pct > 0.5
    oi_down = oi_delta_pct < -0.5
    if price_up and oi_up:
        return 40.0
    if price_up and oi_down:
        return -65.0
    if price_down and oi_up:
        return 65.0
    if price_down and oi_down:
        return -40.0
    if abs(oi_delta_pct) > 3.0:
        return 30.0 if oi_delta_pct < 0 else -30.0
    return 0.0


def compute_setup_confluence_score(breakout: float, fade: float, short_squeeze: float, long_flush: float) -> float:
    total = breakout + fade + short_squeeze + long_flush
    if total < 10:
        return 0.0
    net_directional = (breakout + short_squeeze) - (fade + long_flush)
    dominance = net_directional / total
    return max(-100.0, min(100.0, dominance * 120.0))


def compute_momentum_score(change_5m: float, change_15m: float, change_1h: float, change_4h: float) -> float:
    tfs = [change_5m, change_15m, change_1h, change_4h]
    weights = [0.10, 0.25, 0.40, 0.25]
    raw = sum(tf * w for tf, w in zip(tfs, weights))
    score = max(-100.0, min(100.0, raw * 60.0))
    alive = sum(1 for tf in tfs if abs(tf) > 0.05)
    if alive >= 3 and abs(score) > 65:
        score *= 0.75
    return score


def compute_crowding_score(crowding: str, funding_pct: float, change_1h: float) -> float:
    if crowding == "shorts-at-risk":
        return min(80.0, 40.0 + abs(change_1h) * 15.0)
    if crowding == "longs-at-risk":
        return max(-80.0, -40.0 - abs(change_1h) * 15.0)
    if funding_pct < 20:
        return 15.0
    if funding_pct > 80:
        return -15.0
    return 0.0


def build_reasons_long(funding_score, oi_score, setup_score, momentum_score, crowding_score, composite, agreement):
    parts = []
    if abs(funding_score) > 50:
        parts.append("funding:extreme")
    elif abs(funding_score) > 20:
        parts.append("funding:tilt")
    if abs(oi_score) > 50:
        parts.append("oi:divergence")
    if abs(setup_score) > 50:
        parts.append("setup:directional")
    if abs(momentum_score) > 50:
        parts.append("momentum:strong")
    if abs(crowding_score) > 40:
        parts.append("crowding:biased")
    parts.append(f"composite:{composite:.0f}")
    parts.append(f"tf_agree:{agreement}/5")
    return parts


def build_reasons_no_trade(funding_score, oi_score, setup_score, momentum_score, composite, agreement):
    return [
        f"No trade: composite {composite:.0f}, tf_agree {agreement}/5",
        f"funding {funding_score:.0f}, oi {oi_score:.0f}, setup {setup_score:.0f}, momentum {momentum_score:.0f}",
    ]
