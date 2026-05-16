"""
Cross-Symbol Momentum Rotational Strategy

Market-neutral long-short strategy ranking all Hyperliquid perps by
multi-timeframe momentum. Goes long top N, short bottom N.
"""

from .logic import (
    compute_momentum_score,
    rank_symbols,
    select_baskets,
    evaluate_signal,
)
from .scoring import score_setup, get_top_opportunities
from .risk import (
    check_invalidation,
    check_market_wide_kill,
    check_session_killswitch,
    calculate_position_size,
)
from .paper import (
    paper_candidate,
    simulate_entry_execution,
    simulate_exit_execution,
    calculate_paper_pnl,
    generate_paper_trade_thesis,
    generate_invalidation_plan,
    generate_trigger_plan,
)

__all__ = [
    "compute_momentum_score",
    "rank_symbols",
    "select_baskets",
    "evaluate_signal",
    "score_setup",
    "get_top_opportunities",
    "check_invalidation",
    "check_market_wide_kill",
    "check_session_killswitch",
    "calculate_position_size",
    "paper_candidate",
    "simulate_entry_execution",
    "simulate_exit_execution",
    "calculate_paper_pnl",
    "generate_paper_trade_thesis",
    "generate_invalidation_plan",
    "generate_trigger_plan",
]

STRATEGY_ID = "cross_symbol_momentum_rotational"
STRATEGY_NAME = "Cross-Symbol Momentum Rotational"
STRATEGY_VERSION = "1.0.0"
