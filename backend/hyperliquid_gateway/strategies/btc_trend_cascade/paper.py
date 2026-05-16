from typing import Any


def paper_candidate(backtest_result: dict[str, Any]) -> dict[str, Any]:
    summary = backtest_result.get("summary", {})
    return {
        "strategy_id": "btc_trend_cascade",
        "promotion_path": "backtest_validated -> paper_candidate -> production_candidate_review",
        "paper_candidate": {
            "entry_plan": "Enter when cascade momentum score >= 0.5, ADX > 22, vol < 85%ile.",
            "exit_plan": "Momentum collapse immediate exit, or 2.5x/5.0x ATR progressive trail.",
            "sizing_plan": "Conviction-based: position size proportional to cascade score.",
        },
        "backtest_summary": {
            "return_pct": summary.get("return_pct"),
            "total_trades": summary.get("total_trades"),
            "profit_factor": summary.get("profit_factor"),
            "max_drawdown_pct": summary.get("max_drawdown_pct"),
        },
    }
