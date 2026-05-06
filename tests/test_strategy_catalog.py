from __future__ import annotations

import asyncio
import json
import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException

from backend.hyperliquid_gateway import app as gateway_app
from backend.hyperliquid_gateway.app import finalize_strategy_row, make_strategy_row, strategy_catalog_card, strategy_catalog_payload
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


if __name__ == "__main__":
    unittest.main()
