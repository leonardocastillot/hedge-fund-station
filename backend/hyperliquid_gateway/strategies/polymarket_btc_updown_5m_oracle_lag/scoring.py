"""
Polymarket BTC Up/Down 5m Oracle Lag - Ranking Helpers
"""

from __future__ import annotations


def score_setup(snapshot: dict, signal_eval: dict) -> dict:
    net_edge_pct = float(signal_eval.get("net_edge_pct", 0.0) or 0.0)
    spread_pct = float(snapshot.get("spread_pct", 0.0) or 0.0)
    seconds_to_expiry = int(snapshot.get("seconds_to_expiry", 0) or 0)
    confidence = int(signal_eval.get("confidence", 0) or 0)

    spread_score = max(0, min(100, round(100 - spread_pct * 40)))
    timing_score = max(0, min(100, round(100 - abs(seconds_to_expiry - 120) * 0.6)))
    edge_score = max(0, min(100, round(50 + net_edge_pct * 45)))

    rank_score = max(
        0,
        min(100, round(confidence * 0.4 + edge_score * 0.4 + spread_score * 0.1 + timing_score * 0.1)),
    )

    watchlist_label = "avoid"
    if signal_eval.get("signal") == "ENTER":
        if rank_score >= 80:
            watchlist_label = "watch-now"
        elif rank_score >= 65:
            watchlist_label = "wait-trigger"

    return {
        "strategy_id": "polymarket_btc_updown_5m_oracle_lag",
        "rank_score": rank_score,
        "watchlist_label": watchlist_label,
        "edge_score": edge_score,
        "spread_score": spread_score,
        "timing_score": timing_score,
        "signal": signal_eval.get("signal"),
        "side": signal_eval.get("side"),
        "confidence": confidence,
        "net_edge_pct": round(net_edge_pct, 4),
    }


def rank_candidates(candidates: list[dict]) -> list[dict]:
    ranked = []
    for candidate in candidates:
        ranked.append(score_setup(candidate.get("snapshot", {}), candidate.get("signal_eval", {})))
    ranked.sort(key=lambda item: item["rank_score"], reverse=True)
    return ranked
