from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from backend.hyperliquid_gateway.backtesting.engine import BacktestConfig
from backend.hyperliquid_gateway.backtesting.registry import available_strategies
from backend.hyperliquid_gateway.strategies.btc_failed_impulse_reversal.backtest import (
    load_sampled_snapshots,
    run_backtest,
    run_backtest_with_params,
)
from backend.hyperliquid_gateway.strategies.btc_failed_impulse_reversal.logic import evaluate_signal
from backend.hyperliquid_gateway.strategies.btc_failed_impulse_reversal.optimizer import build_variant_optimizer_report
from backend.hyperliquid_gateway.strategies.btc_failed_impulse_reversal.paper import (
    build_paper_runtime_plan,
    evaluate_paper_runtime_exit,
)
from backend.hyperliquid_gateway.strategies.btc_failed_impulse_reversal.risk import build_risk_plan, calculate_position_size
from backend.hyperliquid_gateway.strategies.btc_failed_impulse_reversal.scoring import score_setup


class BtcFailedImpulseReversalTest(unittest.TestCase):
    def test_evaluate_signal_long_short_and_no_trade(self) -> None:
        long_signal = evaluate_signal(base_market_data(change1h=-0.35, change15m=-0.04))
        self.assertEqual(long_signal["signal"], "long")

        short_signal = evaluate_signal(base_market_data(change1h=0.35, change15m=-0.22))
        self.assertEqual(short_signal["signal"], "short")

        no_trade = evaluate_signal(base_market_data(symbol="ETH", change1h=-0.4, change15m=0.0))
        self.assertEqual(no_trade["signal"], "none")

    def test_variant_params_can_tighten_signal_and_risk_without_changing_defaults(self) -> None:
        market = base_market_data(change1h=-0.35, change15m=-0.04)

        default_signal = evaluate_signal(market)
        strict_signal = evaluate_signal(market, params={"min_impulse_1h_pct": 0.50})
        variant_risk = build_risk_plan({"price": 100.0, "side": "long"}, side="long", params={"stop_loss_pct": 0.5, "take_profit_pct": 1.2, "max_hold_minutes": 240})
        default_risk = build_risk_plan({"price": 100.0, "side": "long"}, side="long")

        self.assertEqual(default_signal["signal"], "long")
        self.assertEqual(strict_signal["signal"], "none")
        self.assertEqual(variant_risk["stop_loss_pct"], 0.5)
        self.assertEqual(variant_risk["take_profit_pct"], 1.2)
        self.assertEqual(variant_risk["max_hold_minutes"], 240)
        self.assertEqual(default_risk["stop_loss_pct"], 0.65)

    def test_score_setup_rewards_failed_followthrough_and_liquidity(self) -> None:
        good_market = base_market_data(change1h=-0.40, change15m=-0.01, volume24h=3_500_000_000)
        weak_market = base_market_data(change1h=-0.40, change15m=-0.07, volume24h=500_000_000)

        good_score = score_setup(good_market, evaluate_signal(good_market))
        weak_score = score_setup(weak_market, evaluate_signal(weak_market))

        self.assertGreater(good_score["execution_quality"], weak_score["execution_quality"])
        self.assertGreater(good_score["rank_score"], weak_score["rank_score"])

    def test_risk_blocks_no_signal_and_open_position(self) -> None:
        market = base_market_data()
        no_signal = {"signal": "none"}
        self.assertEqual(
            calculate_position_size(
                portfolio_value=100_000,
                market_data=market,
                current_positions=[],
                signal_eval=no_signal,
            )["block_reason"],
            "no_reversal_signal",
        )

        signal = {"signal": "long"}
        self.assertEqual(
            calculate_position_size(
                portfolio_value=100_000,
                market_data=market,
                current_positions=[{"symbol": "BTC"}],
                signal_eval=signal,
            )["block_reason"],
            "max_one_open_position",
        )

    def test_loader_defaults_to_btc_and_respects_lookback(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "hyperliquid.db"
            create_market_db(db_path)
            insert_snapshot(db_path, 1, 1_000_000_000_000, "BTC", 100.0)
            insert_snapshot(db_path, 2, 1_000_086_400_000, "ETH", 100.0)
            insert_snapshot(db_path, 3, 1_000_086_400_000, "BTC", 100.2)
            insert_snapshot(db_path, 4, 1_000_172_800_000, "BTC", 100.3)

            rows, replay_filter = load_sampled_snapshots(db_path, BacktestConfig(lookback_days=1))

        self.assertTrue(replay_filter["default_symbols_applied"])
        self.assertEqual(replay_filter["requested_symbols"], ["BTC"])
        self.assertEqual({row["symbol"] for row in rows}, {"BTC"})
        self.assertEqual(len(rows), 2)

    def test_synthetic_backtest_generates_long_reversal_trade(self) -> None:
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
                100.0,
                99.72,
                99.69,
                99.67,
                99.65,
                100.4,
                100.9,
                101.6,
            ]
            for index, price in enumerate(prices, start=1):
                insert_snapshot(db_path, index, base_ts + ((index - 1) * 300_000), "BTC", price)

            result = run_backtest(db_path, BacktestConfig(symbols=("BTC",), risk_fraction=0.10))
            variant = run_backtest_with_params(
                db_path,
                BacktestConfig(symbols=("BTC",), risk_fraction=0.10),
                params={"take_profit_pct": 1.2, "max_hold_minutes": 240},
                variant_id="test_fast",
            )

        self.assertEqual(result["summary"]["total_trades"], 1)
        self.assertEqual(variant["variant"]["variant_id"], "test_fast")
        self.assertEqual(variant["variant"]["params"]["take_profit_pct"], 1.2)
        trade = result["trades"][0]
        self.assertEqual(trade["side"], "long")
        self.assertEqual(trade["exit_reason"], "take_profit")
        self.assertEqual(trade["entry_fee_rate"], 0.00045)
        self.assertEqual(trade["exit_fee_rate"], 0.00045)
        self.assertGreater(float(trade["net_pnl"]), 0.0)

    def test_variant_optimizer_report_ranks_research_variants(self) -> None:
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
                100.0,
                99.72,
                99.69,
                99.67,
                99.65,
                100.4,
                100.9,
                101.6,
                101.8,
            ]
            for index, price in enumerate(prices, start=1):
                insert_snapshot(db_path, index, base_ts + ((index - 1) * 300_000), "BTC", price)

            report = build_variant_optimizer_report(
                dataset_path=db_path,
                config=BacktestConfig(symbols=("BTC",), risk_fraction=0.10),
                variants=[
                    {"variantId": "default", "params": {}},
                    {"variantId": "fast", "params": {"take_profit_pct": 1.2, "max_hold_minutes": 240}},
                ],
            )

        self.assertEqual(report["strategyId"], "btc_failed_impulse_reversal")
        self.assertEqual(report["variantCount"], 2)
        self.assertIn(report["status"], {"stable-candidate-found", "fragile-best-candidate", "no-candidate"})
        self.assertEqual([row["rank"] for row in report["variants"]], [1, 2])
        self.assertIsNotNone(report["topVariant"])

    def test_paper_runtime_opens_only_on_strategy_signal(self) -> None:
        prices = [
            100.0,
            100.0,
            100.0,
            100.0,
            100.0,
            100.0,
            100.0,
            100.0,
            100.0,
            99.66,
            99.65,
            99.64,
            99.65,
        ]
        plan = build_paper_runtime_plan(runtime_history(prices), [], portfolio_value=100_000)

        self.assertEqual(plan["status"], "entry-ready")
        self.assertTrue(plan["entry"]["shouldOpen"])
        self.assertEqual(plan["entry"]["tradePayload"]["setup_tag"], "btc_failed_impulse_reversal")
        self.assertEqual(plan["entry"]["tradePayload"]["side"], "long")
        self.assertEqual(plan["entry"]["tradePayload"]["size_usd"], 10_000.0)

        blocked = build_paper_runtime_plan(
            runtime_history(prices),
            [
                {
                    "id": 1,
                    "symbol": "BTC",
                    "setupTag": "btc_failed_impulse_reversal",
                    "side": "long",
                    "status": "open",
                    "entryPrice": 100.0,
                    "sizeUsd": 10_000.0,
                    "createdAt": 1_000_000_000_000,
                }
            ],
        )

        self.assertFalse(blocked["entry"]["shouldOpen"])
        self.assertEqual(blocked["entry"]["blockReason"], "matching_open_trade")

        flat = build_paper_runtime_plan(runtime_history([100.0] * 13), [], portfolio_value=100_000)

        self.assertEqual(flat["status"], "flat-no-signal")
        self.assertFalse(flat["entry"]["shouldOpen"])
        self.assertEqual(flat["entry"]["blockReason"], "no_reversal_signal")

    def test_paper_runtime_exit_uses_stop_target_and_time_stop(self) -> None:
        trade = {
            "id": 9,
            "symbol": "BTC",
            "setupTag": "btc_failed_impulse_reversal",
            "side": "long",
            "status": "open",
            "entryPrice": 100.0,
            "sizeUsd": 10_000.0,
            "stopLossPct": 0.65,
            "takeProfitPct": 1.75,
            "createdAt": 1_000_000_000_000,
        }

        take_profit = evaluate_paper_runtime_exit(
            trade,
            base_market_data(price=101.8, timestamp_ms=1_000_000_600_000),
        )
        stop_loss = evaluate_paper_runtime_exit(
            trade,
            base_market_data(price=99.3, timestamp_ms=1_000_000_600_000),
        )
        time_stop = evaluate_paper_runtime_exit(
            trade,
            base_market_data(price=100.2, timestamp_ms=1_000_000_000_000 + (481 * 60_000)),
        )

        self.assertEqual(take_profit["exitReason"], "take_profit")
        self.assertEqual(take_profit["realizedPnlUsd"], 180.0)
        self.assertEqual(stop_loss["exitReason"], "stop_loss")
        self.assertEqual(time_stop["exitReason"], "time_stop")

    def test_registry_exposes_strategy(self) -> None:
        self.assertIn("btc_failed_impulse_reversal", available_strategies())
        self.assertIn("btc_failed_impulse_balanced_fast", available_strategies())


def base_market_data(**overrides: object) -> dict[str, object]:
    data: dict[str, object] = {
        "timestamp": "2026-05-06T00:00:00Z",
        "timestamp_ms": 1_000_000_000_000,
        "symbol": "BTC",
        "price": 100.0,
        "fundingRate": 0.00001,
        "fundingPercentile": 55.0,
        "change5m": 0.0,
        "change15m": -0.04,
        "change1h": -0.35,
        "change4h": -0.5,
        "openInterestUsd": 2_500_000_000,
        "volume24h": 3_000_000_000,
        "opportunityScore": 70,
        "crowdingBias": "balanced",
        "primarySetup": "fade",
        "setupScores": {"fade": 55, "longFlush": 45, "shortSqueeze": 44, "breakoutContinuation": 62},
    }
    data.update(overrides)
    return data


def runtime_history(prices: list[float]) -> list[dict[str, object]]:
    base_ts = 1_000_000_000_000
    return [
        {
            "time": base_ts + (index * 300_000),
            "symbol": "BTC",
            "price": price,
            "change24hPct": 0.0,
            "openInterestUsd": 2_500_000_000,
            "volume24h": 3_000_000_000,
            "fundingRate": 0.00001,
            "opportunityScore": 70,
            "signalLabel": "neutral",
            "riskLabel": "normal",
            "estimatedTotalLiquidationUsd": 0.0,
            "crowdingBias": "balanced",
            "primarySetup": "fade",
            "setupScores": {"fade": 55, "longFlush": 45, "shortSqueeze": 44, "breakoutContinuation": 62},
        }
        for index, price in enumerate(prices)
    ]


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
            VALUES (?, ?, ?, ?, 0.0, 2500000000.0, 3000000000.0, 0.00001, 70.0,
                    'neutral', 'normal', 0.0, 'balanced', 'fade', ?)
            """,
            (
                row_id,
                timestamp_ms,
                symbol,
                price,
                json.dumps({"fade": 55, "longFlush": 45, "shortSqueeze": 44, "breakoutContinuation": 62}),
            ),
        )


if __name__ == "__main__":
    unittest.main()
