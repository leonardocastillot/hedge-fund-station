from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from backend.hyperliquid_gateway.cli import build_parser
from backend.hyperliquid_gateway.strategy_memory import (
    StrategyMemorySourceRoots,
    approx_token_count,
    chunk_markdown,
    deterministic_chunk_id,
    initialize_strategy_memory,
    query_strategy_memory,
    strategy_memory_db_path,
    strategy_memory_status,
    sync_strategy_memory,
)


class StrategyMemoryIndexTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.repo_root = Path(self.tempdir.name) / "repo"
        self.data_root = self.repo_root / "backend" / "hyperliquid_gateway" / "data"
        self.memory_root = self.data_root / "strategy_memory"
        self.docs_root = self.repo_root / "docs" / "strategies"
        self.reports_root = self.data_root / "backtests"
        self.validations_root = self.data_root / "validations"
        self.paper_root = self.data_root / "paper"
        self.audits_root = self.data_root / "audits"
        self.agent_runs_root = self.data_root / "agent_runs"
        self.progress_root = self.repo_root / "progress"
        for path in (
            self.memory_root,
            self.docs_root,
            self.reports_root,
            self.validations_root,
            self.paper_root,
            self.audits_root,
            self.agent_runs_root,
            self.progress_root,
        ):
            path.mkdir(parents=True, exist_ok=True)
        self.roots = StrategyMemorySourceRoots(
            repo_root=self.repo_root,
            data_root=self.data_root,
            docs_strategies_root=self.docs_root,
            reports_root=self.reports_root,
            validations_root=self.validations_root,
            paper_root=self.paper_root,
            audits_root=self.audits_root,
            agent_runs_root=self.agent_runs_root,
            progress_root=self.progress_root,
            learning_root=self.memory_root,
        )

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def write_fixture_sources(self) -> None:
        (self.docs_root / "btc-memory-alpha.md").write_text(
            "\n".join(
                [
                    "# BTC Memory Alpha",
                    "",
                    "Funding squeeze continuation works only after open interest confirms the reclaim.",
                    "Anti-regime: chop after liquidation pressure fades.",
                ]
            ),
            encoding="utf-8",
        )
        (self.reports_root / "btc_memory_alpha-smoke.json").write_text(
            json.dumps(
                {
                    "artifact_type": "backtest_report",
                    "strategy_id": "btc_memory_alpha",
                    "generated_at": "2026-05-15T00:00:00Z",
                    "summary": {"total_trades": 42, "return_pct": 8.4, "profit_factor": 1.7},
                    "robust_assessment": {"status": "passes"},
                    "trades": [{"id": index, "pnl": 1.0} for index in range(50)],
                }
            ),
            encoding="utf-8",
        )
        learning_dir = self.memory_root / "btc_memory_alpha"
        learning_dir.mkdir(parents=True, exist_ok=True)
        (learning_dir / "lesson.json").write_text(
            json.dumps(
                {
                    "artifact_type": "strategy_learning_event",
                    "strategy_id": "btc_memory_alpha",
                    "kind": "lesson",
                    "outcome": "loss",
                    "title": "Do not trust first reclaim",
                    "summary": "The first reclaim failed without OI confirmation.",
                    "lesson": "Wait for OI confirmation before treating reclaim as tradable.",
                    "evidence_paths": ["docs/strategies/btc-memory-alpha.md"],
                }
            ),
            encoding="utf-8",
        )
        (self.progress_root / "impl_memory_alpha.md").write_text(
            "# Memory Alpha Handoff\n\nValidated that reclaim evidence needs cited backend artifacts.",
            encoding="utf-8",
        )

    def test_chunking_keeps_segments_bounded_and_ids_deterministic(self) -> None:
        long_markdown = "\n\n".join(["alpha " * 3000 for _ in range(5)])
        chunks = chunk_markdown(long_markdown)

        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(approx_token_count(chunk) <= 3000 for chunk in chunks))
        self.assertEqual(
            deterministic_chunk_id("source", 0, chunks[0]),
            deterministic_chunk_id("source", 0, chunks[0]),
        )

    def test_initialize_creates_migration_table(self) -> None:
        status = initialize_strategy_memory(self.memory_root)

        self.assertTrue(status["available"])
        with sqlite3.connect(strategy_memory_db_path(self.memory_root)) as connection:
            row = connection.execute(
                "SELECT version FROM strategy_memory_schema_migrations WHERE version = 1"
            ).fetchone()
        self.assertEqual(row[0], 1)

    def test_sync_dry_run_real_sync_query_and_duplicate_ingest(self) -> None:
        self.write_fixture_sources()

        dry_run = sync_strategy_memory(
            memory_root=self.memory_root,
            source_roots=self.roots,
            dry_run=True,
        )
        self.assertTrue(dry_run["dryRun"])
        self.assertFalse(strategy_memory_db_path(self.memory_root).exists())

        first = sync_strategy_memory(
            memory_root=self.memory_root,
            source_roots=self.roots,
            process_jobs=True,
        )
        status = strategy_memory_status(self.memory_root)
        lesson_results = query_strategy_memory(
            "first reclaim OI confirmation",
            strategy_id="btc_memory_alpha",
            memory_root=self.memory_root,
        )
        doc_results = query_strategy_memory(
            "funding squeeze continuation",
            strategy_id="btc_memory_alpha",
            memory_root=self.memory_root,
        )
        second = sync_strategy_memory(
            memory_root=self.memory_root,
            source_roots=self.roots,
            process_jobs=True,
        )

        self.assertEqual(first["changedSources"], 4)
        self.assertGreaterEqual(first["processedJobs"], 4)
        self.assertEqual(status["failedJobCount"], 0)
        self.assertGreater(status["summaryCount"], 0)
        self.assertEqual(status["lifecycleCounts"].get("scored"), status["chunkCount"])
        self.assertGreaterEqual(lesson_results["count"], 1)
        self.assertIn("first reclaim", lesson_results["results"][0]["snippet"].lower())
        self.assertGreaterEqual(doc_results["count"], 1)
        self.assertIn("docs/strategies/btc-memory-alpha.md", doc_results["results"][0]["path"])
        self.assertEqual(second["changedSources"], 0)
        self.assertEqual(second["unchangedSources"], 4)

    def test_cli_memory_commands_are_registered(self) -> None:
        parser = build_parser()
        sync_args = parser.parse_args(["memory", "sync", "--dry-run"])
        query_args = parser.parse_args(["memory", "query", "what did we learn?", "--strategy", "btc_memory_alpha"])
        status_args = parser.parse_args(["memory", "status"])

        self.assertEqual(sync_args.memory_command, "sync")
        self.assertTrue(sync_args.dry_run)
        self.assertEqual(query_args.memory_command, "query")
        self.assertEqual(query_args.strategy, "btc_memory_alpha")
        self.assertEqual(status_args.memory_command, "status")


if __name__ == "__main__":
    unittest.main()
