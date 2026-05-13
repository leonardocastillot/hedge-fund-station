"""Paper candidate helpers for the BTC fee-aware failed impulse scalp."""

from __future__ import annotations

from typing import Any

STRATEGY_ID = "btc_fee_aware_failed_impulse_scalp"
SETUP_TAGS = (
    STRATEGY_ID,
    "btc-fee-aware-failed-impulse-scalp",
    "fee_aware_failed_impulse_scalp",
    "fee-aware-failed-impulse-scalp",
)


def paper_candidate(payload: dict[str, Any]) -> dict[str, Any]:
    latest_signal = payload.get("latest_signal", {}) or {}
    summary = payload.get("report_summary", {}) or {}
    validation = payload.get("validation", {}) or {}
    ready = validation.get("status") == "ready-for-paper"
    signal = latest_signal.get("signal", "none")
    return {
        "strategy_id": STRATEGY_ID,
        "symbol": latest_signal.get("symbol", "BTC"),
        "signal": signal,
        "status": "candidate" if ready and signal in {"long", "short"} else "standby",
        "promotion_gate": "eligible-for-paper-review" if ready else "blocked-by-validation",
        "validation_status": validation.get("status"),
        "validation_blockers": validation.get("blocking_reasons", []),
        "thesis": "Fade late BTC impulse failure only when OI/funding/crowding suggest trapped leverage and the target clears fees.",
        "trigger_plan": latest_signal.get(
            "trigger_plan",
            "Wait for a BTC 1h impulse, failed 15m continuation, stable/rising OI, trapped-side context, and fee-clearing target.",
        ),
        "invalidation_plan": latest_signal.get(
            "invalidation_plan",
            "Use 0.45% stop, 0.90% target, 20m no-progress exit, 90m max hold, one BTC position, and cooldowns.",
        ),
        "report_context": {
            "return_pct": summary.get("return_pct"),
            "btc_hold_return_pct": summary.get("btc_hold_return_pct"),
            "excess_vs_btc_hold_pct": summary.get("excess_vs_btc_hold_pct"),
            "profit_factor": summary.get("profit_factor"),
            "win_rate_pct": summary.get("win_rate_pct"),
            "max_drawdown_pct": summary.get("max_drawdown_pct"),
            "total_trades": summary.get("total_trades"),
            "fees_paid": summary.get("fees_paid"),
        },
        "review_fields": [
            "symbol",
            "side",
            "change1h_pct",
            "change15m_pct",
            "open_interest_delta_1h_pct",
            "funding_percentile",
            "fee_edge_pct",
            "execution_quality",
            "excess_vs_btc_hold_pct",
            "paper journal outcome",
        ],
    }
