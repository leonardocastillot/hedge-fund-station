"""
Funding Exhaustion Snap - Paper Trading Helpers

Simulation functions for paper execution with realistic slippage and latency.
"""

from __future__ import annotations

from typing import Any
import random


def paper_candidate(payload: dict[str, Any]) -> dict[str, Any]:
    latest_signal = payload.get("latest_signal", {})
    summary = payload.get("report_summary", {})
    validation = payload.get("validation", {})
    signal = latest_signal.get("signal", "none")
    gate_ready = validation.get("status") == "ready-for-paper"
    return {
        "strategy_id": "funding_exhaustion_snap",
        "symbol": latest_signal.get("symbol"),
        "signal": signal,
        "status": "candidate" if gate_ready and signal in {"long", "short"} else "standby",
        "promotion_gate": "eligible-for-paper-review" if gate_ready else "blocked-by-validation",
        "report_context": {
            "return_pct": summary.get("return_pct"),
            "profit_factor": summary.get("profit_factor"),
            "max_drawdown_pct": summary.get("max_drawdown_pct"),
            "total_trades": summary.get("total_trades"),
        },
        "trigger_plan": latest_signal.get("trigger_plan", "Monitor for funding extreme + momentum exhaustion alignment."),
        "review_fields": [
            "dataset",
            "report_path",
            "validation_path",
            "symbol",
            "funding_percentile",
            "execution_quality",
            "rank_score",
            "profit_factor",
            "max_drawdown_pct",
        ],
    }


def simulate_entry_execution(
    signal_eval: dict[str, Any],
    market_data: dict[str, Any],
    size_usd: float
) -> dict[str, Any]:
    """
    Simulate paper trade entry with realistic execution.

    Models:
    - Entry slippage (0.05% - 0.10% based on exec quality)
    - Latency (1-3 seconds)
    - Fill quality

    Returns:
        {
            "filled": bool,
            "fill_price": float,
            "slippage_pct": float,
            "latency_ms": int,
            "execution_notes": str
        }
    """
    direction = signal_eval.get("direction", "long")
    current_price = market_data.get("price", 0.0)
    exec_quality = market_data.get("executionQuality", 70)

    # Calculate slippage based on exec quality
    if exec_quality >= 80:
        slippage_range = (0.03, 0.06)  # Excellent fills
    elif exec_quality >= 60:
        slippage_range = (0.05, 0.10)  # Good fills
    else:
        slippage_range = (0.08, 0.15)  # Poor fills

    slippage_pct = random.uniform(*slippage_range)

    # Apply slippage (worse for entry)
    if direction == "long":
        fill_price = current_price * (1 + slippage_pct / 100)  # Buy higher
    else:  # short
        fill_price = current_price * (1 - slippage_pct / 100)  # Sell lower

    # Simulate latency
    latency_ms = random.randint(1000, 3000)

    # Fill success (99% for liquid markets, 95% for less liquid)
    fill_success = exec_quality >= 50 or random.random() > 0.05

    execution_notes = f"Taker order, {latency_ms}ms latency"
    if exec_quality < 60:
        execution_notes += ", lower liquidity"

    return {
        "filled": fill_success,
        "fill_price": round(fill_price, 6),
        "slippage_pct": round(slippage_pct, 4),
        "latency_ms": latency_ms,
        "execution_notes": execution_notes
    }


def simulate_exit_execution(
    position: dict[str, Any],
    current_market_data: dict[str, Any],
    exit_reason: str
) -> dict[str, Any]:
    """
    Simulate paper trade exit with realistic execution.

    Exit slippage is typically worse than entry (panic selling, urgent exits).

    Returns:
        Same structure as simulate_entry_execution
    """
    side = position.get("side", "long")
    current_price = current_market_data.get("price", 0.0)
    exec_quality = current_market_data.get("executionQuality", 70)

    # Exit slippage is worse, especially for stops
    if exit_reason in ("stop_loss", "oi_collapse", "volume_dried"):
        # Panic exits have worse slippage
        slippage_range = (0.10, 0.18)
    elif exec_quality >= 80:
        slippage_range = (0.04, 0.08)
    elif exec_quality >= 60:
        slippage_range = (0.06, 0.12)
    else:
        slippage_range = (0.10, 0.18)

    slippage_pct = random.uniform(*slippage_range)

    # Apply slippage (worse for exit)
    if side == "long":
        fill_price = current_price * (1 - slippage_pct / 100)  # Sell lower
    else:  # short
        fill_price = current_price * (1 + slippage_pct / 100)  # Cover higher

    # Simulate latency
    latency_ms = random.randint(800, 2500)

    execution_notes = f"Exit: {exit_reason}, taker order"
    if exit_reason in ("stop_loss", "oi_collapse"):
        execution_notes += ", urgent fill"

    return {
        "filled": True,  # Exits almost always fill
        "fill_price": round(fill_price, 6),
        "slippage_pct": round(slippage_pct, 4),
        "latency_ms": latency_ms,
        "execution_notes": execution_notes
    }


def calculate_paper_pnl(
    position: dict[str, Any],
    exit_price: float,
    entry_execution: dict[str, Any],
    exit_execution: dict[str, Any]
) -> dict[str, Any]:
    """
    Calculate P&L for paper trade including all costs.

    Costs:
    - Entry fee (0.045% taker)
    - Exit fee (0.045% taker)
    - Entry slippage
    - Exit slippage

    Returns:
        {
            "pnl_usd": float,
            "pnl_pct": float,
            "gross_pnl_pct": float,
            "total_fees_usd": float,
            "total_slippage_cost_usd": float,
            "net_after_costs": float
        }
    """
    entry_price = position.get("entryPrice", 0.0)
    size_usd = position.get("sizeUsd", 0.0)
    side = position.get("side", "long")

    if entry_price == 0 or size_usd == 0:
        return {
            "pnl_usd": 0.0,
            "pnl_pct": 0.0,
            "gross_pnl_pct": 0.0,
            "total_fees_usd": 0.0,
            "total_slippage_cost_usd": 0.0,
            "net_after_costs": 0.0
        }

    # Calculate gross P&L (before costs)
    if side == "long":
        gross_pnl_pct = ((exit_price - entry_price) / entry_price) * 100
    else:  # short
        gross_pnl_pct = ((entry_price - exit_price) / entry_price) * 100

    gross_pnl_usd = (gross_pnl_pct / 100) * size_usd

    # Calculate Hyperliquid Tier 0 taker fees (0.045% per side = 0.09% round-trip).
    fee_rate = 0.045
    entry_fee = size_usd * (fee_rate / 100)
    exit_fee = size_usd * (fee_rate / 100)
    total_fees_usd = entry_fee + exit_fee

    # Calculate slippage costs
    entry_slippage_pct = entry_execution.get("slippage_pct", 0.08)
    exit_slippage_pct = exit_execution.get("slippage_pct", 0.10)
    total_slippage_pct = entry_slippage_pct + exit_slippage_pct
    total_slippage_cost_usd = (total_slippage_pct / 100) * size_usd

    # Net P&L
    net_pnl_usd = gross_pnl_usd - total_fees_usd - total_slippage_cost_usd
    net_pnl_pct = (net_pnl_usd / size_usd) * 100

    return {
        "pnl_usd": round(net_pnl_usd, 2),
        "pnl_pct": round(net_pnl_pct, 2),
        "gross_pnl_pct": round(gross_pnl_pct, 2),
        "total_fees_usd": round(total_fees_usd, 2),
        "total_fees_pct": round((total_fees_usd / size_usd) * 100, 3),
        "total_slippage_cost_usd": round(total_slippage_cost_usd, 2),
        "total_slippage_pct": round(total_slippage_pct, 3),
        "net_after_costs": round(net_pnl_usd, 2)
    }


def generate_paper_trade_thesis(
    signal_eval: dict[str, Any],
    market_data: dict[str, Any]
) -> str:
    """
    Generate human-readable thesis for paper trade journal.

    Returns concise 1-2 sentence explanation.
    """
    direction = signal_eval.get("direction", "long")
    symbol = market_data.get("symbol", "UNKNOWN")
    funding_pct = market_data.get("fundingPercentile", 50.0)
    change_1h = market_data.get("change1h", 0.0)
    crowding = market_data.get("crowdingBias", "balanced")

    if direction == "long":
        thesis = (
            f"{symbol} funding at {funding_pct:.0f}th percentile (longs bleeding), "
            f"momentum exhausted ({change_1h:+.2f}% 1hr), "
            f"crowding shows {crowding}. Expect unwind toward funding normalization."
        )
    else:  # short
        thesis = (
            f"{symbol} funding at {funding_pct:.0f}th percentile (shorts bleeding), "
            f"momentum exhausted ({change_1h:+.2f}% 1hr), "
            f"crowding shows {crowding}. Expect unwind toward funding normalization."
        )

    return thesis


def generate_invalidation_plan(signal_eval: dict[str, Any], market_data: dict[str, Any]) -> str:
    """
    Generate invalidation plan text for paper trade.
    """
    direction = signal_eval.get("direction", "long")
    funding_pct = market_data.get("fundingPercentile", 50.0)

    if direction == "long":
        plan = (
            f"Exit if: (1) Stop loss >1.2%, (2) Funding normalizes below 60th percentile, "
            f"(3) OI drops >8%, (4) Momentum re-accelerates up >2.5% 1hr, (5) >4hr hold time."
        )
    else:
        plan = (
            f"Exit if: (1) Stop loss >1.2%, (2) Funding normalizes above 40th percentile, "
            f"(3) OI drops >8%, (4) Momentum re-accelerates down <-2.5% 1hr, (5) >4hr hold time."
        )

    return plan


def generate_trigger_plan(signal_eval: dict[str, Any], market_data: dict[str, Any]) -> str:
    """
    Generate trigger plan text for watchlist signals.
    """
    direction = signal_eval.get("direction", "long")

    if direction == "long":
        return "Wait for 15-min break of local low with volume confirmation, avoid first 2min after funding payment."
    elif direction == "short":
        return "Wait for 15-min break of local high with volume confirmation, avoid first 2min after funding payment."
    else:
        return "Monitor for funding extreme + momentum exhaustion alignment."
