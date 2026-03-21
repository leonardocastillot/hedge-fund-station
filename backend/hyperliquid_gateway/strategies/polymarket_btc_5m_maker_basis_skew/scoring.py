"""
Polymarket BTC Up/Down 5m Maker Basis Skew - Ranking Helpers
"""

from __future__ import annotations


def score_maker_setup(snapshot: dict, signal_eval: dict) -> dict:
    net_edge_pct = float(signal_eval.get("net_edge_pct", 0.0) or 0.0)
    spread_pct = float(snapshot.get("spread_pct", 0.0) or 0.0)
    seconds_to_expiry = int(snapshot.get("seconds_to_expiry", 0) or 0)
    confidence = int(signal_eval.get("confidence", 0) or 0)

    spread_score = max(0, min(100, round(spread_pct * 35)))
    timing_score = max(0, min(100, round(100 - abs(seconds_to_expiry - 110) * 0.7)))
    edge_score = max(0, min(100, round(50 + net_edge_pct * 12)))
    rank_score = max(0, min(100, round(confidence * 0.45 + edge_score * 0.35 + spread_score * 0.1 + timing_score * 0.1)))

    label = "avoid"
    if signal_eval.get("signal") == "ENTER":
        if rank_score >= 82:
            label = "watch-now"
        elif rank_score >= 68:
            label = "wait-trigger"

    return {
        "strategy_id": "polymarket_btc_5m_maker_basis_skew",
        "rank_score": rank_score,
        "watchlist_label": label,
        "edge_score": edge_score,
        "spread_score": spread_score,
        "timing_score": timing_score,
        "signal": signal_eval.get("signal"),
        "side": signal_eval.get("side"),
        "confidence": confidence,
        "net_edge_pct": round(net_edge_pct, 4),
    }
