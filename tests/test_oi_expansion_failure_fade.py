from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from backend.hyperliquid_gateway.backtesting.engine import BacktestConfig
from backend.hyperliquid_gateway.backtesting.registry import available_strategies
from backend.hyperliquid_gateway.strategies.oi_expansion_failure_fade.backtest import (
    load_sampled_snapshots,
    run_backtest,
)
from backend.hyperliquid_gateway.strategies.oi_expansion_failure_fade.logic import evaluate_signal
from backend.hyperliquid_gateway.strategies.oi_expansion_failure_fade.risk import calculate_position_size
from backend.hyperliquid_gateway.strategies.oi_expansion_failure_fade.scoring import score_setup


class OiExpansionFailureFadeTest(unittest.TestCase):
    def test_evaluate_signal_long_short_and_no_trade(self) -> None:
        long_signal = evaluate_signal(base_market_data(change1h=-0.45, change15m=-0.05, change5m=0.02))
        self.assertEqual(long_signal["signal"], "long")

        short_signal = evaluate_signal(base_market_data(change1h=0.45, change15m=0.05, change5m=-0.02))
        self.assertEqual(short_signal["signal"], "short")

        no_trade = evaluate_signal(base_market_data(volume24h=500_000, openInterestUsd=100_000))
        self.assertEqual(no_trade["signal"], "none")

    def test_score_setup_penalizes_low_liquidity_and_extreme_continuation(self) -> None:
        good_market = base_market_data(change1h=-0.45, change15m=-0.03, change5m=0.0, volume24h=250_000_000, openInterestUsd=250_000_000)
        weak_market = base_market_data(change1h=-0.45, change15m=-0.03, change5m=0.0, volume24h=10_000_000, openInterestUsd=1_000_000)
        crowded_continuation = base_market_data(
            change1h=-0.45,
            change15m=-0.03,
            change5m=0.0,
            volume24h=250_000_000,
            openInterestUsd=250_000_000,
            setupScores={"fade": 70, "longFlush": 95, "shortSqueeze": 10, "breakoutContinuation": 20},
        )

        good_score = score_setup(good_market, evaluate_signal(good_market))
        weak_score = score_setup(weak_market, evaluate_signal(weak_market))
        continuation_score = score_setup(crowded_continuation, evaluate_signal(crowded_continuation))

        self.assertGreater(good_score["execution_quality"], weak_score["execution_quality"])
        self.assertGreater(good_score["rank_score"], weak_score["rank_score"])
        self.assertGreater(good_score["rank_score"], continuation_score["rank_score"])

    def test_risk_blocks_exposure_and_cooldown(self) -> None:
        signal = {"signal": "long"}
        market = {"symbol": "BTC", "timestamp_ms": 1_000, "cooldownUntilMs": 2_000, "executionQuality": 80}
        self.assertEqual(
            calculate_position_size(portfolio_value=100_000, market_data=market, current_positions=[], signal_eval=signal)["block_reason"],
            "symbol_cooldown",
        )

        no_cooldown = {**market, "timestamp_ms": 3_000}
        current_positions = [{"symbol": "ETH"}, {"symbol": "SOL"}, {"symbol": "HYPE"}]
        self.assertEqual(
            calculate_position_size(
                portfolio_value=100_000,
                market_data=no_cooldown,
                current_positions=current_positions,
                signal_eval=signal,
            )["block_reason"],
            "max_concurrent_positions",
        )

    def test_loader_filters_symbol_and_lookback(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "hyperliquid.db"
            create_market_db(db_path)
            insert_snapshot(db_path, 1, 1_000_000_000_000, "BTC", 100.0)
            insert_snapshot(db_path, 2, 1_000_086_400_000, "ETH", 100.0)
            insert_snapshot(db_path, 3, 1_000_086_400_000, "BTC", 99.8)
            insert_snapshot(db_path, 4, 1_000_172_800_000, "BTC", 99.7)

            rows, replay_filter = load_sampled_snapshots(db_path, BacktestConfig(symbols=("BTC",), lookback_days=1))

        self.assertEqual(replay_filter["requested_symbols"], ["BTC"])
        self.assertEqual({row["symbol"] for row in rows}, {"BTC"})
        self.assertEqual(len(rows), 2)

    def test_synthetic_backtest_generates_trade_with_fees(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "hyperliquid.db"
            create_market_db(db_path)
            base_ts = 1_000_000_000_000
            prices = [100.0, 99.94, 99.88, 99.82, 99.76, 99.70, 99.66, 99.63, 99.61, 99.60, 99.60, 99.60, 99.60, 101.0]
            for index, price in enumerate(prices, start=1):
                insert_snapshot(
                    db_path,
                    index,
                    base_ts + ((index - 1) * 300_000),
                    "BTC",
                    price,
                    open_interest_usd=1_500_000 + index * 12_000,
                    setup_scores={"fade": 72, "longFlush": 40, "shortSqueeze": 10, "breakoutContinuation": 20},
                )

            result = run_backtest(db_path, BacktestConfig(symbols=("BTC",), risk_fraction=0.01))

        self.assertEqual(result["summary"]["total_trades"], 1)
        trade = result["trades"][0]
        self.assertEqual(trade["side"], "long")
        self.assertIn(trade["exit_reason"], {"take_profit", "forced_close"})
        self.assertEqual(trade["entry_fee_rate"], 0.00045)
        self.assertEqual(trade["exit_fee_rate"], 0.00045)
        self.assertGreater(float(trade["fees"]), 0.0)

    def test_registry_exposes_strategy(self) -> None:
        self.assertIn("oi_expansion_failure_fade", available_strategies())


def base_market_data(**overrides: object) -> dict[str, object]:
    data: dict[str, object] = {
        "timestamp": "2026-05-05T00:00:00Z",
        "timestamp_ms": 1_000_000_000_000,
        "symbol": "BTC",
        "price": 100.0,
        "fundingRate": 0.00001,
        "fundingPercentile": 55.0,
        "change5m": 0.0,
        "change15m": 0.0,
        "change1h": -0.45,
        "change4h": -0.5,
        "openInterestUsd": 2_100_000,
        "openInterestUsd1hAgo": 2_000_000,
        "volume24h": 20_000_000,
        "opportunityScore": 70,
        "crowdingBias": "balanced",
        "primarySetup": "fade",
        "setupScores": {"fade": 72, "longFlush": 40, "shortSqueeze": 10, "breakoutContinuation": 20},
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


def insert_snapshot(
    db_path: Path,
    row_id: int,
    timestamp_ms: int,
    symbol: str,
    price: float,
    *,
    open_interest_usd: float = 2_000_000,
    setup_scores: dict[str, float] | None = None,
) -> None:
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            """
            INSERT INTO market_snapshots (
                id, timestamp_ms, symbol, price, change24h_pct, open_interest_usd,
                volume24h, funding_rate, opportunity_score, signal_label, risk_label,
                estimated_total_liquidation_usd, crowding_bias, primary_setup, setup_scores_json
            )
            VALUES (?, ?, ?, ?, 0.0, ?, 20000000.0, 0.00001, 70.0,
                    'watch', 'normal', 0.0, 'balanced', 'fade', ?)
            """,
            (
                row_id,
                timestamp_ms,
                symbol,
                price,
                open_interest_usd,
                json.dumps(setup_scores or {"fade": 72, "longFlush": 40, "shortSqueeze": 10, "breakoutContinuation": 20}),
            ),
        )


if __name__ == "__main__":
    unittest.main()
