"""
Polymarket BTC Up/Down 5m Maker Basis Skew - Signal Logic
"""

from __future__ import annotations

from typing import Any


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def entry_price_bucket(price: float) -> str:
    if price <= 0.20:
        return "cheap-tail"
    if price <= 0.40:
        return "discount"
    if price <= 0.60:
        return "mid"
    if price <= 0.80:
        return "rich"
    return "very-rich"


def maker_outcome_book(side: str, best_bid: float, best_ask: float) -> tuple[float, float]:
    if side == "BUY_YES":
        return best_bid, best_ask
    no_bid = clamp(1.0 - best_ask, 0.0, 1.0)
    no_ask = clamp(1.0 - best_bid, 0.0, 1.0)
    return no_bid, no_ask


def passive_quote_price(side: str, best_bid: float, best_ask: float, tick_size: float = 0.01) -> float:
    outcome_bid, outcome_ask = maker_outcome_book(side, best_bid, best_ask)
    improved_bid = round(outcome_bid + tick_size, 4)
    max_passive = round(outcome_ask - tick_size, 4)
    if max_passive <= 0 or improved_bid > max_passive:
        return 0.0
    return round(max(improved_bid, tick_size), 4)


def modeled_probability_from_basis(basis_bps: float, sensitivity_bps: float = 10.0) -> float:
    shift = clamp(basis_bps / max(sensitivity_bps, 0.0001), -0.20, 0.20)
    return clamp(0.5 + shift, 0.02, 0.98)


def evaluate_maker_setup(snapshot: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    result = {
        "signal": "HOLD",
        "side": None,
        "confidence": 0,
        "entry_price": 0.0,
        "target_exit_price": 0.0,
        "modeled_prob_up": 0.5,
        "net_edge_pct": 0.0,
        "entry_price_bucket": None,
        "filters_passed": {},
        "filters_failed": {},
        "reasons": [],
    }

    best_bid = float(snapshot.get("best_bid", 0.0) or 0.0)
    best_ask = float(snapshot.get("best_ask", 0.0) or 0.0)
    spread_pct = float(snapshot.get("spread_pct", 0.0) or 0.0)
    basis_bps = float(snapshot.get("basis_bps", 0.0) or 0.0)
    seconds_to_expiry = int(snapshot.get("seconds_to_expiry", 0) or 0)
    min_seconds = int(config.get("min_seconds_to_expiry", 70) or 70)
    max_seconds = int(config.get("max_seconds_to_expiry", 180) or 180)
    min_abs_basis_bps = float(config.get("min_abs_basis_bps", 8.0) or 8.0)
    min_spread_pct = float(config.get("min_spread_pct", 1.0) or 1.0)
    max_entry_price = float(config.get("max_entry_price", 0.4) or 0.4)
    allowed_buckets = {str(item).strip().lower() for item in config.get("allowed_entry_buckets", ["cheap-tail", "discount"])}
    target_move_pct = float(config.get("target_move_pct", 0.06) or 0.06)

    require_price_to_beat = bool(config.get("require_price_to_beat", False))
    if not snapshot.get("price_to_beat"):
        if require_price_to_beat:
            result["filters_failed"]["price_to_beat"] = "Missing priceToBeat"
            result["reasons"] = ["Official priceToBeat is required for maker basis skew"]
            return result
        result["filters_passed"]["basis_source"] = "stored_basis_only"
    else:
        result["filters_passed"]["basis_source"] = "official_price_to_beat"

    if min_seconds <= seconds_to_expiry <= max_seconds:
        result["filters_passed"]["time_window"] = f"{seconds_to_expiry}s"
    else:
        result["filters_failed"]["time_window"] = f"{seconds_to_expiry}s not in [{min_seconds}, {max_seconds}]"

    if abs(basis_bps) >= min_abs_basis_bps:
        result["filters_passed"]["basis"] = f"{basis_bps:+.2f}bps"
    else:
        result["filters_failed"]["basis"] = f"{basis_bps:+.2f}bps < {min_abs_basis_bps:.2f}bps"

    if spread_pct >= min_spread_pct:
        result["filters_passed"]["spread"] = f"{spread_pct:.3f}%"
    else:
        result["filters_failed"]["spread"] = f"{spread_pct:.3f}% < {min_spread_pct:.3f}%"

    side = "BUY_YES" if basis_bps > 0 else "BUY_NO" if basis_bps < 0 else None
    if not side:
        result["filters_failed"]["direction"] = "No directional basis"
        result["reasons"] = ["External BTC reference is neutral"]
        return result

    result["side"] = side
    modeled_prob_up = modeled_probability_from_basis(basis_bps, float(config.get("basis_sensitivity_bps", 10.0) or 10.0))
    result["modeled_prob_up"] = round(modeled_prob_up, 4)

    entry_price = passive_quote_price(side, best_bid, best_ask, float(config.get("tick_size", 0.01) or 0.01))
    if entry_price <= 0:
        result["filters_failed"]["passive_quote"] = "No passive improvement available"
    else:
        result["entry_price"] = entry_price
        bucket = entry_price_bucket(entry_price)
        result["entry_price_bucket"] = bucket
        if bucket in allowed_buckets:
            result["filters_passed"]["entry_bucket"] = bucket
        else:
            result["filters_failed"]["entry_bucket"] = f"{bucket} not in {sorted(allowed_buckets)}"
        if entry_price <= max_entry_price:
            result["filters_passed"]["entry_price"] = f"{entry_price:.3f} <= {max_entry_price:.3f}"
        else:
            result["filters_failed"]["entry_price"] = f"{entry_price:.3f} > {max_entry_price:.3f}"

        modeled_outcome_prob = modeled_prob_up if side == "BUY_YES" else (1.0 - modeled_prob_up)
        gross_edge_pct = (modeled_outcome_prob - entry_price) * 100
        result["net_edge_pct"] = round(gross_edge_pct, 4)
        result["target_exit_price"] = round(min(0.99, entry_price + target_move_pct), 4)
        if gross_edge_pct > 0:
            result["filters_passed"]["edge"] = f"{gross_edge_pct:.3f}%"
        else:
            result["filters_failed"]["edge"] = f"{gross_edge_pct:.3f}%"

    if not result["filters_failed"]:
        result["signal"] = "ENTER"
        result["confidence"] = int(clamp(65 + abs(basis_bps) * 2 + result["net_edge_pct"] * 8, 0, 99))
        result["reasons"] = [
            f"Basis {basis_bps:+.2f} bps favors {side}",
            f"Passive quote at {result['entry_price']:.3f}",
            f"Target exit at {result['target_exit_price']:.3f}",
        ]
    else:
        result["confidence"] = int(clamp(35 + max(result["net_edge_pct"], -1.0) * 5, 0, 60))
        if not result["reasons"]:
            result["reasons"] = [f"{len(result['filters_failed'])} filters failed"]

    return result
