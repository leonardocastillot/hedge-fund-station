from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from backend.hyperliquid_gateway.backtesting.engine import BacktestConfig
from backend.hyperliquid_gateway.backtesting.registry import available_strategies
from backend.hyperliquid_gateway.strategies.btc_fee_aware_failed_impulse_scalp.backtest import (
    build_btc_hold_benchmark,
    load_sampled_snapshots,
    maybe_close_position,
    run_backtest,
    run_backtest_with_params,
)
from backend.hyperliquid_gateway.strategies.btc_fee_aware_failed_impulse_scalp.logic import evaluate_signal
from backend.hyperliquid_gateway.strategies.btc_fee_aware_failed_impulse_scalp.paper import paper_candidate
from backend.hyperliquid_gateway.strategies.btc_fee_aware_failed_impulse_scalp.risk import build_risk_plan, calculate_position_size
from backend.hyperliquid_gateway.strategies.btc_fee_aware_failed_impulse_scalp.scoring import score_setup


class BtcFeeAwareFailedImpulseScalpTest(unittest.TestCase):
    def test_evaluate_signal_requires_btc_fee_edge_and_trapped_context(self) -> None:
        long_signal = evaluate_signal(
            base_market_data(
                change1h=-0.36,
                change15m=-0.02,
                change5m=0.01,
                fundingPercentile=35.0,
                crowdingBias="shorts-at-risk",
                setupScores={"fade": 66, "shortSqueeze": 72, "longFlush": 30, "breakoutContinuation": 40},
            )
        )
        short_signal = evaluate_signal(
            base_market_data(
                change1h=0.38,
                change15m=0.01,
                change5m=-0.01,
                fundingPercentile=72.0,
                crowdingBias="longs-at-risk",
                setupScores={"fade": 66, "shortSqueeze": 30, "longFlush": 72, "breakoutContinuation": 35},
            )
        )
        weak_fee = evaluate_signal(base_market_data(change1h=-0.36, change15m=-0.02), params={"take_profit_pct": 0.30})
        wrong_symbol = evaluate_signal(base_market_data(symbol="ETH", change1h=-0.36, change15m=-0.02))

        self.assertEqual(long_signal["signal"], "long")
        self.assertEqual(short_signal["signal"], "short")
        self.assertEqual(weak_fee["signal"], "none")
        self.assertIn("target_clears_taker_fee_floor", weak_fee["filters_failed"])
        self.assertEqual(wrong_symbol["signal"], "none")

    def test_score_setup_rewards_liquidity_oi_and_fee_edge(self) -> None:
        strong = base_market_data(
            change1h=-0.42,
            change15m=-0.01,
            openInterestDelta1hPct=0.8,
            volume24h=3_500_000_000,
            opportunityScore=80,
            crowdingBias="shorts-at-risk",
            setupScores={"fade": 70, "shortSqueeze": 72, "longFlush": 30, "breakoutContinuation": 40},
        )
        weak = base_market_data(
            change1h=-0.42,
            change15m=-0.05,
            openInterestDelta1hPct=-0.05,
            volume24h=600_000_000,
            opportunityScore=40,
            crowdingBias="balanced",
            setupScores={"fade": 20, "shortSqueeze": 20, "longFlush": 20, "breakoutContinuation": 20},
        )

        strong_score = score_setup(strong, evaluate_signal(strong))
        weak_score = score_setup(weak, evaluate_signal(weak))

        self.assertGreater(strong_score["execution_quality"], weak_score["execution_quality"])
        self.assertGreater(strong_score["rank_score"], weak_score["rank_score"])

    def test_risk_plan_and_no_progress_exit(self) -> None:
        risk = build_risk_plan({"price": 100.0, "side": "long"}, side="long")
        self.assertEqual(risk["stop_loss_pct"], 0.45)
        self.assertEqual(risk["take_profit_pct"], 0.90)
        self.assertEqual(risk["no_progress_minutes"], 20)

        blocked = calculate_position_size(
            portfolio_value=100_000,
            market_data=base_market_data(executionQuality=80),
            current_positions=[{"symbol": "BTC"}],
            signal_eval={"signal": "long"},
        )
        self.assertEqual(blocked["block_reason"], "max_one_open_position")

        position = {
            "strategy_id": "btc_fee_aware_failed_impulse_scalp",
            "symbol": "BTC",
            "side": "long",
            "createdAt": 0,
            "entry_timestamp": "2026-05-05T00:00:00Z",
            "entry_price": 100.0,
            "size_usd": 1000.0,
            "entry_fee": 0.45,
            "entry_fee_rate": 0.00045,
            "entry_liquidity_role": "taker",
            "stop_loss": 99.55,
            "take_profit": 100.9,
            "risk_plan": risk,
            "entry_context": {},
        }
        no_progress = maybe_close_position(
            position,
            {
                "timestamp": "2026-05-05T00:20:00Z",
                "timestamp_ms": 1_200_000,
                "price": 100.05,
                "executionQuality": 80,
                "change15m": 0.01,
            },
            BacktestConfig(),
        )

        self.assertIsNotNone(no_progress)
        self.assertEqual(no_progress["exit_reason"], "no_progress")

    def test_loader_defaults_to_btc(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "hyperliquid.db"
            create_market_db(db_path)
            insert_snapshot(db_path, 1, 1_000_000_000_000, "BTC", 100.0)
            insert_snapshot(db_path, 2, 1_000_000_000_000, "ETH", 100.0)

            rows, replay_filter = load_sampled_snapshots(db_path, BacktestConfig())

        self.assertTrue(replay_filter["default_symbols_applied"])
        self.assertEqual(replay_filter["requested_symbols"], ["BTC"])
        self.assertEqual({row["symbol"] for row in rows}, {"BTC"})

    def test_synthetic_backtest_records_btc_hold_benchmark_and_variants(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "hyperliquid.db"
            create_market_db(db_path)
            base_ts = 1_000_000_000_000
            prices = [
                100.0,
                100.0,
                100.0,
                100.0,
                100.0,
                100.0,
                100.0,
                100.0,
                99.68,
                99.68,
                99.67,
                99.66,
                99.65,
                100.8,
                101.1,
            ]
            for index, price in enumerate(prices, start=1):
                insert_snapshot(db_path, index, base_ts + ((index - 1) * 300_000), "BTC", price)

            result = run_backtest(db_path, BacktestConfig(symbols=("BTC",), risk_fraction=0.10))
            mixed = run_backtest_with_params(
                db_path,
                BacktestConfig(symbols=("BTC",), risk_fraction=0.10, fee_model="mixed", maker_ratio=0.60),
                params={"take_profit_pct": 0.75, "max_hold_minutes": 45},
                variant_id="mixed_fee_test",
            )

        self.assertEqual(result["summary"]["total_trades"], 1)
        self.assertEqual(result["trades"][0]["side"], "long")
        self.assertEqual(result["trades"][0]["exit_reason"], "take_profit")
        self.assertIn("btc_hold_return_pct", result)
        self.assertIn("excess_vs_btc_hold_pct", result)
        self.assertIn("benchmark_window", result)
        self.assertEqual(result["summary"]["btc_hold_return_pct"], result["btc_hold_return_pct"])
        self.assertEqual(len(result["variant_leaderboard"]), 27)
        self.assertEqual(mixed["trades"][0]["entry_liquidity_role"], "mixed")
        self.assertEqual(mixed["variant"]["variant_id"], "mixed_fee_test")

    def test_btc_hold_benchmark_handles_sparse_rows(self) -> None:
        benchmark = build_btc_hold_benchmark(
            [
                {"symbol": "ETH", "price": 100.0, "timestamp": "a"},
                {"symbol": "BTC", "price": 100.0, "timestamp": "start"},
                {"symbol": "BTC", "price": 102.0, "timestamp": "end"},
            ]
        )

        self.assertEqual(benchmark["btc_hold_return_pct"], 2.0)
        self.assertEqual(benchmark["benchmark_window"]["rows"], 2)

    def test_paper_candidate_blocks_until_validation_ready(self) -> None:
        blocked = paper_candidate(
            {
                "latest_signal": {"signal": "long", "symbol": "BTC"},
                "report_summary": {"return_pct": 1.0, "excess_vs_btc_hold_pct": 0.5},
                "validation": {"status": "blocked", "blocking_reasons": ["robust_gate"]},
            }
        )
        ready = paper_candidate(
            {
                "latest_signal": {"signal": "short", "symbol": "BTC"},
                "report_summary": {"return_pct": 1.0, "excess_vs_btc_hold_pct": 0.5},
                "validation": {"status": "ready-for-paper", "blocking_reasons": []},
            }
        )

        self.assertEqual(blocked["status"], "standby")
        self.assertEqual(blocked["promotion_gate"], "blocked-by-validation")
        self.assertEqual(ready["status"], "candidate")
        self.assertEqual(ready["promotion_gate"], "eligible-for-paper-review")

    def test_registry_exposes_strategy(self) -> None:
        self.assertIn("btc_fee_aware_failed_impulse_scalp", available_strategies())


def base_market_data(**overrides: object) -> dict[str, object]:
    data: dict[str, object] = {
        "timestamp": "2026-05-06T00:00:00Z",
        "timestamp_ms": 1_000_000_000_000,
        "symbol": "BTC",
        "price": 100.0,
        "fundingRate": -0.00001,
        "fundingPercentile": 35.0,
        "change5m": 0.0,
        "change15m": -0.02,
        "change1h": -0.36,
        "change4h": -0.5,
        "openInterestDelta1hPct": 0.25,
        "openInterestUsd": 2_500_000_000,
        "volume24h": 3_000_000_000,
        "opportunityScore": 70,
        "crowdingBias": "shorts-at-risk",
        "primarySetup": "fade",
        "setupScores": {"fade": 66, "longFlush": 45, "shortSqueeze": 72, "breakoutContinuation": 40},
        "executionQuality": 80,
    }
    data.update(overrides)
    return data


def create_market_db(db_path: Path) -> None:
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            """
            CREATE TABLE market_snapshots (
                id INTEGER PRIMARY KEY,
                timestamp_ms INTEGER NOT NULL,
                symbol TEXT NOT NULL,
                price REAL,
                change24h_pct REAL,
                open_interest_usd REAL,
                volume24h REAL,
                funding_rate REAL,
                opportunity_score REAL,
                signal_label TEXT,
                risk_label TEXT,
                estimated_total_liquidation_usd REAL,
                crowding_bias TEXT,
                primary_setup TEXT,
                setup_scores_json TEXT
            )
            """
        )


def insert_snapshot(db_path: Path, row_id: int, timestamp_ms: int, symbol: str, price: float) -> None:
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            """
            INSERT INTO market_snapshots (
                id, timestamp_ms, symbol, price, change24h_pct, open_interest_usd,
                volume24h, funding_rate, opportunity_score, signal_label, risk_label,
                estimated_total_liquidation_usd, crowding_bias, primary_setup, setup_scores_json
            )
            VALUES (?, ?, ?, ?, 0.0, 2500000000.0, 3000000000.0, -0.00001, 70.0,
                    'neutral', 'normal', 0.0, 'shorts-at-risk', 'fade', ?)
            """,
            (
                row_id,
                timestamp_ms,
                symbol,
                price,
                json.dumps({"fade": 66, "longFlush": 45, "shortSqueeze": 72, "breakoutContinuation": 40}),
            ),
        )


if __name__ == "__main__":
    unittest.main()
