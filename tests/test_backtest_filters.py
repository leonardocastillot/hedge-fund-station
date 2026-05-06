from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from backend.hyperliquid_gateway.backtesting.diagnostics import assess_robust_gate, build_trade_diagnostics
from backend.hyperliquid_gateway.backtesting.engine import BacktestConfig, normalize_symbols, parse_time_to_ms
from backend.hyperliquid_gateway.strategies.short_squeeze_continuation.backtest import load_sampled_snapshots


class BacktestFilterTest(unittest.TestCase):
    def test_normalize_symbols_accepts_csv_and_sequences(self) -> None:
        self.assertEqual(normalize_symbols("btc, eth,btc"), ("BTC", "ETH"))
        self.assertEqual(normalize_symbols(["sol", "HYPE,BTC"]), ("SOL", "HYPE", "BTC"))

    def test_parse_time_to_ms_accepts_iso_and_epoch(self) -> None:
        self.assertEqual(parse_time_to_ms("2026-05-05T00:00:00Z"), 1777939200000)
        self.assertEqual(parse_time_to_ms("1777939200"), 1777939200000)
        self.assertEqual(parse_time_to_ms("1777939200000"), 1777939200000)

    def test_market_snapshot_loader_filters_symbol_and_lookback(self) -> None:
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
                rows = [
                    (1, 1_000_000_000_000, "BTC"),
                    (2, 1_000_086_400_000, "BTC"),
                    (3, 1_000_086_400_000, "ETH"),
                    (4, 1_000_172_800_000, "BTC"),
                ]
                for row_id, timestamp_ms, symbol in rows:
                    connection.execute(
                        """
                        INSERT INTO market_snapshots (
                            id, timestamp_ms, symbol, price, change24h_pct, open_interest_usd,
                            volume24h, funding_rate, opportunity_score, signal_label, risk_label,
                            estimated_total_liquidation_usd, crowding_bias, primary_setup, setup_scores_json
                        )
                        VALUES (?, ?, ?, 100.0, 0.0, 1000000.0, 1000000.0, 0.0, 50.0,
                                'watch', 'normal', 0.0, 'balanced', 'no-trade', '{}')
                        """,
                        (row_id, timestamp_ms, symbol),
                    )

            rows, replay_filter = load_sampled_snapshots(
                db_path,
                BacktestConfig(symbols=("BTC",), lookback_days=1),
            )

            self.assertEqual(replay_filter["requested_symbols"], ["BTC"])
            self.assertEqual({row["symbol"] for row in rows}, {"BTC"})
            self.assertEqual(len(rows), 2)
            self.assertGreaterEqual(rows[0]["timestamp_ms"], replay_filter["start_ms"])

    def test_robust_diagnostics_gate_passes_and_blocks(self) -> None:
        trades = [
            {
                "symbol": "BTC",
                "net_pnl": 20.0,
                "return_pct": 0.2,
                "fees": 1.0,
                "exit_reason": "take_profit",
                "exit_timestamp": f"2026-05-05T00:{index:02d}:00Z",
            }
            for index in range(30)
        ]
        summary = {
            "total_trades": 30,
            "net_profit": 600.0,
            "return_pct": 0.6,
            "profit_factor": 99.0,
            "max_drawdown_pct": 0.0,
        }

        diagnostics = build_trade_diagnostics(
            summary=summary,
            trades=trades,
            initial_equity=100_000.0,
            requested_symbols=["BTC"],
        )

        self.assertEqual(diagnostics["robust_assessment"]["status"], "passes")
        self.assertEqual(diagnostics["symbol_leaderboard"][0]["symbol"], "BTC")
        self.assertEqual(diagnostics["symbol_leaderboard"][0]["robust_assessment"]["status"], "passes")

        weak = assess_robust_gate(summary={**summary, "total_trades": 2}, trades=trades[:2])
        self.assertEqual(weak["status"], "insufficient-sample")
        self.assertIn("min_trades", weak["blockers"])


if __name__ == "__main__":
    unittest.main()
