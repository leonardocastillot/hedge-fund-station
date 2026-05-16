from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from .engine import BacktestConfig, simulate_strategy
from .io import Candle, canonicalize_ohlcv_csv, dataset_metadata

try:
    from ..strategies.bb_squeeze_adx.backtest import build_signals as bb_squeeze_adx_build_signals
    from ..strategies.btc_asymmetric_vol_carry.backtest import run_backtest as btc_asymmetric_vol_carry_run_backtest
    from ..strategies.btc_asymmetric_vol_carry.paper import paper_candidate as btc_asymmetric_vol_carry_paper_candidate
    from ..strategies.btc_structural_market_alpha.backtest import run_backtest as btc_structural_market_alpha_run_backtest
    from ..strategies.btc_structural_market_alpha.paper import paper_candidate as btc_structural_market_alpha_paper_candidate
    from ..strategies.btc_multiframe_trend_ensemble.backtest import run_backtest as btc_multiframe_trend_ensemble_run_backtest
    from ..strategies.btc_trend_cascade.backtest import run_backtest as btc_trend_cascade_run_backtest
    from ..strategies.btc_trend_cascade.paper import paper_candidate as btc_trend_cascade_paper_candidate
    from ..strategies.btc_multiframe_trend_ensemble.paper import paper_candidate as btc_multiframe_trend_ensemble_paper_candidate
    from ..strategies.btc_regime_adaptive_confluence.backtest import run_backtest as btc_regime_adaptive_confluence_run_backtest
    from ..strategies.btc_regime_adaptive_confluence.paper import paper_candidate as btc_regime_adaptive_confluence_paper_candidate
    from ..strategies.btc_vol_atr_trend.backtest import run_backtest as btc_vol_atr_trend_run_backtest
    from ..strategies.btc_vol_atr_trend.paper import paper_candidate as btc_vol_atr_trend_paper_candidate
    from ..strategies.btc_dual_momentum_trend.backtest import run_backtest as btc_dual_momentum_trend_run_backtest
    from ..strategies.btc_dual_momentum_trend.paper import paper_candidate as btc_dual_momentum_trend_paper_candidate
    from ..strategies.btc_vol_dynamic_trail_trend.backtest import run_backtest as btc_vol_dynamic_trail_trend_run_backtest
    from ..strategies.btc_vol_dynamic_trail_trend.paper import paper_candidate as btc_vol_dynamic_trail_trend_paper_candidate
    from ..strategies.btc_vol_tight_trail_trend.backtest import run_backtest as btc_vol_tight_trail_trend_run_backtest
    from ..strategies.btc_vol_tight_trail_trend.paper import paper_candidate as btc_vol_tight_trail_trend_paper_candidate
    from ..strategies.btc_zscore_atr_trend.backtest import run_backtest as btc_zscore_atr_trend_run_backtest
    from ..strategies.btc_zscore_atr_trend.paper import paper_candidate as btc_zscore_atr_trend_paper_candidate
    from ..strategies.bb_squeeze_adx.logic import evaluate_latest_signal as bb_squeeze_adx_latest_signal
    from ..strategies.bb_squeeze_adx.paper import paper_candidate as bb_squeeze_adx_paper_candidate
    from ..strategies.hyperliquid_structural_alpha.backtest import run_backtest as hyperliquid_structural_alpha_run_backtest
    from ..strategies.hyperliquid_structural_alpha.paper import paper_candidate as hyperliquid_structural_alpha_paper_candidate
    from ..strategies.breakout_oi_confirmation.backtest import run_backtest as breakout_oi_confirmation_run_backtest
    from ..strategies.breakout_oi_confirmation.paper import paper_candidate as breakout_oi_confirmation_paper_candidate
    from ..strategies.btc_crowding_scalper.backtest import run_backtest as btc_crowding_scalper_run_backtest
    from ..strategies.btc_crowding_scalper.paper import paper_candidate as btc_crowding_scalper_paper_candidate
    from ..strategies.btc_adaptive_cycle_trend.backtest import run_backtest as btc_adaptive_cycle_trend_run_backtest
    from ..strategies.btc_adaptive_cycle_trend.paper import paper_candidate as btc_adaptive_cycle_trend_paper_candidate
    from ..strategies.btc_convex_cycle_trend.backtest import run_backtest as btc_convex_cycle_trend_run_backtest
    from ..strategies.btc_convex_cycle_trend.paper import paper_candidate as btc_convex_cycle_trend_paper_candidate
    from ..strategies.btc_guarded_cycle_trend.backtest import run_backtest as btc_guarded_cycle_trend_run_backtest
    from ..strategies.btc_guarded_cycle_trend.paper import paper_candidate as btc_guarded_cycle_trend_paper_candidate
    from ..strategies.btc_fee_aware_failed_impulse_scalp.backtest import run_backtest as btc_fee_aware_failed_impulse_scalp_run_backtest
    from ..strategies.btc_fee_aware_failed_impulse_scalp.paper import paper_candidate as btc_fee_aware_failed_impulse_scalp_paper_candidate
    from ..strategies.btc_failed_impulse_balanced_fast.backtest import run_backtest as btc_failed_impulse_balanced_fast_run_backtest
    from ..strategies.btc_failed_impulse_balanced_fast.paper import paper_candidate as btc_failed_impulse_balanced_fast_paper_candidate
    from ..strategies.btc_failed_impulse_reversal.backtest import run_backtest as btc_failed_impulse_reversal_run_backtest
    from ..strategies.btc_failed_impulse_reversal.paper import paper_candidate as btc_failed_impulse_reversal_paper_candidate
    from ..strategies.funding_exhaustion_snap.backtest import run_backtest as funding_exhaustion_snap_run_backtest
    from ..strategies.funding_exhaustion_snap.paper import paper_candidate as funding_exhaustion_snap_paper_candidate
    from ..strategies.long_flush_continuation.backtest import run_backtest as long_flush_continuation_run_backtest
    from ..strategies.long_flush_continuation.paper import paper_candidate as long_flush_continuation_paper_candidate
    from ..strategies.liquidation_pressure_flip_reversal.backtest import run_backtest as liquidation_pressure_flip_reversal_run_backtest
    from ..strategies.liquidation_pressure_flip_reversal.paper import paper_candidate as liquidation_pressure_flip_reversal_paper_candidate
    from ..strategies.oi_expansion_failure_fade.backtest import run_backtest as oi_expansion_failure_fade_run_backtest
    from ..strategies.oi_expansion_failure_fade.paper import paper_candidate as oi_expansion_failure_fade_paper_candidate
    from ..strategies.one_bitcoin.backtest import run_backtest as one_bitcoin_run_backtest
    from ..strategies.one_bitcoin.paper import paper_candidate as one_bitcoin_paper_candidate
    from ..strategies.polymarket_btc_5m_maker_basis_skew.backtest import run_backtest as polymarket_btc_5m_maker_basis_skew_run_backtest
    from ..strategies.polymarket_btc_5m_maker_basis_skew.paper import paper_candidate as polymarket_btc_5m_maker_basis_skew_paper_candidate
    from ..strategies.polymarket_btc_updown_5m_oracle_lag.backtest import run_backtest as polymarket_btc_updown_5m_oracle_lag_run_backtest
    from ..strategies.polymarket_btc_updown_5m_oracle_lag.paper import paper_candidate as polymarket_btc_updown_5m_oracle_lag_paper_candidate
    from ..strategies.short_squeeze_continuation.backtest import run_backtest as short_squeeze_continuation_run_backtest
    from ..strategies.short_squeeze_continuation.paper import paper_candidate as short_squeeze_continuation_paper_candidate
except ImportError:
    from strategies.bb_squeeze_adx.backtest import build_signals as bb_squeeze_adx_build_signals
    from strategies.btc_asymmetric_vol_carry.backtest import run_backtest as btc_asymmetric_vol_carry_run_backtest
    from strategies.btc_asymmetric_vol_carry.paper import paper_candidate as btc_asymmetric_vol_carry_paper_candidate
    from strategies.btc_structural_market_alpha.backtest import run_backtest as btc_structural_market_alpha_run_backtest
    from strategies.btc_structural_market_alpha.paper import paper_candidate as btc_structural_market_alpha_paper_candidate
    from strategies.btc_multiframe_trend_ensemble.backtest import run_backtest as btc_multiframe_trend_ensemble_run_backtest
    from strategies.btc_trend_cascade.backtest import run_backtest as btc_trend_cascade_run_backtest
    from strategies.btc_trend_cascade.paper import paper_candidate as btc_trend_cascade_paper_candidate
    from strategies.btc_multiframe_trend_ensemble.paper import paper_candidate as btc_multiframe_trend_ensemble_paper_candidate
    from strategies.btc_regime_adaptive_confluence.backtest import run_backtest as btc_regime_adaptive_confluence_run_backtest
    from strategies.btc_regime_adaptive_confluence.paper import paper_candidate as btc_regime_adaptive_confluence_paper_candidate
    from strategies.btc_vol_atr_trend.backtest import run_backtest as btc_vol_atr_trend_run_backtest
    from strategies.btc_vol_atr_trend.paper import paper_candidate as btc_vol_atr_trend_paper_candidate
    from strategies.btc_dual_momentum_trend.backtest import run_backtest as btc_dual_momentum_trend_run_backtest
    from strategies.btc_dual_momentum_trend.paper import paper_candidate as btc_dual_momentum_trend_paper_candidate
    from strategies.btc_vol_dynamic_trail_trend.backtest import run_backtest as btc_vol_dynamic_trail_trend_run_backtest
    from strategies.btc_vol_dynamic_trail_trend.paper import paper_candidate as btc_vol_dynamic_trail_trend_paper_candidate
    from strategies.btc_vol_tight_trail_trend.backtest import run_backtest as btc_vol_tight_trail_trend_run_backtest
    from strategies.btc_vol_tight_trail_trend.paper import paper_candidate as btc_vol_tight_trail_trend_paper_candidate
    from strategies.btc_zscore_atr_trend.backtest import run_backtest as btc_zscore_atr_trend_run_backtest
    from strategies.btc_zscore_atr_trend.paper import paper_candidate as btc_zscore_atr_trend_paper_candidate
    from strategies.bb_squeeze_adx.logic import evaluate_latest_signal as bb_squeeze_adx_latest_signal
    from strategies.bb_squeeze_adx.paper import paper_candidate as bb_squeeze_adx_paper_candidate
    from strategies.hyperliquid_structural_alpha.backtest import run_backtest as hyperliquid_structural_alpha_run_backtest
    from strategies.hyperliquid_structural_alpha.paper import paper_candidate as hyperliquid_structural_alpha_paper_candidate
    from strategies.breakout_oi_confirmation.backtest import run_backtest as breakout_oi_confirmation_run_backtest
    from strategies.breakout_oi_confirmation.paper import paper_candidate as breakout_oi_confirmation_paper_candidate
    from strategies.btc_crowding_scalper.backtest import run_backtest as btc_crowding_scalper_run_backtest
    from strategies.btc_crowding_scalper.paper import paper_candidate as btc_crowding_scalper_paper_candidate
    from strategies.btc_adaptive_cycle_trend.backtest import run_backtest as btc_adaptive_cycle_trend_run_backtest
    from strategies.btc_adaptive_cycle_trend.paper import paper_candidate as btc_adaptive_cycle_trend_paper_candidate
    from strategies.btc_convex_cycle_trend.backtest import run_backtest as btc_convex_cycle_trend_run_backtest
    from strategies.btc_convex_cycle_trend.paper import paper_candidate as btc_convex_cycle_trend_paper_candidate
    from strategies.btc_guarded_cycle_trend.backtest import run_backtest as btc_guarded_cycle_trend_run_backtest
    from strategies.btc_guarded_cycle_trend.paper import paper_candidate as btc_guarded_cycle_trend_paper_candidate
    from strategies.btc_fee_aware_failed_impulse_scalp.backtest import run_backtest as btc_fee_aware_failed_impulse_scalp_run_backtest
    from strategies.btc_fee_aware_failed_impulse_scalp.paper import paper_candidate as btc_fee_aware_failed_impulse_scalp_paper_candidate
    from strategies.btc_failed_impulse_balanced_fast.backtest import run_backtest as btc_failed_impulse_balanced_fast_run_backtest
    from strategies.btc_failed_impulse_balanced_fast.paper import paper_candidate as btc_failed_impulse_balanced_fast_paper_candidate
    from strategies.btc_failed_impulse_reversal.backtest import run_backtest as btc_failed_impulse_reversal_run_backtest
    from strategies.btc_failed_impulse_reversal.paper import paper_candidate as btc_failed_impulse_reversal_paper_candidate
    from strategies.funding_exhaustion_snap.backtest import run_backtest as funding_exhaustion_snap_run_backtest
    from strategies.funding_exhaustion_snap.paper import paper_candidate as funding_exhaustion_snap_paper_candidate
    from strategies.long_flush_continuation.backtest import run_backtest as long_flush_continuation_run_backtest
    from strategies.long_flush_continuation.paper import paper_candidate as long_flush_continuation_paper_candidate
    from strategies.liquidation_pressure_flip_reversal.backtest import run_backtest as liquidation_pressure_flip_reversal_run_backtest
    from strategies.liquidation_pressure_flip_reversal.paper import paper_candidate as liquidation_pressure_flip_reversal_paper_candidate
    from strategies.oi_expansion_failure_fade.backtest import run_backtest as oi_expansion_failure_fade_run_backtest
    from strategies.oi_expansion_failure_fade.paper import paper_candidate as oi_expansion_failure_fade_paper_candidate
    from strategies.one_bitcoin.backtest import run_backtest as one_bitcoin_run_backtest
    from strategies.one_bitcoin.paper import paper_candidate as one_bitcoin_paper_candidate
    from strategies.polymarket_btc_5m_maker_basis_skew.backtest import run_backtest as polymarket_btc_5m_maker_basis_skew_run_backtest
    from strategies.polymarket_btc_5m_maker_basis_skew.paper import paper_candidate as polymarket_btc_5m_maker_basis_skew_paper_candidate
    from strategies.polymarket_btc_updown_5m_oracle_lag.backtest import run_backtest as polymarket_btc_updown_5m_oracle_lag_run_backtest
    from strategies.polymarket_btc_updown_5m_oracle_lag.paper import paper_candidate as polymarket_btc_updown_5m_oracle_lag_paper_candidate
    from strategies.short_squeeze_continuation.backtest import run_backtest as short_squeeze_continuation_run_backtest
    from strategies.short_squeeze_continuation.paper import paper_candidate as short_squeeze_continuation_paper_candidate

PaperCandidateBuilder = Callable[[dict[str, Any]], dict[str, Any]]
BacktestRunner = Callable[[Path, BacktestConfig], dict[str, Any]]
DATA_ROOT = Path(os.getenv("HYPERLIQUID_DATA_ROOT", str(Path(__file__).resolve().parents[1] / "data"))).expanduser()
DEFAULT_GATEWAY_DB = DATA_ROOT / "hyperliquid.db"
DEFAULT_ONE_BITCOIN_DATASET = DATA_ROOT / "market_data" / "one_bitcoin_btc_usd_daily.json"
DEFAULT_BTC_DAILY_YAHOO_DATASET = DATA_ROOT / "market_data" / "btc_usd_daily_yahoo.json"


@dataclass(frozen=True)
class ValidationPolicy:
    min_trades: int = 1
    min_return_pct: float = 0.0
    min_profit_factor: float = 1.0
    min_win_rate_pct: float = 30.0
    max_drawdown_pct: float = 25.0


@dataclass(frozen=True)
class StrategyDefinition:
    strategy_id: str
    backtest_runner: BacktestRunner
    paper_candidate_builder: PaperCandidateBuilder
    validation_policy: ValidationPolicy = field(default_factory=ValidationPolicy)
    default_dataset: str | None = None
    dataset_label: str = "dataset"


def _run_bb_squeeze_adx_backtest(dataset_path: Path, config: BacktestConfig) -> dict[str, Any]:
    candles = canonicalize_ohlcv_csv(dataset_path)
    indicators = bb_squeeze_adx_build_signals(candles)
    result = simulate_strategy(
        strategy_id="bb_squeeze_adx",
        candles=candles,
        indicators=indicators,
        config=config,
    )
    return {
        "dataset": dataset_metadata(candles, dataset_path),
        "summary": result["summary"],
        "latest_signal": bb_squeeze_adx_latest_signal(candles),
        "trades": result["trades"],
        "equity_curve": result["equity_curve"],
        "notes": [
            "Donor-compatible OHLCV baseline backtest.",
            "No slippage model yet; fees only.",
        ],
    }


STRATEGY_REGISTRY: dict[str, StrategyDefinition] = {
    "bb_squeeze_adx": StrategyDefinition(
        strategy_id="bb_squeeze_adx",
        backtest_runner=_run_bb_squeeze_adx_backtest,
        paper_candidate_builder=bb_squeeze_adx_paper_candidate,
        validation_policy=ValidationPolicy(
            min_trades=3,
            min_return_pct=0.5,
            min_profit_factor=1.05,
            min_win_rate_pct=30.0,
            max_drawdown_pct=20.0,
        ),
        default_dataset=r"C:\Users\leonard\Documents\trading-harvard\Harvard-Algorithmic-Trading-with-AI\backtest\data\BTC-6h-1000wks-data.csv",
        dataset_label="ohlcv_csv",
    ),
    "btc_asymmetric_vol_carry": StrategyDefinition(
        strategy_id="btc_asymmetric_vol_carry",
        backtest_runner=btc_asymmetric_vol_carry_run_backtest,
        paper_candidate_builder=btc_asymmetric_vol_carry_paper_candidate,
        validation_policy=ValidationPolicy(
            min_trades=15,
            min_return_pct=116.0,
            min_profit_factor=1.8,
            min_win_rate_pct=35.0,
            max_drawdown_pct=22.0,
        ),
        default_dataset=str(Path(__file__).resolve().parents[1] / "data" / "market_data" / "btc_usd_daily_yahoo.json"),
        dataset_label="btc_usd_daily",
    ),
    "btc_vol_atr_trend": StrategyDefinition(
        strategy_id="btc_vol_atr_trend",
        backtest_runner=btc_vol_atr_trend_run_backtest,
        paper_candidate_builder=btc_vol_atr_trend_paper_candidate,
        validation_policy=ValidationPolicy(
            min_trades=8,
            min_return_pct=116.0,
            min_profit_factor=3.0,
            min_win_rate_pct=45.0,
            max_drawdown_pct=18.0,
        ),
        default_dataset=str(DEFAULT_BTC_DAILY_YAHOO_DATASET),
        dataset_label="btc_usd_daily",
    ),
    "btc_zscore_atr_trend": StrategyDefinition(
        strategy_id="btc_zscore_atr_trend",
        backtest_runner=btc_zscore_atr_trend_run_backtest,
        paper_candidate_builder=btc_zscore_atr_trend_paper_candidate,
        validation_policy=ValidationPolicy(
            min_trades=8,
            min_return_pct=163.0,
            min_profit_factor=4.0,
            min_win_rate_pct=40.0,
            max_drawdown_pct=18.0,
        ),
        default_dataset=str(DEFAULT_BTC_DAILY_YAHOO_DATASET),
        dataset_label="btc_usd_daily",
    ),
    "hyperliquid_structural_alpha": StrategyDefinition(
        strategy_id="hyperliquid_structural_alpha",
        backtest_runner=hyperliquid_structural_alpha_run_backtest,
        paper_candidate_builder=hyperliquid_structural_alpha_paper_candidate,
        validation_policy=ValidationPolicy(
            min_trades=15,
            min_return_pct=0.15,
            min_profit_factor=1.15,
            min_win_rate_pct=40.0,
            max_drawdown_pct=8.0,
        ),
        default_dataset=str(DEFAULT_GATEWAY_DB),
        dataset_label="gateway_snapshot_db",
    ),
    "breakout_oi_confirmation": StrategyDefinition(
        strategy_id="breakout_oi_confirmation",
        backtest_runner=breakout_oi_confirmation_run_backtest,
        paper_candidate_builder=breakout_oi_confirmation_paper_candidate,
        validation_policy=ValidationPolicy(
            min_trades=20,
            min_return_pct=0.15,
            min_profit_factor=1.15,
            min_win_rate_pct=40.0,
            max_drawdown_pct=6.0,
        ),
        default_dataset=str(DEFAULT_GATEWAY_DB),
        dataset_label="gateway_snapshot_db",
    ),
    "funding_exhaustion_snap": StrategyDefinition(
        strategy_id="funding_exhaustion_snap",
        backtest_runner=funding_exhaustion_snap_run_backtest,
        paper_candidate_builder=funding_exhaustion_snap_paper_candidate,
        validation_policy=ValidationPolicy(
            min_trades=8,
            min_return_pct=0.25,
            min_profit_factor=1.1,
            min_win_rate_pct=35.0,
            max_drawdown_pct=8.0,
        ),
        default_dataset=str(DEFAULT_GATEWAY_DB),
        dataset_label="gateway_snapshot_db",
    ),
    "btc_crowding_scalper": StrategyDefinition(
        strategy_id="btc_crowding_scalper",
        backtest_runner=btc_crowding_scalper_run_backtest,
        paper_candidate_builder=btc_crowding_scalper_paper_candidate,
        validation_policy=ValidationPolicy(
            min_trades=60,
            min_return_pct=0.0,
            min_profit_factor=1.30,
            min_win_rate_pct=40.0,
            max_drawdown_pct=3.5,
        ),
        default_dataset=str(DEFAULT_GATEWAY_DB),
        dataset_label="gateway_snapshot_db",
    ),
    "btc_adaptive_cycle_trend": StrategyDefinition(
        strategy_id="btc_adaptive_cycle_trend",
        backtest_runner=btc_adaptive_cycle_trend_run_backtest,
        paper_candidate_builder=btc_adaptive_cycle_trend_paper_candidate,
        validation_policy=ValidationPolicy(
            min_trades=10,
            min_return_pct=90.0,
            min_profit_factor=2.0,
            min_win_rate_pct=40.0,
            max_drawdown_pct=20.0,
        ),
        default_dataset=str(DEFAULT_BTC_DAILY_YAHOO_DATASET),
        dataset_label="btc_usd_daily",
    ),
    "btc_convex_cycle_trend": StrategyDefinition(
        strategy_id="btc_convex_cycle_trend",
        backtest_runner=btc_convex_cycle_trend_run_backtest,
        paper_candidate_builder=btc_convex_cycle_trend_paper_candidate,
        validation_policy=ValidationPolicy(
            min_trades=10,
            min_return_pct=95.0,
            min_profit_factor=2.0,
            min_win_rate_pct=40.0,
            max_drawdown_pct=20.0,
        ),
        default_dataset=str(DEFAULT_BTC_DAILY_YAHOO_DATASET),
        dataset_label="btc_usd_daily",
    ),
    "btc_dual_momentum_trend": StrategyDefinition(
        strategy_id="btc_dual_momentum_trend",
        backtest_runner=btc_dual_momentum_trend_run_backtest,
        paper_candidate_builder=btc_dual_momentum_trend_paper_candidate,
        validation_policy=ValidationPolicy(
            min_trades=8,
            min_return_pct=162.3,
            min_profit_factor=2.0,
            min_win_rate_pct=40.0,
            max_drawdown_pct=18.0,
        ),
        default_dataset=str(DEFAULT_BTC_DAILY_YAHOO_DATASET),
        dataset_label="btc_usd_daily",
    ),
    "btc_regime_adaptive_confluence": StrategyDefinition(
        strategy_id="btc_regime_adaptive_confluence",
        backtest_runner=btc_regime_adaptive_confluence_run_backtest,
        paper_candidate_builder=btc_regime_adaptive_confluence_paper_candidate,
        validation_policy=ValidationPolicy(
            min_trades=8,
            min_return_pct=180.25,
            min_profit_factor=2.0,
            min_win_rate_pct=40.0,
            max_drawdown_pct=20.0,
        ),
        default_dataset=str(DEFAULT_BTC_DAILY_YAHOO_DATASET),
        dataset_label="btc_usd_daily",
    ),
    "btc_trend_cascade": StrategyDefinition(
        strategy_id="btc_trend_cascade",
        backtest_runner=btc_trend_cascade_run_backtest,
        paper_candidate_builder=btc_trend_cascade_paper_candidate,
        validation_policy=ValidationPolicy(
            min_trades=8,
            min_return_pct=263.78,
            min_profit_factor=2.0,
            min_win_rate_pct=35.0,
            max_drawdown_pct=22.0,
        ),
        default_dataset=str(DEFAULT_BTC_DAILY_YAHOO_DATASET),
        dataset_label="btc_usd_daily",
    ),
    "btc_structural_market_alpha": StrategyDefinition(
        strategy_id="btc_structural_market_alpha",
        backtest_runner=btc_structural_market_alpha_run_backtest,
        paper_candidate_builder=btc_structural_market_alpha_paper_candidate,
        validation_policy=ValidationPolicy(
            min_trades=8,
            min_return_pct=180.0,
            min_profit_factor=2.0,
            min_win_rate_pct=40.0,
            max_drawdown_pct=22.0,
        ),
        default_dataset=str(DEFAULT_BTC_DAILY_YAHOO_DATASET),
        dataset_label="btc_usd_daily",
    ),
    "btc_multiframe_trend_ensemble": StrategyDefinition(
        strategy_id="btc_multiframe_trend_ensemble",
        backtest_runner=btc_multiframe_trend_ensemble_run_backtest,
        paper_candidate_builder=btc_multiframe_trend_ensemble_paper_candidate,
        validation_policy=ValidationPolicy(
            min_trades=8,
            min_return_pct=180.0,
            min_profit_factor=2.0,
            min_win_rate_pct=40.0,
            max_drawdown_pct=22.0,
        ),
        default_dataset=str(DEFAULT_BTC_DAILY_YAHOO_DATASET),
        dataset_label="btc_usd_daily",
    ),
    "btc_vol_dynamic_trail_trend": StrategyDefinition(
        strategy_id="btc_vol_dynamic_trail_trend",
        backtest_runner=btc_vol_dynamic_trail_trend_run_backtest,
        paper_candidate_builder=btc_vol_dynamic_trail_trend_paper_candidate,
        validation_policy=ValidationPolicy(
            min_trades=8,
            min_return_pct=162.3,
            min_profit_factor=2.0,
            min_win_rate_pct=40.0,
            max_drawdown_pct=18.0,
        ),
        default_dataset=str(DEFAULT_BTC_DAILY_YAHOO_DATASET),
        dataset_label="btc_usd_daily",
    ),
    "btc_vol_tight_trail_trend": StrategyDefinition(
        strategy_id="btc_vol_tight_trail_trend",
        backtest_runner=btc_vol_tight_trail_trend_run_backtest,
        paper_candidate_builder=btc_vol_tight_trail_trend_paper_candidate,
        validation_policy=ValidationPolicy(
            min_trades=8,
            min_return_pct=162.3,
            min_profit_factor=2.0,
            min_win_rate_pct=40.0,
            max_drawdown_pct=18.0,
        ),
        default_dataset=str(DEFAULT_BTC_DAILY_YAHOO_DATASET),
        dataset_label="btc_usd_daily",
    ),
    "btc_guarded_cycle_trend": StrategyDefinition(
        strategy_id="btc_guarded_cycle_trend",
        backtest_runner=btc_guarded_cycle_trend_run_backtest,
        paper_candidate_builder=btc_guarded_cycle_trend_paper_candidate,
        validation_policy=ValidationPolicy(
            min_trades=10,
            min_return_pct=50.0,
            min_profit_factor=2.0,
            min_win_rate_pct=40.0,
            max_drawdown_pct=25.0,
        ),
        default_dataset=str(DEFAULT_BTC_DAILY_YAHOO_DATASET),
        dataset_label="btc_usd_daily",
    ),
    "btc_fee_aware_failed_impulse_scalp": StrategyDefinition(
        strategy_id="btc_fee_aware_failed_impulse_scalp",
        backtest_runner=btc_fee_aware_failed_impulse_scalp_run_backtest,
        paper_candidate_builder=btc_fee_aware_failed_impulse_scalp_paper_candidate,
        validation_policy=ValidationPolicy(
            min_trades=60,
            min_return_pct=0.0,
            min_profit_factor=1.30,
            min_win_rate_pct=40.0,
            max_drawdown_pct=3.5,
        ),
        default_dataset=str(DEFAULT_GATEWAY_DB),
        dataset_label="gateway_snapshot_db",
    ),
    "btc_failed_impulse_reversal": StrategyDefinition(
        strategy_id="btc_failed_impulse_reversal",
        backtest_runner=btc_failed_impulse_reversal_run_backtest,
        paper_candidate_builder=btc_failed_impulse_reversal_paper_candidate,
        validation_policy=ValidationPolicy(
            min_trades=8,
            min_return_pct=0.50,
            min_profit_factor=1.50,
            min_win_rate_pct=55.0,
            max_drawdown_pct=4.0,
        ),
        default_dataset=str(DEFAULT_GATEWAY_DB),
        dataset_label="gateway_snapshot_db",
    ),
    "btc_failed_impulse_balanced_fast": StrategyDefinition(
        strategy_id="btc_failed_impulse_balanced_fast",
        backtest_runner=btc_failed_impulse_balanced_fast_run_backtest,
        paper_candidate_builder=btc_failed_impulse_balanced_fast_paper_candidate,
        validation_policy=ValidationPolicy(
            min_trades=8,
            min_return_pct=0.25,
            min_profit_factor=1.50,
            min_win_rate_pct=50.0,
            max_drawdown_pct=4.0,
        ),
        default_dataset=str(DEFAULT_GATEWAY_DB),
        dataset_label="gateway_snapshot_db",
    ),
    "one_bitcoin": StrategyDefinition(
        strategy_id="one_bitcoin",
        backtest_runner=one_bitcoin_run_backtest,
        paper_candidate_builder=one_bitcoin_paper_candidate,
        validation_policy=ValidationPolicy(
            min_trades=1,
            min_return_pct=-100.0,
            min_profit_factor=0.0,
            min_win_rate_pct=0.0,
            max_drawdown_pct=1_000.0,
        ),
        default_dataset=str(DEFAULT_ONE_BITCOIN_DATASET),
        dataset_label="btc_usd_daily",
    ),
    "oi_expansion_failure_fade": StrategyDefinition(
        strategy_id="oi_expansion_failure_fade",
        backtest_runner=oi_expansion_failure_fade_run_backtest,
        paper_candidate_builder=oi_expansion_failure_fade_paper_candidate,
        validation_policy=ValidationPolicy(
            min_trades=30,
            min_return_pct=0.10,
            min_profit_factor=1.20,
            min_win_rate_pct=42.0,
            max_drawdown_pct=5.0,
        ),
        default_dataset=str(DEFAULT_GATEWAY_DB),
        dataset_label="gateway_snapshot_db",
    ),
    "long_flush_continuation": StrategyDefinition(
        strategy_id="long_flush_continuation",
        backtest_runner=long_flush_continuation_run_backtest,
        paper_candidate_builder=long_flush_continuation_paper_candidate,
        validation_policy=ValidationPolicy(
            min_trades=5,
            min_return_pct=0.1,
            min_profit_factor=1.02,
            min_win_rate_pct=35.0,
            max_drawdown_pct=8.0,
        ),
        default_dataset=str(DEFAULT_GATEWAY_DB),
        dataset_label="gateway_snapshot_db",
    ),
    "liquidation_pressure_flip_reversal": StrategyDefinition(
        strategy_id="liquidation_pressure_flip_reversal",
        backtest_runner=liquidation_pressure_flip_reversal_run_backtest,
        paper_candidate_builder=liquidation_pressure_flip_reversal_paper_candidate,
        validation_policy=ValidationPolicy(
            min_trades=15,
            min_return_pct=0.10,
            min_profit_factor=1.20,
            min_win_rate_pct=42.0,
            max_drawdown_pct=5.5,
        ),
        default_dataset=str(DEFAULT_GATEWAY_DB),
        dataset_label="gateway_snapshot_db",
    ),
    "polymarket_btc_updown_5m_oracle_lag": StrategyDefinition(
        strategy_id="polymarket_btc_updown_5m_oracle_lag",
        backtest_runner=polymarket_btc_updown_5m_oracle_lag_run_backtest,
        paper_candidate_builder=polymarket_btc_updown_5m_oracle_lag_paper_candidate,
        validation_policy=ValidationPolicy(
            min_trades=3,
            min_return_pct=0.1,
            min_profit_factor=1.05,
            min_win_rate_pct=45.0,
            max_drawdown_pct=6.0,
        ),
        default_dataset=str(DEFAULT_GATEWAY_DB),
        dataset_label="polymarket_snapshot_db",
    ),
    "polymarket_btc_5m_maker_basis_skew": StrategyDefinition(
        strategy_id="polymarket_btc_5m_maker_basis_skew",
        backtest_runner=polymarket_btc_5m_maker_basis_skew_run_backtest,
        paper_candidate_builder=polymarket_btc_5m_maker_basis_skew_paper_candidate,
        validation_policy=ValidationPolicy(
            min_trades=2,
            min_return_pct=0.1,
            min_profit_factor=1.05,
            min_win_rate_pct=50.0,
            max_drawdown_pct=4.0,
        ),
        default_dataset=str(DEFAULT_GATEWAY_DB),
        dataset_label="polymarket_snapshot_db",
    ),
    "short_squeeze_continuation": StrategyDefinition(
        strategy_id="short_squeeze_continuation",
        backtest_runner=short_squeeze_continuation_run_backtest,
        paper_candidate_builder=short_squeeze_continuation_paper_candidate,
        validation_policy=ValidationPolicy(
            min_trades=5,
            min_return_pct=0.1,
            min_profit_factor=1.02,
            min_win_rate_pct=35.0,
            max_drawdown_pct=8.0,
        ),
        default_dataset=str(DEFAULT_GATEWAY_DB),
        dataset_label="gateway_snapshot_db",
    ),
}


def available_strategies() -> list[str]:
    return sorted(STRATEGY_REGISTRY.keys())


def discover_strategy_packages(strategies_root: Path | None = None) -> list[str]:
    root = strategies_root or Path(__file__).resolve().parents[1] / "strategies"
    if not root.exists():
        return []

    packages: list[str] = []
    for path in root.iterdir():
        if not path.is_dir():
            continue
        if path.name.startswith("__"):
            continue
        if (path / "logic.py").exists():
            packages.append(path.name)
    return sorted(packages)


def get_strategy_definition(strategy_id: str) -> StrategyDefinition:
    try:
        return STRATEGY_REGISTRY[strategy_id]
    except KeyError as exc:
        raise ValueError(f"Unsupported strategy: {strategy_id}") from exc


def resolve_default_dataset(strategy_id: str) -> Path:
    definition = get_strategy_definition(strategy_id)
    if not definition.default_dataset:
        raise ValueError(f"Strategy {strategy_id} does not define a default dataset.")
    return Path(definition.default_dataset)


def run_registered_backtest(
    strategy_id: str,
    dataset_path: Path,
    config: BacktestConfig | None = None,
) -> dict[str, Any]:
    definition = get_strategy_definition(strategy_id)
    return definition.backtest_runner(dataset_path, config or BacktestConfig())
