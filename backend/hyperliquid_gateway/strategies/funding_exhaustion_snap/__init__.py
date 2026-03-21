"""
Funding Exhaustion Snap Strategy

Mean reversion strategy exploiting funding rate extremes with momentum exhaustion.
"""

from .logic import evaluate_signal, calculate_funding_percentile, calculate_momentum_score
from .scoring import score_setup, rank_symbols, get_top_opportunities
from .risk import check_invalidation, calculate_position_size, check_session_killswitch
from .paper import (
    paper_candidate,
    simulate_entry_execution,
    simulate_exit_execution,
    calculate_paper_pnl,
    generate_paper_trade_thesis,
    generate_invalidation_plan,
    generate_trigger_plan
)

__all__ = [
    # Logic
    "evaluate_signal",
    "calculate_funding_percentile",
    "calculate_momentum_score",
    # Scoring
    "score_setup",
    "rank_symbols",
    "get_top_opportunities",
    # Risk
    "check_invalidation",
    "calculate_position_size",
    "check_session_killswitch",
    # Paper
    "paper_candidate",
    "simulate_entry_execution",
    "simulate_exit_execution",
    "calculate_paper_pnl",
    "generate_paper_trade_thesis",
    "generate_invalidation_plan",
    "generate_trigger_plan",
]

STRATEGY_ID = "funding_exhaustion_snap"
STRATEGY_NAME = "Funding Exhaustion Snap"
STRATEGY_VERSION = "1.0.0"
