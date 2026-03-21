"""
Polymarket BTC Up/Down 5m Maker Basis Skew - Risk Controls
"""

from __future__ import annotations


def allow_maker_entry(signal_eval: dict, open_positions: list[dict], config: dict) -> dict:
    if signal_eval.get("signal") != "ENTER":
        return {"allowed": False, "reason": "Signal is not actionable"}

    max_open_positions = int(config.get("max_open_positions", 1) or 1)
    if len([position for position in open_positions if position.get("status") == "OPEN"]) >= max_open_positions:
        return {"allowed": False, "reason": f"Max open positions reached ({max_open_positions})"}

    min_confidence = int(config.get("min_confidence", 80) or 80)
    if int(signal_eval.get("confidence", 0) or 0) < min_confidence:
        return {"allowed": False, "reason": f"Signal confidence below {min_confidence}"}

    min_edge = float(config.get("min_net_edge_pct", 3.0) or 3.0)
    if float(signal_eval.get("net_edge_pct", 0.0) or 0.0) < min_edge:
        return {"allowed": False, "reason": f"Net edge below {min_edge:.3f}%"}

    return {"allowed": True, "reason": "Entry allowed"}
