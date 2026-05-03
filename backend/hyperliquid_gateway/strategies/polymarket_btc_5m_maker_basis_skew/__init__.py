"""
Polymarket BTC Up/Down 5m Maker Basis Skew Strategy
"""

from .logic import evaluate_maker_setup, passive_quote_price
from .paper import calculate_realized_pnl, estimate_maker_rebate_pct, paper_candidate
from .risk import allow_maker_entry
from .scoring import score_maker_setup

__all__ = [
    "allow_maker_entry",
    "calculate_realized_pnl",
    "estimate_maker_rebate_pct",
    "evaluate_maker_setup",
    "paper_candidate",
    "passive_quote_price",
    "score_maker_setup",
]

STRATEGY_ID = "polymarket_btc_5m_maker_basis_skew"
STRATEGY_NAME = "Polymarket BTC Up/Down 5m Maker Basis Skew"
STRATEGY_VERSION = "0.1.0"
