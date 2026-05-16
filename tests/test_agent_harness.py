from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from scripts import agent_harness


class AgentHarnessCurrentSessionTest(unittest.TestCase):
    def test_current_active_task_must_exist_in_task_queue(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            current_path = root / "progress" / "current.md"
            current_path.parent.mkdir(parents=True, exist_ok=True)
            current_path.write_text(
                "\n".join(
                    [
                        "# Current Agent Session",
                        "",
                        "- Task: missing_active_task",
                        "- Status: in_progress",
                        "- Owner: unit-test",
                    ]
                ),
                encoding="utf-8",
            )

            original_current = agent_harness.CURRENT_PATH
            try:
                agent_harness.CURRENT_PATH = current_path
                issues = agent_harness.validate_current([])
            finally:
                agent_harness.CURRENT_PATH = original_current

            messages = [issue.message for issue in issues]
            self.assertTrue(
                any("missing_active_task" in message and "no matching task" in message for message in messages)
            )

    def test_current_active_task_accepts_matching_active_task(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            current_path = root / "progress" / "current.md"
            current_path.parent.mkdir(parents=True, exist_ok=True)
            current_path.write_text(
                "\n".join(
                    [
                        "# Current Agent Session",
                        "",
                        "- Task: active_task",
                        "- Status: in_progress",
                        "- Owner: unit-test",
                    ]
                ),
                encoding="utf-8",
            )

            original_current = agent_harness.CURRENT_PATH
            try:
                agent_harness.CURRENT_PATH = current_path
                issues = agent_harness.validate_current(
                    [{"id": "active_task", "status": "in_progress"}]
                )
            finally:
                agent_harness.CURRENT_PATH = original_current

            self.assertEqual([], [issue.message for issue in issues])


if __name__ == "__main__":
    unittest.main()
