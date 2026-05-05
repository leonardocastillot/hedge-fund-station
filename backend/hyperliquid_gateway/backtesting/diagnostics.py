from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any

ROBUST_GATE = {
    "min_trades": 30,
    "min_return_pct": 0.0,
    "min_profit_factor": 1.30,
    "max_drawdown_pct": 3.5,
    "min_avg_net_trade_return_pct": 0.12,
    "max_largest_trade_pnl_share_pct": 50.0,
}


def build_trade_diagnostics(
    *,
    summary: dict[str, Any],
    trades: list[dict[str, Any]],
    initial_equity: float,
    requested_symbols: list[str] | None = None,
    robust_gate: dict[str, float | int] | None = None,
) -> dict[str, Any]:
    symbol_leaderboard = build_symbol_leaderboard(
        trades=trades,
        initial_equity=initial_equity,
        requested_symbols=requested_symbols or [],
        robust_gate=robust_gate,
    )
    return {
        "symbol_leaderboard": symbol_leaderboard,
        "exit_reason_counts": dict(Counter(str(trade.get("exit_reason", "unknown")) for trade in trades)),
        "robust_assessment": assess_robust_gate(summary=summary, trades=trades, robust_gate=robust_gate),
    }


def build_symbol_leaderboard(
    *,
    trades: list[dict[str, Any]],
    initial_equity: float,
    requested_symbols: list[str],
    robust_gate: dict[str, float | int] | None = None,
) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for trade in trades:
        grouped[str(trade.get("symbol") or "BTC")].append(trade)

    for symbol in requested_symbols:
        grouped.setdefault(symbol, [])

    rows = [build_trade_group_summary(symbol, symbol_trades, initial_equity, robust_gate=robust_gate) for symbol, symbol_trades in grouped.items()]
    rows.sort(
        key=lambda item: (
            item["robust_assessment"]["status"] == "passes",
            float(item["net_pnl"]),
            float(item["profit_factor"]),
            int(item["total_trades"]),
        ),
        reverse=True,
    )
    return rows


def build_trade_group_summary(
    symbol: str,
    trades: list[dict[str, Any]],
    initial_equity: float,
    *,
    robust_gate: dict[str, float | int] | None = None,
) -> dict[str, Any]:
    total_trades = len(trades)
    wins = sum(1 for trade in trades if float(trade.get("net_pnl", 0.0) or 0.0) > 0)
    losses = sum(1 for trade in trades if float(trade.get("net_pnl", 0.0) or 0.0) < 0)
    net_pnl = sum(float(trade.get("net_pnl", 0.0) or 0.0) for trade in trades)
    gross_profit = sum(float(trade.get("net_pnl", 0.0) or 0.0) for trade in trades if float(trade.get("net_pnl", 0.0) or 0.0) > 0)
    gross_loss = abs(sum(float(trade.get("net_pnl", 0.0) or 0.0) for trade in trades if float(trade.get("net_pnl", 0.0) or 0.0) < 0))
    fees_paid = sum(float(trade.get("fees", 0.0) or 0.0) for trade in trades)
    return_pcts = [float(trade.get("return_pct", 0.0) or 0.0) for trade in trades]
    summary = {
        "symbol": symbol,
        "total_trades": total_trades,
        "wins": wins,
        "losses": losses,
        "win_rate_pct": round((wins / total_trades) * 100, 2) if total_trades else 0.0,
        "net_pnl": round(net_pnl, 2),
        "return_pct": round((net_pnl / initial_equity) * 100, 2) if initial_equity else 0.0,
        "profit_factor": round(gross_profit / gross_loss, 2) if gross_loss else (99.0 if gross_profit > 0 else 0.0),
        "max_drawdown_pct": round(max_trade_group_drawdown_pct(trades, initial_equity), 2),
        "fees_paid": round(fees_paid, 2),
        "avg_net_trade_return_pct": round(sum(return_pcts) / total_trades, 4) if total_trades else 0.0,
        "exit_reason_counts": dict(Counter(str(trade.get("exit_reason", "unknown")) for trade in trades)),
    }
    summary["robust_assessment"] = assess_robust_gate(summary=summary, trades=trades, robust_gate=robust_gate)
    return summary


def max_trade_group_drawdown_pct(trades: list[dict[str, Any]], initial_equity: float) -> float:
    equity = initial_equity
    peak = initial_equity
    max_drawdown = 0.0
    for trade in sorted(trades, key=lambda item: str(item.get("exit_timestamp") or item.get("entry_timestamp") or "")):
        equity += float(trade.get("net_pnl", 0.0) or 0.0)
        peak = max(peak, equity)
        if peak > 0:
            max_drawdown = max(max_drawdown, ((peak - equity) / peak) * 100)
    return max_drawdown


def assess_robust_gate(
    *,
    summary: dict[str, Any],
    trades: list[dict[str, Any]],
    robust_gate: dict[str, float | int] | None = None,
) -> dict[str, Any]:
    policy = {**ROBUST_GATE, **(robust_gate or {})}
    avg_net_trade_return_pct = average_trade_return_pct(trades)
    largest_trade_share = largest_trade_pnl_share_pct(trades, summary_float(summary, "net_profit", summary_float(summary, "net_pnl", 0.0)))
    robust_profit_factor = profit_factor_from_trades(trades)
    exit_reason_share = dominant_exit_reason_pnl_share_pct(trades, summary_float(summary, "net_profit", summary_float(summary, "net_pnl", 0.0)))
    checks = {
        "min_trades": int(summary.get("total_trades", 0) or 0) >= policy["min_trades"],
        "positive_net_return": summary_float(summary, "return_pct", 0.0) > policy["min_return_pct"],
        "min_profit_factor": robust_profit_factor >= policy["min_profit_factor"],
        "max_drawdown_pct": summary_float(summary, "max_drawdown_pct", 999.0) <= policy["max_drawdown_pct"],
        "min_avg_net_trade_return_pct": avg_net_trade_return_pct >= policy["min_avg_net_trade_return_pct"],
        "max_largest_trade_pnl_share_pct": largest_trade_share <= policy["max_largest_trade_pnl_share_pct"],
    }
    if "max_exit_reason_pnl_share_pct" in policy:
        checks["max_exit_reason_pnl_share_pct"] = exit_reason_share <= float(policy["max_exit_reason_pnl_share_pct"])
    blockers = [key for key, passed in checks.items() if not passed]
    status = "passes" if not blockers else "insufficient-sample" if not checks["min_trades"] else "blocked"
    return {
        "status": status,
        "policy": policy,
        "checks": checks,
        "blockers": blockers,
        "metrics": {
            "avg_net_trade_return_pct": round(avg_net_trade_return_pct, 4),
            "largest_trade_pnl_share_pct": round(largest_trade_share, 2),
            "dominant_exit_reason_pnl_share_pct": round(exit_reason_share, 2),
            "profit_factor": round(robust_profit_factor, 2),
        },
    }


def average_trade_return_pct(trades: list[dict[str, Any]]) -> float:
    if not trades:
        return 0.0
    return sum(float(trade.get("return_pct", 0.0) or 0.0) for trade in trades) / len(trades)


def largest_trade_pnl_share_pct(trades: list[dict[str, Any]], net_profit: float) -> float:
    if net_profit <= 0 or not trades:
        return 0.0
    largest = max(float(trade.get("net_pnl", 0.0) or 0.0) for trade in trades)
    if largest <= 0:
        return 0.0
    return (largest / net_profit) * 100


def dominant_exit_reason_pnl_share_pct(trades: list[dict[str, Any]], net_profit: float) -> float:
    if net_profit <= 0 or not trades:
        return 0.0
    pnl_by_reason: Counter[str] = Counter()
    for trade in trades:
        pnl = float(trade.get("net_pnl", 0.0) or 0.0)
        if pnl <= 0:
            continue
        pnl_by_reason[str(trade.get("exit_reason", "unknown"))] += pnl
    if not pnl_by_reason:
        return 0.0
    return (max(pnl_by_reason.values()) / net_profit) * 100


def profit_factor_from_trades(trades: list[dict[str, Any]]) -> float:
    gross_profit = sum(float(trade.get("net_pnl", 0.0) or 0.0) for trade in trades if float(trade.get("net_pnl", 0.0) or 0.0) > 0)
    gross_loss = abs(sum(float(trade.get("net_pnl", 0.0) or 0.0) for trade in trades if float(trade.get("net_pnl", 0.0) or 0.0) < 0))
    if gross_loss:
        return gross_profit / gross_loss
    return 99.0 if gross_profit > 0 else 0.0


def summary_float(summary: dict[str, Any], key: str, default: float) -> float:
    value = summary.get(key)
    if value is None:
        return default
    return float(value)
