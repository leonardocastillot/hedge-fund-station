"""
Polymarket BTC Up/Down 5m Oracle Lag - Risk Controls
"""

from __future__ import annotations


def calculate_position_size(
    balance_usd: float,
    config: dict,
    open_positions: list[dict],
) -> dict:
    result = {
        "can_enter": True,
        "block_reason": None,
        "size_usd": 0.0,
        "size_pct": 0.0,
        "adjustments": [],
    }

    max_open_positions = int(config.get("max_open_positions", 1) or 1)
    if len([position for position in open_positions if position.get("status") == "OPEN"]) >= max_open_positions:
        result["can_enter"] = False
        result["block_reason"] = f"Max open positions reached ({max_open_positions})"
        return result

    base_size_pct = float(config.get("stake_pct", 8.0) or 8.0)
    max_notional_usd = float(config.get("max_notional_usd", 12.0) or 12.0)

    size_from_pct = balance_usd * (base_size_pct / 100)
    size_usd = min(size_from_pct, max_notional_usd, balance_usd)
    result["size_usd"] = round(max(0.0, size_usd), 2)
    result["size_pct"] = round((result["size_usd"] / balance_usd) * 100, 3) if balance_usd > 0 else 0.0
    result["adjustments"].append(f"Stake capped at ${max_notional_usd:.2f}")
    return result


def check_session_killswitch(session_stats: dict, config: dict) -> dict:
    max_consecutive_losses = int(config.get("max_consecutive_losses", 3) or 3)
    max_daily_drawdown_pct = float(config.get("max_daily_drawdown_pct", 8.0) or 8.0)

    consecutive_losses = int(session_stats.get("consecutive_losses", 0) or 0)
    daily_drawdown_pct = float(session_stats.get("daily_drawdown_pct", 0.0) or 0.0)

    if consecutive_losses >= max_consecutive_losses:
        return {
            "should_pause": True,
            "reason": f"{consecutive_losses} consecutive losses",
            "pause_minutes": 180,
        }

    if daily_drawdown_pct <= -abs(max_daily_drawdown_pct):
        return {
            "should_pause": True,
            "reason": f"Daily drawdown {daily_drawdown_pct:.2f}%",
            "pause_minutes": 360,
        }

    return {
        "should_pause": False,
        "reason": "",
        "pause_minutes": 0,
    }


def entry_allowed(snapshot: dict, signal_eval: dict, session_guard: dict, config: dict | None = None) -> dict:
    config = config or {}

    if session_guard.get("should_pause"):
        return {
            "allowed": False,
            "reason": session_guard.get("reason") or "Session kill-switch active",
        }

    if signal_eval.get("signal") != "ENTER":
        return {
            "allowed": False,
            "reason": "Signal is not actionable",
        }

    if int(snapshot.get("seconds_to_expiry", 0) or 0) <= 0:
        return {
            "allowed": False,
            "reason": "Event already expired",
        }

    if config.get("require_accepting_orders") and not bool(snapshot.get("accepting_orders", True)):
        return {
            "allowed": False,
            "reason": "Market is not accepting orders",
        }

    if config.get("require_price_to_beat") and snapshot.get("price_to_beat") is None:
        return {
            "allowed": False,
            "reason": "Market metadata is missing priceToBeat",
        }

    min_confidence = config.get("min_confidence")
    if min_confidence is not None and int(signal_eval.get("confidence", 0) or 0) < int(min_confidence):
        return {
            "allowed": False,
            "reason": f"Signal confidence below {int(min_confidence)}",
        }

    min_net_edge_pct = config.get("min_net_edge_pct")
    if min_net_edge_pct is not None and float(signal_eval.get("net_edge_pct", 0.0) or 0.0) < float(min_net_edge_pct):
        return {
            "allowed": False,
            "reason": f"Net edge below {float(min_net_edge_pct):.3f}%",
        }

    max_entry_price = config.get("max_entry_price")
    if max_entry_price is not None and float(signal_eval.get("entry_price", 0.0) or 0.0) > float(max_entry_price):
        return {
            "allowed": False,
            "reason": f"Entry price above {float(max_entry_price):.3f}",
        }

    max_spread_pct = config.get("max_spread_pct")
    if max_spread_pct is not None and float(snapshot.get("spread_pct", 0.0) or 0.0) > float(max_spread_pct):
        return {
            "allowed": False,
            "reason": f"Spread above {float(max_spread_pct):.3f}%",
        }

    return {
        "allowed": True,
        "reason": "Entry allowed",
    }
