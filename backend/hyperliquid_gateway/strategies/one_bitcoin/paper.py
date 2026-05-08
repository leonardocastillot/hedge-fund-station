"""Paper helpers for One Bitcoin.

One Bitcoin is a research and accumulation goal tracker. It intentionally does
not create executable paper trades in v1.
"""

from __future__ import annotations

from typing import Any

from .logic import STRATEGY_ID


def paper_candidate(payload: dict[str, Any]) -> dict[str, Any]:
    summary = payload.get("report_summary", {}) or {}
    validation = payload.get("validation", {}) or {}
    latest_signal = payload.get("latest_signal", {}) or {}
    return {
        "strategy_id": STRATEGY_ID,
        "symbol": "BTC",
        "signal": "none",
        "status": "blocked",
        "promotion_gate": "blocked-accumulation-research-only",
        "validation_status": validation.get("status"),
        "validation_blockers": validation.get("blocking_reasons", []),
        "thesis": "Accumulate BTC toward one full coin with DCA as baseline and reserved dip buying as the experiment.",
        "trigger_plan": latest_signal.get("trigger_plan", "Review the backtest variant comparison; do not route orders from this package."),
        "invalidation_plan": "No paper/live execution in v1. Human must design a separate broker/exchange execution route first.",
        "report_context": {
            "btc_balance": summary.get("btc_balance"),
            "percent_to_one_btc": summary.get("percent_to_one_btc"),
            "total_deposited_usd": summary.get("total_deposited_usd"),
            "cash_left_usd": summary.get("cash_left_usd"),
            "months_to_one_btc": summary.get("months_to_one_btc"),
        },
        "review_fields": [
            "variant_comparison",
            "btc_balance",
            "percent_to_one_btc",
            "average_cost_basis",
            "cash_drag_notes",
            "dca_benchmark",
        ],
    }
