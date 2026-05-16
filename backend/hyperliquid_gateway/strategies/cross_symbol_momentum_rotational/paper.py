"""
Cross-Symbol Momentum Rotational - Paper Trading Helpers

Entry/exit simulation for long-short basket positions.
"""

from __future__ import annotations

import random
from typing import Any

from .logic import rank_symbols, select_baskets, evaluate_signal


TAKER_FEE_RATE = 0.045
LATENCY_MS_MIN = 500
LATENCY_MS_MAX = 1500


def paper_candidate(payload: dict[str, Any]) -> dict[str, Any]:
    latest_signal = payload.get("latest_signal", {})
    summary = payload.get("report_summary", {})
    validation = payload.get("validation", {})
    signal = latest_signal.get("signal", "none")
    gate_ready = validation.get("status") == "ready-for-paper"

    return {
        "strategy_id": "cross_symbol_momentum_rotational",
        "symbol": "BASKET",
        "signal": signal,
        "status": "candidate" if gate_ready and signal == "active" else "standby",
        "promotion_gate": "eligible-for-paper-review" if gate_ready else "blocked-by-validation",
        "report_context": {
            "return_pct": summary.get("return_pct"),
            "profit_factor": summary.get("profit_factor"),
            "max_drawdown_pct": summary.get("max_drawdown_pct"),
            "total_trades": summary.get("total_trades"),
        },
        "trigger_plan": latest_signal.get(
            "trigger_plan",
            "Rebalance every 15min: long top 3, short bottom 3 by momentum.",
        ),
        "review_fields": [
            "dataset",
            "report_path",
            "validation_path",
            "rank_score",
            "dispersion",
            "basket_size",
            "total_qualified",
        ],
    }


def simulate_entry_execution(
    position_info: dict[str, Any],
    market_data: dict[str, Any],
    size_usd: float,
) -> dict[str, Any]:
    side = position_info.get("side", "long")
    current_price = market_data.get("price", 0.0)
    volume = market_data.get("volume24h", 0.0) or 0.0

    if volume >= 200_000_000:
        slippage_range = (0.03, 0.06)
    elif volume >= 50_000_000:
        slippage_range = (0.05, 0.10)
    else:
        slippage_range = (0.08, 0.15)

    slippage_pct = random.uniform(*slippage_range)

    if side == "long":
        fill_price = current_price * (1 + slippage_pct / 100)
    else:
        fill_price = current_price * (1 - slippage_pct / 100)

    latency_ms = random.randint(LATENCY_MS_MIN, LATENCY_MS_MAX)

    return {
        "filled": True,
        "fill_price": round(fill_price, 6),
        "slippage_pct": round(slippage_pct, 4),
        "latency_ms": latency_ms,
        "execution_notes": f"Basket {side} entry, {latency_ms}ms latency",
    }


def simulate_exit_execution(
    position: dict[str, Any],
    current_market_data: dict[str, Any],
    exit_reason: str,
) -> dict[str, Any]:
    side = position.get("side", "long")
    current_price = current_market_data.get("price", 0.0)
    volume = current_market_data.get("volume24h", 0.0) or 0.0

    if volume >= 200_000_000:
        slippage_range = (0.04, 0.08)
    elif volume >= 50_000_000:
        slippage_range = (0.06, 0.12)
    else:
        slippage_range = (0.10, 0.18)

    slippage_pct = random.uniform(*slippage_range)

    if side == "long":
        fill_price = current_price * (1 - slippage_pct / 100)
    else:
        fill_price = current_price * (1 + slippage_pct / 100)

    latency_ms = random.randint(400, 1200)

    return {
        "filled": True,
        "fill_price": round(fill_price, 6),
        "slippage_pct": round(slippage_pct, 4),
        "latency_ms": latency_ms,
        "execution_notes": f"Basket exit: {exit_reason}",
    }


def calculate_paper_pnl(
    position: dict[str, Any],
    exit_price: float,
    entry_execution: dict[str, Any],
    exit_execution: dict[str, Any],
) -> dict[str, Any]:
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
            "net_after_costs": 0.0,
        }

    if side == "long":
        gross_pnl_pct = ((exit_price - entry_price) / entry_price) * 100
    else:
        gross_pnl_pct = ((entry_price - exit_price) / entry_price) * 100

    gross_pnl_usd = (gross_pnl_pct / 100) * size_usd

    entry_fee = size_usd * (TAKER_FEE_RATE / 100)
    exit_fee = size_usd * (TAKER_FEE_RATE / 100)
    total_fees_usd = entry_fee + exit_fee

    entry_slip = entry_execution.get("slippage_pct", 0.08)
    exit_slip = exit_execution.get("slippage_pct", 0.10)
    total_slippage_cost_usd = ((entry_slip + exit_slip) / 100) * size_usd

    net_pnl_usd = gross_pnl_usd - total_fees_usd - total_slippage_cost_usd
    net_pnl_pct = (net_pnl_usd / size_usd) * 100

    return {
        "pnl_usd": round(net_pnl_usd, 2),
        "pnl_pct": round(net_pnl_pct, 2),
        "gross_pnl_pct": round(gross_pnl_pct, 2),
        "total_fees_usd": round(total_fees_usd, 2),
        "total_slippage_cost_usd": round(total_slippage_cost_usd, 2),
        "net_after_costs": round(net_pnl_usd, 2),
    }


def generate_paper_trade_thesis(
    signal_eval: dict[str, Any],
    market_data: dict[str, Any],
) -> str:
    long_symbols = [s["symbol"] for s in signal_eval.get("long_basket", [])]
    short_symbols = [s["symbol"] for s in signal_eval.get("short_basket", [])]
    dispersion = signal_eval.get("dispersion", 0.0)
    total = signal_eval.get("total_qualified", 0)

    thesis = (
        f"Long {long_symbols}, Short {short_symbols}. "
        f"Dispersion {dispersion:.2f}% across {total} symbols. "
        f"Market-neutral momentum rotation."
    )
    return thesis


def generate_invalidation_plan(
    signal_eval: dict[str, Any],
    market_data: dict[str, Any],
) -> str:
    return (
        "Exit single position if: rank drops out of top/bottom 5, "
        "volume < $5M, funding adverse, or held > 2h. "
        "Exit all if: market-wide 1h drop > 5%."
    )


def generate_trigger_plan(
    signal_eval: dict[str, Any],
    market_data: dict[str, Any],
) -> str:
    return (
        "Rebalance every 15min: long top 3, short bottom 3 by multi-TF momentum. "
        "Skip rebalance if dispersion < 0.5% or < 8 qualified symbols."
    )
