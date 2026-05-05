from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Sequence

from .io import Candle
from .metrics import build_summary

DEFAULT_TAKER_FEE_RATE = 0.00045
DEFAULT_MAKER_FEE_RATE = 0.00015
VALID_FEE_MODELS = {"taker", "maker", "mixed"}


@dataclass(frozen=True)
class BacktestConfig:
    initial_equity: float = 100_000.0
    fee_rate: float | None = None
    taker_fee_rate: float | None = None
    maker_fee_rate: float | None = None
    fee_model: str = "taker"
    maker_ratio: float = 0.0
    risk_fraction: float = 0.10
    symbols: tuple[str, ...] = ()
    universe: str = "default"
    start: str | None = None
    end: str | None = None
    lookback_days: int | None = None

    def __post_init__(self) -> None:
        taker_fee_rate = self.taker_fee_rate
        if taker_fee_rate is None:
            taker_fee_rate = self.fee_rate if self.fee_rate is not None else DEFAULT_TAKER_FEE_RATE
        maker_fee_rate = self.maker_fee_rate if self.maker_fee_rate is not None else DEFAULT_MAKER_FEE_RATE
        fee_model = self.fee_model.strip().lower()
        if fee_model not in VALID_FEE_MODELS:
            raise ValueError(f"fee_model must be one of {sorted(VALID_FEE_MODELS)}")
        if taker_fee_rate < 0 or maker_fee_rate < 0:
            raise ValueError("Fee rates must be non-negative decimals.")
        if self.maker_ratio < 0 or self.maker_ratio > 1:
            raise ValueError("maker_ratio must be between 0 and 1.")
        object.__setattr__(self, "fee_rate", taker_fee_rate)
        object.__setattr__(self, "taker_fee_rate", taker_fee_rate)
        object.__setattr__(self, "maker_fee_rate", maker_fee_rate)
        object.__setattr__(self, "fee_model", fee_model)

    def effective_symbols(self) -> tuple[str, ...]:
        if self.universe.strip().lower() == "all":
            return ()
        return normalize_symbols(self.symbols)

    def fee_rate_for_role(self, liquidity_role: str | None = None) -> float:
        role = normalize_liquidity_role(liquidity_role) or self.fee_model
        if role == "maker":
            return float(self.maker_fee_rate or DEFAULT_MAKER_FEE_RATE)
        if role == "mixed":
            maker_ratio = float(self.maker_ratio)
            return (float(self.maker_fee_rate or DEFAULT_MAKER_FEE_RATE) * maker_ratio) + (
                float(self.taker_fee_rate or DEFAULT_TAKER_FEE_RATE) * (1 - maker_ratio)
            )
        return float(self.taker_fee_rate or DEFAULT_TAKER_FEE_RATE)

    def liquidity_role_for_order(self, liquidity_role: str | None = None) -> str:
        return normalize_liquidity_role(liquidity_role) or self.fee_model


def normalize_symbols(symbols: Sequence[str] | str | None) -> tuple[str, ...]:
    if symbols is None:
        return ()
    raw_items: list[str]
    if isinstance(symbols, str):
        raw_items = symbols.split(",")
    else:
        raw_items = []
        for item in symbols:
            raw_items.extend(str(item).split(","))

    normalized: list[str] = []
    seen: set[str] = set()
    for item in raw_items:
        symbol = item.strip().upper()
        if not symbol or symbol in seen:
            continue
        normalized.append(symbol)
        seen.add(symbol)
    return tuple(normalized)


def normalize_liquidity_role(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    if not normalized:
        return None
    if normalized not in VALID_FEE_MODELS:
        raise ValueError(f"liquidity role must be one of {sorted(VALID_FEE_MODELS)}")
    return normalized


def calculate_trade_fee(
    *,
    notional_usd: float,
    config: BacktestConfig,
    liquidity_role: str | None = None,
) -> dict[str, float | str]:
    role = config.liquidity_role_for_order(liquidity_role)
    fee_rate = config.fee_rate_for_role(role)
    return {
        "fee": notional_usd * fee_rate,
        "fee_rate": fee_rate,
        "liquidity_role": role,
    }


def parse_time_to_ms(value: str | int | float | None) -> int | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        numeric = int(value)
        return numeric if numeric > 10_000_000_000 else numeric * 1000

    cleaned = value.strip()
    if not cleaned:
        return None
    if cleaned.isdigit():
        numeric = int(cleaned)
        return numeric if numeric > 10_000_000_000 else numeric * 1000

    normalized = cleaned.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return int(parsed.timestamp() * 1000)


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
            exit_trade = _check_exit(open_position, candle, config)
            if exit_trade is not None:
                fees_paid += float(exit_trade["fees"]) - float(open_position["entry_fee"])
                equity += float(exit_trade.get("equity_delta", exit_trade["net_pnl"]))
                trades.append(exit_trade)
                open_position = None

        equity_curve.append({"timestamp": candle.timestamp, "equity": round(equity, 2)})

        if open_position is not None or signal.get("entry") is None:
            continue

        size_usd = equity * config.risk_fraction
        if size_usd <= 0:
            continue

        entry_fee_result = calculate_trade_fee(
            notional_usd=size_usd,
            config=config,
            liquidity_role=str(signal.get("entry_liquidity_role") or signal.get("liquidity_role") or ""),
        )
        entry_fee = float(entry_fee_result["fee"])
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
            "entry_fee_rate": round(float(entry_fee_result["fee_rate"]), 8),
            "entry_liquidity_role": entry_fee_result["liquidity_role"],
            "entry_context": signal,
        }

    if open_position is not None:
        last_candle = candles[-1]
        forced_exit = _close_position(open_position, last_candle.timestamp, last_candle.close, "forced_close", config)
        fees_paid += float(forced_exit["fees"]) - float(open_position["entry_fee"])
        equity += float(forced_exit.get("equity_delta", forced_exit["net_pnl"]))
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


def _check_exit(open_position: dict[str, object], candle: Candle, config: BacktestConfig) -> dict[str, object] | None:
    side = str(open_position["side"])
    stop_loss = float(open_position["stop_loss"])
    take_profit = float(open_position["take_profit"])

    if side == "long":
        if candle.low <= stop_loss:
            return _close_position(open_position, candle.timestamp, stop_loss, "stop_loss", config)
        if candle.high >= take_profit:
            return _close_position(open_position, candle.timestamp, take_profit, "take_profit", config)
    else:
        if candle.high >= stop_loss:
            return _close_position(open_position, candle.timestamp, stop_loss, "stop_loss", config)
        if candle.low <= take_profit:
            return _close_position(open_position, candle.timestamp, take_profit, "take_profit", config)
    return None


def _close_position(
    open_position: dict[str, object],
    exit_timestamp: str,
    exit_price: float,
    exit_reason: str,
    config: BacktestConfig,
) -> dict[str, object]:
    entry_price = float(open_position["entry_price"])
    size_usd = float(open_position["size_usd"])
    units = 0.0 if entry_price == 0 else size_usd / entry_price
    side = str(open_position["side"])
    gross_pnl = (exit_price - entry_price) * units if side == "long" else (entry_price - exit_price) * units
    exit_fee_result = calculate_trade_fee(
        notional_usd=size_usd,
        config=config,
        liquidity_role=str(open_position.get("exit_liquidity_role") or open_position.get("liquidity_role") or ""),
    )
    exit_fee = float(exit_fee_result["fee"])
    total_fees = float(open_position["entry_fee"]) + exit_fee
    equity_delta = gross_pnl - exit_fee
    net_pnl = gross_pnl - total_fees
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
        "equity_delta": round(equity_delta, 2),
        "return_pct": round((net_pnl / size_usd) * 100, 3) if size_usd else 0.0,
        "fees": round(total_fees, 6),
        "entry_fee_rate": open_position.get("entry_fee_rate"),
        "exit_fee_rate": round(float(exit_fee_result["fee_rate"]), 8),
        "entry_liquidity_role": open_position.get("entry_liquidity_role"),
        "exit_liquidity_role": exit_fee_result["liquidity_role"],
        "exit_reason": exit_reason,
        "entry_context": open_position["entry_context"],
    }
