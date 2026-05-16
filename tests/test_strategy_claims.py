from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from backend.hyperliquid_gateway.strategy_claims import (
    StrategyClaimConflictError,
    claim_strategy,
    list_strategy_claims,
    release_strategy_claim,
)
from scripts import agent_harness


def write_task_queue(root: Path) -> Path:
    path = root / "agent_tasks.json"
    path.write_text(
        json.dumps(
            {
                "project": "test",
                "description": "test queue",
                "rules": {"one_implementation_task_at_a_time": True},
                "tasks": [],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return path


class StrategyClaimsTest(unittest.TestCase):
    def test_claim_creates_scaffold_task_current_and_claim_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            tasks_path = write_task_queue(root)
            claims_path = root / "progress" / "strategy_claims.json"
            current_path = root / "progress" / "current.md"

            result = claim_strategy(
                strategy_id="BTC Factory Test",
                title="BTC Factory Test",
                asset_symbol="BTC",
                owner="unit-test",
                repo_root=root,
                claims_path=claims_path,
                tasks_path=tasks_path,
                current_path=current_path,
            )

            self.assertTrue(result["ok"])
            self.assertEqual(result["claim"]["strategy_id"], "btc_factory_test")
            self.assertTrue((root / "docs" / "strategies" / "btc-factory-test.md").exists())
            self.assertTrue((root / "backend" / "hyperliquid_gateway" / "strategies" / "btc_factory_test" / "logic.py").exists())
            task_queue = json.loads(tasks_path.read_text(encoding="utf-8"))
            self.assertEqual(task_queue["tasks"][0]["id"], "btc_factory_test")
            self.assertEqual(task_queue["tasks"][0]["status"], "in_progress")
            self.assertIn("btc_factory_test", current_path.read_text(encoding="utf-8"))
            claims = json.loads(claims_path.read_text(encoding="utf-8"))["claims"]
            self.assertEqual(len(claims), 1)

    def test_duplicate_active_asset_is_blocked(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            tasks_path = write_task_queue(root)
            claims_path = root / "progress" / "strategy_claims.json"
            current_path = root / "progress" / "current.md"

            claim_strategy(
                strategy_id="btc_first_claim",
                title="BTC First Claim",
                asset_symbol="BTC",
                repo_root=root,
                claims_path=claims_path,
                tasks_path=tasks_path,
                current_path=current_path,
            )

            with self.assertRaises(StrategyClaimConflictError):
                claim_strategy(
                    strategy_id="btc_second_claim",
                    title="BTC Second Claim",
                    asset_symbol="BTC",
                    repo_root=root,
                    claims_path=claims_path,
                    tasks_path=tasks_path,
                    current_path=current_path,
                )

    def test_same_claim_is_idempotent_and_does_not_overwrite_scaffold(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            tasks_path = write_task_queue(root)
            claims_path = root / "progress" / "strategy_claims.json"
            current_path = root / "progress" / "current.md"

            claim_strategy(
                strategy_id="btc_repeat_claim",
                title="BTC Repeat Claim",
                asset_symbol="BTC",
                repo_root=root,
                claims_path=claims_path,
                tasks_path=tasks_path,
                current_path=current_path,
            )
            logic_path = root / "backend" / "hyperliquid_gateway" / "strategies" / "btc_repeat_claim" / "logic.py"
            logic_path.write_text("# keep me\n", encoding="utf-8")

            result = claim_strategy(
                strategy_id="btc_repeat_claim",
                title="BTC Repeat Claim",
                asset_symbol="BTC",
                repo_root=root,
                claims_path=claims_path,
                tasks_path=tasks_path,
                current_path=current_path,
            )

            self.assertTrue(result["idempotent"])
            self.assertEqual(logic_path.read_text(encoding="utf-8"), "# keep me\n")
            listed = list_strategy_claims(claims_path=claims_path)
            self.assertEqual(len(listed["claims"]), 1)

    def test_release_claim_updates_task_and_current(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            tasks_path = write_task_queue(root)
            claims_path = root / "progress" / "strategy_claims.json"
            current_path = root / "progress" / "current.md"
            handoff = root / "progress" / "impl_btc_release_claim.md"
            handoff.parent.mkdir(parents=True, exist_ok=True)
            handoff.write_text("# handoff\n", encoding="utf-8")

            claim_strategy(
                strategy_id="btc_release_claim",
                title="BTC Release Claim",
                asset_symbol="BTC",
                repo_root=root,
                claims_path=claims_path,
                tasks_path=tasks_path,
                current_path=current_path,
            )
            result = release_strategy_claim(
                strategy_id="btc_release_claim",
                status="done",
                handoff_path="progress/impl_btc_release_claim.md",
                repo_root=root,
                claims_path=claims_path,
                tasks_path=tasks_path,
                current_path=current_path,
            )

            self.assertEqual(result["claim"]["status"], "done")
            task = json.loads(tasks_path.read_text(encoding="utf-8"))["tasks"][0]
            self.assertEqual(task["status"], "done")
            self.assertIn("progress/impl_btc_release_claim.md", task["evidence_paths"])
            self.assertIn("Task: none", current_path.read_text(encoding="utf-8"))

    def test_harness_validation_detects_duplicate_active_asset_claims(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            claims_path = root / "progress" / "strategy_claims.json"
            claims_path.parent.mkdir(parents=True, exist_ok=True)
            claims_path.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "claims": [
                            {
                                "strategy_id": "btc_a",
                                "asset_symbol": "BTC",
                                "status": "in_progress",
                            },
                            {
                                "strategy_id": "btc_b",
                                "asset_symbol": "BTC",
                                "status": "review",
                            },
                        ],
                    }
                ),
                encoding="utf-8",
            )
            original_repo = agent_harness.REPO_ROOT
            original_claims = agent_harness.CLAIMS_PATH
            try:
                agent_harness.REPO_ROOT = root
                agent_harness.CLAIMS_PATH = claims_path
                issues = agent_harness.validate_strategy_claims(
                    [
                        {
                            "id": "btc_a",
                            "status": "in_progress",
                            "scope": [
                                "progress/strategy_claims.json",
                                "docs/strategies/btc-a.md",
                                "backend/hyperliquid_gateway/strategies/btc_a/",
                            ],
                        },
                        {
                            "id": "btc_b",
                            "status": "review",
                            "scope": [
                                "progress/strategy_claims.json",
                                "docs/strategies/btc-b.md",
                                "backend/hyperliquid_gateway/strategies/btc_b/",
                            ],
                        },
                    ]
                )
            finally:
                agent_harness.REPO_ROOT = original_repo
                agent_harness.CLAIMS_PATH = original_claims

            messages = [issue.message for issue in issues]
            self.assertTrue(any("More than one active strategy claim for asset BTC" in message for message in messages))


if __name__ == "__main__":
    unittest.main()
