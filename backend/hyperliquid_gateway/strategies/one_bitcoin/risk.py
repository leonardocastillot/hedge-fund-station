"""Risk helpers for One Bitcoin."""

from __future__ import annotations

from typing import Any

from .logic import STRATEGY_ID, strategy_config


def build_risk_plan(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    config = strategy_config((payload or {}).get("config") if isinstance((payload or {}).get("config"), dict) else None)
    return {
        "strategy_id": STRATEGY_ID,
        "allowed": True,
        "paper_allowed": False,
        "live_allowed": False,
        "goal_btc": config["goal_btc"],
        "starting_cash_usd": config["starting_cash_usd"],
        "monthly_deposit_usd": config["monthly_deposit_usd"],
        "max_leverage": 1.0,
        "rules": [
            "BTC spot accumulation only.",
            "No leverage.",
            "No shorting.",
            "Sell/rebuy logic is research-only until separately approved.",
            "No credential use or order routing.",
            "Validation blocks execution promotion by default.",
        ],
        "invalidation": [
            "Reject non-BTC symbols.",
            "Reject non-positive prices.",
            "Reject missing historical data.",
            "Treat any execution-routing request as out of scope for this strategy package.",
        ],
    }


def clamp_purchase_amount(*, cash_usd: float, requested_usd: float, min_purchase_usd: float) -> dict[str, Any]:
    spend = min(max(0.0, requested_usd), max(0.0, cash_usd))
    if spend < min_purchase_usd:
        return {
            "can_buy": False,
            "spend_usd": 0.0,
            "block_reason": "below_min_purchase_usd",
        }
    return {
        "can_buy": True,
        "spend_usd": round(spend, 8),
        "block_reason": None,
    }
