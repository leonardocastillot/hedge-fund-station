"""
Polymarket BTC Up/Down 5m Oracle Lag - Signal Logic

This module does not assume the edge exists. It only evaluates whether a
specific market snapshot offers enough modeled edge to justify a trade after
fees, slippage, and timing constraints.
"""

from __future__ import annotations

from typing import Any

from .paper import estimate_fee_pct


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def implied_edge_pct(
    market_entry_price: float,
    modeled_prob_up: float,
    side: str,
) -> float:
    """
    Return percentage edge between modeled probability and actionable entry price.
    """
    if side == "BUY_YES":
        return (modeled_prob_up - market_entry_price) * 100
    if side == "BUY_NO":
        modeled_prob_down = 1.0 - modeled_prob_up
        return (modeled_prob_down - market_entry_price) * 100
    return 0.0


def price_to_probability(price: float | None) -> float | None:
    if price is None:
        return None
    return clamp(price, 0.0, 1.0)


def side_entry_price(side: str, best_bid: float, best_ask: float) -> float:
    if side == "BUY_YES":
        return float(clamp(best_ask, 0.0, 1.0))
    if side == "BUY_NO":
        return float(clamp(1.0 - best_bid, 0.0, 1.0))
    return 0.0


def side_from_basis(basis_bps: float) -> str | None:
    if basis_bps > 0:
        return "BUY_YES"
    if basis_bps < 0:
        return "BUY_NO"
    return None


def entry_price_bucket(entry_price: float) -> str:
    if entry_price <= 0.20:
        return "cheap-tail"
    if entry_price <= 0.40:
        return "discount"
    if entry_price <= 0.60:
        return "mid"
    if entry_price <= 0.80:
        return "rich"
    return "very-rich"


def model_probability_from_basis(
    basis_bps: float,
    sensitivity_bps: float = 8.0,
    base_probability: float = 0.5,
) -> float:
    """
    Map external BTC basis into a conservative probability estimate.
    """
    probability_shift = clamp(basis_bps / max(sensitivity_bps, 0.0001), -0.18, 0.18)
    return clamp(base_probability + probability_shift, 0.02, 0.98)


def evaluate_signal(snapshot: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    """
    Evaluate whether the current snapshot is tradeable.
    """
    result = {
        "signal": "HOLD",
        "side": None,
        "confidence": 0,
        "modeled_prob_up": 0.5,
        "gross_edge_pct": 0.0,
        "net_edge_pct": 0.0,
        "reasons": [],
        "filters_passed": {},
        "filters_failed": {},
    }

    yes_price = price_to_probability(snapshot.get("yes_price"))
    best_ask = price_to_probability(snapshot.get("best_ask"))
    best_bid = price_to_probability(snapshot.get("best_bid"))
    basis_bps = float(snapshot.get("basis_bps", 0.0) or 0.0)
    seconds_to_expiry = int(snapshot.get("seconds_to_expiry", 0) or 0)
    slippage_pct = float(snapshot.get("slippage_pct", 0.0) or 0.0)
    safety_margin_pct = float(config.get("safety_margin_pct", 0.10) or 0.10)
    min_seconds_to_expiry = int(config.get("min_seconds_to_expiry", 40) or 40)
    max_seconds_to_expiry = int(config.get("max_seconds_to_expiry", 250) or 250)
    min_gross_edge_pct = float(config.get("min_gross_edge_pct", 0.20) or 0.20)

    if yes_price is None or best_ask is None or best_bid is None:
        result["filters_failed"]["book"] = "Missing yes/bid/ask price"
        result["reasons"].append("Incomplete orderbook snapshot")
        return result

    modeled_prob_up = model_probability_from_basis(
        basis_bps=basis_bps,
        sensitivity_bps=float(config.get("basis_sensitivity_bps", 8.0) or 8.0),
    )
    result["modeled_prob_up"] = round(modeled_prob_up, 4)

    if min_seconds_to_expiry <= seconds_to_expiry <= max_seconds_to_expiry:
        result["filters_passed"]["time_window"] = f"{seconds_to_expiry}s"
    else:
        result["filters_failed"]["time_window"] = (
            f"{seconds_to_expiry}s not in [{min_seconds_to_expiry}, {max_seconds_to_expiry}]"
        )

    if basis_bps > 0:
        side = "BUY_YES"
    elif basis_bps < 0:
        side = "BUY_NO"
    else:
        side = "HOLD"

    if side == "HOLD":
        result["filters_failed"]["basis"] = "No directional basis"
        result["reasons"].append("External BTC reference is neutral")
        return result

    result["side"] = side
    actionable_entry_price = side_entry_price(side, float(best_bid), float(best_ask))

    one_way_fee_pct = estimate_fee_pct(actionable_entry_price)
    roundtrip_fee_pct = one_way_fee_pct * 2
    gross_edge_pct = implied_edge_pct(actionable_entry_price, modeled_prob_up, side)
    net_edge_pct = gross_edge_pct - roundtrip_fee_pct - slippage_pct - safety_margin_pct
    result["gross_edge_pct"] = round(gross_edge_pct, 4)
    result["net_edge_pct"] = round(net_edge_pct, 4)
    result["entry_price"] = round(actionable_entry_price, 4)
    result["roundtrip_fee_pct"] = round(roundtrip_fee_pct, 4)
    result["entry_price_bucket"] = entry_price_bucket(actionable_entry_price)
    result["cost_structure"] = {
        "roundtrip_fee_pct": round(roundtrip_fee_pct, 4),
        "slippage_pct": round(slippage_pct, 4),
        "safety_margin_pct": round(safety_margin_pct, 4),
    }

    if gross_edge_pct >= min_gross_edge_pct:
        result["filters_passed"]["gross_edge"] = f"{gross_edge_pct:.3f}%"
    else:
        result["filters_failed"]["gross_edge"] = f"{gross_edge_pct:.3f}% < {min_gross_edge_pct:.3f}%"

    total_cost_pct = roundtrip_fee_pct + slippage_pct + safety_margin_pct
    if net_edge_pct > 0:
        result["filters_passed"]["net_edge"] = f"{net_edge_pct:.3f}% after {total_cost_pct:.3f}% costs"
    else:
        result["filters_failed"]["net_edge"] = f"{net_edge_pct:.3f}% after {total_cost_pct:.3f}% costs"

    spread_pct = max(0.0, (best_ask - best_bid) * 100)
    max_spread_pct = float(config.get("max_spread_pct", 1.2) or 1.2)
    if spread_pct <= max_spread_pct:
        result["filters_passed"]["spread"] = f"{spread_pct:.3f}%"
    else:
        result["filters_failed"]["spread"] = f"{spread_pct:.3f}% > {max_spread_pct:.3f}%"

    max_entry_price = config.get("max_entry_price")
    if max_entry_price is not None:
        max_entry_price = float(max_entry_price)
        if actionable_entry_price <= max_entry_price:
            result["filters_passed"]["entry_price"] = f"{actionable_entry_price:.3f} <= {max_entry_price:.3f}"
        else:
            result["filters_failed"]["entry_price"] = f"{actionable_entry_price:.3f} > {max_entry_price:.3f}"

    allowed_entry_buckets = config.get("allowed_entry_buckets")
    if allowed_entry_buckets:
        normalized_allowed_buckets = {str(item).strip().lower() for item in allowed_entry_buckets}
        current_bucket = str(result["entry_price_bucket"]).strip().lower()
        if current_bucket in normalized_allowed_buckets:
            result["filters_passed"]["entry_bucket"] = current_bucket
        else:
            result["filters_failed"]["entry_bucket"] = f"{current_bucket} not in {sorted(normalized_allowed_buckets)}"

    filters_failed = len(result["filters_failed"])
    if filters_failed == 0:
        result["signal"] = "ENTER"
        result["confidence"] = int(clamp(60 + abs(basis_bps) * 2 + net_edge_pct * 20, 0, 99))
        result["reasons"] = [
            f"Basis {basis_bps:+.2f} bps favors {side}",
            f"Gross edge {gross_edge_pct:.3f}%",
            f"Net edge {net_edge_pct:.3f}% after modeled costs",
        ]
    else:
        result["confidence"] = int(clamp(40 + max(net_edge_pct, -1.0) * 10, 0, 60))
        if not result["reasons"]:
            result["reasons"] = [f"{filters_failed} filters failed"]

    return result


def apply_signal_confirmation(
    signal_eval: dict[str, Any],
    recent_snapshots: list[dict[str, Any]],
    config: dict[str, Any],
) -> dict[str, Any]:
    if signal_eval.get("signal") != "ENTER":
        return signal_eval

    required_count = int(config.get("required_signal_persistence_count", 1) or 1)
    min_confirmed_basis_bps = float(
        config.get("min_confirmed_basis_bps", config.get("min_abs_basis_bps", 0.0)) or 0.0
    )
    if required_count <= 1 and min_confirmed_basis_bps <= 0:
        return signal_eval

    confirmed_signal = dict(signal_eval)
    expected_side = str(signal_eval.get("side") or "")
    recent_window = list(recent_snapshots[-required_count:])
    if len(recent_window) < required_count:
        confirmed_signal["signal"] = "HOLD"
        confirmed_signal["confidence"] = min(int(confirmed_signal.get("confidence", 0) or 0), 60)
        confirmed_signal.setdefault("filters_failed", {})["confirmation"] = (
            f"Only {len(recent_window)} snapshots available, need {required_count}"
        )
        confirmed_signal["reasons"] = ["Signal confirmation history is insufficient"]
        confirmed_signal["confirmation"] = {
            "passed": False,
            "requiredCount": required_count,
            "observedCount": len(recent_window),
            "sameSideCount": 0,
            "minConfirmedBasisBps": min_confirmed_basis_bps,
        }
        return confirmed_signal

    same_side_count = 0
    min_observed_abs_basis = None
    for snapshot in recent_window:
        observed_basis_bps = float(snapshot.get("basis_bps", 0.0) or 0.0)
        observed_side = side_from_basis(observed_basis_bps)
        if observed_side == expected_side and abs(observed_basis_bps) >= min_confirmed_basis_bps:
            same_side_count += 1
        abs_basis = abs(observed_basis_bps)
        min_observed_abs_basis = abs_basis if min_observed_abs_basis is None else min(min_observed_abs_basis, abs_basis)

    if same_side_count < required_count:
        confirmed_signal["signal"] = "HOLD"
        confirmed_signal["confidence"] = min(int(confirmed_signal.get("confidence", 0) or 0), 60)
        confirmed_signal.setdefault("filters_failed", {})["confirmation"] = (
            f"{same_side_count}/{required_count} confirmed snapshots at >= {min_confirmed_basis_bps:.2f} bps"
        )
        confirmed_signal["reasons"] = ["Directional persistence confirmation failed"]
        confirmed_signal["confirmation"] = {
            "passed": False,
            "requiredCount": required_count,
            "observedCount": len(recent_window),
            "sameSideCount": same_side_count,
            "minConfirmedBasisBps": min_confirmed_basis_bps,
            "minObservedAbsBasisBps": round(float(min_observed_abs_basis or 0.0), 4),
        }
        return confirmed_signal

    confirmed_signal.setdefault("filters_passed", {})["confirmation"] = (
        f"{same_side_count}/{required_count} snapshots confirmed at >= {min_confirmed_basis_bps:.2f} bps"
    )
    confirmed_signal["confirmation"] = {
        "passed": True,
        "requiredCount": required_count,
        "observedCount": len(recent_window),
        "sameSideCount": same_side_count,
        "minConfirmedBasisBps": min_confirmed_basis_bps,
        "minObservedAbsBasisBps": round(float(min_observed_abs_basis or 0.0), 4),
    }
    return confirmed_signal
