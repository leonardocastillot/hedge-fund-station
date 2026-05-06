from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from backend.hyperliquid_gateway.app import build_backtest_config_from_filters
from backend.hyperliquid_gateway.backtesting.engine import BacktestConfig, calculate_trade_fee, simulate_strategy
from backend.hyperliquid_gateway.backtesting.io import Candle
from backend.hyperliquid_gateway.cli import build_backtest_config, build_parser
from backend.hyperliquid_gateway.strategies.btc_crowding_scalper.backtest import (
    SCALPER_ROBUST_GATE,
    close_position,
    load_sampled_snapshots,
    maybe_close_position,
)


class BacktestFeeModelTest(unittest.TestCase):
    def test_default_and_legacy_fee_rates(self) -> None:
        default_config = BacktestConfig()
        self.assertEqual(default_config.fee_rate, 0.00045)
        self.assertEqual(default_config.taker_fee_rate, 0.00045)
        self.assertEqual(default_config.maker_fee_rate, 0.00015)

        legacy_config = BacktestConfig(fee_rate=0.00055)
        self.assertEqual(legacy_config.fee_rate, 0.00055)
        self.assertEqual(legacy_config.taker_fee_rate, 0.00055)

        explicit_config = BacktestConfig(fee_rate=0.00055, taker_fee_rate=0.00045)
        self.assertEqual(explicit_config.fee_rate, 0.00045)
        self.assertEqual(explicit_config.taker_fee_rate, 0.00045)

    def test_fee_model_roles_and_mixed_ratio(self) -> None:
        config = BacktestConfig(fee_model="mixed", maker_ratio=0.25)
        taker_fee = calculate_trade_fee(notional_usd=10_000, config=config, liquidity_role="taker")
        maker_fee = calculate_trade_fee(notional_usd=10_000, config=config, liquidity_role="maker")
        mixed_fee = calculate_trade_fee(notional_usd=10_000, config=config)

        self.assertAlmostEqual(float(taker_fee["fee"]), 4.5)
        self.assertAlmostEqual(float(maker_fee["fee"]), 1.5)
        self.assertAlmostEqual(float(mixed_fee["fee"]), 3.75)
        self.assertEqual(mixed_fee["liquidity_role"], "mixed")

    def test_simulate_strategy_records_fee_metadata(self) -> None:
        candles = [
            Candle("2026-05-05T00:00:00Z", 0, 100.0, 100.0, 100.0, 100.0, 1.0),
            Candle("2026-05-05T00:05:00Z", 300_000, 100.0, 100.5, 99.8, 100.3, 1.0),
        ]
        indicators = [
            {"entry": "long", "stop_loss": 99.0, "take_profit": 100.2},
            {},
        ]

        result = simulate_strategy(
            strategy_id="unit_fee_strategy",
            candles=candles,
            indicators=indicators,
            config=BacktestConfig(initial_equity=100_000, risk_fraction=0.01),
        )

        trade = result["trades"][0]
        self.assertEqual(trade["entry_fee_rate"], 0.00045)
        self.assertEqual(trade["exit_fee_rate"], 0.00045)
        self.assertEqual(trade["entry_liquidity_role"], "taker")
        self.assertEqual(trade["exit_liquidity_role"], "taker")
        self.assertAlmostEqual(float(trade["fees"]), 0.9, places=6)
        self.assertAlmostEqual(float(result["summary"]["net_profit"]), float(trade["net_pnl"]), places=2)

    def test_cli_and_api_fee_config_smoke(self) -> None:
        parser = build_parser()
        args = parser.parse_args(
            [
                "backtest",
                "--strategy",
                "short_squeeze_continuation",
                "--symbol",
                "BTC",
                "--taker-fee-rate",
                "0.00045",
                "--maker-fee-rate",
                "0.00015",
                "--fee-model",
                "mixed",
                "--maker-ratio",
                "0.4",
            ]
        )
        cli_config = build_backtest_config(args)
        self.assertEqual(cli_config.effective_symbols(), ("BTC",))
        self.assertEqual(cli_config.fee_model, "mixed")
        self.assertEqual(cli_config.maker_ratio, 0.4)

        api_config = build_backtest_config_from_filters(
            symbols="BTC,ETH",
            taker_fee_rate=0.00045,
            maker_fee_rate=0.00015,
            fee_model="maker",
        )
        self.assertEqual(api_config.effective_symbols(), ("BTC", "ETH"))
        self.assertEqual(api_config.fee_model, "maker")


class BtcCrowdingScalperTest(unittest.TestCase):
    def test_scalper_exits_take_profit_and_no_progress(self) -> None:
        config = BacktestConfig()
        position = {
            "strategy_id": "btc_crowding_scalper",
            "symbol": "BTC",
            "side": "long",
            "createdAt": 0,
            "entry_timestamp": "2026-05-05T00:00:00Z",
            "entry_price": 100.0,
            "size_usd": 1000.0,
            "entry_fee": 0.45,
            "entry_fee_rate": 0.00045,
            "entry_liquidity_role": "taker",
            "stop_loss": 99.75,
            "take_profit": 100.35,
            "entry_context": {},
        }

        take_profit_trade = maybe_close_position(
            position,
            {
                "timestamp": "2026-05-05T00:05:00Z",
                "timestamp_ms": 300_000,
                "price": 100.5,
                "executionQuality": 80,
                "change15m": 0.3,
            },
            config,
        )
        self.assertIsNotNone(take_profit_trade)
        self.assertEqual(take_profit_trade["exit_reason"], "take_profit")

        no_progress_trade = maybe_close_position(
            position,
            {
                "timestamp": "2026-05-05T00:10:00Z",
                "timestamp_ms": 600_000,
                "price": 100.03,
                "executionQuality": 80,
                "change15m": 0.0,
            },
            config,
        )
        self.assertIsNotNone(no_progress_trade)
        self.assertEqual(no_progress_trade["exit_reason"], "no_progress")

    def test_close_position_records_scalper_fee_metadata(self) -> None:
        config = BacktestConfig(fee_model="maker")
        trade = close_position(
            {
                "symbol": "BTC",
                "entry_timestamp": "2026-05-05T00:00:00Z",
                "entry_price": 100.0,
                "size_usd": 1000.0,
                "entry_fee": 0.15,
                "entry_fee_rate": 0.00015,
                "entry_liquidity_role": "maker",
                "entry_context": {},
            },
            "2026-05-05T00:05:00Z",
            100.35,
            "take_profit",
            config,
        )

        self.assertEqual(trade["entry_liquidity_role"], "maker")
        self.assertEqual(trade["exit_liquidity_role"], "maker")
        self.assertEqual(trade["exit_fee_rate"], 0.00015)
        self.assertAlmostEqual(float(trade["fees"]), 0.3, places=6)

    def test_scalper_default_loader_applies_btc_universe(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "hyperliquid.db"
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
                for row_id, symbol in enumerate(("BTC", "ETH"), start=1):
                    connection.execute(
                        """
                        INSERT INTO market_snapshots (
                            id, timestamp_ms, symbol, price, change24h_pct, open_interest_usd,
                            volume24h, funding_rate, opportunity_score, signal_label, risk_label,
                            estimated_total_liquidation_usd, crowding_bias, primary_setup, setup_scores_json
                        )
                        VALUES (?, 1000000000000, ?, 100.0, 0.0, 100000000.0, 100000000.0, -0.0001, 60.0,
                                'watch', 'normal', 0.0, 'shorts-at-risk', 'scalp', '{"shortSqueeze": 70}')
                        """,
                        (row_id, symbol),
                    )

            rows, replay_filter = load_sampled_snapshots(db_path, BacktestConfig())

        self.assertEqual({row["symbol"] for row in rows}, {"BTC"})
        self.assertEqual(replay_filter["requested_symbols"], ["BTC"])
        self.assertTrue(replay_filter["default_symbols_applied"])
        self.assertEqual(SCALPER_ROBUST_GATE["min_trades"], 60)


if __name__ == "__main__":
    unittest.main()
