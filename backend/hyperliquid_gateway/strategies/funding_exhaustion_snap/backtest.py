from __future__ import annotations

from bisect import bisect_right
from collections import defaultdict
from pathlib import Path
from typing import Any

try:
    from ...backtesting.engine import BacktestConfig, calculate_trade_fee
    from ...backtesting.diagnostics import build_trade_diagnostics
    from ...backtesting.metrics import build_summary
    from ...backtesting.snapshots import load_sampled_market_snapshots
except ImportError:
    from backtesting.engine import BacktestConfig, calculate_trade_fee
    from backtesting.diagnostics import build_trade_diagnostics
    from backtesting.metrics import build_summary
    from backtesting.snapshots import load_sampled_market_snapshots
from .logic import calculate_funding_percentile, evaluate_signal
from .paper import generate_invalidation_plan, generate_paper_trade_thesis, generate_trigger_plan
from .risk import calculate_position_size
from .scoring import calculate_execution_quality, score_setup

FIVE_MINUTES_MS = 5 * 60 * 1000
ONE_HOUR_MS = 60 * 60 * 1000
FOUR_HOURS_MS = 4 * ONE_HOUR_MS
TWENTY_FOUR_HOURS_MS = 24 * ONE_HOUR_MS
SEVEN_DAYS_MS = 7 * TWENTY_FOUR_HOURS_MS


def run_backtest(dataset_path: Path, config: BacktestConfig) -> dict[str, Any]:
    sampled_rows, replay_filter = load_sampled_snapshots(dataset_path, config)
    equity = config.initial_equity
    equity_curve: list[dict[str, float | int | str]] = []
    trades: list[dict[str, Any]] = []
    open_positions: dict[str, dict[str, Any]] = {}
    symbol_histories: dict[str, list[dict[str, Any]]] = defaultdict(list)
    fees_paid = 0.0
    session_stats = {
        "consecutiveLosses": 0,
        "dailyPnlPct": 0.0,
        "avgSlippagePct": 0.0,
    }
    slippage_samples: list[float] = []

    for row in sampled_rows:
        symbol = str(row["symbol"])
        history = symbol_histories[symbol]
        market_data = build_market_data(history, row)
        history.append(market_data)

        if symbol in open_positions:
            close_result = maybe_close_position(
                position=open_positions[symbol],
                current_market_data=market_data,
                config=config,
            )
            if close_result is not None:
                trade = close_result["trade"]
                equity += float(trade["net_pnl"])
                trades.append(trade)
                fees_paid += float(trade["fees"])
                slippage_samples.append((float(trade["entry_slippage_pct"]) + float(trade["exit_slippage_pct"])) / 2)
                if float(trade["net_pnl"]) < 0:
                    session_stats["consecutiveLosses"] += 1
                else:
                    session_stats["consecutiveLosses"] = 0
                session_stats["dailyPnlPct"] = round(((equity - config.initial_equity) / config.initial_equity) * 100, 3)
                session_stats["avgSlippagePct"] = round(sum(slippage_samples) / len(slippage_samples), 4)
                del open_positions[symbol]

        equity_curve.append({"timestamp": market_data["timestamp"], "equity": round(equity, 2)})

        if len(history) < 60:
            continue
        if symbol in open_positions:
            continue
        if session_stats["consecutiveLosses"] >= 3:
            continue
        if session_stats["dailyPnlPct"] < -2.5:
            continue
        if session_stats["avgSlippagePct"] > 0.12:
            continue

        signal_eval = evaluate_signal(market_data)
        if signal_eval.get("signal") not in {"long", "short"}:
            continue

        setup_score = score_setup(market_data, signal_eval)
        sizing = calculate_position_size(
            portfolio_value=equity,
            market_data={**market_data, "executionQuality": setup_score["execution_quality"]},
            current_positions=[*open_positions.values()],
            signal_eval=signal_eval,
        )
        if not sizing.get("can_enter"):
            continue

        entry_fill = deterministic_fill_price(
            price=float(market_data["price"]),
            side=str(signal_eval["signal"]),
            exec_quality=int(setup_score["execution_quality"]),
            is_exit=False,
            urgent=False,
        )
        size_usd = float(sizing["size_usd"])
        if size_usd <= 0:
            continue
        entry_fee_result = calculate_trade_fee(notional_usd=size_usd, config=config)

        open_positions[symbol] = {
            "status": "open",
            "strategy_id": "funding_exhaustion_snap",
            "symbol": symbol,
            "side": str(signal_eval["signal"]),
            "createdAt": int(market_data["timestamp_ms"]),
            "entry_timestamp": market_data["timestamp"],
            "entryPrice": round(entry_fill["fill_price"], 6),
            "sizeUsd": round(size_usd, 2),
            "entry_fee": round(float(entry_fee_result["fee"]), 6),
            "entry_fee_rate": round(float(entry_fee_result["fee_rate"]), 8),
            "entry_liquidity_role": entry_fee_result["liquidity_role"],
            "entry_slippage_pct": entry_fill["slippage_pct"],
            "execution_quality": int(setup_score["execution_quality"]),
            "entry_data": market_data,
            "signal_eval": signal_eval,
            "setup_score": setup_score,
            "target_pct": target_pct_from_market(market_data),
            "thesis": generate_paper_trade_thesis(signal_eval, market_data),
            "trigger_plan": generate_trigger_plan(signal_eval, market_data),
            "invalidation_plan": generate_invalidation_plan(signal_eval, market_data),
        }

    for position in list(open_positions.values()):
        forced_market_data = position["entry_data"]
        trade = close_position(
            position=position,
            current_market_data=forced_market_data,
            exit_reason="forced_close",
            config=config,
        )
        equity += float(trade["net_pnl"])
        trades.append(trade)
        fees_paid += float(trade["fees"])
        equity_curve.append({"timestamp": position["entry_timestamp"], "equity": round(equity, 2)})

    latest_signal = build_latest_signal(symbol_histories)
    summary = build_summary(
        initial_equity=config.initial_equity,
        equity_curve=equity_curve,
        trades=trades,
        fees_paid=fees_paid,
    )
    diagnostics = build_trade_diagnostics(
        summary=summary,
        trades=trades,
        initial_equity=config.initial_equity,
        requested_symbols=replay_filter["requested_symbols"],
    )
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
        "latest_signal": latest_signal,
        "trades": trades,
        "equity_curve": equity_curve,
        "symbol_leaderboard": diagnostics["symbol_leaderboard"],
        "exit_reason_counts": diagnostics["exit_reason_counts"],
        "robust_assessment": diagnostics["robust_assessment"],
        "notes": [
            "Replay uses gateway market_snapshots sampled to 5-minute buckets.",
            "This is a backend-native research replay on funding/OI/crowding data, not donor OHLCV.",
            "Production candidacy still requires paper journal and regime review.",
        ],
    }


def load_sampled_snapshots(dataset_path: Path, config: BacktestConfig) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    return load_sampled_market_snapshots(dataset_path, config, bucket_ms=FIVE_MINUTES_MS)


def build_market_data(history: list[dict[str, Any]], row: dict[str, Any]) -> dict[str, Any]:
    timestamps = [item["timestamp_ms"] for item in history]
    funding_history = [
        item["fundingRate"]
        for item in history
        if item["timestamp_ms"] >= row["timestamp_ms"] - SEVEN_DAYS_MS
    ]
    price_1h = reference_value(history, timestamps, row["timestamp_ms"] - ONE_HOUR_MS, "price")
    price_4h = reference_value(history, timestamps, row["timestamp_ms"] - FOUR_HOURS_MS, "price")
    oi_1h = reference_value(history, timestamps, row["timestamp_ms"] - ONE_HOUR_MS, "openInterestUsd")
    funding_percentile = calculate_funding_percentile(row["funding_rate"], funding_history)
    market_data = {
        "timestamp": row["timestamp"],
        "timestamp_ms": row["timestamp_ms"],
        "symbol": row["symbol"],
        "price": row["price"],
        "fundingRate": row["funding_rate"],
        "fundingPercentile": funding_percentile,
        "change1h": pct_change(row["price"], price_1h),
        "change4h": pct_change(row["price"], price_4h),
        "change24h": row["change24h_pct"],
        "openInterestUsd": row["open_interest_usd"],
        "openInterestUsd1hAgo": oi_1h if oi_1h is not None else row["open_interest_usd"],
        "volume24h": row["volume24h"],
        "opportunityScore": round(float(row["opportunity_score"])),
        "crowdingBias": row["crowding_bias"],
        "signalLabel": row["signal_label"],
        "riskLabel": row["risk_label"],
        "primarySetup": row["primary_setup"],
        "setupScores": row["setup_scores"],
        "estimatedTotalLiquidationUsd": row["estimated_total_liquidation_usd"],
    }
    market_data["executionQuality"] = calculate_execution_quality(market_data)
    return market_data


def reference_value(
    history: list[dict[str, Any]],
    timestamps: list[int],
    target_ms: int,
    key: str,
) -> float | None:
    if not history:
        return None
    index = bisect_right(timestamps, target_ms) - 1
    if index < 0:
        return None
    return float(history[index][key])


def pct_change(current: float, reference: float | None) -> float:
    if reference is None or reference == 0:
        return 0.0
    return round(((current - reference) / reference) * 100, 4)


def maybe_close_position(
    *,
    position: dict[str, Any],
    current_market_data: dict[str, Any],
    config: BacktestConfig,
) -> dict[str, Any] | None:
    pnl_pct = current_pnl_pct(position, current_market_data)
    held_ms = int(current_market_data["timestamp_ms"]) - int(position["createdAt"])
    side = str(position["side"])
    entry_data = position["entry_data"]
    current_funding_pct = float(current_market_data["fundingPercentile"])
    entry_funding_pct = float(entry_data["fundingPercentile"])
    current_oi = float(current_market_data["openInterestUsd"])
    entry_oi = float(entry_data["openInterestUsd"])
    current_volume = float(current_market_data["volume24h"])
    entry_volume = float(entry_data["volume24h"])
    current_bias = str(current_market_data["crowdingBias"])
    entry_bias = str(entry_data["crowdingBias"])
    change_1h = float(current_market_data["change1h"])

    exit_reason: str | None = None
    urgent = False

    if pnl_pct <= -1.2:
        exit_reason = "stop_loss"
        urgent = True
    elif pnl_pct >= float(position["target_pct"]):
        exit_reason = "profit_target"
    elif side == "long" and entry_funding_pct >= 85 and current_funding_pct <= 60:
        exit_reason = "funding_normalized"
    elif side == "short" and entry_funding_pct <= 15 and current_funding_pct >= 40:
        exit_reason = "funding_normalized"
    elif entry_oi > 0 and ((current_oi - entry_oi) / entry_oi) * 100 < -8.0:
        exit_reason = "oi_collapse"
        urgent = True
    elif entry_volume > 0 and current_volume / entry_volume < 0.30:
        exit_reason = "volume_dried"
    elif held_ms > FOUR_HOURS_MS:
        exit_reason = "time_limit"
    elif held_ms > 45 * 60 * 1000 and abs(pnl_pct) < 0.3:
        exit_reason = "no_progress"
    elif side == "long" and entry_bias == "longs-at-risk" and current_bias == "shorts-at-risk":
        exit_reason = "bias_flip"
    elif side == "short" and entry_bias == "shorts-at-risk" and current_bias == "longs-at-risk":
        exit_reason = "bias_flip"
    elif side == "long" and change_1h > 2.5:
        exit_reason = "momentum_reversal"
    elif side == "short" and change_1h < -2.5:
        exit_reason = "momentum_reversal"

    if exit_reason is None:
        return None
    return {
        "trade": close_position(
            position=position,
            current_market_data=current_market_data,
            exit_reason=exit_reason,
            config=config,
            urgent=urgent,
        )
    }


def current_pnl_pct(position: dict[str, Any], current_market_data: dict[str, Any]) -> float:
    entry_price = float(position["entryPrice"])
    current_price = float(current_market_data["price"])
    if entry_price == 0:
        return 0.0
    if position["side"] == "long":
        return ((current_price - entry_price) / entry_price) * 100
    return ((entry_price - current_price) / entry_price) * 100


def close_position(
    *,
    position: dict[str, Any],
    current_market_data: dict[str, Any],
    exit_reason: str,
    config: BacktestConfig,
    urgent: bool = False,
) -> dict[str, Any]:
    exit_fill = deterministic_fill_price(
        price=float(current_market_data["price"]),
        side=str(position["side"]),
        exec_quality=int(position["execution_quality"]),
        is_exit=True,
        urgent=urgent,
    )
    entry_price = float(position["entryPrice"])
    exit_price = float(exit_fill["fill_price"])
    size_usd = float(position["sizeUsd"])
    units = 0.0 if entry_price == 0 else size_usd / entry_price
    side = str(position["side"])
    gross_pnl = (exit_price - entry_price) * units if side == "long" else (entry_price - exit_price) * units
    entry_fee = float(position.get("entry_fee") or calculate_trade_fee(notional_usd=size_usd, config=config)["fee"])
    exit_fee_result = calculate_trade_fee(notional_usd=size_usd, config=config)
    exit_fee = float(exit_fee_result["fee"])
    total_fees = entry_fee + exit_fee
    net_pnl = gross_pnl - total_fees
    return {
        "strategy_id": "funding_exhaustion_snap",
        "symbol": position["symbol"],
        "side": side,
        "entry_timestamp": position["entry_timestamp"],
        "exit_timestamp": current_market_data["timestamp"],
        "entry_price": round(entry_price, 6),
        "exit_price": round(exit_price, 6),
        "size_usd": round(size_usd, 2),
        "gross_pnl": round(gross_pnl, 2),
        "net_pnl": round(net_pnl, 2),
        "equity_delta": round(net_pnl, 2),
        "return_pct": round((net_pnl / size_usd) * 100, 3) if size_usd else 0.0,
        "fees": round(total_fees, 6),
        "entry_fee_rate": position.get("entry_fee_rate"),
        "exit_fee_rate": round(float(exit_fee_result["fee_rate"]), 8),
        "entry_liquidity_role": position.get("entry_liquidity_role"),
        "exit_liquidity_role": exit_fee_result["liquidity_role"],
        "exit_reason": exit_reason,
        "entry_context": {
            "market_data": position["entry_data"],
            "signal_eval": position["signal_eval"],
            "setup_score": position["setup_score"],
            "thesis": position["thesis"],
            "trigger_plan": position["trigger_plan"],
            "invalidation_plan": position["invalidation_plan"],
        },
        "entry_slippage_pct": round(float(position["entry_slippage_pct"]), 4),
        "exit_slippage_pct": round(float(exit_fill["slippage_pct"]), 4),
    }


def deterministic_fill_price(
    *,
    price: float,
    side: str,
    exec_quality: int,
    is_exit: bool,
    urgent: bool,
) -> dict[str, float]:
    if is_exit:
        if urgent:
            slippage_pct = 0.14
        elif exec_quality >= 80:
            slippage_pct = 0.06
        elif exec_quality >= 60:
            slippage_pct = 0.09
        else:
            slippage_pct = 0.14
        fill_price = price * (1 - slippage_pct / 100) if side == "long" else price * (1 + slippage_pct / 100)
    else:
        if exec_quality >= 80:
            slippage_pct = 0.045
        elif exec_quality >= 60:
            slippage_pct = 0.075
        else:
            slippage_pct = 0.115
        fill_price = price * (1 + slippage_pct / 100) if side == "long" else price * (1 - slippage_pct / 100)
    return {"fill_price": round(fill_price, 6), "slippage_pct": round(slippage_pct, 4)}


def target_pct_from_market(market_data: dict[str, Any]) -> float:
    funding_extremity = abs(float(market_data["fundingPercentile"]) - 50.0)
    if funding_extremity >= 45:
        return 2.2
    if funding_extremity >= 40:
        return 1.6
    return 1.2


def build_latest_signal(symbol_histories: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    ranked: list[dict[str, Any]] = []
    for symbol, history in symbol_histories.items():
        if len(history) < 60:
            continue
        market_data = history[-1]
        signal_eval = evaluate_signal(market_data)
        setup_score = score_setup(market_data, signal_eval)
        ranked.append(
            {
                "strategy_id": "funding_exhaustion_snap",
                "symbol": symbol,
                "signal": signal_eval.get("signal", "none"),
                "direction": signal_eval.get("direction"),
                "confidence": signal_eval.get("confidence", 0),
                "rank_score": setup_score.get("rank_score", 0),
                "watchlist_label": setup_score.get("watchlist_label"),
                "execution_quality": setup_score.get("execution_quality"),
                "funding_percentile": market_data.get("fundingPercentile"),
                "change1h": market_data.get("change1h"),
                "crowding_bias": market_data.get("crowdingBias"),
                "trigger_plan": generate_trigger_plan(signal_eval, market_data),
            }
        )
    if not ranked:
        return {
            "strategy_id": "funding_exhaustion_snap",
            "signal": "none",
            "status": "watch",
        }
    ranked.sort(key=lambda item: (item["signal"] in {"long", "short"}, item["rank_score"], item["confidence"]), reverse=True)
    top = ranked[0]
    return {
        **top,
        "status": "ready" if top["signal"] in {"long", "short"} else "watch",
    }
