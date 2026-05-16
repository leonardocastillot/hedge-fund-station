#!/usr/bin/env python3
"""Validate and summarize the file-based agent harness."""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
TASKS_PATH = REPO_ROOT / "agent_tasks.json"
CURRENT_PATH = REPO_ROOT / "progress" / "current.md"
CLAIMS_PATH = REPO_ROOT / "progress" / "strategy_claims.json"
GRAPHIFY_OUT_PATH = REPO_ROOT / "graphify-out"
OBSIDIAN_VAULT_PATH = REPO_ROOT / "hedge-station"
VALID_STATUSES = {"pending", "in_progress", "review", "done", "blocked"}
ACTIVE_STATUSES = {"in_progress", "review"}
REQUIRED_FILES = [
    "AGENTS.md",
    "RTK.md",
    "CAVEMAN.md",
    "CHECKPOINTS.md",
    "agent_tasks.json",
    "progress/README.md",
    "progress/current.md",
    "progress/history.md",
    "progress/strategy_claims.json",
    "docs/operations/agents/file-harness.md",
    "docs/operations/agents/roles/leader.md",
    "docs/operations/agents/roles/explorer.md",
    "docs/operations/agents/roles/implementer.md",
    "docs/operations/agents/roles/reviewer.md",
]
REQUIRED_TASK_FIELDS = {
    "id",
    "title",
    "mission_class",
    "priority",
    "scope",
    "acceptance",
    "verification",
    "status",
    "owner",
    "evidence_paths",
    "notes",
}
LIVE_TERMS = ("live", "production", "prod", "execution")
LIVE_GATE_TERMS = ("research", "backtest", "validation", "paper", "risk", "operator")
MEMORY_FILES = [
    "docs/operations/agents/memory/memory-policy.md",
    "docs/operations/agents/memory/shared-memory.md",
    "docs/operations/agents/memory/decisions.md",
    "docs/operations/agents/memory/open-questions.md",
    "docs/operations/agents/memory/mission-log.md",
]


class HarnessIssue:
    """A single validation issue."""

    def __init__(self, message: str, *, warning: bool = False) -> None:
        self.message = message
        self.warning = warning


def repo_path(relative: str) -> Path:
    return REPO_ROOT / relative


def load_json(path: Path) -> tuple[dict[str, Any] | None, list[HarnessIssue]]:
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None, [HarnessIssue(f"Missing {path.relative_to(REPO_ROOT)}")]
    except json.JSONDecodeError as exc:
        return None, [HarnessIssue(f"Invalid JSON in {path.relative_to(REPO_ROOT)}: {exc}")]
    if not isinstance(parsed, dict):
        return None, [HarnessIssue(f"{path.relative_to(REPO_ROOT)} must contain a JSON object")]
    return parsed, []


def task_id(task: dict[str, Any], index: int) -> str:
    value = task.get("id")
    return str(value) if value else f"<task #{index + 1}>"


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def git_value(args: list[str], *, timeout: float = 2) -> str | None:
    value = git_output(args, timeout=timeout)
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def git_output(args: list[str], *, timeout: float = 2) -> str | None:
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if result.returncode != 0:
        return None
    return result.stdout


def git_dirty() -> bool | None:
    value = git_output(["status", "--porcelain", "--untracked-files=all"])
    if value is None:
        return None
    return bool(value.strip())


def graphify_collection(payload: dict[str, Any], primary: str, fallback: str | None = None) -> list[Any]:
    value = payload.get(primary)
    if isinstance(value, list):
        return value
    if fallback:
        fallback_value = payload.get(fallback)
        if isinstance(fallback_value, list):
            return fallback_value
    nested = payload.get("graph")
    if isinstance(nested, dict):
        nested_value = nested.get(primary)
        if isinstance(nested_value, list):
            return nested_value
        if fallback:
            nested_fallback = nested.get(fallback)
            if isinstance(nested_fallback, list):
                return nested_fallback
    return []


def graphify_built_commit(report_path: Path) -> str | None:
    if not report_path.exists():
        return None
    try:
        for line in report_path.read_text(encoding="utf-8").splitlines():
            if "Built from commit:" not in line:
                continue
            value = line.split("Built from commit:", 1)[1].strip()
            return value.strip("`").strip() or None
    except OSError:
        return None
    return None


def graphify_counts(graph_path: Path) -> tuple[int | None, int | None, int | None]:
    if not graph_path.exists():
        return None, None, None
    try:
        payload = json.loads(graph_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None, None, None
    if not isinstance(payload, dict):
        return None, None, None
    nodes = graphify_collection(payload, "nodes")
    edges = graphify_collection(payload, "edges", "links")
    communities = payload.get("communities")
    if isinstance(communities, list):
        community_count = len(communities)
    elif isinstance(communities, dict):
        community_count = len(communities)
    else:
        community_values = {
            node.get("community") or node.get("cluster") or node.get("community_id") or node.get("communityId")
            for node in nodes
            if isinstance(node, dict)
        }
        community_count = len({value for value in community_values if value not in (None, "")})
    return len(nodes), len(edges), community_count


def graphify_changed_paths_since_built(built_commit: str | None, current_commit: str | None) -> list[str] | None:
    if not built_commit or not current_commit or built_commit == current_commit:
        return []
    value = git_value(["diff", "--name-only", f"{built_commit}..{current_commit}"])
    if value is None:
        return None
    return [line.strip() for line in value.splitlines() if line.strip()]


def graphify_only_generated_changes(paths: list[str] | None) -> bool:
    if paths is None:
        return False
    return len(paths) > 0 and all(path == "graphify-out" or path.startswith("graphify-out/") for path in paths)


def graphify_status_summary() -> dict[str, Any]:
    required = {
        "report": GRAPHIFY_OUT_PATH / "GRAPH_REPORT.md",
        "graph": GRAPHIFY_OUT_PATH / "graph.json",
        "html": GRAPHIFY_OUT_PATH / "graph.html",
    }
    missing = [str(path.relative_to(REPO_ROOT)) for path in required.values() if not path.exists()]
    available = not missing
    built_commit = graphify_built_commit(required["report"])
    current_commit = git_value(["rev-parse", "--short=8", "HEAD"])
    has_dirty_tree = git_dirty()
    changed_paths = graphify_changed_paths_since_built(built_commit, current_commit)
    if not available:
        freshness = "missing"
    elif has_dirty_tree:
        freshness = "dirty"
    elif built_commit and current_commit:
        freshness = "fresh" if built_commit == current_commit or graphify_only_generated_changes(changed_paths) else "stale"
    else:
        freshness = "unknown"
    node_count, edge_count, community_count = graphify_counts(required["graph"])
    command = "rtk npm run graph:build" if freshness in {"missing", "stale", "dirty"} else "rtk npm run graph:check"
    return {
        "available": available,
        "freshness": freshness,
        "built_commit": built_commit,
        "current_commit": current_commit,
        "has_dirty_tree": has_dirty_tree,
        "node_count": node_count,
        "edge_count": edge_count,
        "community_count": community_count,
        "missing": missing,
        "changed_paths_since_built": changed_paths,
        "recommended_command": command,
    }


def validate_required_files() -> list[HarnessIssue]:
    issues: list[HarnessIssue] = []
    for relative in REQUIRED_FILES:
        if not repo_path(relative).exists():
            issues.append(HarnessIssue(f"Missing required harness file: {relative}"))
    return issues


def validate_tasks(data: dict[str, Any] | None) -> tuple[list[dict[str, Any]], list[HarnessIssue]]:
    if data is None:
        return [], []
    raw_tasks = data.get("tasks")
    if not isinstance(raw_tasks, list):
        return [], [HarnessIssue("agent_tasks.json must contain a tasks array")]

    issues: list[HarnessIssue] = []
    tasks: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    for index, raw_task in enumerate(raw_tasks):
        if not isinstance(raw_task, dict):
            issues.append(HarnessIssue(f"Task #{index + 1} must be an object"))
            continue
        tasks.append(raw_task)
        current_id = task_id(raw_task, index)
        missing = sorted(REQUIRED_TASK_FIELDS - raw_task.keys())
        if missing:
            issues.append(HarnessIssue(f"{current_id} missing required fields: {', '.join(missing)}"))
        if current_id in seen_ids:
            issues.append(HarnessIssue(f"Duplicate task id: {current_id}"))
        seen_ids.add(current_id)
        status = raw_task.get("status")
        if status not in VALID_STATUSES:
            issues.append(HarnessIssue(f"{current_id} has invalid status: {status}"))
        for list_field in ("scope", "acceptance", "verification", "evidence_paths"):
            if list_field in raw_task and not isinstance(raw_task.get(list_field), list):
                issues.append(HarnessIssue(f"{current_id}.{list_field} must be a list"))
        if status == "blocked" and not str(raw_task.get("notes", "")).strip():
            issues.append(HarnessIssue(f"{current_id} is blocked but has no notes"))
        if status == "done":
            issues.extend(validate_done_task(raw_task, current_id))
        issues.extend(validate_live_task(raw_task, current_id))

    nonparallel_active = [
        task
        for task in tasks
        if task.get("status") == "in_progress" and not bool(task.get("parallelizable"))
    ]
    if len(nonparallel_active) > 1:
        ids = ", ".join(str(task.get("id")) for task in nonparallel_active)
        issues.append(HarnessIssue(f"More than one non-parallel task is in_progress: {ids}"))

    return tasks, issues


def validate_done_task(task: dict[str, Any], current_id: str) -> list[HarnessIssue]:
    issues: list[HarnessIssue] = []
    evidence_paths = [str(item) for item in as_list(task.get("evidence_paths"))]
    if not evidence_paths:
        issues.append(HarnessIssue(f"{current_id} is done but has no evidence_paths"))
    evidence_text = " ".join(evidence_paths).lower()
    if not any(token in evidence_text for token in ("review_", "handoff", "impl_")):
        issues.append(
            HarnessIssue(
                f"{current_id} is done but evidence_paths do not include an implementation, review, or handoff report"
            )
        )
    for relative in evidence_paths:
        if not repo_path(relative).exists():
            issues.append(HarnessIssue(f"{current_id} evidence path does not exist: {relative}"))
    return issues


def validate_live_task(task: dict[str, Any], current_id: str) -> list[HarnessIssue]:
    haystack = " ".join(
        [
            str(task.get("title", "")),
            str(task.get("mission_class", "")),
            str(task.get("notes", "")),
            " ".join(str(item) for item in as_list(task.get("acceptance"))),
        ]
    ).lower()
    if not any(term in haystack for term in LIVE_TERMS):
        return []
    if task.get("status") != "blocked":
        missing = [term for term in LIVE_GATE_TERMS if term not in haystack]
        if missing:
            return [
                HarnessIssue(
                    f"{current_id} appears live/production-related but is not blocked and lacks gates: {', '.join(missing)}"
                )
            ]
    return []


def parse_current_field(current: str, field: str) -> str | None:
    prefix = f"- {field}:"
    for line in current.splitlines():
        if not line.startswith(prefix):
            continue
        value = line.split(":", 1)[1].strip()
        return value.strip("`").strip() or None
    return None


def validate_current(tasks: list[dict[str, Any]]) -> list[HarnessIssue]:
    issues: list[HarnessIssue] = []
    try:
        current = CURRENT_PATH.read_text(encoding="utf-8")
    except FileNotFoundError:
        return [HarnessIssue("Missing progress/current.md")]

    current_task_id = parse_current_field(current, "Task")
    current_status = parse_current_field(current, "Status")
    tasks_by_id = {str(task.get("id")): task for task in tasks}
    if current_task_id and current_task_id.lower() != "none" and current_status in ACTIVE_STATUSES:
        current_task = tasks_by_id.get(current_task_id)
        if not current_task:
            issues.append(
                HarnessIssue(
                    f"progress/current.md names active task {current_task_id} but no matching task exists in agent_tasks.json"
                )
            )
        elif current_task.get("status") not in ACTIVE_STATUSES:
            issues.append(
                HarnessIssue(
                    f"progress/current.md names active task {current_task_id} but task status is {current_task.get('status')}"
                )
            )

    active = [task for task in tasks if task.get("status") in {"in_progress", "review"}]
    if active and not any(str(task.get("id")) in current for task in active):
        ids = ", ".join(str(task.get("id")) for task in active)
        issues.append(HarnessIssue(f"progress/current.md does not mention active task(s): {ids}"))
    if not active and "Task:" not in current:
        issues.append(HarnessIssue("progress/current.md should state that no task is active", warning=True))
    return issues


def normalize_asset(value: Any) -> str:
    return "".join(char for char in str(value or "").upper() if char.isalnum())


def normalize_strategy(value: Any) -> str:
    return str(value or "").strip().lower().replace("-", "_").replace(" ", "_")


def validate_strategy_claims(tasks: list[dict[str, Any]]) -> list[HarnessIssue]:
    issues: list[HarnessIssue] = []
    data, json_issues = load_json(CLAIMS_PATH)
    issues.extend(json_issues)
    if data is None:
        return issues
    raw_claims = data.get("claims")
    if not isinstance(raw_claims, list):
        return [*issues, HarnessIssue("progress/strategy_claims.json must contain a claims array")]

    active_by_asset: dict[str, list[str]] = {}
    tasks_by_id = {str(task.get("id")): task for task in tasks}
    for index, raw_claim in enumerate(raw_claims):
        if not isinstance(raw_claim, dict):
            issues.append(HarnessIssue(f"Strategy claim #{index + 1} must be an object"))
            continue
        strategy_id = normalize_strategy(raw_claim.get("strategy_id") or raw_claim.get("claim_id"))
        asset_symbol = normalize_asset(raw_claim.get("asset_symbol"))
        status = raw_claim.get("status")
        claim_label = strategy_id or f"<claim #{index + 1}>"
        if not strategy_id:
            issues.append(HarnessIssue(f"Strategy claim #{index + 1} missing strategy_id"))
        if not asset_symbol:
            issues.append(HarnessIssue(f"{claim_label} missing asset_symbol"))
        if status not in VALID_STATUSES:
            issues.append(HarnessIssue(f"{claim_label} has invalid claim status: {status}"))
            continue
        if status not in ACTIVE_STATUSES:
            continue

        active_by_asset.setdefault(asset_symbol, []).append(strategy_id)
        task = tasks_by_id.get(strategy_id)
        if not task:
            issues.append(HarnessIssue(f"Active strategy claim {strategy_id} has no matching task in agent_tasks.json"))
            continue
        if task.get("status") not in ACTIVE_STATUSES:
            issues.append(
                HarnessIssue(
                    f"Active strategy claim {strategy_id} points to task status {task.get('status')}, expected in_progress or review"
                )
            )
        scope = [str(item) for item in as_list(task.get("scope"))]
        expected_scope = [
            "progress/strategy_claims.json",
            f"docs/strategies/{strategy_id.replace('_', '-')}.md",
            f"backend/hyperliquid_gateway/strategies/{strategy_id}/",
        ]
        for expected in expected_scope:
            if expected not in scope:
                issues.append(HarnessIssue(f"Active strategy claim {strategy_id} task scope missing {expected}"))

    for asset_symbol, strategy_ids in active_by_asset.items():
        unique_ids = sorted(set(strategy_ids))
        if len(unique_ids) > 1:
            issues.append(
                HarnessIssue(
                    f"More than one active strategy claim for asset {asset_symbol}: {', '.join(unique_ids)}"
                )
            )
    return issues


def collect_issues() -> tuple[list[dict[str, Any]], list[HarnessIssue]]:
    issues = validate_required_files()
    data, json_issues = load_json(TASKS_PATH)
    issues.extend(json_issues)
    tasks, task_issues = validate_tasks(data)
    issues.extend(task_issues)
    issues.extend(validate_strategy_claims(tasks))
    issues.extend(validate_current(tasks))
    return tasks, issues


def print_issues(issues: list[HarnessIssue]) -> None:
    for issue in issues:
        label = "WARN" if issue.warning else "FAIL"
        print(f"[{label}] {issue.message}")


def command_check(_: argparse.Namespace) -> int:
    tasks, issues = collect_issues()
    failures = [issue for issue in issues if not issue.warning]
    warnings = [issue for issue in issues if issue.warning]
    if issues:
        print_issues(issues)
    if failures:
        print(f"[FAIL] Harness check failed with {len(failures)} failure(s).")
        return 1
    print(f"[OK] Harness check passed ({len(tasks)} task(s), {len(warnings)} warning(s)).")
    return 0


def command_status(_: argparse.Namespace) -> int:
    tasks, issues = collect_issues()
    counts = Counter(str(task.get("status")) for task in tasks)
    active = [
        {
            "id": task.get("id"),
            "title": task.get("title"),
            "status": task.get("status"),
            "owner": task.get("owner"),
            "priority": task.get("priority"),
        }
        for task in tasks
        if task.get("status") in {"in_progress", "review"}
    ]
    payload = {
        "ok": not any(not issue.warning for issue in issues),
        "task_count": len(tasks),
        "status_counts": dict(sorted(counts.items())),
        "active_tasks": active,
        "issues": [
            {"level": "warning" if issue.warning else "failure", "message": issue.message}
            for issue in issues
        ],
    }
    print(json.dumps(payload, indent=2))
    return 0 if payload["ok"] else 1


def command_brief(_: argparse.Namespace) -> int:
    tasks, issues = collect_issues()
    failures = [issue for issue in issues if not issue.warning]
    warnings = [issue for issue in issues if issue.warning]
    counts = Counter(str(task.get("status")) for task in tasks)
    active = [task for task in tasks if task.get("status") in {"in_progress", "review"}]
    graph = graphify_status_summary()
    memory_missing = [relative for relative in MEMORY_FILES if not repo_path(relative).exists()]
    obsidian_index = OBSIDIAN_VAULT_PATH / "Agent Navigation Index.md"

    print("Hedge Fund Station Agent Brief")
    print("=" * 32)
    print(f"Harness: {'OK' if not failures else 'NEEDS ATTENTION'} ({len(tasks)} task(s), {len(warnings)} warning(s))")
    print(f"Task counts: {dict(sorted(counts.items()))}")
    if active:
        for task in active:
            print(f"Active: {task.get('id')} ({task.get('status')}, owner={task.get('owner')})")
    else:
        print("Active: none")
    print(
        "Graphify: "
        f"{graph['freshness']} "
        f"({graph['node_count'] if graph['node_count'] is not None else 'unknown'} nodes, "
        f"{graph['edge_count'] if graph['edge_count'] is not None else 'unknown'} edges, "
        f"built={graph['built_commit'] or 'unknown'}, head={graph['current_commit'] or 'unknown'}, "
        f"dirty={graph['has_dirty_tree']})"
    )
    if graph["missing"]:
        print(f"Graphify missing: {', '.join(graph['missing'])}")
    print(f"Graphify next: {graph['recommended_command']}")
    print(f"Memory: {'OK' if not memory_missing else 'missing ' + ', '.join(memory_missing)}")
    print(
        "Obsidian: "
        f"{'vault found' if OBSIDIAN_VAULT_PATH.exists() else 'vault missing'}; "
        f"Agent Navigation Index {'found' if obsidian_index.exists() else 'missing'}"
    )
    if issues:
        print("Issues:")
        for issue in issues:
            label = "WARN" if issue.warning else "FAIL"
            print(f"- [{label}] {issue.message}")
    print("Next reads:")
    print("1. AGENTS.md")
    print("2. RTK.md")
    print("3. CAVEMAN.md")
    print("4. progress/current.md")
    print("5. agent_tasks.json")
    print("6. docs/operations/agents/graph-memory-operating-system.md for memory/Graphify/Obsidian work")
    print("7. graphify-out/GRAPH_REPORT.md or rtk npm run graph:query -- \"<question>\" when Graphify is fresh")
    return 0 if not failures else 1


def command_init(args: argparse.Namespace) -> int:
    exit_code = command_check(args)
    if exit_code == 0:
        print("[OK] File harness is ready.")
        print("Next: read progress/current.md, then agent_tasks.json.")
    return exit_code


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="File-based AI agent harness helpers.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("init", help="Check harness readiness and print next steps.").set_defaults(func=command_init)
    subparsers.add_parser("status", help="Print task status summary as JSON.").set_defaults(func=command_status)
    subparsers.add_parser("check", help="Validate harness files and task state.").set_defaults(func=command_check)
    subparsers.add_parser("brief", help="Print a fast agent orientation brief.").set_defaults(func=command_brief)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())
