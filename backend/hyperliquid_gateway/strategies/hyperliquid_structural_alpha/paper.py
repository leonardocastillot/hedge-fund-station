from __future__ import annotations

from typing import Any

from .logic import STRATEGY_ID

SETUP_TAGS = (STRATEGY_ID, "hyperliquid-structural-alpha", "multi-factor", "funding-oi-setup")


def paper_candidate(payload: dict[str, Any]) -> dict[str, Any]:
    latest_signal = payload.get("latest_signal", {}) or {}
    summary = payload.get("report_summary", {}) or {}
    validation = payload.get("validation", {}) or {}
    ready = validation.get("status") == "ready-for-paper"
    signal = latest_signal.get("signal", "none")
    return {
        "strategy_id": STRATEGY_ID,
        "symbol": "MULTI",
        "signal": signal,
        "status": "candidate" if ready else "blocked",
        "promotion_gate": "eligible-for-paper-review" if ready else "blocked-by-validation",
        "validation_status": validation.get("status"),
        "validation_blockers": validation.get("blocking_reasons", []),
        "thesis": (
            "Exploit structural inefficiencies in perpetual futures: funding rate extremes "
            "(retail crowding), OI/price divergence (smart money positioning), setup score "
            "confluence (regime clarity), and multi-timeframe momentum. Multi-symbol ranking "
            "selects highest-conviction setups across 190+ Hyperliquid markets."
        ),
        "signal_summary": f"Current signal: {signal} (conviction: {latest_signal.get('conviction', 0)})",
        "trigger_plan": (
            "Composite score from 5 factors crosses +/-50 threshold. "
            "Funding: extremes indicate retail crowding. "
            "OI divergence: trend health or weakness. "
            "Setup confluence: breakout vs fade dominance. "
            "Momentum: multi-TF weighted composite. "
            "Crowding: contrarian bias signal."
        ),
        "invalidation_plan": (
            "Stop loss (vol-adaptive, conviction-scaled). "
            "Take profit (1.5-2.5x risk). "
            "OI contraction > 2.5%. "
            "15m direction reversal. "
            "25m no-progress exit. "
            "120m time stop."
        ),
        "report_context": {
            "return_pct": summary.get("return_pct"),
            "profit_factor": summary.get("profit_factor"),
            "win_rate_pct": summary.get("win_rate_pct"),
            "max_drawdown_pct": summary.get("max_drawdown_pct"),
            "total_trades": summary.get("total_trades"),
            "fees_paid": summary.get("fees_paid"),
        },
        "paperTradeMatch": {"symbol": "MULTI", "setupTags": list(SETUP_TAGS)},
        "review_fields": [
            "composite_score",
            "component_scores (funding, oi, setup, momentum, crowding)",
            "tf_agreement",
            "conviction",
            "execution_quality",
            "entry/exit prices",
            "exit_reason",
            "paper journal outcome",
        ],
    }
