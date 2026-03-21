"""
Polymarket BTC Up/Down 5m Oracle Lag - Paper and ROI Helpers
"""

from __future__ import annotations


def paper_candidate(payload: dict) -> dict:
    latest_signal = payload.get("latest_signal", {})
    summary = payload.get("report_summary", {})
    validation = payload.get("validation", {})
    research_summary = payload.get("report_payload", {}).get("research_summary", {})
    gate_ready = validation.get("status") == "ready-for-paper"
    return {
        "strategy_id": "polymarket_btc_updown_5m_oracle_lag",
        "slug": latest_signal.get("slug"),
        "signal": latest_signal.get("signal", "HOLD"),
        "side": latest_signal.get("side"),
        "status": "candidate" if gate_ready and latest_signal.get("signal") == "ENTER" else "standby",
        "promotion_gate": "eligible-for-paper-review" if gate_ready else "blocked-by-validation",
        "report_context": {
            "return_pct": summary.get("return_pct"),
            "profit_factor": summary.get("profit_factor"),
            "max_drawdown_pct": summary.get("max_drawdown_pct"),
            "total_trades": summary.get("total_trades"),
        },
        "research_recommendation": research_summary.get("recommended_next_variant"),
        "variant_leaderboard": research_summary.get("variant_leaderboard", [])[:3],
        "trigger_plan": "Only enter inside the configured expiry window when net edge remains positive after fees and slippage reserve.",
        "review_fields": [
            "dataset",
            "report_path",
            "validation_path",
            "slug",
            "side",
            "net_edge_pct",
            "seconds_to_expiry",
            "profit_factor",
            "research_recommendation",
        ],
    }


def estimate_fee_pct(price: float, fee_rate: float = 0.25, exponent: int = 2) -> float:
    """
    Estimate one-way taker fee as a percentage of traded notional for crypto markets.

    Polymarket fee docs define:
    fee = C × p × feeRate × (p × (1 - p))^exponent

    Effective fee percent on notional is therefore:
    feeRate × (p × (1 - p))^exponent × 100
    """
    bounded_price = min(max(float(price), 0.01), 0.99)
    effective_fee_fraction = fee_rate * ((bounded_price * (1 - bounded_price)) ** exponent)
    return effective_fee_fraction * 100


def calculate_realized_pnl(
    side: str,
    entry_price: float,
    exit_price: float,
    size_usd: float,
    entry_fee_usd: float,
    exit_fee_usd: float,
) -> dict:
    if entry_price <= 0 or size_usd <= 0:
        return {
            "gross_pnl_usd": 0.0,
            "net_pnl_usd": 0.0,
            "roi_pct": 0.0,
        }

    shares = size_usd / entry_price
    gross_pnl_usd = (exit_price - entry_price) * shares
    net_pnl_usd = gross_pnl_usd - entry_fee_usd - exit_fee_usd
    roi_pct = (net_pnl_usd / size_usd) * 100

    return {
        "gross_pnl_usd": round(gross_pnl_usd, 4),
        "net_pnl_usd": round(net_pnl_usd, 4),
        "roi_pct": round(roi_pct, 4),
    }


def session_roi(starting_balance_usd: float, current_balance_usd: float) -> float:
    if starting_balance_usd <= 0:
        return 0.0
    return round(((current_balance_usd - starting_balance_usd) / starting_balance_usd) * 100, 4)
