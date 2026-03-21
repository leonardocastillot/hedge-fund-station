from __future__ import annotations


def build_summary(
    *,
    initial_equity: float,
    equity_curve: list[dict[str, float | int | str]],
    trades: list[dict[str, object]],
    fees_paid: float,
) -> dict[str, float | int]:
    final_equity = float(equity_curve[-1]["equity"]) if equity_curve else initial_equity
    net_profit = final_equity - initial_equity
    total_trades = len(trades)
    wins = sum(1 for trade in trades if float(trade["net_pnl"]) > 0)
    losses = sum(1 for trade in trades if float(trade["net_pnl"]) < 0)
    gross_profit = sum(float(trade["net_pnl"]) for trade in trades if float(trade["net_pnl"]) > 0)
    gross_loss = abs(sum(float(trade["net_pnl"]) for trade in trades if float(trade["net_pnl"]) < 0))

    peak = initial_equity
    max_drawdown = 0.0
    for point in equity_curve:
        equity = float(point["equity"])
        peak = max(peak, equity)
        if peak > 0:
            drawdown = ((peak - equity) / peak) * 100
            max_drawdown = max(max_drawdown, drawdown)

    return {
        "initial_equity": round(initial_equity, 2),
        "final_equity": round(final_equity, 2),
        "net_profit": round(net_profit, 2),
        "return_pct": round((net_profit / initial_equity) * 100, 2) if initial_equity else 0.0,
        "total_trades": total_trades,
        "wins": wins,
        "losses": losses,
        "win_rate_pct": round((wins / total_trades) * 100, 2) if total_trades else 0.0,
        "profit_factor": round(gross_profit / gross_loss, 2) if gross_loss else 0.0,
        "max_drawdown_pct": round(max_drawdown, 2),
        "fees_paid": round(fees_paid, 2),
    }
