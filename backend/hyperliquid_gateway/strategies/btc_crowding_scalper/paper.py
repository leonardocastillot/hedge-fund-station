"""Paper candidate helpers for the BTC crowding scalper."""

from __future__ import annotations

from typing import Any


def paper_candidate(payload: dict[str, Any]) -> dict[str, Any]:
    latest_signal = payload.get("latest_signal", {}) or {}
    summary = payload.get("report_summary", {}) or {}
    validation = payload.get("validation", {}) or {}
    ready = validation.get("status") == "ready-for-paper"
    return {
        "strategy_id": "btc_crowding_scalper",
        "symbol": latest_signal.get("symbol"),
        "signal": latest_signal.get("signal", "none"),
        "status": "candidate" if ready and latest_signal.get("signal") == "long" else "standby",
        "promotion_gate": "eligible-for-paper-review" if ready else "blocked-by-validation",
        "trigger_plan": latest_signal.get("trigger_plan", "Wait for BTC crowding tailwind, micro impulse, OI stability, and liquid execution."),
        "invalidation_plan": latest_signal.get("invalidation_plan", "Stop at -0.25%, exit no-progress after 10m, time stop at 20m, and cool down after losses."),
        "report_context": {
            "return_pct": summary.get("return_pct"),
            "profit_factor": summary.get("profit_factor"),
            "max_drawdown_pct": summary.get("max_drawdown_pct"),
            "total_trades": summary.get("total_trades"),
            "fees_paid": summary.get("fees_paid"),
        },
        "review_fields": [
            "symbol",
            "funding_percentile",
            "crowding_bias",
            "micro_impulse",
            "execution_quality",
            "fees_paid",
            "exit_reason_counts",
            "paper journal outcome",
        ],
    }
