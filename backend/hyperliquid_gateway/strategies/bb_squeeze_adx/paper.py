"""BB Squeeze ADX paper-trade helpers."""

from __future__ import annotations

from typing import Any


def paper_candidate(payload: dict[str, Any]) -> dict[str, Any]:
    signal = payload.get("latest_signal", payload)
    summary = payload.get("report_summary", {})
    validation = payload.get("validation", {})
    gate_ready = validation.get("status") == "ready-for-paper"
    return {
        "strategy_id": "bb_squeeze_adx",
        "signal": signal.get("signal", "none"),
        "status": "candidate" if gate_ready and signal.get("signal") in {"long", "short"} else "standby",
        "promotion_gate": "eligible-for-paper-review" if gate_ready else "blocked-by-validation",
        "report_context": {
            "return_pct": summary.get("return_pct"),
            "profit_factor": summary.get("profit_factor"),
            "max_drawdown_pct": summary.get("max_drawdown_pct"),
            "total_trades": summary.get("total_trades"),
        },
        "trigger_plan": "Wait for the next confirmed breakout candle after squeeze release and verify gateway market data.",
        "review_fields": [
            "dataset",
            "report_path",
            "validation_path",
            "adx",
            "stop_loss",
            "take_profit",
            "profit_factor",
            "max_drawdown_pct",
        ],
    }
