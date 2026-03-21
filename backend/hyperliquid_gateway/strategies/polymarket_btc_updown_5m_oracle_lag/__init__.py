"""
Polymarket BTC Up/Down 5m Oracle Lag Strategy
"""

from .logic import (
    apply_signal_confirmation,
    evaluate_signal,
    implied_edge_pct,
    model_probability_from_basis,
    side_entry_price,
)
from .paper import calculate_realized_pnl, estimate_fee_pct, paper_candidate, session_roi
from .risk import calculate_position_size, check_session_killswitch, entry_allowed
from .scoring import rank_candidates, score_setup

__all__ = [
    "calculate_position_size",
    "calculate_realized_pnl",
    "check_session_killswitch",
    "entry_allowed",
    "estimate_fee_pct",
    "apply_signal_confirmation",
    "evaluate_signal",
    "implied_edge_pct",
    "model_probability_from_basis",
    "side_entry_price",
    "rank_candidates",
    "score_setup",
    "paper_candidate",
    "session_roi",
]

STRATEGY_ID = "polymarket_btc_updown_5m_oracle_lag"
STRATEGY_NAME = "Polymarket BTC Up/Down 5m Oracle Lag"
STRATEGY_VERSION = "0.1.0"
