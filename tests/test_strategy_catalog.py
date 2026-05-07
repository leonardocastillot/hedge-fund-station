from __future__ import annotations

import asyncio
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException

from backend.hyperliquid_gateway import app as gateway_app
from backend.hyperliquid_gateway.app import (
    build_paper_runtime_supervisor_status,
    finalize_strategy_row,
    make_strategy_row,
    strategy_catalog_card,
    strategy_catalog_payload,
)
from backend.hyperliquid_gateway.backtesting.doubling import (
    build_doubling_estimate,
    build_doubling_stability_audit,
    build_paper_baseline,
    build_paper_readiness,
)
from backend.hyperliquid_gateway.backtesting import workflow


class StrategyCatalogTest(unittest.TestCase):
    def test_strategy_document_discovery_normalizes_research_suffixes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            docs_root = Path(tmp)
            (docs_root / "README.md").write_text("# Ignore\n", encoding="utf-8")
            (docs_root / "short-squeeze-continuation-template.md").write_text("# Ignore\n", encoding="utf-8")
            (docs_root / "docs-only-edge.md").write_text("# Docs Only Edge\n", encoding="utf-8")
            (docs_root / "funding-exhaustion-snap-validation.md").write_text("# Funding Validation\n", encoding="utf-8")
            (docs_root / "polymarket-btc-updown-5m-research-note.md").write_text("# Poly Research\n", encoding="utf-8")

            self.assertEqual(
                workflow.discover_strategy_documents(docs_root),
                ["docs_only_edge", "funding_exhaustion_snap", "polymarket_btc_updown_5m"],
            )

    def test_status_snapshot_includes_docs_backend_registered_and_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            docs_root = root / "docs" / "strategies"
            reports_root = root / "data" / "backtests"
            validations_root = root / "data" / "validations"
            paper_root = root / "data" / "paper"
            audits_root = root / "data" / "audits"
            for path in [docs_root, reports_root, validations_root, paper_root, audits_root]:
                path.mkdir(parents=True, exist_ok=True)
            (docs_root / "docs-only-strategy.md").write_text("# Docs Only Strategy\n", encoding="utf-8")
            (reports_root / "artifact_only_strategy-unit-20260505T000000Z.json").write_text(
                json.dumps(
                    {
                        "strategy_id": "artifact_only_strategy",
                        "generated_at": "2026-05-05T00:00:00Z",
                        "summary": {"total_trades": 3},
                    }
                ),
                encoding="utf-8",
            )

            original = {
                "DOCS_STRATEGIES_ROOT": workflow.DOCS_STRATEGIES_ROOT,
                "REPORTS_ROOT": workflow.REPORTS_ROOT,
                "VALIDATIONS_ROOT": workflow.VALIDATIONS_ROOT,
                "PAPER_ROOT": workflow.PAPER_ROOT,
                "AUDITS_ROOT": workflow.AUDITS_ROOT,
                "BACKEND_ROOT": workflow.BACKEND_ROOT,
                "available_strategies": workflow.available_strategies,
                "discover_strategy_packages": workflow.discover_strategy_packages,
            }
            try:
                workflow.DOCS_STRATEGIES_ROOT = docs_root
                workflow.REPORTS_ROOT = reports_root
                workflow.VALIDATIONS_ROOT = validations_root
                workflow.PAPER_ROOT = paper_root
                workflow.AUDITS_ROOT = audits_root
                workflow.BACKEND_ROOT = root / "backend" / "hyperliquid_gateway"
                workflow.available_strategies = lambda: ["registered_only_strategy"]  # type: ignore[assignment]
                workflow.discover_strategy_packages = lambda: ["backend_only_strategy"]  # type: ignore[assignment]

                snapshot = workflow.build_status_snapshot()
            finally:
                for name, value in original.items():
                    setattr(workflow, name, value)

            by_id = {row["strategy_id"]: row for row in snapshot["strategy_status"]}
            self.assertEqual(by_id["docs_only_strategy"]["promotion_stage"], "docs_only")
            self.assertEqual(by_id["backend_only_strategy"]["promotion_stage"], "research_package_only")
            self.assertEqual(by_id["registered_only_strategy"]["promotion_stage"], "registered_for_backtest")
            self.assertEqual(by_id["artifact_only_strategy"]["promotion_stage"], "backtest_complete")
            self.assertIn("docs_only_strategy", snapshot["docs_only_strategy_ids"])

    def test_catalog_card_separates_visibility_from_backtest_registration(self) -> None:
        row = make_strategy_row("docs_only_strategy", display_name="Docs Only Strategy")
        row["sourceTypes"] = ["docs"]
        row["documentationPaths"] = ["/tmp/docs/strategies/docs-only-strategy.md"]
        row["latestArtifactPaths"]["docs"] = row["documentationPaths"][0]
        row["registeredForBacktest"] = False
        row["canBacktest"] = False
        row["stage"] = "research"

        card = strategy_catalog_card(row)

        self.assertEqual(card["strategyId"], "docs_only_strategy")
        self.assertFalse(card["registeredForBacktest"])
        self.assertFalse(card["canBacktest"])
        self.assertEqual(card["documentationPaths"], ["/tmp/docs/strategies/docs-only-strategy.md"])

    def test_catalog_payload_keeps_runtime_rows_out_of_strategy_cards(self) -> None:
        strategy_row = make_strategy_row("btc_crowding_scalper")
        runtime_row = make_strategy_row("runtime:BTC::short_squeeze")
        runtime_row["strategyId"] = "runtime:BTC::short_squeeze"

        payload = strategy_catalog_payload({"updatedAt": 1, "summary": {}, "runtimeError": None, "strategies": [strategy_row, runtime_row]})

        self.assertEqual([row["strategyId"] for row in payload["strategies"]], ["btc_crowding_scalper"])

    def test_paper_runtime_supervisor_status_reads_screen_metadata_and_last_tick(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            meta_path = root / "btc-paper-runtime-loop.meta"
            pid_path = root / "btc-paper-runtime-loop.pid"
            log_path = root / "btc-paper-runtime-loop.log"
            meta_path.write_text(
                "\n".join(
                    [
                        "strategy=btc_failed_impulse_reversal",
                        "gateway_url=http://127.0.0.1:18001",
                        "interval_seconds=300",
                        "max_ticks=0",
                        "dry_run=false",
                        "fail_fast=false",
                        "portfolio_value=100000",
                        "started_at=2026-05-06T22:46:54Z",
                    ]
                ),
                encoding="utf-8",
            )
            pid_path.write_text("999999", encoding="utf-8")
            log_path.write_text(
                "\n".join(
                    [
                        json.dumps({"event": "paper_runtime_loop_started", "strategyId": "btc_failed_impulse_reversal"}),
                        json.dumps(
                            {
                                "event": "paper_runtime_tick",
                                "tick": 3,
                                "ok": True,
                                "status": "managing-open-trade",
                                "signal": "long",
                                "entryBlockReason": "matching_open_trade",
                            }
                        ),
                    ]
                ),
                encoding="utf-8",
            )

            original = {
                "PAPER_LOOP_META_FILE": gateway_app.PAPER_LOOP_META_FILE,
                "PAPER_LOOP_PID_FILE": gateway_app.PAPER_LOOP_PID_FILE,
                "PAPER_LOOP_LOG_FILE": gateway_app.PAPER_LOOP_LOG_FILE,
                "PAPER_LOOP_SCREEN_SESSION": gateway_app.PAPER_LOOP_SCREEN_SESSION,
                "supervisor_screen_pid": gateway_app.supervisor_screen_pid,
            }
            try:
                gateway_app.PAPER_LOOP_META_FILE = meta_path
                gateway_app.PAPER_LOOP_PID_FILE = pid_path
                gateway_app.PAPER_LOOP_LOG_FILE = log_path
                gateway_app.PAPER_LOOP_SCREEN_SESSION = "btc-paper-runtime-loop"
                gateway_app.supervisor_screen_pid = lambda: "12345"  # type: ignore[assignment]

                status = build_paper_runtime_supervisor_status("btc_failed_impulse_reversal", tail_lines=10)
            finally:
                for name, value in original.items():
                    setattr(gateway_app, name, value)

            self.assertTrue(status["running"])
            self.assertEqual(status["mode"], "screen")
            self.assertEqual(status["pid"], "12345")
            self.assertEqual(status["intervalSeconds"], 300.0)
            self.assertFalse(status["dryRun"])
            self.assertEqual(status["healthStatus"], "healthy")
            self.assertEqual(status["healthBlockers"], [])
            self.assertTrue(status["healthChecks"]["notStale"])
            self.assertTrue(status["strategyMatches"])
            self.assertEqual(status["lastTick"]["status"], "managing-open-trade")
            self.assertEqual(status["lastTick"]["entryBlockReason"], "matching_open_trade")

    def test_paper_runtime_supervisor_status_reports_blockers(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            meta_path = root / "btc-paper-runtime-loop.meta"
            pid_path = root / "btc-paper-runtime-loop.pid"
            log_path = root / "btc-paper-runtime-loop.log"
            meta_path.write_text(
                "\n".join(
                    [
                        "strategy=other_strategy",
                        "interval_seconds=300",
                        "dry_run=true",
                        "started_at=2026-05-06T22:46:54Z",
                    ]
                ),
                encoding="utf-8",
            )
            pid_path.write_text("999999", encoding="utf-8")
            log_path.write_text("", encoding="utf-8")

            original = {
                "PAPER_LOOP_META_FILE": gateway_app.PAPER_LOOP_META_FILE,
                "PAPER_LOOP_PID_FILE": gateway_app.PAPER_LOOP_PID_FILE,
                "PAPER_LOOP_LOG_FILE": gateway_app.PAPER_LOOP_LOG_FILE,
                "supervisor_screen_pid": gateway_app.supervisor_screen_pid,
            }
            try:
                gateway_app.PAPER_LOOP_META_FILE = meta_path
                gateway_app.PAPER_LOOP_PID_FILE = pid_path
                gateway_app.PAPER_LOOP_LOG_FILE = log_path
                gateway_app.supervisor_screen_pid = lambda: None  # type: ignore[assignment]

                status = build_paper_runtime_supervisor_status("btc_failed_impulse_reversal", tail_lines=10)
            finally:
                for name, value in original.items():
                    setattr(gateway_app, name, value)

            self.assertFalse(status["running"])
            self.assertEqual(status["healthStatus"], "stopped")
            self.assertIn("supervisor_not_running", status["healthBlockers"])
            self.assertIn("supervisor_strategy_mismatch", status["healthBlockers"])
            self.assertIn("dry_run_enabled", status["healthBlockers"])

    def test_pipeline_marks_docs_only_strategy_as_research(self) -> None:
        row = make_strategy_row("docs_only_strategy")
        row["checklist"]["docsExists"] = True

        finalized = finalize_strategy_row(row)

        self.assertEqual(finalized["pipelineStage"], "research")
        self.assertEqual(finalized["gateStatus"], "backtest-required")
        self.assertIn("backend_module", finalized["gateReasons"])
        self.assertFalse(finalized["nextAction"]["enabled"])

    def test_pipeline_marks_registered_strategy_without_backtest_as_backtesting(self) -> None:
        row = make_strategy_row("registered_strategy")
        row["registeredForBacktest"] = True

        finalized = finalize_strategy_row(row)

        self.assertEqual(finalized["pipelineStage"], "backtesting")
        self.assertEqual(finalized["gateStatus"], "backtest-running-eligible")
        self.assertTrue(finalized["nextAction"]["enabled"])

    def test_pipeline_marks_robust_passing_backtest_as_audit_eligible(self) -> None:
        row = make_strategy_row("passing_strategy")
        row["registeredForBacktest"] = True
        row["checklist"]["backtestExists"] = True
        row["robustAssessment"] = {"status": "passes", "blockers": []}

        finalized = finalize_strategy_row(row)

        self.assertEqual(finalized["pipelineStage"], "audit")
        self.assertEqual(finalized["gateStatus"], "audit-eligible")
        self.assertEqual(finalized["nextAction"]["label"], "Run Audit")
        self.assertTrue(finalized["nextAction"]["enabled"])

    def test_pipeline_blocks_failed_backtest_or_validation(self) -> None:
        failed_backtest = make_strategy_row("failed_backtest")
        failed_backtest["registeredForBacktest"] = True
        failed_backtest["checklist"]["backtestExists"] = True
        failed_backtest["robustAssessment"] = {"status": "insufficient-sample", "blockers": ["min_trades"]}

        blocked = finalize_strategy_row(failed_backtest)

        self.assertEqual(blocked["pipelineStage"], "blocked")
        self.assertEqual(blocked["gateStatus"], "audit-blocked")
        self.assertEqual(blocked["gateReasons"], ["min_trades"])

        failed_validation = make_strategy_row("failed_validation")
        failed_validation["registeredForBacktest"] = True
        failed_validation["checklist"]["backtestExists"] = True
        failed_validation["checklist"]["validationExists"] = True
        failed_validation["validationStatus"] = "blocked"
        failed_validation["robustAssessment"] = {"status": "passes", "blockers": []}
        failed_validation["_validationBlockingReasons"] = ["min_profit_factor"]

        validation_blocked = finalize_strategy_row(failed_validation)

        self.assertEqual(validation_blocked["pipelineStage"], "blocked")
        self.assertEqual(validation_blocked["gateStatus"], "audit-blocked")
        self.assertEqual(validation_blocked["gateReasons"], ["min_profit_factor"])

    def test_pipeline_marks_ready_validation_or_paper_artifact_as_paper(self) -> None:
        ready_validation = make_strategy_row("ready_validation")
        ready_validation["registeredForBacktest"] = True
        ready_validation["checklist"]["backtestExists"] = True
        ready_validation["checklist"]["validationExists"] = True
        ready_validation["validationStatus"] = "ready-for-paper"
        ready_validation["robustAssessment"] = {"status": "passes", "blockers": []}

        ready = finalize_strategy_row(ready_validation)

        self.assertEqual(ready["pipelineStage"], "paper")
        self.assertEqual(ready["gateStatus"], "ready-for-paper")
        self.assertTrue(ready["nextAction"]["enabled"])

        paper_candidate = make_strategy_row("paper_candidate")
        paper_candidate["checklist"]["paperCandidateExists"] = True

        candidate = finalize_strategy_row(paper_candidate)

        self.assertEqual(candidate["pipelineStage"], "paper")
        self.assertEqual(candidate["gateStatus"], "ready-for-paper")

    def test_doubling_estimate_requires_positive_validated_backtest(self) -> None:
        report = {
            "artifact_id": "backtest_report:btc_demo:20260506T000000Z",
            "strategy_id": "btc_demo",
            "dataset": {
                "start": "2026-05-01T00:00:00Z",
                "end": "2026-05-04T00:00:00Z",
            },
            "config": {"fee_model": "taker", "risk_fraction": 0.1},
            "summary": {"return_pct": 1.0, "total_trades": 10},
            "robust_assessment": {"status": "passes", "blockers": []},
        }

        estimate = build_doubling_estimate(report, validation_payload={"status": "ready-for-paper"})

        self.assertEqual(estimate["status"], "candidate")
        self.assertTrue(estimate["candidate"])
        self.assertEqual(estimate["feeModel"], "taker")
        self.assertEqual(estimate["totalTrades"], 10)
        self.assertAlmostEqual(estimate["projectedDaysToDouble"], 209.0, places=1)
        self.assertEqual(estimate["projectedTradesToDouble"], 697)

        blocked = build_doubling_estimate(
            {**report, "summary": {"return_pct": -0.25, "total_trades": 10}},
            validation_payload={"status": "blocked", "blocking_reasons": ["min_return_pct"]},
        )

        self.assertEqual(blocked["status"], "no-positive-return")
        self.assertFalse(blocked["candidate"])
        self.assertIsNone(blocked["projectedDaysToDouble"])
        self.assertIn("positive_net_return", blocked["blockers"])

    def test_catalog_card_includes_doubling_estimate(self) -> None:
        row = make_strategy_row("btc_demo")
        row["doublingEstimate"] = {
            "status": "candidate",
            "candidate": True,
            "projectedDaysToDouble": 209.0,
        }
        row["doublingStability"] = {
            "status": "stable",
            "positiveSliceRatioPct": 100.0,
            "largestPositiveSlicePnlSharePct": 33.33,
        }
        row["btcOptimization"] = {
            "status": "fragile-best-candidate",
            "topVariantId": "fast_target",
            "topProjectedDaysToDouble": 180.0,
        }

        card = strategy_catalog_card(row)

        self.assertEqual(card["doublingEstimate"]["status"], "candidate")
        self.assertEqual(card["doublingEstimate"]["projectedDaysToDouble"], 209.0)
        self.assertEqual(card["doublingStability"]["status"], "stable")
        self.assertEqual(card["btcOptimization"]["topVariantId"], "fast_target")

    def test_doubling_stability_audit_flags_concentration(self) -> None:
        report = {
            "artifact_id": "backtest_report:btc_demo:20260506T000000Z",
            "strategy_id": "btc_demo",
            "dataset": {
                "start": "2026-05-01T00:00:00Z",
                "end": "2026-05-04T00:00:00Z",
            },
            "config": {"fee_model": "taker", "risk_fraction": 0.1},
            "summary": {
                "initial_equity": 100_000.0,
                "net_profit": 3_000.0,
                "return_pct": 3.0,
                "total_trades": 3,
            },
            "robust_assessment": {"status": "passes", "blockers": []},
            "trades": [
                {"exit_timestamp": "2026-05-01T12:00:00Z", "net_pnl": 1_000.0, "return_pct": 1.0},
                {"exit_timestamp": "2026-05-02T12:00:00Z", "net_pnl": 1_000.0, "return_pct": 1.0},
                {"exit_timestamp": "2026-05-03T12:00:00Z", "net_pnl": 1_000.0, "return_pct": 1.0},
            ],
        }

        stable = build_doubling_stability_audit(report, validation_payload={"status": "ready-for-paper"}, slice_count=3)

        self.assertEqual(stable["status"], "stable")
        self.assertEqual(stable["activeSliceCount"], 3)
        self.assertEqual(stable["positiveSliceRatioPct"], 100.0)
        self.assertLess(stable["largestPositiveSlicePnlSharePct"], 55.0)

        concentrated = build_doubling_stability_audit(
            {
                **report,
                "trades": [
                    {"exit_timestamp": "2026-05-01T04:00:00Z", "net_pnl": 1_000.0, "return_pct": 1.0},
                    {"exit_timestamp": "2026-05-01T08:00:00Z", "net_pnl": 1_000.0, "return_pct": 1.0},
                    {"exit_timestamp": "2026-05-01T12:00:00Z", "net_pnl": 1_000.0, "return_pct": 1.0},
                ],
            },
            validation_payload={"status": "ready-for-paper"},
            slice_count=3,
        )

        self.assertEqual(concentrated["status"], "fragile")
        self.assertIn("insufficient_active_slices", concentrated["blockers"])
        self.assertIn("return_concentration", concentrated["blockers"])

    def test_paper_baseline_defines_sample_drift_and_blockers(self) -> None:
        report = {
            "artifact_id": "backtest_report:btc_demo:20260506T000000Z",
            "strategy_id": "btc_demo",
            "dataset": {
                "start": "2026-05-01T00:00:00Z",
                "end": "2026-05-04T00:00:00Z",
            },
            "config": {"fee_model": "taker", "risk_fraction": 0.1},
            "summary": {
                "return_pct": 1.0,
                "total_trades": 10,
                "profit_factor": 2.0,
                "win_rate_pct": 70.0,
                "max_drawdown_pct": 0.5,
                "fees_paid": 90.0,
            },
            "robust_assessment": {"status": "passes", "blockers": [], "metrics": {"profit_factor": 2.0}},
        }

        baseline = build_paper_baseline(
            report,
            validation_payload={"status": "ready-for-paper"},
            paper_candidate={"status": "standby", "signal": "none"},
        )

        self.assertEqual(baseline["status"], "collect-paper-evidence")
        self.assertEqual(baseline["minimumPaperSample"]["calendarDays"], 14)
        self.assertEqual(baseline["minimumPaperSample"]["closedTrades"], 30)
        self.assertEqual(baseline["backtestBenchmark"]["baselineFeePerTrade"], 9.0)
        self.assertIn("paper_drift_checks", baseline["promotionBlockers"])
        self.assertIn("operator_sign_off", baseline["promotionBlockers"])
        self.assertEqual(
            [item["key"] for item in baseline["driftChecks"]],
            [
                "paper_positive_after_fees",
                "paper_profit_factor_floor",
                "paper_avg_trade_retains_half_baseline",
                "paper_drawdown_guard",
                "paper_review_coverage",
            ],
        )

    def test_paper_readiness_evaluates_sample_and_drift_checks(self) -> None:
        baseline = {
            "status": "collect-paper-evidence",
            "backtestBenchmark": {"feeModel": "taker", "baselineFeePerTrade": 9.0},
            "minimumPaperSample": {"calendarDays": 14, "closedTrades": 30, "reviewCoveragePct": 90},
            "driftChecks": [
                {"key": "paper_positive_after_fees", "operator": ">", "threshold": 0, "metric": "paper_net_return_pct"},
                {"key": "paper_profit_factor_floor", "operator": ">=", "threshold": 1.5, "metric": "paper_profit_factor"},
                {"key": "paper_avg_trade_retains_half_baseline", "operator": ">=", "threshold": 0.055, "metric": "paper_avg_net_trade_return_pct"},
                {"key": "paper_drawdown_guard", "operator": "<=", "threshold": 2.0, "metric": "paper_max_drawdown_pct"},
                {"key": "paper_review_coverage", "operator": ">=", "threshold": 90, "metric": "review_coverage_pct"},
            ],
            "promotionBlockers": ["regime_review", "risk_review", "operator_sign_off"],
        }

        empty = build_paper_readiness(baseline=baseline, trades=[])

        self.assertEqual(empty["status"], "collecting-paper-trades")
        self.assertIn("closed_trades", empty["blockers"])
        self.assertIn("paper_positive_after_fees", empty["blockers"])

        start_ms = 1_778_000_000_000
        day_ms = 86_400_000
        trades = [
            {
                "id": trade_id,
                "createdAt": start_ms + int((trade_id - 1) * (15 * day_ms / 29)),
                "closedAt": start_ms + int((trade_id - 1) * (15 * day_ms / 29)) + 60_000,
                "status": "closed",
                "sizeUsd": 10_000.0,
                "realizedPnlUsd": 25.0,
                "review": {"outcomeTag": "valid"},
            }
            for trade_id in range(1, 31)
        ]

        ready = build_paper_readiness(baseline=baseline, trades=trades)

        self.assertEqual(ready["sampleProgress"]["closedTrades"], 30)
        self.assertTrue(ready["sampleProgress"]["checks"]["calendar_days"])
        self.assertTrue(all(item["passed"] for item in ready["driftChecks"]))
        self.assertEqual(ready["paperMetrics"]["paperAvgNetTradeReturnPct"], 0.16)
        self.assertEqual(ready["blockers"], ["regime_review", "risk_review", "operator_sign_off"])
        self.assertEqual(ready["status"], "paper-blocked")

    def test_paper_runtime_tick_dry_run_does_not_write_trade(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "hyperliquid.db"
            saved_history = {key: list(values) for key, values in gateway_app.market_history.items()}

            async def fake_ensure_overview_data() -> dict[str, object]:
                return {"markets": [], "updatedAt": 1_000_003_600_000}

            original = {
                "DB_PATH": gateway_app.DB_PATH,
                "ensure_overview_data": gateway_app.ensure_overview_data,
            }
            try:
                gateway_app.DB_PATH = str(db_path)
                gateway_app.init_db()
                gateway_app.market_history.clear()
                gateway_app.market_history["BTC"].extend(btc_runtime_history([
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
                ]))
                gateway_app.ensure_overview_data = fake_ensure_overview_data  # type: ignore[assignment]

                response = asyncio.run(
                    gateway_app.paper_runtime_tick(
                        "btc_failed_impulse_reversal",
                        dry_run=True,
                        portfolio_value=100_000,
                    )
                )
                with sqlite3.connect(db_path) as connection:
                    trade_count = connection.execute("SELECT COUNT(*) FROM paper_trades").fetchone()[0]
            finally:
                for name, value in original.items():
                    setattr(gateway_app, name, value)
                gateway_app.market_history.clear()
                for key, values in saved_history.items():
                    gateway_app.market_history[key].extend(values)

        self.assertTrue(response["success"])
        self.assertTrue(response["dryRun"])
        self.assertEqual(response["status"], "entry-ready")
        self.assertTrue(response["plan"]["entry"]["shouldOpen"])
        self.assertIsNone(response["openedTradeId"])
        self.assertEqual(trade_count, 0)

    def test_strategy_catalog_endpoint_uses_lightweight_evidence(self) -> None:
        calls: dict[str, object] = {}

        async def fake_build_strategy_evidence(
            limit: int = 500,
            runtime_limit: int = 60,
            *,
            include_database: bool = True,
            exact_db_counts: bool = False,
            mark_paper_trades: bool = True,
        ) -> dict[str, object]:
            calls["limit"] = limit
            calls["runtime_limit"] = runtime_limit
            calls["include_database"] = include_database
            calls["exact_db_counts"] = exact_db_counts
            calls["mark_paper_trades"] = mark_paper_trades
            return {
                "updatedAt": 1,
                "summary": {},
                "runtimeError": None,
                "strategies": [finalize_strategy_row(make_strategy_row("demo_strategy"))],
            }

        def fail_summarize_db(*_args: object, **_kwargs: object) -> dict[str, object]:
            raise AssertionError("catalog should not summarize the database")

        original_build = gateway_app.build_strategy_evidence
        original_summarize = gateway_app.summarize_db
        try:
            gateway_app.build_strategy_evidence = fake_build_strategy_evidence  # type: ignore[assignment]
            gateway_app.summarize_db = fail_summarize_db  # type: ignore[assignment]

            payload = asyncio.run(gateway_app.strategies_catalog(limit=20))
        finally:
            gateway_app.build_strategy_evidence = original_build  # type: ignore[assignment]
            gateway_app.summarize_db = original_summarize  # type: ignore[assignment]

        self.assertEqual(calls["limit"], 20)
        self.assertEqual(calls["runtime_limit"], 0)
        self.assertFalse(calls["include_database"])
        self.assertFalse(calls["mark_paper_trades"])
        self.assertEqual(payload["strategies"][0]["strategyId"], "demo_strategy")

    def test_backtest_artifact_summaries_are_ordered_and_match_validation(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            reports_root = root / "backtests"
            validations_root = root / "validations"
            reports_root.mkdir()
            validations_root.mkdir()
            older_artifact = "backtest_report:demo_strategy:20260505T000000Z"
            newer_artifact = "backtest_report:demo_strategy:20260506T000000Z"
            (reports_root / "demo_strategy-hyperliquid-20260505T000000Z.json").write_text(
                json.dumps(
                    {
                        "artifact_id": older_artifact,
                        "strategy_id": "demo_strategy",
                        "generated_at": "2026-05-05T00:00:00Z",
                        "summary": {"total_trades": 1, "return_pct": -1.0},
                        "robust_assessment": {"status": "blocked"},
                    }
                ),
                encoding="utf-8",
            )
            (reports_root / "demo_strategy-hyperliquid-20260506T000000Z.json").write_text(
                json.dumps(
                    {
                        "artifact_id": newer_artifact,
                        "strategy_id": "demo_strategy",
                        "generated_at": "2026-05-06T00:00:00Z",
                        "summary": {"total_trades": 4, "return_pct": 2.5},
                        "robust_assessment": {"status": "passes"},
                    }
                ),
                encoding="utf-8",
            )
            (validations_root / "demo_strategy-20260506T000000Z.json").write_text(
                json.dumps(
                    {
                        "strategy_id": "demo_strategy",
                        "status": "ready-for-paper",
                        "report_artifact_id": newer_artifact,
                    }
                ),
                encoding="utf-8",
            )

            original = {
                "REPORTS_ROOT": gateway_app.REPORTS_ROOT,
                "VALIDATIONS_ROOT": gateway_app.VALIDATIONS_ROOT,
            }
            try:
                gateway_app.REPORTS_ROOT = reports_root
                gateway_app.VALIDATIONS_ROOT = validations_root

                summaries = gateway_app.backtest_artifact_summaries("demo_strategy", limit=10)
            finally:
                for name, value in original.items():
                    setattr(gateway_app, name, value)

        self.assertEqual([item["artifactId"] for item in summaries], [newer_artifact, older_artifact])
        self.assertEqual(summaries[0]["validationStatus"], "ready-for-paper")
        self.assertIn("doublingEstimate", summaries[0])
        self.assertIsNone(summaries[1]["validationStatus"])

    def test_backtest_artifact_detail_rejects_strategy_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            reports_root = Path(tmp)
            artifact_id = "backtest_report:other_strategy:20260506T000000Z"
            (reports_root / "demo_strategy-hyperliquid-20260506T000000Z.json").write_text(
                json.dumps(
                    {
                        "artifact_id": artifact_id,
                        "strategy_id": "other_strategy",
                        "generated_at": "2026-05-06T00:00:00Z",
                    }
                ),
                encoding="utf-8",
            )

            original = gateway_app.REPORTS_ROOT
            try:
                gateway_app.REPORTS_ROOT = reports_root

                with self.assertRaises(HTTPException) as raised:
                    gateway_app.backtest_artifact_payload("demo_strategy", artifact_id)
            finally:
                gateway_app.REPORTS_ROOT = original

        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("belongs to other_strategy", raised.exception.detail)

    def test_validation_endpoint_uses_latest_report_and_reports_missing_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            reports_root = root / "backtests"
            validations_root = root / "validations"
            reports_root.mkdir()
            validations_root.mkdir()
            (reports_root / "demo_strategy-hyperliquid-20260505T000000Z.json").write_text(
                json.dumps(
                    {
                        "artifact_id": "backtest_report:demo_strategy:20260505T000000Z",
                        "strategy_id": "demo_strategy",
                    }
                ),
                encoding="utf-8",
            )
            latest_path = reports_root / "demo_strategy-hyperliquid-20260506T000000Z.json"
            latest_path.write_text(
                json.dumps(
                    {
                        "artifact_id": "backtest_report:demo_strategy:20260506T000000Z",
                        "strategy_id": "demo_strategy",
                    }
                ),
                encoding="utf-8",
            )

            calls: dict[str, object] = {}

            def fake_validate_strategy_workflow(strategy_id: str, report_path: Path) -> dict[str, object]:
                calls["strategy_id"] = strategy_id
                calls["report_path"] = report_path
                return {
                    "validation_path": validations_root / "demo_strategy-20260506T000000Z.json",
                    "payload": {"status": "blocked", "blocking_reasons": ["min_trades"]},
                }

            original = {
                "REPORTS_ROOT": gateway_app.REPORTS_ROOT,
                "VALIDATIONS_ROOT": gateway_app.VALIDATIONS_ROOT,
                "validate_strategy_workflow": gateway_app.validate_strategy_workflow,
            }
            try:
                gateway_app.REPORTS_ROOT = reports_root
                gateway_app.VALIDATIONS_ROOT = validations_root
                gateway_app.validate_strategy_workflow = fake_validate_strategy_workflow  # type: ignore[assignment]

                response = asyncio.run(gateway_app.run_strategy_validation("demo_strategy"))
                empty_root = root / "empty"
                empty_root.mkdir()
                gateway_app.REPORTS_ROOT = empty_root
                with self.assertRaises(HTTPException) as raised:
                    asyncio.run(gateway_app.run_strategy_validation("demo_strategy"))
            finally:
                for name, value in original.items():
                    setattr(gateway_app, name, value)

        self.assertEqual(calls["strategy_id"], "demo_strategy")
        self.assertEqual(calls["report_path"], latest_path)
        self.assertTrue(response["success"])
        self.assertEqual(response["validation"]["status"], "blocked")
        self.assertEqual(raised.exception.status_code, 404)

def btc_runtime_history(prices: list[float]) -> list[dict[str, object]]:
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


if __name__ == "__main__":
    unittest.main()
