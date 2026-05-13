from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from backend.hyperliquid_gateway.backtesting.engine import BacktestConfig
from backend.hyperliquid_gateway.backtesting.registry import available_strategies
from backend.hyperliquid_gateway.strategies.liquidation_pressure_flip_reversal.backtest import run_backtest
from backend.hyperliquid_gateway.strategies.liquidation_pressure_flip_reversal.logic import evaluate_signal
from backend.hyperliquid_gateway.strategies.liquidation_pressure_flip_reversal.paper import paper_candidate
from backend.hyperliquid_gateway.strategies.liquidation_pressure_flip_reversal.risk import build_risk_plan, calculate_position_size
from backend.hyperliquid_gateway.strategies.liquidation_pressure_flip_reversal.scoring import score_setup


class LiquidationPressureFlipReversalTest(unittest.TestCase):
    def test_evaluate_signal_long_short_and_no_trade(self) -> None:
        long_signal = evaluate_signal(base_market_data(change1h=-0.55, change15m=-0.05, change5m=0.01, crowdingBias="longs-at-risk"))
        self.assertEqual(long_signal["signal"], "long")

        short_signal = evaluate_signal(
            base_market_data(
                change1h=0.55,
                change15m=0.05,
                change5m=-0.01,
                crowdingBias="shorts-at-risk",
                setupScores={"fade": 72, "longFlush": 10, "shortSqueeze": 78, "breakoutContinuation": 25},
            )
        )
        self.assertEqual(short_signal["signal"], "short")

        no_pressure = evaluate_signal(base_market_data(estimatedTotalLiquidationUsd=50_000, crowdingBias="balanced"))
        self.assertEqual(no_pressure["signal"], "none")

    def test_score_setup_rewards_pressure_and_stall(self) -> None:
        good_market = base_market_data(volume24h=350_000_000, openInterestUsd=300_000_000)
        weak_market = base_market_data(volume24h=1_000_000, openInterestUsd=500_000, estimatedTotalLiquidationUsd=100_000)

        good_score = score_setup(good_market, evaluate_signal(good_market))
        weak_score = score_setup(weak_market, evaluate_signal(weak_market))

        self.assertGreater(good_score["execution_quality"], weak_score["execution_quality"])
        self.assertGreater(good_score["rank_score"], weak_score["rank_score"])
        self.assertEqual(good_score["signal_direction"], "long")

    def test_risk_blocks_cooldown_and_builds_short_plan(self) -> None:
        signal = {"signal": "short"}
        market = {"symbol": "BTC", "timestamp_ms": 1_000, "cooldownUntilMs": 2_000, "executionQuality": 80}
        self.assertEqual(
            calculate_position_size(portfolio_value=100_000, market_data=market, current_positions=[], signal_eval=signal)["block_reason"],
            "symbol_cooldown",
        )

        no_cooldown = {**market, "timestamp_ms": 3_000}
        self.assertTrue(
            calculate_position_size(portfolio_value=100_000, market_data=no_cooldown, current_positions=[], signal_eval=signal)["can_enter"]
        )

        plan = build_risk_plan({"price": 100.0, "executionQuality": 80}, side="short")
        self.assertEqual(plan["side"], "short")
        self.assertEqual(plan["stop_loss"], 100.45)
        self.assertEqual(plan["take_profit"], 99.2)

    def test_synthetic_backtest_generates_long_reversal_trade(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "hyperliquid.db"
            create_market_db(db_path)
            base_ts = 1_000_000_000_000
            prices = [100.0, 99.9, 99.8, 99.7, 99.6, 99.5, 99.45, 99.42, 99.40, 99.38, 99.37, 99.36, 99.35, 101.0]
            for index, price in enumerate(prices, start=1):
                insert_snapshot(db_path, index, base_ts + ((index - 1) * 300_000), "BTC", price)

            result = run_backtest(db_path, BacktestConfig(symbols=("BTC",), risk_fraction=0.01))

        self.assertEqual(result["summary"]["total_trades"], 1)
        trade = result["trades"][0]
        self.assertEqual(trade["strategy_id"], "liquidation_pressure_flip_reversal")
        self.assertEqual(trade["side"], "long")
        self.assertIn(trade["exit_reason"], {"take_profit", "forced_close"})
        self.assertEqual(trade["entry_fee_rate"], 0.00045)
        self.assertEqual(trade["exit_fee_rate"], 0.00045)
        self.assertGreater(float(trade["fees"]), 0.0)

    def test_paper_candidate_requires_ready_validation_and_signal(self) -> None:
        standby = paper_candidate(
            {
                "latest_signal": {"signal": "long", "symbol": "BTC"},
                "report_summary": {"total_trades": 15},
                "validation": {"status": "blocked"},
            }
        )
        candidate = paper_candidate(
            {
                "latest_signal": {"signal": "short", "symbol": "SOL"},
                "report_summary": {"total_trades": 15},
                "validation": {"status": "ready-for-paper"},
            }
        )

        self.assertEqual(standby["status"], "standby")
        self.assertEqual(standby["promotion_gate"], "blocked-by-validation")
        self.assertEqual(candidate["status"], "candidate")
        self.assertEqual(candidate["promotion_gate"], "eligible-for-paper-review")

    def test_registry_exposes_strategy(self) -> None:
        self.assertIn("liquidation_pressure_flip_reversal", available_strategies())


def base_market_data(**overrides: object) -> dict[str, object]:
    data: dict[str, object] = {
        "timestamp": "2026-05-13T00:00:00Z",
        "timestamp_ms": 1_000_000_000_000,
        "symbol": "BTC",
        "price": 100.0,
        "fundingRate": 0.00002,
        "fundingPercentile": 55.0,
        "change5m": 0.01,
        "change15m": -0.05,
        "change1h": -0.55,
        "change4h": -1.00,
        "openInterestUsd": 260_000_000,
        "openInterestUsd1hAgo": 258_000_000,
        "volume24h": 350_000_000,
        "opportunityScore": 72,
        "estimatedTotalLiquidationUsd": 750_000,
        "crowdingBias": "longs-at-risk",
        "primarySetup": "long-flush",
        "setupScores": {"fade": 72, "longFlush": 78, "shortSqueeze": 10, "breakoutContinuation": 25},
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
            VALUES (?, ?, ?, ?, -1.2, 260000000.0, 350000000.0, 0.00002, 72.0,
                    'watch', 'normal', 750000.0, 'longs-at-risk', 'long-flush', ?)
            """,
            (
                row_id,
                timestamp_ms,
                symbol,
                price,
                json.dumps({"fade": 72, "longFlush": 78, "shortSqueeze": 10, "breakoutContinuation": 25}),
            ),
        )


if __name__ == "__main__":
    unittest.main()
