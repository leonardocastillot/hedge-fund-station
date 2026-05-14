"""Backtest adapter for BTC Convex Cycle Trend."""

from __future__ import annotations

from pathlib import Path
from typing import Any

try:
    from ...backtesting.btc_daily_history import load_btc_daily_history
    from ...backtesting.diagnostics import build_trade_diagnostics
    from ...backtesting.engine import BacktestConfig, calculate_trade_fee
    from ...backtesting.metrics import build_summary
except ImportError:
    from backtesting.btc_daily_history import load_btc_daily_history
    from backtesting.diagnostics import build_trade_diagnostics
    from backtesting.engine import BacktestConfig, calculate_trade_fee
    from backtesting.metrics import build_summary

from .logic import STRATEGY_ID, SYMBOL, evaluate_signal, row_close
from .risk import build_risk_plan, calculate_position_size
from .scoring import score_setup

CHAMPION_STRATEGY = "btc_adaptive_cycle_trend"
CHAMPION_RETURN_PCT = 94.39
CONVEX_CYCLE_ROBUST_GATE = {
    "min_trades": 10,
    "min_return_pct": CHAMPION_RETURN_PCT,
    "min_profit_factor": 2.0,
    "max_drawdown_pct": 20.0,
    "min_avg_net_trade_return_pct": 2.0,
    "max_largest_trade_pnl_share_pct": 45.0,
}


def run_backtest(dataset_path: Path, config: BacktestConfig) -> dict[str, Any]:
    rows, dataset = load_btc_daily_history(dataset_path, config)
    if not rows:
        raise ValueError("BTC Convex Cycle Trend requires non-empty BTC/USD daily history.")

    equity_curve: list[dict[str, float | str]] = []
    trades: list[dict[str, Any]] = []
    cash = float(config.initial_equity)
    btc_units = 0.0
    open_position: dict[str, Any] | None = None
    fees_paid = 0.0

    for index, row in enumerate(rows):
        close = row_close(row)
        if open_position is not None:
            open_position["peak_close"] = max(float(open_position["peak_close"]), close)
            exit_eval = evaluate_signal(rows, index, in_position=True, trade_peak_close=float(open_position["peak_close"]))
            if exit_eval.get("exit_trigger"):
                trade = close_position(open_position, row, exit_eval, config)
                cash += float(trade["exit_cash_added"])
                btc_units = 0.0
                fees_paid += float(trade["exit_fee"])
                trades.append(trade)
                open_position = None

        if open_position is None:
            signal_eval = evaluate_signal(rows, index, in_position=False)
            if signal_eval.get("signal") == "long":
                sizing = calculate_position_size(
                    portfolio_value=cash,
                    signal_eval=signal_eval,
                    risk_fraction=config.risk_fraction,
                )
                if sizing["can_enter"]:
                    size_usd = float(sizing["size_usd"])
                    fee_result = calculate_trade_fee(notional_usd=size_usd, config=config)
                    entry_fee = float(fee_result["fee"])
                    btc_units = (size_usd - entry_fee) / close
                    cash -= size_usd
                    fees_paid += entry_fee
                    score = score_setup(signal_eval)
                    open_position = {
                        "strategy_id": STRATEGY_ID,
                        "symbol": SYMBOL,
                        "side": "long",
                        "createdAt": date_to_ms(str(row["date"])),
                        "entry_timestamp": str(row["date"]),
                        "entry_price": round(close, 8),
                        "size_usd": round(size_usd, 2),
                        "entry_fee": round(entry_fee, 6),
                        "entry_fee_rate": round(float(fee_result["fee_rate"]), 8),
                        "entry_liquidity_role": fee_result["liquidity_role"],
                        "btc_units": btc_units,
                        "peak_close": close,
                        "entry_context": {
                            "signal": signal_eval,
                            "score": score,
                            "sizing": sizing,
                            "risk_plan": build_risk_plan(signal_eval),
                        },
                    }

        mark_value = cash + (btc_units * close if open_position is not None else 0.0)
        equity_curve.append({"timestamp": str(row["date"]), "equity": round(mark_value, 2)})

    if open_position is not None:
        latest = rows[-1]
        signal_eval = evaluate_signal(rows, len(rows) - 1, in_position=True, trade_peak_close=float(open_position["peak_close"]))
        trade = close_position(open_position, latest, {**signal_eval, "exit_reason": "forced_close"}, config)
        cash += float(trade["exit_cash_added"])
        fees_paid += float(trade["exit_fee"])
        trades.append(trade)
        equity_curve.append({"timestamp": str(latest["date"]), "equity": round(cash, 2)})

    summary = build_summary(
        initial_equity=config.initial_equity,
        equity_curve=equity_curve,
        trades=trades,
        fees_paid=fees_paid,
    )
    summary = {
        **summary,
        "strategy_id": STRATEGY_ID,
        "champion_strategy": CHAMPION_STRATEGY,
        "champion_return_pct": CHAMPION_RETURN_PCT,
        "excess_return_vs_champion_pct": round(float(summary.get("return_pct", 0.0)) - CHAMPION_RETURN_PCT, 2),
        "beats_champion": float(summary.get("return_pct", 0.0)) > CHAMPION_RETURN_PCT,
    }
    diagnostics = build_trade_diagnostics(
        summary=summary,
        trades=trades,
        initial_equity=config.initial_equity,
        requested_symbols=[SYMBOL],
        robust_gate=CONVEX_CYCLE_ROBUST_GATE,
    )
    latest_signal = build_latest_signal(rows)
    return {
        "dataset": {
            **dataset,
            "rows": len(rows),
            "start": rows[0]["date"],
            "end": rows[-1]["date"],
            "symbol": SYMBOL,
        },
        "summary": summary,
        "latest_signal": latest_signal,
        "trades": trades,
        "equity_curve": equity_curve,
        "symbol_leaderboard": diagnostics["symbol_leaderboard"],
        "exit_reason_counts": diagnostics["exit_reason_counts"],
        "robust_assessment": diagnostics["robust_assessment"],
        "risk_plan": build_risk_plan(latest_signal),
        "benchmark": {
            "strategy_id": CHAMPION_STRATEGY,
            "profile_id": "500_usd_validated",
            "return_pct": CHAMPION_RETURN_PCT,
            "initial_equity": 500.0,
            "fee_model": "taker",
            "leverage": "none",
        },
        "notes": [
            "BTC daily convex cycle trend replay using shared BTC/USD history.",
            "Long-only convex partial exposure; no shorts, no leverage, no live routing.",
            "Validation requires beating the current 94.39% BTC adaptive cycle champion before paper review.",
        ],
    }


def close_position(position: dict[str, Any], row: dict[str, Any], signal_eval: dict[str, Any], config: BacktestConfig) -> dict[str, Any]:
    exit_price = row_close(row)
    size_usd = float(position["size_usd"])
    btc_units = float(position["btc_units"])
    gross_exit_value = btc_units * exit_price
    exit_fee_result = calculate_trade_fee(notional_usd=gross_exit_value, config=config)
    exit_fee = float(exit_fee_result["fee"])
    net_pnl = gross_exit_value - exit_fee - size_usd
    return {
        "strategy_id": STRATEGY_ID,
        "symbol": SYMBOL,
        "side": "long",
        "entry_timestamp": position["entry_timestamp"],
        "exit_timestamp": str(row["date"]),
        "entry_price": position["entry_price"],
        "exit_price": round(exit_price, 8),
        "size_usd": round(size_usd, 2),
        "gross_pnl": round((exit_price - float(position["entry_price"])) * btc_units, 2),
        "net_pnl": round(net_pnl, 2),
        "equity_delta": round(gross_exit_value - exit_fee, 2),
        "exit_cash_added": round(gross_exit_value - exit_fee, 8),
        "return_pct": round((net_pnl / size_usd) * 100.0, 4) if size_usd else 0.0,
        "fees": round(float(position["entry_fee"]) + exit_fee, 6),
        "entry_fee": position["entry_fee"],
        "exit_fee": round(exit_fee, 6),
        "entry_fee_rate": position["entry_fee_rate"],
        "exit_fee_rate": round(float(exit_fee_result["fee_rate"]), 8),
        "entry_liquidity_role": position["entry_liquidity_role"],
        "exit_liquidity_role": exit_fee_result["liquidity_role"],
        "exit_reason": signal_eval.get("exit_reason") or "forced_close",
        "entry_context": position["entry_context"],
        "exit_context": signal_eval,
    }


def build_latest_signal(rows: list[dict[str, Any]]) -> dict[str, Any]:
    signal_eval = evaluate_signal(rows, len(rows) - 1, in_position=False)
    score = score_setup(signal_eval)
    return {
        **signal_eval,
        "rank_score": score["rank_score"],
        "execution_quality": score["execution_quality"],
        "trigger_plan": "Enter long when BTC daily close > SMA150, SMA50 > SMA150, and RSI14 > 42; use 25% exposure only in convex regime.",
        "invalidation_plan": "Exit on 15% close drawdown from trade peak, slow-trend break, or crash guard.",
    }


def date_to_ms(value: str) -> int:
    from datetime import datetime, timezone

    parsed = datetime.fromisoformat(value).replace(tzinfo=timezone.utc)
    return int(parsed.timestamp() * 1000)
