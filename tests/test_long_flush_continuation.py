from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from backend.hyperliquid_gateway.backtesting.engine import BacktestConfig
from backend.hyperliquid_gateway.backtesting.registry import available_strategies
from backend.hyperliquid_gateway.strategies.long_flush_continuation.backtest import run_backtest
from backend.hyperliquid_gateway.strategies.long_flush_continuation.logic import evaluate_signal
from backend.hyperliquid_gateway.strategies.long_flush_continuation.paper import paper_candidate
from backend.hyperliquid_gateway.strategies.long_flush_continuation.risk import build_risk_plan, calculate_position_size
from backend.hyperliquid_gateway.strategies.long_flush_continuation.scoring import score_setup


class LongFlushContinuationTest(unittest.TestCase):
    def test_evaluate_signal_short_and_no_trade(self) -> None:
        short_signal = evaluate_signal(base_market_data())
        self.assertEqual(short_signal["signal"], "short")
        self.assertEqual(short_signal["direction"], "short")

        no_impulse = evaluate_signal(base_market_data(change1h=0.15, change4h=0.25, change24h=0.0))
        self.assertEqual(no_impulse["signal"], "none")

        no_pressure = evaluate_signal(
            base_market_data(crowdingBias="balanced", setupScores={"fade": 45, "longFlush": 50})
        )
        self.assertEqual(no_pressure["signal"], "none")

    def test_score_setup_rewards_long_flush_quality_and_liquidity(self) -> None:
        good_market = base_market_data(volume24h=3_500_000_000, setupScores={"longFlush": 82, "fade": 68})
        weak_market = base_market_data(volume24h=25_000, setupScores={"longFlush": 58, "fade": 45})

        good_score = score_setup(good_market, evaluate_signal(good_market))
        weak_score = score_setup(weak_market, evaluate_signal(weak_market))

        self.assertGreater(good_score["execution_quality"], weak_score["execution_quality"])
        self.assertGreater(good_score["rank_score"], weak_score["rank_score"])
        self.assertEqual(good_score["signal_direction"], "short")

    def test_risk_blocks_no_signal_and_limits_concurrency(self) -> None:
        market = base_market_data()
        no_signal = {"signal": "none"}
        self.assertEqual(
            calculate_position_size(
                portfolio_value=100_000,
                market_data=market,
                current_positions=[],
                signal_eval=no_signal,
            )["block_reason"],
            "no_short_signal",
        )

        signal = {"signal": "short"}
        self.assertEqual(
            calculate_position_size(
                portfolio_value=100_000,
                market_data=market,
                current_positions=[{"symbol": "BTC"}, {"symbol": "SOL"}, {"symbol": "HYPE"}],
                signal_eval=signal,
            )["block_reason"],
            "max_concurrent_positions",
        )
        self.assertTrue(
            calculate_position_size(
                portfolio_value=100_000,
                market_data={**market, "executionQuality": 75},
                current_positions=[],
                signal_eval=signal,
            )["can_enter"]
        )

        plan = build_risk_plan({"price": 100.0})
        self.assertEqual(plan["side"], "short")
        self.assertEqual(plan["stop_loss"], 100.8)
        self.assertEqual(plan["take_profit"], 98.6)

    def test_synthetic_backtest_generates_short_continuation_trade(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "hyperliquid.db"
            create_market_db(db_path)
            base_ts = 1_000_000_000_000
            prices = [100.0] * 12 + [99.5, 98.0]
            for index, price in enumerate(prices, start=1):
                insert_snapshot(db_path, index, base_ts + ((index - 1) * 300_000), "BTC", price)

            result = run_backtest(db_path, BacktestConfig(symbols=("BTC",), risk_fraction=0.10))

        self.assertEqual(result["summary"]["total_trades"], 1)
        trade = result["trades"][0]
        self.assertEqual(trade["strategy_id"], "long_flush_continuation")
        self.assertEqual(trade["side"], "short")
        self.assertEqual(trade["exit_reason"], "take_profit")
        self.assertEqual(trade["entry_fee_rate"], 0.00045)
        self.assertEqual(trade["exit_fee_rate"], 0.00045)
        self.assertGreater(float(trade["net_pnl"]), 0.0)

    def test_paper_candidate_requires_ready_validation_and_short_signal(self) -> None:
        standby = paper_candidate(
            {
                "latest_signal": {"signal": "short", "symbol": "BTC"},
                "report_summary": {"total_trades": 8},
                "validation": {"status": "blocked"},
            }
        )
        candidate = paper_candidate(
            {
                "latest_signal": {"signal": "short", "symbol": "BTC"},
                "report_summary": {"total_trades": 8},
                "validation": {"status": "ready-for-paper"},
            }
        )

        self.assertEqual(standby["status"], "standby")
        self.assertEqual(standby["promotion_gate"], "blocked-by-validation")
        self.assertEqual(candidate["status"], "candidate")
        self.assertEqual(candidate["promotion_gate"], "eligible-for-paper-review")

    def test_registry_exposes_strategy(self) -> None:
        self.assertIn("long_flush_continuation", available_strategies())


def base_market_data(**overrides: object) -> dict[str, object]:
    data: dict[str, object] = {
        "timestamp": "2026-05-07T00:00:00Z",
        "timestamp_ms": 1_000_000_000_000,
        "symbol": "BTC",
        "price": 100.0,
        "fundingRate": 0.00008,
        "fundingPercentile": 82.0,
        "change1h": -0.5,
        "change4h": -1.2,
        "change24h": -1.6,
        "openInterestUsd": 2_500_000_000,
        "openInterestUsd1hAgo": 2_450_000_000,
        "volume24h": 3_000_000_000,
        "opportunityScore": 74,
        "crowdingBias": "longs-at-risk",
        "primarySetup": "long-flush",
        "setupScores": {"fade": 68, "longFlush": 76, "shortSqueeze": 10, "breakoutContinuation": 30},
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
            VALUES (?, ?, ?, ?, -1.6, 2500000000.0, 3000000000.0, 0.00008, 74.0,
                    'watch', 'normal', 0.0, 'longs-at-risk', 'long-flush', ?)
            """,
            (
                row_id,
                timestamp_ms,
                symbol,
                price,
                json.dumps({"fade": 68, "longFlush": 76, "shortSqueeze": 10, "breakoutContinuation": 30}),
            ),
        )


if __name__ == "__main__":
    unittest.main()
