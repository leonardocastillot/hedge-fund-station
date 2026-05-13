"""Backtest adapter for One Bitcoin accumulation research."""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any

try:
    from ...backtesting.btc_daily_history import load_btc_daily_history as load_shared_btc_daily_history
    from ...backtesting.engine import BacktestConfig
except ImportError:
    from backtesting.btc_daily_history import load_btc_daily_history as load_shared_btc_daily_history
    from backtesting.engine import BacktestConfig
from .logic import (
    GOAL_BTC,
    STRATEGY_ID,
    evaluate_dip_signal,
    evaluate_sell_signal,
    should_deposit_month,
    strategy_config,
    variant_definition,
    variant_ids,
)
from .risk import build_risk_plan, clamp_purchase_amount
from .scoring import rank_variants

PRIMARY_SELECTION_MODE = "max_btc_balance"


def run_backtest(dataset_path: Path, config: BacktestConfig) -> dict[str, Any]:
    rows, dataset = load_btc_daily_history(dataset_path, config)
    if not rows:
        raise ValueError("One Bitcoin requires non-empty BTC/USD daily history.")

    strategy_cfg = build_runtime_config(config)
    variants = run_accumulation_variants(rows, config=strategy_cfg)
    comparison = rank_variants(variants)
    primary = select_primary_variant(variants)
    dca = variants["dca_monthly"]
    summary = build_summary(primary, dca)

    return {
        "dataset": {
            **dataset,
            "rows": len(rows),
            "start": rows[0]["date"],
            "end": rows[-1]["date"],
            "symbol": "BTC",
        },
        "summary": summary,
        "latest_signal": build_latest_signal(primary, rows[-1]),
        "trades": primary["trades"],
        "equity_curve": primary["equity_curve"],
        "variant_comparison": comparison,
        "variant_results": [compact_variant_payload(variant) for variant in variants.values()],
        "symbol_leaderboard": [
            {
                "symbol": "BTC",
                "rank": 1,
                "strategy_id": STRATEGY_ID,
                "primary_variant": primary["variant_id"],
                "primary_selection": PRIMARY_SELECTION_MODE,
                "btc_balance": summary["btc_balance"],
                "percent_to_one_btc": summary["percent_to_one_btc"],
            }
        ],
        "robust_assessment": {
            "status": "blocked",
            "blockers": [
                "accumulation_strategy_not_execution_route",
                "execution_promotion_disabled_by_design",
            ],
            "metrics": {
                "primary_variant": primary["variant_id"],
                "primary_selection": PRIMARY_SELECTION_MODE,
                "btc_balance": summary["btc_balance"],
                "percent_to_one_btc": summary["percent_to_one_btc"],
                "months_to_one_btc": summary["months_to_one_btc"],
                "cash_drag_pct": summary["average_cash_drag_pct"],
            },
            "interpretation": "One Bitcoin is a BTC accumulation research tool. Passing a backtest does not permit paper or live execution.",
        },
        "risk_plan": build_risk_plan({"config": strategy_cfg}),
        "notes": [
            "BTC-only spot accumulation research; no leverage, no shorting, and no order routing.",
            "DCA is the baseline; the primary variant is selected by ending BTC balance, not fixed by name.",
            "Research-only sell/rebuy variants may trim overheated BTC in the backtest, but no order routing is enabled.",
            "Yahoo Finance BTC-USD daily history is cached under the backend data artifact layer when the default dataset is missing; Binance daily candles are a fallback.",
            "Validation intentionally blocks execution promotion for this strategy.",
        ],
    }


def build_runtime_config(config: BacktestConfig | None = None, overrides: dict[str, Any] | None = None) -> dict[str, float]:
    resolved = strategy_config(overrides)
    if config and config.fee_rate not in (None, 0.00045):
        resolved["spot_buy_fee_rate"] = float(config.fee_rate)
    return resolved


def load_btc_daily_history(dataset_path: Path, config: BacktestConfig | None = None) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    rows, metadata = load_shared_btc_daily_history(dataset_path, config)
    return rows, {**metadata, "coin_id": "bitcoin"}


def run_accumulation_variants(
    rows: list[dict[str, Any]],
    *,
    config: dict[str, float] | None = None,
) -> dict[str, dict[str, Any]]:
    resolved = strategy_config(config)
    variants = {variant_id: simulate_variant(rows, variant_id, config=resolved) for variant_id in variant_ids()}
    dca_metrics = variants["dca_monthly"]["metrics"]
    dca_final_value = float(dca_metrics["final_value_usd"])
    dca_btc = float(dca_metrics["btc_balance"])
    for variant in variants.values():
        metrics = variant["metrics"]
        metrics["dca_btc_balance"] = round(dca_btc, 8)
        metrics["btc_vs_dca"] = round(float(metrics["btc_balance"]) - dca_btc, 8)
        metrics["usd_value_vs_dca"] = round(float(metrics["final_value_usd"]) - dca_final_value, 2)
    return variants


def select_primary_variant(variants: dict[str, dict[str, Any]]) -> dict[str, Any]:
    return max(
        variants.values(),
        key=lambda variant: (
            float(variant["metrics"].get("btc_balance", 0.0) or 0.0),
            float(variant["metrics"].get("final_value_usd", 0.0) or 0.0),
            -float(variant["metrics"].get("average_cash_drag_pct", 0.0) or 0.0),
        ),
    )


def simulate_variant(rows: list[dict[str, Any]], variant_id: str, *, config: dict[str, float] | None = None) -> dict[str, Any]:
    resolved = strategy_config(config)
    definition = variant_definition(variant_id)
    cash = float(resolved["starting_cash_usd"])
    btc_balance = 0.0
    total_deposited = cash
    total_fees = 0.0
    total_slippage_cost = 0.0
    total_spent = 0.0
    trades: list[dict[str, Any]] = []
    equity_curve: list[dict[str, Any]] = []
    peak_value = 0.0
    max_drawdown_usd = 0.0
    max_drawdown_pct = 0.0
    cash_drag_values: list[float] = []
    last_dip_index: int | None = None
    last_sell_index: int | None = None
    goal_reached_date: str | None = None
    latest_dip_signal: dict[str, Any] | None = None
    latest_sell_signal: dict[str, Any] | None = None
    previous_date: str | None = None

    for index, row in enumerate(rows):
        day = str(row["date"])
        close = float(row["close"])
        contribution = 0.0
        if index == 0:
            contribution = float(resolved["starting_cash_usd"])
        elif should_deposit_month(previous_date, day):
            cash += float(resolved["monthly_deposit_usd"])
            contribution = float(resolved["monthly_deposit_usd"])
            total_deposited += contribution

        base_monthly_deploy_pct = float(definition["monthly_deploy_pct"])
        monthly_deploy_pct = adjusted_monthly_deploy_pct(
            rows=rows,
            index=index,
            base_pct=base_monthly_deploy_pct,
            enabled=bool(definition.get("monthly_drawdown_boost")),
            config=resolved,
        )
        if contribution > 0 and monthly_deploy_pct > 0:
            requested = cash if monthly_deploy_pct >= 1.0 else contribution * monthly_deploy_pct
            purchase = execute_purchase(
                variant_id=variant_id,
                day=day,
                close=close,
                cash=cash,
                requested_usd=requested,
                reason="scheduled_dca" if index else "starting_cash",
                config=resolved,
            )
            if purchase:
                cash = float(purchase["cash_after_usd"])
                btc_balance += float(purchase["btc_bought"])
                total_fees += float(purchase["fee_usd"])
                total_slippage_cost += float(purchase["slippage_cost_usd"])
                total_spent += float(purchase["size_usd"])
                purchase["btc_balance"] = round(btc_balance, 8)
                trades.append(purchase)

        latest_sell_signal = evaluate_sell_signal(rows, index)
        if definition.get("sell_enabled") and latest_sell_signal["trigger"] and btc_balance > 0:
            cooldown_days = int(definition.get("sell_cooldown_days", 30))
            cooldown_ready = last_sell_index is None or (index - last_sell_index) >= cooldown_days
            if cooldown_ready:
                sale = execute_sale(
                    variant_id=variant_id,
                    day=day,
                    close=close,
                    btc_balance=btc_balance,
                    requested_btc=btc_balance * float(definition.get("sell_fraction", latest_sell_signal["sell_fraction"])),
                    reason="cycle_trim",
                    config=resolved,
                    sell_signal=latest_sell_signal,
                )
                if sale:
                    last_sell_index = index
                    cash += float(sale["cash_added_usd"])
                    btc_balance = float(sale["btc_after"])
                    total_fees += float(sale["fee_usd"])
                    total_slippage_cost += float(sale["slippage_cost_usd"])
                    sale["btc_balance"] = round(btc_balance, 8)
                    sale["cash_after_usd"] = round(cash, 8)
                    trades.append(sale)
            else:
                latest_sell_signal = {
                    **latest_sell_signal,
                    "trigger": False,
                    "signal": "hold",
                    "block_reason": "sell_cooldown",
                }

        latest_dip_signal = evaluate_dip_signal(
            rows,
            index,
            config=resolved,
            require_trend=bool(definition["dip_requires_trend"]),
        )
        if definition["dip_enabled"] and latest_dip_signal["trigger"]:
            cooldown_days = int(definition.get("dip_cooldown_days", resolved["reserve_cooldown_days"]))
            cooldown_ready = last_dip_index is None or (index - last_dip_index) >= cooldown_days
            if cooldown_ready:
                deploy_fraction = min(1.0, float(latest_dip_signal["deploy_fraction"]) * float(definition.get("dip_deploy_multiplier", 1.0)))
                requested = cash * deploy_fraction
                purchase = execute_purchase(
                    variant_id=variant_id,
                    day=day,
                    close=close,
                    cash=cash,
                    requested_usd=requested,
                    reason=f"dip_{latest_dip_signal['severity']}",
                    config=resolved,
                    dip_signal=latest_dip_signal,
                )
                if purchase:
                    last_dip_index = index
                    cash = float(purchase["cash_after_usd"])
                    btc_balance += float(purchase["btc_bought"])
                    total_fees += float(purchase["fee_usd"])
                    total_slippage_cost += float(purchase["slippage_cost_usd"])
                    total_spent += float(purchase["size_usd"])
                    purchase["btc_balance"] = round(btc_balance, 8)
                    trades.append(purchase)
            else:
                latest_dip_signal = {
                    **latest_dip_signal,
                    "trigger": False,
                    "signal": "standby",
                    "block_reason": "reserve_cooldown",
                }

        value = cash + (btc_balance * close)
        peak_value = max(peak_value, value)
        drawdown_usd = max(0.0, peak_value - value)
        drawdown_pct = (drawdown_usd / peak_value) * 100.0 if peak_value > 0 else 0.0
        max_drawdown_usd = max(max_drawdown_usd, drawdown_usd)
        max_drawdown_pct = max(max_drawdown_pct, drawdown_pct)
        if value > 0:
            cash_drag_values.append((cash / value) * 100.0)
        if goal_reached_date is None and btc_balance >= float(resolved["goal_btc"]):
            goal_reached_date = day

        equity_curve.append(
            {
                "timestamp": day,
                "equity": round(value, 2),
                "cash_usd": round(cash, 2),
                "btc_balance": round(btc_balance, 8),
                "total_deposited_usd": round(total_deposited, 2),
                "percent_to_one_btc": round((btc_balance / float(resolved["goal_btc"])) * 100.0, 4),
            }
        )
        previous_date = day

    final_close = float(rows[-1]["close"])
    final_value = cash + (btc_balance * final_close)
    average_cost_basis = total_spent / btc_balance if btc_balance > 0 else None
    months_to_goal = months_between(rows[0]["date"], goal_reached_date) if goal_reached_date else None
    metrics = {
        "variant_id": variant_id,
        "btc_balance": round(btc_balance, 8),
        "percent_to_one_btc": round((btc_balance / float(resolved["goal_btc"])) * 100.0, 4),
        "goal_btc": float(resolved["goal_btc"]),
        "goal_reached": bool(goal_reached_date),
        "goal_reached_date": goal_reached_date,
        "months_to_one_btc": months_to_goal,
        "total_deposited_usd": round(total_deposited, 2),
        "cash_left_usd": round(cash, 2),
        "final_price_usd": round(final_close, 2),
        "final_value_usd": round(final_value, 2),
        "net_profit_usd": round(final_value - total_deposited, 2),
        "return_pct": round(((final_value - total_deposited) / total_deposited) * 100.0, 4) if total_deposited else 0.0,
        "average_cost_basis": round(average_cost_basis, 2) if average_cost_basis else None,
        "fees_paid_usd": round(total_fees, 2),
        "slippage_paid_usd": round(total_slippage_cost, 2),
        "total_costs_paid_usd": round(total_fees + total_slippage_cost, 2),
        "purchase_count": len([trade for trade in trades if trade.get("side") == "buy"]),
        "sell_count": len([trade for trade in trades if trade.get("side") == "sell"]),
        "trade_count": len(trades),
        "max_drawdown_usd": round(max_drawdown_usd, 2),
        "max_drawdown_pct": round(max_drawdown_pct, 4),
        "average_cash_drag_pct": round(sum(cash_drag_values) / len(cash_drag_values), 4) if cash_drag_values else 0.0,
        "cash_drag_notes": cash_drag_note(variant_id, cash_drag_values),
    }
    return {
        "strategy_id": STRATEGY_ID,
        "variant_id": variant_id,
        "label": definition["label"],
        "definition": definition,
        "metrics": metrics,
        "trades": trades,
        "equity_curve": equity_curve,
        "latest_dip_signal": latest_dip_signal or {},
        "latest_sell_signal": latest_sell_signal or {},
    }


def execute_purchase(
    *,
    variant_id: str,
    day: str,
    close: float,
    cash: float,
    requested_usd: float,
    reason: str,
    config: dict[str, float],
    dip_signal: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    sizing = clamp_purchase_amount(cash_usd=cash, requested_usd=requested_usd, min_purchase_usd=float(config["min_purchase_usd"]))
    if not sizing["can_buy"]:
        return None
    spend = float(sizing["spend_usd"])
    fee = spend * float(config["spot_buy_fee_rate"])
    net_spend = max(0.0, spend - fee)
    fill_price = close * (1.0 + float(config["adverse_slippage_rate"]))
    btc_bought = net_spend / fill_price if fill_price > 0 else 0.0
    no_slippage_btc = net_spend / close if close > 0 else 0.0
    slippage_cost = max(0.0, (no_slippage_btc - btc_bought) * close)
    return {
        "strategy_id": STRATEGY_ID,
        "variant_id": variant_id,
        "side": "buy",
        "entry_timestamp": day,
        "entry_price": round(close, 8),
        "fill_price": round(fill_price, 8),
        "size_usd": round(spend, 2),
        "fee_usd": round(fee, 6),
        "fee_rate": round(float(config["spot_buy_fee_rate"]), 8),
        "slippage_cost_usd": round(slippage_cost, 6),
        "slippage_rate": round(float(config["adverse_slippage_rate"]), 8),
        "btc_bought": round(btc_bought, 8),
        "cash_after_usd": round(cash - spend, 8),
        "reason": reason,
        "exit_reason": "accumulation_hold",
        "net_pnl": 0.0,
        "return_pct": 0.0,
        "entry_context": {
            "dip_signal": dip_signal,
        },
    }


def execute_sale(
    *,
    variant_id: str,
    day: str,
    close: float,
    btc_balance: float,
    requested_btc: float,
    reason: str,
    config: dict[str, float],
    sell_signal: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    btc_to_sell = min(max(0.0, requested_btc), max(0.0, btc_balance))
    if btc_to_sell <= 0:
        return None
    fill_price = close * (1.0 - float(config["adverse_slippage_rate"]))
    gross_usd = btc_to_sell * fill_price
    fee = gross_usd * float(config["spot_buy_fee_rate"])
    cash_added = max(0.0, gross_usd - fee)
    no_slippage_usd = btc_to_sell * close
    slippage_cost = max(0.0, no_slippage_usd - gross_usd)
    return {
        "strategy_id": STRATEGY_ID,
        "variant_id": variant_id,
        "side": "sell",
        "entry_timestamp": day,
        "entry_price": round(close, 8),
        "fill_price": round(fill_price, 8),
        "size_btc": round(btc_to_sell, 8),
        "size_usd": round(gross_usd, 2),
        "cash_added_usd": round(cash_added, 8),
        "fee_usd": round(fee, 6),
        "fee_rate": round(float(config["spot_buy_fee_rate"]), 8),
        "slippage_cost_usd": round(slippage_cost, 6),
        "slippage_rate": round(float(config["adverse_slippage_rate"]), 8),
        "btc_after": round(btc_balance - btc_to_sell, 8),
        "reason": reason,
        "exit_reason": "research_cycle_harvest",
        "net_pnl": 0.0,
        "return_pct": 0.0,
        "entry_context": {
            "sell_signal": sell_signal,
        },
    }


def adjusted_monthly_deploy_pct(
    *,
    rows: list[dict[str, Any]],
    index: int,
    base_pct: float,
    enabled: bool,
    config: dict[str, float],
) -> float:
    if not enabled:
        return base_pct
    signal = evaluate_dip_signal(rows, index, config=config)
    severity = signal.get("severity")
    if severity == "crash":
        return 1.0
    if severity == "deep":
        return max(base_pct, 0.90)
    if severity == "moderate":
        return max(base_pct, 0.75)
    return base_pct


def build_summary(primary: dict[str, Any], dca: dict[str, Any]) -> dict[str, Any]:
    metrics = primary["metrics"]
    return {
        "initial_equity": round(strategy_config()["starting_cash_usd"], 2),
        "final_equity": metrics["final_value_usd"],
        "net_profit": metrics["net_profit_usd"],
        "return_pct": metrics["return_pct"],
        "total_trades": metrics["trade_count"],
        "winning_trades": 0,
        "losing_trades": 0,
        "win_rate_pct": 0.0,
        "profit_factor": 0.0,
        "max_drawdown_pct": metrics["max_drawdown_pct"],
        "fees_paid": metrics["fees_paid_usd"],
        "strategy_id": STRATEGY_ID,
        "primary_variant": primary["variant_id"],
        "btc_balance": metrics["btc_balance"],
        "percent_to_one_btc": metrics["percent_to_one_btc"],
        "goal_btc": metrics["goal_btc"],
        "goal_reached": metrics["goal_reached"],
        "goal_reached_date": metrics["goal_reached_date"],
        "months_to_one_btc": metrics["months_to_one_btc"],
        "total_deposited_usd": metrics["total_deposited_usd"],
        "cash_left_usd": metrics["cash_left_usd"],
        "average_cost_basis": metrics["average_cost_basis"],
        "total_costs_paid_usd": metrics["total_costs_paid_usd"],
        "slippage_paid_usd": metrics["slippage_paid_usd"],
        "purchase_count": metrics["purchase_count"],
        "sell_count": metrics["sell_count"],
        "dca_btc_balance": metrics["dca_btc_balance"],
        "btc_vs_dca": metrics["btc_vs_dca"],
        "usd_value_vs_dca": metrics["usd_value_vs_dca"],
        "dca_final_value_usd": dca["metrics"]["final_value_usd"],
        "dca_average_cost_basis": dca["metrics"]["average_cost_basis"],
        "max_drawdown_usd": metrics["max_drawdown_usd"],
        "average_cash_drag_pct": metrics["average_cash_drag_pct"],
        "cash_drag_notes": metrics["cash_drag_notes"],
    }


def build_latest_signal(primary: dict[str, Any], latest_row: dict[str, Any]) -> dict[str, Any]:
    metrics = primary["metrics"]
    latest_dip = primary.get("latest_dip_signal") or {}
    latest_sell = primary.get("latest_sell_signal") or {}
    cash_left = float(metrics.get("cash_left_usd", 0.0) or 0.0)
    if latest_dip.get("trigger") and cash_left >= 1.0:
        signal = "buy_dip"
        recommended_action = "deploy_available_cash_for_dip"
    elif primary["variant_id"] == "dca_monthly":
        signal = "scheduled_dca"
        recommended_action = "buy_next_contribution_immediately"
    else:
        signal = "standby"
        recommended_action = "wait_for_next_deposit_or_dip"
    return {
        "strategy_id": STRATEGY_ID,
        "symbol": "BTC",
        "signal": signal,
        "recommended_action": recommended_action,
        "variant": primary["variant_id"],
        "latest_price": latest_row["close"],
        "btc_balance": metrics["btc_balance"],
        "percent_to_one_btc": metrics["percent_to_one_btc"],
        "cash_left_usd": cash_left,
        "trigger_plan": "Use the highest-BTC historical variant as primary; compare DCA, aggressive dips, drawdown-weighted DCA, and research-only cycle trims.",
        "invalidation_plan": "No leverage, no shorting, and no order routing from this strategy package. Sell/rebuy logic is research-only until separately approved.",
        "latest_dip_signal": latest_dip,
        "latest_sell_signal": latest_sell,
    }


def compact_variant_payload(variant: dict[str, Any]) -> dict[str, Any]:
    return {
        "strategy_id": STRATEGY_ID,
        "variant_id": variant["variant_id"],
        "label": variant["label"],
        "definition": variant["definition"],
        "metrics": variant["metrics"],
        "purchase_count": variant["metrics"].get("purchase_count"),
        "sell_count": variant["metrics"].get("sell_count"),
        "trade_count": variant["metrics"].get("trade_count"),
        "latest_dip_signal": variant.get("latest_dip_signal"),
        "latest_sell_signal": variant.get("latest_sell_signal"),
    }


def months_between(start_day: str, end_day: str | None) -> float | None:
    if end_day is None:
        return None
    start = date.fromisoformat(start_day)
    end = date.fromisoformat(end_day)
    return round((end - start).days / 30.4375, 2)


def cash_drag_note(variant_id: str, cash_drag_values: list[float]) -> str:
    average = sum(cash_drag_values) / len(cash_drag_values) if cash_drag_values else 0.0
    if variant_id == "dca_monthly":
        return "DCA deploys scheduled cash immediately; cash drag should stay low."
    if average > 35.0:
        return "High cash drag: waiting for dips left a large share of capital idle."
    if average > 15.0:
        return "Moderate cash drag: reserve cash improved optionality but may trail DCA in uptrends."
    return "Low cash drag: reserve cash was regularly deployed."
