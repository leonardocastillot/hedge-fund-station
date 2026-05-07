"""Variant scoring helpers for One Bitcoin."""

from __future__ import annotations

from typing import Any

from .logic import STRATEGY_ID


def score_variant(variant: dict[str, Any], dca_variant: dict[str, Any] | None = None) -> dict[str, Any]:
    metrics = variant.get("metrics", {})
    dca_metrics = (dca_variant or {}).get("metrics", {})
    percent_to_goal = float(metrics.get("percent_to_one_btc", 0.0) or 0.0)
    cash_drag_pct = float(metrics.get("average_cash_drag_pct", 0.0) or 0.0)
    max_drawdown_pct = float(metrics.get("max_drawdown_pct", 0.0) or 0.0)
    btc_vs_dca = float(metrics.get("btc_vs_dca", 0.0) or 0.0)

    average_cost = float(metrics.get("average_cost_basis", 0.0) or 0.0)
    dca_average_cost = float(dca_metrics.get("average_cost_basis", 0.0) or 0.0)
    cost_advantage_pct = 0.0
    if average_cost > 0 and dca_average_cost > 0:
        cost_advantage_pct = ((dca_average_cost - average_cost) / dca_average_cost) * 100.0

    score = (
        min(100.0, percent_to_goal) * 0.55
        + max(-25.0, min(25.0, btc_vs_dca * 100.0)) * 0.25
        + max(-20.0, min(20.0, cost_advantage_pct)) * 0.10
        - min(25.0, cash_drag_pct * 0.20)
        - min(20.0, max_drawdown_pct * 0.10)
    )
    score = max(0.0, min(100.0, score))

    if btc_vs_dca > 0:
        label = "beats-dca-on-btc"
        priority = "high"
    elif percent_to_goal >= 100.0:
        label = "goal-reached"
        priority = "medium"
    elif cash_drag_pct > 35.0:
        label = "cash-drag-risk"
        priority = "low"
    else:
        label = "watch"
        priority = "medium"

    return {
        "strategy_id": STRATEGY_ID,
        "variant_id": variant.get("variant_id"),
        "rank_score": round(score, 2),
        "label": label,
        "priority": priority,
        "percent_to_one_btc": round(percent_to_goal, 4),
        "btc_vs_dca": round(btc_vs_dca, 8),
        "cost_advantage_pct": round(cost_advantage_pct, 4),
        "cash_drag_pct": round(cash_drag_pct, 4),
        "max_drawdown_pct": round(max_drawdown_pct, 4),
    }


def rank_variants(variants: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    dca = variants.get("dca_monthly")
    scored = []
    for variant_id, variant in variants.items():
        score = score_variant(variant, dca)
        scored.append(
            {
                "variant_id": variant_id,
                "label": variant.get("label"),
                "rank": 0,
                "score": score,
                "metrics": compact_metrics(variant.get("metrics", {})),
            }
        )
    scored.sort(
        key=lambda item: (
            float(item["metrics"].get("btc_balance", 0.0) or 0.0),
            float(item["metrics"].get("final_value_usd", 0.0) or 0.0),
            float(item["score"]["rank_score"]),
        ),
        reverse=True,
    )
    for index, item in enumerate(scored, start=1):
        item["rank"] = index
    return scored


def compact_metrics(metrics: dict[str, Any]) -> dict[str, Any]:
    keys = [
        "btc_balance",
        "percent_to_one_btc",
        "total_deposited_usd",
        "cash_left_usd",
        "final_value_usd",
        "average_cost_basis",
        "total_costs_paid_usd",
        "purchase_count",
        "sell_count",
        "months_to_one_btc",
        "btc_vs_dca",
        "usd_value_vs_dca",
        "max_drawdown_usd",
        "max_drawdown_pct",
        "average_cash_drag_pct",
    ]
    return {key: metrics.get(key) for key in keys}
