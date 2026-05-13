from __future__ import annotations

from bisect import bisect_right
from collections import defaultdict
from pathlib import Path
from typing import Any

try:
    from ...backtesting.diagnostics import build_trade_diagnostics
    from ...backtesting.engine import BacktestConfig, calculate_trade_fee
    from ...backtesting.metrics import build_summary
    from ...backtesting.snapshots import load_sampled_market_snapshots
except ImportError:
    from backtesting.diagnostics import build_trade_diagnostics
    from backtesting.engine import BacktestConfig, calculate_trade_fee
    from backtesting.metrics import build_summary
    from backtesting.snapshots import load_sampled_market_snapshots
from .logic import calculate_funding_percentile, evaluate_signal, signal_params
from .risk import build_risk_plan, calculate_position_size, risk_params
from .scoring import calculate_execution_quality, score_setup

STRATEGY_ID = "btc_fee_aware_failed_impulse_scalp"
FIVE_MINUTES_MS = 5 * 60 * 1000
ONE_HOUR_MS = 60 * 60 * 1000
FOUR_HOURS_MS = 4 * ONE_HOUR_MS
SEVEN_DAYS_MS = 7 * 24 * ONE_HOUR_MS
DEFAULT_SYMBOLS = ("BTC",)

SCALP_ROBUST_GATE = {
    "min_trades": 60,
    "min_return_pct": 0.0,
    "min_profit_factor": 1.30,
    "max_drawdown_pct": 3.5,
    "min_avg_net_trade_return_pct": 0.12,
    "max_largest_trade_pnl_share_pct": 50.0,
    "max_exit_reason_pnl_share_pct": 85.0,
    "min_excess_vs_btc_hold_pct": 0.0,
}


def run_backtest(dataset_path: Path, config: BacktestConfig) -> dict[str, Any]:
    sampled_rows, replay_filter = load_sampled_snapshots(dataset_path, config)
    result = run_backtest_with_params(
        dataset_path,
        config,
        params=None,
        variant_id="default",
        sampled_rows=sampled_rows,
        replay_filter=replay_filter,
    )
    result["variant_leaderboard"] = build_variant_leaderboard(dataset_path, config, sampled_rows, replay_filter)
    return result


def fee_aware_variant_params(overrides: dict[str, Any] | None = None) -> dict[str, float]:
    resolved = {
        **signal_params(),
        **risk_params(),
    }
    for key, value in (overrides or {}).items():
        if key in resolved and isinstance(value, (int, float)):
            resolved[key] = float(value)
    resolved["take_profit_pct"] = float(resolved["take_profit_pct"])
    return resolved


def run_backtest_with_params(
    dataset_path: Path,
    config: BacktestConfig,
    *,
    params: dict[str, Any] | None = None,
    variant_id: str = "default",
    sampled_rows: list[dict[str, Any]] | None = None,
    replay_filter: dict[str, Any] | None = None,
) -> dict[str, Any]:
    resolved_params = fee_aware_variant_params(params)
    resolved_signal_params = signal_params(resolved_params)
    resolved_risk_params = risk_params(resolved_params)
    if sampled_rows is None or replay_filter is None:
        sampled_rows, replay_filter = load_sampled_snapshots(dataset_path, config)

    equity = config.initial_equity
    equity_curve: list[dict[str, float | int | str]] = []
    trades: list[dict[str, Any]] = []
    open_position: dict[str, Any] | None = None
    symbol_histories: dict[str, list[dict[str, Any]]] = defaultdict(list)
    cooldown_until_by_symbol: dict[str, int] = defaultdict(int)
    fees_paid = 0.0

    for row in sampled_rows:
        symbol = str(row["symbol"])
        history = symbol_histories[symbol]
        market_data = build_market_data(history, row)
        history.append(market_data)

        if open_position is not None and open_position["symbol"] == symbol:
            maybe_trade = maybe_close_position(open_position, market_data, config)
            if maybe_trade is not None:
                equity += float(maybe_trade.get("equity_delta", maybe_trade["net_pnl"]))
                fees_paid += float(maybe_trade["fees"]) - float(open_position["entry_fee"])
                trades.append(maybe_trade)
                cooldown_minutes = int(
                    resolved_risk_params["post_loss_cooldown_minutes"]
                    if float(maybe_trade["net_pnl"]) < 0
                    else resolved_risk_params["cooldown_minutes"]
                )
                cooldown_until_by_symbol[symbol] = int(market_data["timestamp_ms"]) + (cooldown_minutes * 60 * 1000)
                open_position = None

        equity_curve.append({"timestamp": market_data["timestamp"], "equity": round(equity, 2)})
        if len(history) < 13 or open_position is not None:
            continue
        if int(market_data["timestamp_ms"]) < cooldown_until_by_symbol[symbol]:
            continue

        market_data["cooldownUntilMs"] = cooldown_until_by_symbol[symbol]
        signal_eval = evaluate_signal(market_data, params=resolved_signal_params)
        if signal_eval.get("signal") not in {"long", "short"}:
            continue

        setup_score = score_setup(market_data, signal_eval)
        market_data["executionQuality"] = setup_score["execution_quality"]
        sizing = calculate_position_size(
            portfolio_value=equity,
            market_data=market_data,
            current_positions=[open_position] if open_position is not None else [],
            signal_eval=signal_eval,
            params=resolved_risk_params,
        )
        if not sizing.get("can_enter"):
            continue

        side = str(signal_eval["signal"])
        entry_price = apply_slippage(float(market_data["price"]), side, int(setup_score["execution_quality"]), is_exit=False)
        size_usd = min(float(sizing["size_usd"]), equity * config.risk_fraction)
        if size_usd <= 0:
            continue

        risk_plan = build_risk_plan({**market_data, "price": entry_price, "side": side}, side=side, params=resolved_risk_params)
        entry_fee_result = calculate_trade_fee(notional_usd=size_usd, config=config)
        entry_fee = float(entry_fee_result["fee"])
        equity -= entry_fee
        fees_paid += entry_fee
        open_position = {
            "strategy_id": STRATEGY_ID,
            "symbol": symbol,
            "side": side,
            "createdAt": int(market_data["timestamp_ms"]),
            "entry_timestamp": market_data["timestamp"],
            "entry_price": round(entry_price, 6),
            "size_usd": round(size_usd, 2),
            "entry_fee": round(entry_fee, 6),
            "entry_fee_rate": round(float(entry_fee_result["fee_rate"]), 8),
            "entry_liquidity_role": entry_fee_result["liquidity_role"],
            "stop_loss": risk_plan["stop_loss"],
            "take_profit": risk_plan["take_profit"],
            "risk_plan": risk_plan,
            "entry_context": {
                "signal": signal_eval,
                "score": setup_score,
                "risk_plan": risk_plan,
                "market": compact_market_context(market_data),
            },
        }

    if open_position is not None:
        latest_market_data = symbol_histories[str(open_position["symbol"])][-1]
        trade = close_position(
            open_position,
            latest_market_data["timestamp"],
            apply_slippage(
                float(latest_market_data["price"]),
                str(open_position["side"]),
                int(latest_market_data.get("executionQuality", 80)),
                True,
            ),
            "forced_close",
            config,
        )
        equity += float(trade.get("equity_delta", trade["net_pnl"]))
        fees_paid += float(trade["fees"]) - float(open_position["entry_fee"])
        trades.append(trade)
        equity_curve.append({"timestamp": latest_market_data["timestamp"], "equity": round(equity, 2)})

    summary = build_summary(
        initial_equity=config.initial_equity,
        equity_curve=equity_curve,
        trades=trades,
        fees_paid=fees_paid,
    )
    benchmark = build_btc_hold_benchmark(sampled_rows)
    summary = {
        **summary,
        "btc_hold_return_pct": benchmark["btc_hold_return_pct"],
        "excess_vs_btc_hold_pct": round(float(summary["return_pct"]) - float(benchmark["btc_hold_return_pct"]), 2),
    }
    diagnostics = build_trade_diagnostics(
        summary=summary,
        trades=trades,
        initial_equity=config.initial_equity,
        requested_symbols=replay_filter["requested_symbols"],
        robust_gate=SCALP_ROBUST_GATE,
    )
    robust_assessment = augment_robust_with_benchmark(diagnostics["robust_assessment"], summary)
    return {
        "dataset": {
            "path": str(dataset_path),
            "type": "gateway_snapshot_db",
            "rows": len(sampled_rows),
            "symbols": len({row["symbol"] for row in sampled_rows}),
            "symbol_filter": replay_filter,
            "sampling_bucket_minutes": 5,
            "start": sampled_rows[0]["timestamp"] if sampled_rows else None,
            "end": sampled_rows[-1]["timestamp"] if sampled_rows else None,
        },
        "summary": summary,
        "btc_hold_return_pct": summary["btc_hold_return_pct"],
        "excess_vs_btc_hold_pct": summary["excess_vs_btc_hold_pct"],
        "benchmark_window": benchmark["benchmark_window"],
        "latest_signal": build_latest_signal(symbol_histories, params=resolved_signal_params),
        "trades": trades,
        "equity_curve": equity_curve,
        "symbol_leaderboard": diagnostics["symbol_leaderboard"],
        "exit_reason_counts": diagnostics["exit_reason_counts"],
        "robust_assessment": robust_assessment,
        "notes": [
            "BTC-only fee-aware failed impulse scalp replay on Hyperliquid gateway market snapshots.",
            "Default validation is conservative taker/taker; mixed maker-ratio runs are maker-feasibility evidence only.",
            "Backtest output includes same-window BTC buy-and-hold benchmark fields.",
            "Passing validation only permits paper review; this is not a live-trading route.",
        ],
        "variant": {
            "variant_id": variant_id,
            "params": resolved_params,
            "research_only": variant_id != "default",
        },
    }


def load_sampled_snapshots(dataset_path: Path, config: BacktestConfig) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    return load_sampled_market_snapshots(dataset_path, config, bucket_ms=FIVE_MINUTES_MS, default_symbols=DEFAULT_SYMBOLS)


def build_market_data(history: list[dict[str, Any]], row: dict[str, Any]) -> dict[str, Any]:
    timestamps = [item["timestamp_ms"] for item in history]
    funding_history = [item["fundingRate"] for item in history if item["timestamp_ms"] >= row["timestamp_ms"] - SEVEN_DAYS_MS]
    price_5m = reference_value(history, timestamps, row["timestamp_ms"] - FIVE_MINUTES_MS, "price")
    price_15m = reference_value(history, timestamps, row["timestamp_ms"] - (3 * FIVE_MINUTES_MS), "price")
    price_1h = reference_value(history, timestamps, row["timestamp_ms"] - ONE_HOUR_MS, "price")
    price_4h = reference_value(history, timestamps, row["timestamp_ms"] - FOUR_HOURS_MS, "price")
    oi_1h = reference_value(history, timestamps, row["timestamp_ms"] - ONE_HOUR_MS, "openInterestUsd")
    oi_4h = reference_value(history, timestamps, row["timestamp_ms"] - FOUR_HOURS_MS, "openInterestUsd")
    market_data = {
        "timestamp": row["timestamp"],
        "timestamp_ms": row["timestamp_ms"],
        "symbol": row["symbol"],
        "price": row["price"],
        "fundingRate": row["funding_rate"],
        "fundingPercentile": calculate_funding_percentile(row["funding_rate"], funding_history),
        "change5m": pct_change(row["price"], price_5m),
        "change15m": pct_change(row["price"], price_15m),
        "change1h": pct_change(row["price"], price_1h),
        "change4h": pct_change(row["price"], price_4h),
        "openInterestDelta1hPct": pct_change(row["open_interest_usd"], oi_1h),
        "openInterestDelta4hPct": pct_change(row["open_interest_usd"], oi_4h),
        "change24h": row["change24h_pct"],
        "openInterestUsd": row["open_interest_usd"],
        "volume24h": row["volume24h"],
        "opportunityScore": round(float(row["opportunity_score"])),
        "crowdingBias": row["crowding_bias"],
        "primarySetup": row["primary_setup"],
        "setupScores": row["setup_scores"],
        "estimatedTotalLiquidationUsd": row["estimated_total_liquidation_usd"],
    }
    market_data["executionQuality"] = calculate_execution_quality(market_data)
    return market_data


def maybe_close_position(position: dict[str, Any], market_data: dict[str, Any], config: BacktestConfig) -> dict[str, Any] | None:
    side = str(position["side"])
    price = float(market_data["price"])
    execution_quality = int(market_data.get("executionQuality", 80) or 80)
    if side == "long":
        if price <= float(position["stop_loss"]):
            return close_position(position, market_data["timestamp"], apply_slippage(price, side, execution_quality, True), "stop_loss", config)
        if price >= float(position["take_profit"]):
            return close_position(position, market_data["timestamp"], apply_slippage(price, side, execution_quality, True), "take_profit", config)
        if float(market_data.get("change15m", 0.0) or 0.0) <= -0.20:
            return close_position(position, market_data["timestamp"], apply_slippage(price, side, execution_quality, True), "impulse_reasserted", config)
    else:
        if price >= float(position["stop_loss"]):
            return close_position(position, market_data["timestamp"], apply_slippage(price, side, execution_quality, True), "stop_loss", config)
        if price <= float(position["take_profit"]):
            return close_position(position, market_data["timestamp"], apply_slippage(price, side, execution_quality, True), "take_profit", config)
        if float(market_data.get("change15m", 0.0) or 0.0) >= 0.20:
            return close_position(position, market_data["timestamp"], apply_slippage(price, side, execution_quality, True), "impulse_reasserted", config)

    risk_plan = position.get("risk_plan") if isinstance(position.get("risk_plan"), dict) else {}
    held_ms = int(market_data["timestamp_ms"]) - int(position["createdAt"])
    no_progress_minutes = int(risk_plan.get("no_progress_minutes") or risk_params()["no_progress_minutes"])
    min_progress_pct = float(risk_plan.get("min_progress_pct") or risk_params()["min_progress_pct"])
    if held_ms >= no_progress_minutes * 60 * 1000 and favorable_move_pct(position, price) < min_progress_pct:
        return close_position(position, market_data["timestamp"], apply_slippage(price, side, execution_quality, True), "no_progress", config)

    max_hold_minutes = int(risk_plan.get("max_hold_minutes") or risk_params()["max_hold_minutes"])
    if held_ms >= max_hold_minutes * 60 * 1000:
        return close_position(position, market_data["timestamp"], apply_slippage(price, side, execution_quality, True), "time_stop", config)
    return None


def close_position(position: dict[str, Any], exit_timestamp: str, exit_price: float, exit_reason: str, config: BacktestConfig) -> dict[str, Any]:
    entry_price = float(position["entry_price"])
    size_usd = float(position["size_usd"])
    units = 0.0 if entry_price == 0 else size_usd / entry_price
    side = str(position["side"])
    gross_pnl = (exit_price - entry_price) * units if side == "long" else (entry_price - exit_price) * units
    exit_fee_result = calculate_trade_fee(notional_usd=size_usd, config=config)
    exit_fee = float(exit_fee_result["fee"])
    total_fees = float(position["entry_fee"]) + exit_fee
    equity_delta = gross_pnl - exit_fee
    net_pnl = gross_pnl - total_fees
    return {
        "strategy_id": STRATEGY_ID,
        "symbol": position["symbol"],
        "side": side,
        "entry_timestamp": position["entry_timestamp"],
        "exit_timestamp": exit_timestamp,
        "entry_price": round(entry_price, 6),
        "exit_price": round(exit_price, 6),
        "size_usd": round(size_usd, 2),
        "gross_pnl": round(gross_pnl, 2),
        "net_pnl": round(net_pnl, 2),
        "equity_delta": round(equity_delta, 2),
        "return_pct": round((net_pnl / size_usd) * 100, 3) if size_usd else 0.0,
        "fees": round(total_fees, 6),
        "entry_fee_rate": position.get("entry_fee_rate"),
        "exit_fee_rate": round(float(exit_fee_result["fee_rate"]), 8),
        "entry_liquidity_role": position.get("entry_liquidity_role"),
        "exit_liquidity_role": exit_fee_result["liquidity_role"],
        "exit_reason": exit_reason,
        "entry_context": position["entry_context"],
    }


def build_latest_signal(symbol_histories: dict[str, list[dict[str, Any]]], params: dict[str, Any] | None = None) -> dict[str, Any]:
    candidates = []
    for history in symbol_histories.values():
        if not history:
            continue
        market_data = history[-1]
        signal_eval = evaluate_signal(market_data, params=params)
        setup_score = score_setup(market_data, signal_eval)
        candidates.append((setup_score["rank_score"], market_data, signal_eval, setup_score))
    if not candidates:
        return {"strategy_id": STRATEGY_ID, "signal": "none"}
    _, market_data, signal_eval, setup_score = sorted(candidates, key=lambda item: item[0], reverse=True)[0]
    return {
        **signal_eval,
        "symbol": market_data.get("symbol"),
        "rank_score": setup_score.get("rank_score"),
        "execution_quality": setup_score.get("execution_quality"),
        "trigger_plan": "Fade a BTC one-hour impulse only after fifteen-minute continuation fails and OI/funding/crowding suggest trapped leverage.",
        "invalidation_plan": "Use 0.45% stop, 0.90% target, 20m no-progress exit, 90m max hold, one BTC position, and post-exit cooldown.",
    }


def build_btc_hold_benchmark(sampled_rows: list[dict[str, Any]]) -> dict[str, Any]:
    btc_rows = [row for row in sampled_rows if str(row.get("symbol")) == "BTC" and float(row.get("price") or 0.0) > 0]
    if len(btc_rows) < 2:
        return {
            "btc_hold_return_pct": 0.0,
            "benchmark_window": {
                "symbol": "BTC",
                "start": None,
                "end": None,
                "start_price": None,
                "end_price": None,
                "rows": len(btc_rows),
            },
        }
    start = btc_rows[0]
    end = btc_rows[-1]
    start_price = float(start["price"])
    end_price = float(end["price"])
    hold_return = ((end_price - start_price) / start_price) * 100 if start_price else 0.0
    return {
        "btc_hold_return_pct": round(hold_return, 2),
        "benchmark_window": {
            "symbol": "BTC",
            "start": start.get("timestamp"),
            "end": end.get("timestamp"),
            "start_price": round(start_price, 6),
            "end_price": round(end_price, 6),
            "rows": len(btc_rows),
        },
    }


def augment_robust_with_benchmark(robust_assessment: dict[str, Any], summary: dict[str, Any]) -> dict[str, Any]:
    robust = {
        **robust_assessment,
        "policy": {**(robust_assessment.get("policy") or {}), "min_excess_vs_btc_hold_pct": SCALP_ROBUST_GATE["min_excess_vs_btc_hold_pct"]},
        "checks": dict(robust_assessment.get("checks") or {}),
        "blockers": list(robust_assessment.get("blockers") or []),
        "metrics": dict(robust_assessment.get("metrics") or {}),
    }
    excess = float(summary.get("excess_vs_btc_hold_pct", 0.0) or 0.0)
    robust["checks"]["positive_excess_vs_btc_hold"] = excess > SCALP_ROBUST_GATE["min_excess_vs_btc_hold_pct"]
    robust["metrics"]["excess_vs_btc_hold_pct"] = round(excess, 2)
    if not robust["checks"]["positive_excess_vs_btc_hold"] and "positive_excess_vs_btc_hold" not in robust["blockers"]:
        robust["blockers"].append("positive_excess_vs_btc_hold")
    robust["status"] = "passes" if not robust["blockers"] else "insufficient-sample" if not robust["checks"].get("min_trades") else "blocked"
    return robust


def build_variant_leaderboard(
    dataset_path: Path,
    config: BacktestConfig,
    sampled_rows: list[dict[str, Any]],
    replay_filter: dict[str, Any],
) -> list[dict[str, Any]]:
    variants = []
    for target in (0.75, 0.90, 1.10):
        for stop in (0.35, 0.45, 0.60):
            for hold in (45, 90, 180):
                variant_id = f"tp{target:.2f}_sl{stop:.2f}_hold{hold}".replace(".", "p")
                params = {
                    "take_profit_pct": target,
                    "stop_loss_pct": stop,
                    "max_hold_minutes": hold,
                }
                result = run_backtest_with_params(
                    dataset_path,
                    config,
                    params=params,
                    variant_id=variant_id,
                    sampled_rows=sampled_rows,
                    replay_filter=replay_filter,
                )
                summary = result["summary"]
                robust = result.get("robust_assessment") or {}
                variants.append(
                    {
                        "variant_id": variant_id,
                        "params": params,
                        "status": robust.get("status"),
                        "blockers": robust.get("blockers") or [],
                        "return_pct": summary.get("return_pct"),
                        "btc_hold_return_pct": summary.get("btc_hold_return_pct"),
                        "excess_vs_btc_hold_pct": summary.get("excess_vs_btc_hold_pct"),
                        "total_trades": summary.get("total_trades"),
                        "win_rate_pct": summary.get("win_rate_pct"),
                        "profit_factor": summary.get("profit_factor"),
                        "max_drawdown_pct": summary.get("max_drawdown_pct"),
                        "fees_paid": summary.get("fees_paid"),
                    }
                )
    variants.sort(
        key=lambda item: (
            item["status"] == "passes",
            float(item.get("excess_vs_btc_hold_pct") or -999.0),
            float(item.get("return_pct") or -999.0),
            float(item.get("profit_factor") or 0.0),
            int(item.get("total_trades") or 0),
        ),
        reverse=True,
    )
    for index, item in enumerate(variants, start=1):
        item["rank"] = index
    return variants


def reference_value(history: list[dict[str, Any]], timestamps: list[int], target_ms: int, key: str) -> float | None:
    if not history:
        return None
    index = bisect_right(timestamps, target_ms) - 1
    if index < 0:
        return None
    value = history[index].get(key)
    return float(value) if value is not None else None


def pct_change(current: float, previous: float | None) -> float:
    if previous in (None, 0):
        return 0.0
    return round(((current - previous) / previous) * 100, 4)


def favorable_move_pct(position: dict[str, Any], current_price: float) -> float:
    entry_price = float(position["entry_price"])
    if entry_price <= 0:
        return 0.0
    side = str(position["side"])
    if side == "short":
        return ((entry_price - current_price) / entry_price) * 100
    return ((current_price - entry_price) / entry_price) * 100


def apply_slippage(price: float, side: str, execution_quality: int, is_exit: bool) -> float:
    base = 0.00025 if execution_quality >= 78 else 0.0004 if execution_quality >= 55 else 0.0007
    slippage = base * (1.25 if is_exit else 1.0)
    if is_exit:
        return price * (1 - slippage) if side == "long" else price * (1 + slippage)
    return price * (1 + slippage) if side == "long" else price * (1 - slippage)


def compact_market_context(market_data: dict[str, Any]) -> dict[str, Any]:
    keys = [
        "timestamp",
        "symbol",
        "price",
        "fundingPercentile",
        "change5m",
        "change15m",
        "change1h",
        "change4h",
        "openInterestDelta1hPct",
        "openInterestUsd",
        "volume24h",
        "crowdingBias",
        "primarySetup",
        "setupScores",
        "executionQuality",
    ]
    return {key: market_data.get(key) for key in keys}
