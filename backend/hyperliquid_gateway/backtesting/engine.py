from __future__ import annotations

from dataclasses import dataclass

from .io import Candle
from .metrics import build_summary


@dataclass(frozen=True)
class BacktestConfig:
    initial_equity: float = 100_000.0
    fee_rate: float = 0.00055
    risk_fraction: float = 0.10


def simulate_strategy(
    *,
    strategy_id: str,
    candles: list[Candle],
    indicators: list[dict[str, float | bool | None]],
    config: BacktestConfig,
) -> dict[str, object]:
    equity = config.initial_equity
    fees_paid = 0.0
    equity_curve: list[dict[str, float | int | str]] = []
    trades: list[dict[str, object]] = []
    open_position: dict[str, object] | None = None

    for candle, signal in zip(candles, indicators):
        if open_position is not None:
            exit_trade = _check_exit(open_position, candle, config.fee_rate)
            if exit_trade is not None:
                fees_paid += float(exit_trade["fees"]) - float(open_position["entry_fee"])
                equity += float(exit_trade["net_pnl"])
                trades.append(exit_trade)
                open_position = None

        equity_curve.append({"timestamp": candle.timestamp, "equity": round(equity, 2)})

        if open_position is not None or signal.get("entry") is None:
            continue

        size_usd = equity * config.risk_fraction
        if size_usd <= 0:
            continue

        entry_fee = size_usd * config.fee_rate
        fees_paid += entry_fee
        equity -= entry_fee
        open_position = {
            "strategy_id": strategy_id,
            "side": str(signal["entry"]),
            "entry_timestamp": candle.timestamp,
            "entry_price": candle.close,
            "stop_loss": float(signal["stop_loss"]),
            "take_profit": float(signal["take_profit"]),
            "size_usd": round(size_usd, 2),
            "entry_fee": round(entry_fee, 6),
            "entry_context": signal,
        }

    if open_position is not None:
        last_candle = candles[-1]
        forced_exit = _close_position(open_position, last_candle.timestamp, last_candle.close, "forced_close", config.fee_rate)
        fees_paid += float(forced_exit["fees"]) - float(open_position["entry_fee"])
        equity += float(forced_exit["net_pnl"])
        trades.append(forced_exit)
        equity_curve.append({"timestamp": last_candle.timestamp, "equity": round(equity, 2)})

    return {
        "summary": build_summary(
            initial_equity=config.initial_equity,
            equity_curve=equity_curve,
            trades=trades,
            fees_paid=fees_paid,
        ),
        "equity_curve": equity_curve,
        "trades": trades,
    }


def _check_exit(open_position: dict[str, object], candle: Candle, fee_rate: float) -> dict[str, object] | None:
    side = str(open_position["side"])
    stop_loss = float(open_position["stop_loss"])
    take_profit = float(open_position["take_profit"])

    if side == "long":
        if candle.low <= stop_loss:
            return _close_position(open_position, candle.timestamp, stop_loss, "stop_loss", fee_rate)
        if candle.high >= take_profit:
            return _close_position(open_position, candle.timestamp, take_profit, "take_profit", fee_rate)
    else:
        if candle.high >= stop_loss:
            return _close_position(open_position, candle.timestamp, stop_loss, "stop_loss", fee_rate)
        if candle.low <= take_profit:
            return _close_position(open_position, candle.timestamp, take_profit, "take_profit", fee_rate)
    return None


def _close_position(
    open_position: dict[str, object],
    exit_timestamp: str,
    exit_price: float,
    exit_reason: str,
    fee_rate: float,
) -> dict[str, object]:
    entry_price = float(open_position["entry_price"])
    size_usd = float(open_position["size_usd"])
    units = 0.0 if entry_price == 0 else size_usd / entry_price
    side = str(open_position["side"])
    gross_pnl = (exit_price - entry_price) * units if side == "long" else (entry_price - exit_price) * units
    exit_fee = size_usd * fee_rate
    total_fees = float(open_position["entry_fee"]) + exit_fee
    net_pnl = gross_pnl - exit_fee
    return {
        "strategy_id": open_position["strategy_id"],
        "side": side,
        "entry_timestamp": open_position["entry_timestamp"],
        "exit_timestamp": exit_timestamp,
        "entry_price": round(entry_price, 6),
        "exit_price": round(exit_price, 6),
        "size_usd": round(size_usd, 2),
        "gross_pnl": round(gross_pnl, 2),
        "net_pnl": round(net_pnl, 2),
        "return_pct": round((net_pnl / size_usd) * 100, 3) if size_usd else 0.0,
        "fees": round(total_fees, 6),
        "exit_reason": exit_reason,
        "entry_context": open_position["entry_context"],
    }
