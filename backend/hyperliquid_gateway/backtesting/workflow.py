from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .engine import BacktestConfig
from .registry import (
    available_strategies,
    discover_strategy_packages,
    get_strategy_definition,
    resolve_default_dataset,
    run_registered_backtest,
)

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
if PACKAGE_ROOT.name == "hyperliquid_gateway" and PACKAGE_ROOT.parent.name == "backend":
    REPO_ROOT = PACKAGE_ROOT.parents[1]
    BACKEND_ROOT = PACKAGE_ROOT
else:
    REPO_ROOT = PACKAGE_ROOT
    BACKEND_ROOT = PACKAGE_ROOT
DATA_ROOT = Path(os.getenv("HYPERLIQUID_DATA_ROOT", str(BACKEND_ROOT / "data"))).expanduser()
REPORTS_ROOT = DATA_ROOT / "backtests"
AUDITS_ROOT = DATA_ROOT / "audits"
PAPER_ROOT = DATA_ROOT / "paper"
VALIDATIONS_ROOT = DATA_ROOT / "validations"
DOCS_STRATEGIES_ROOT = REPO_ROOT / "docs" / "strategies"


def run_backtest_workflow(
    *,
    strategy_id: str,
    dataset_path: Path | None,
    config: BacktestConfig,
    output_path: Path | None = None,
) -> dict[str, Any]:
    definition = get_strategy_definition(strategy_id)
    resolved_dataset = dataset_path if dataset_path is not None else resolve_default_dataset(strategy_id)
    result = run_registered_backtest(strategy_id, resolved_dataset, config=config)
    artifact_id = build_artifact_id("backtest_report", strategy_id)
    reserved_keys = {
        "dataset",
        "summary",
        "latest_signal",
        "trades",
        "equity_curve",
        "notes",
    }
    extra_payload = {key: value for key, value in result.items() if key not in reserved_keys}
    payload = {
        "artifact_id": artifact_id,
        "generated_at": now_iso(),
        "artifact_type": "backtest_report",
        "strategy_id": strategy_id,
        "research": build_research_snapshot(strategy_id),
        "dataset": result["dataset"],
        "config": {
            "initial_equity": config.initial_equity,
            "fee_rate": config.fee_rate,
            "taker_fee_rate": config.taker_fee_rate,
            "maker_fee_rate": config.maker_fee_rate,
            "fee_model": config.fee_model,
            "maker_ratio": config.maker_ratio,
            "risk_fraction": config.risk_fraction,
            "symbols": list(config.effective_symbols()),
            "universe": config.universe,
            "start": config.start,
            "end": config.end,
            "lookback_days": config.lookback_days,
        },
        "validation_policy": validation_policy_payload(definition.validation_policy),
        "summary": result["summary"],
        "latest_signal": result["latest_signal"],
        "trades": result["trades"],
        "equity_curve": result["equity_curve"],
        "notes": result.get("notes", []),
        "lineage": {
            "stage": "backtest",
            "parents": [],
            "children": ["validation_report", "paper_candidate"],
        },
    }
    payload.update(extra_payload)

    destination = output_path or REPORTS_ROOT / f"{strategy_id}-{resolved_dataset.stem}-{timestamp_slug()}.json"
    write_json(destination, payload)
    return {"report_path": destination, "payload": payload}


def validate_strategy_workflow(
    *,
    strategy_id: str,
    report_path: Path | None = None,
    output_path: Path | None = None,
) -> dict[str, Any]:
    definition = get_strategy_definition(strategy_id)
    resolved_report = report_path if report_path is not None else latest_json(REPORTS_ROOT, f"{strategy_id}-")
    research = build_research_snapshot(strategy_id)
    checks = {
        "docs_exists": research["docs_exists"],
        "spec_exists": research["spec_exists"],
        "logic_exists": research["logic_exists"],
        "scoring_exists": research["scoring_exists"],
        "risk_exists": research["risk_exists"],
        "paper_exists": research["paper_exists"],
        "registered_for_backtest": strategy_id in available_strategies(),
        "report_exists": bool(resolved_report and resolved_report.exists()),
    }

    summary: dict[str, Any] | None = None
    robust_assessment: dict[str, Any] | None = None
    gate_checks: dict[str, bool] = {}
    if resolved_report and resolved_report.exists():
        report_payload = json.loads(resolved_report.read_text(encoding="utf-8"))
        summary = report_payload.get("summary", {})
        robust_assessment = report_payload.get("robust_assessment")
        policy = definition.validation_policy
        gate_checks = {
            "min_trades": int(summary.get("total_trades", 0)) >= policy.min_trades,
            "min_return_pct": float(summary.get("return_pct", 0.0)) >= policy.min_return_pct,
            "min_profit_factor": float(summary.get("profit_factor", 0.0)) >= policy.min_profit_factor,
            "min_win_rate_pct": float(summary.get("win_rate_pct", 0.0)) >= policy.min_win_rate_pct,
            "max_drawdown_pct": float(summary.get("max_drawdown_pct", 999.0)) <= policy.max_drawdown_pct,
        }
        if robust_assessment:
            gate_checks["robust_gate"] = robust_assessment.get("status") == "passes"

    package_ready = all(checks.values())
    backtest_ready = bool(gate_checks) and all(gate_checks.values())
    status = "ready-for-paper" if package_ready and backtest_ready else "blocked"
    blocking_reasons = [
        reason
        for reason, passed in {
            **checks,
            **gate_checks,
        }.items()
        if not passed
    ]
    if robust_assessment and robust_assessment.get("status") != "passes":
        blocking_reasons.extend(f"robust:{reason}" for reason in robust_assessment.get("blockers") or [])
    report_artifact_id = None
    if resolved_report and resolved_report.exists():
        report_artifact_id = json.loads(resolved_report.read_text(encoding="utf-8")).get("artifact_id")
    artifact_id = build_artifact_id("validation_report", strategy_id)
    payload = {
        "artifact_id": artifact_id,
        "generated_at": now_iso(),
        "artifact_type": "validation_report",
        "strategy_id": strategy_id,
        "status": status,
        "research": research,
        "checks": checks,
        "validation_policy": validation_policy_payload(definition.validation_policy),
        "gate_checks": gate_checks,
        "robust_assessment": robust_assessment,
        "blocking_reasons": blocking_reasons,
        "report_path": str(resolved_report) if resolved_report else None,
        "report_artifact_id": report_artifact_id,
        "summary": summary,
        "promotion_path": {
            "current_stage": "backtest_validated" if status == "ready-for-paper" else "research_or_backtest_blocked",
            "next_stage": "paper_candidate",
            "final_stage": "production_candidate",
        },
        "lineage": {
            "stage": "validation",
            "parents": [report_artifact_id] if report_artifact_id else [],
            "children": ["paper_candidate"],
        },
    }
    destination = output_path or VALIDATIONS_ROOT / f"{strategy_id}-{timestamp_slug()}.json"
    write_json(destination, payload)
    return {"validation_path": destination, "payload": payload}


def build_paper_workflow(
    *,
    strategy_id: str,
    report_path: Path | None = None,
    validation_path: Path | None = None,
    output_path: Path | None = None,
) -> dict[str, Any]:
    definition = get_strategy_definition(strategy_id)
    resolved_report = report_path if report_path is not None else latest_json(REPORTS_ROOT, f"{strategy_id}-")
    if resolved_report is None or not resolved_report.exists():
        raise ValueError("No backtest report found. Run hf backtest first or pass --report.")

    report_payload = json.loads(resolved_report.read_text(encoding="utf-8"))
    report_artifact_id = report_payload.get("artifact_id")
    resolved_validation = validation_path if validation_path is not None else latest_matching_validation(
        strategy_id=strategy_id,
        report_path=resolved_report,
        report_artifact_id=report_artifact_id,
    )
    if resolved_validation and resolved_validation.exists():
        validation_payload = json.loads(resolved_validation.read_text(encoding="utf-8"))
    else:
        validation_result = validate_strategy_workflow(strategy_id=strategy_id, report_path=resolved_report)
        resolved_validation = validation_result["validation_path"]
        validation_payload = validation_result["payload"]

    candidate_input = {
        "strategy_id": strategy_id,
        "latest_signal": report_payload.get("latest_signal", {}),
        "report_summary": report_payload.get("summary", {}),
        "dataset": report_payload.get("dataset", {}),
        "validation": validation_payload,
    }
    candidate = definition.paper_candidate_builder(candidate_input)
    artifact_id = build_artifact_id("paper_candidate", strategy_id)
    production_assessment = build_production_candidate_assessment(
        strategy_id=strategy_id,
        report_payload=report_payload,
        validation_payload=validation_payload,
        paper_candidate=candidate,
    )
    payload = {
        "artifact_id": artifact_id,
        "generated_at": now_iso(),
        "artifact_type": "paper_candidate",
        "strategy_id": strategy_id,
        "research": report_payload.get("research"),
        "report_path": str(resolved_report),
        "validation_path": str(resolved_validation) if resolved_validation else None,
        "report_artifact_id": report_artifact_id,
        "validation_artifact_id": validation_payload.get("artifact_id"),
        "dataset": report_payload.get("dataset"),
        "summary": report_payload.get("summary"),
        "latest_signal": report_payload.get("latest_signal"),
        "paper_candidate": candidate,
        "production_candidate_assessment": production_assessment,
        "promotion_path": {
            "current_stage": "paper_candidate",
            "next_stage": "production_candidate_review" if validation_payload.get("status") == "ready-for-paper" else "paper_only",
            "requires": [
                "paper execution journal",
                "regime review",
                "operator sign-off",
            ],
        },
        "lineage": {
            "stage": "paper",
            "parents": [item for item in [report_artifact_id, validation_payload.get("artifact_id")] if item],
            "children": ["production_candidate_review"],
        },
    }
    destination = output_path or PAPER_ROOT / f"{strategy_id}-{timestamp_slug()}.json"
    write_json(destination, payload)
    return {"paper_path": destination, "payload": payload}


def normalize_strategy_id(value: str) -> str:
    return value.strip().lower().replace("-", "_").replace(" ", "_")


def is_strategy_document_path(path: Path) -> bool:
    if not path.is_file() or path.suffix.lower() != ".md":
        return False
    stem = path.stem.lower()
    if stem in {"readme", "implementation-roadmap"}:
        return False
    return not stem.endswith("-template")


def strategy_document_id(path: Path) -> str:
    normalized = normalize_strategy_id(path.stem)
    for suffix in ("_validation", "_research_note", "_template"):
        if normalized.endswith(suffix):
            return normalized[: -len(suffix)]
    return normalized


def discover_strategy_documents(docs_root: Path | None = None) -> list[str]:
    return sorted(discover_strategy_document_paths(docs_root).keys())


def discover_strategy_document_paths(docs_root: Path | None = None) -> dict[str, list[str]]:
    root = docs_root or DOCS_STRATEGIES_ROOT
    if not root.exists():
        return {}
    paths: dict[str, list[str]] = {}
    for path in root.glob("*.md"):
        if not is_strategy_document_path(path):
            continue
        paths.setdefault(strategy_document_id(path), []).append(str(path))
    return {
        strategy_id: sorted(items, key=lambda item: (Path(item).stem != strategy_id.replace("_", "-"), item))
        for strategy_id, items in paths.items()
    }


def discover_artifact_strategy_ids(*roots: Path) -> list[str]:
    strategy_ids: set[str] = set()
    for root in roots:
        if not root.exists():
            continue
        for path in root.glob("*.json"):
            payload = load_json_if_exists(path) or {}
            raw_strategy_id = payload.get("strategy_id") or path.stem.split("-")[0]
            if raw_strategy_id:
                strategy_ids.add(normalize_strategy_id(str(raw_strategy_id)))
    return sorted(strategy_ids)


def build_status_snapshot() -> dict[str, Any]:
    strategy_document_paths = discover_strategy_document_paths()
    strategy_documents = sorted(strategy_document_paths.keys())
    strategy_packages = discover_strategy_packages()
    registered = available_strategies()
    artifact_strategy_ids = discover_artifact_strategy_ids(REPORTS_ROOT, VALIDATIONS_ROOT, PAPER_ROOT)
    catalog_strategy_ids = sorted(set(strategy_documents) | set(strategy_packages) | set(registered) | set(artifact_strategy_ids))
    strategy_status: list[dict[str, Any]] = []
    for strategy_id in catalog_strategy_ids:
        latest_report = latest_json(REPORTS_ROOT, f"{strategy_id}-")
        latest_validation = latest_json(VALIDATIONS_ROOT, f"{strategy_id}-")
        latest_paper = latest_json(PAPER_ROOT, f"{strategy_id}-")
        latest_validation_payload = load_json_if_exists(latest_validation)
        latest_paper_payload = load_json_if_exists(latest_paper)
        docs_exists = strategy_id in strategy_documents
        backend_module_exists = strategy_id in strategy_packages
        registered_for_backtest = strategy_id in registered
        sources = []
        if docs_exists:
            sources.append("docs")
        if backend_module_exists:
            sources.append("backend_module")
        if registered_for_backtest:
            sources.append("registered_backtest")
        if latest_report:
            sources.append("backtest_artifact")
        if latest_validation:
            sources.append("validation_artifact")
        if latest_paper:
            sources.append("paper_candidate_artifact")
        strategy_status.append(
            {
                "strategy_id": strategy_id,
                "docs_exists": docs_exists,
                "backend_module_exists": backend_module_exists,
                "registered_for_backtest": registered_for_backtest,
                "sources": sources,
                "docs_path": strategy_document_paths.get(strategy_id, [None])[0] if docs_exists else None,
                "docs_paths": strategy_document_paths.get(strategy_id, []),
                "strategy_dir": str(BACKEND_ROOT / "strategies" / strategy_id) if backend_module_exists else None,
                "latest_backtest": str(latest_report) if latest_report else None,
                "latest_validation": str(latest_validation) if latest_validation else None,
                "latest_paper": str(latest_paper) if latest_paper else None,
                "promotion_stage": infer_strategy_stage(
                    strategy_id=strategy_id,
                    latest_report=latest_report,
                    latest_validation_payload=latest_validation_payload,
                    latest_paper_payload=latest_paper_payload,
                    docs_exists=docs_exists,
                    backend_module_exists=backend_module_exists,
                    registered_for_backtest=registered_for_backtest,
                ),
            }
        )

    return {
        "generated_at": now_iso(),
        "available_strategies": registered,
        "strategy_documents": strategy_documents,
        "strategy_packages": strategy_packages,
        "catalog_strategy_ids": catalog_strategy_ids,
        "docs_only_strategy_ids": [
            strategy_id for strategy_id in catalog_strategy_ids if strategy_id in strategy_documents and strategy_id not in strategy_packages
        ],
        "backend_only_strategy_ids": [
            strategy_id for strategy_id in catalog_strategy_ids if strategy_id in strategy_packages and strategy_id not in strategy_documents
        ],
        "unregistered_strategy_packages": [strategy_id for strategy_id in strategy_packages if strategy_id not in registered],
        "latest_audit": path_to_str(latest_json(AUDITS_ROOT)),
        "latest_backtest": path_to_str(latest_json(REPORTS_ROOT)),
        "latest_validation": path_to_str(latest_json(VALIDATIONS_ROOT)),
        "latest_paper": path_to_str(latest_json(PAPER_ROOT)),
        "report_count": len(list(REPORTS_ROOT.glob("*.json"))) if REPORTS_ROOT.exists() else 0,
        "validation_count": len(list(VALIDATIONS_ROOT.glob("*.json"))) if VALIDATIONS_ROOT.exists() else 0,
        "paper_count": len(list(PAPER_ROOT.glob("*.json"))) if PAPER_ROOT.exists() else 0,
        "strategy_status": strategy_status,
    }


def build_research_snapshot(strategy_id: str) -> dict[str, Any]:
    docs_path = REPO_ROOT / "docs" / "strategies" / f"{strategy_id.replace('_', '-')}.md"
    strategy_dir = BACKEND_ROOT / "strategies" / strategy_id
    spec_path = strategy_dir / "spec.md"
    return {
        "strategy_id": strategy_id,
        "docs_path": str(docs_path),
        "spec_path": str(spec_path),
        "strategy_dir": str(strategy_dir),
        "docs_exists": docs_path.exists(),
        "spec_exists": spec_path.exists(),
        "logic_exists": (strategy_dir / "logic.py").exists(),
        "scoring_exists": (strategy_dir / "scoring.py").exists(),
        "risk_exists": (strategy_dir / "risk.py").exists(),
        "paper_exists": (strategy_dir / "paper.py").exists(),
    }


def validation_policy_payload(policy: Any) -> dict[str, float | int]:
    return {
        "min_trades": int(policy.min_trades),
        "min_return_pct": float(policy.min_return_pct),
        "min_profit_factor": float(policy.min_profit_factor),
        "min_win_rate_pct": float(policy.min_win_rate_pct),
        "max_drawdown_pct": float(policy.max_drawdown_pct),
    }


def build_production_candidate_assessment(
    *,
    strategy_id: str,
    report_payload: dict[str, Any],
    validation_payload: dict[str, Any],
    paper_candidate: dict[str, Any],
) -> dict[str, Any]:
    summary = report_payload.get("summary", {})
    validation_ready = validation_payload.get("status") == "ready-for-paper"
    paper_ready = paper_candidate.get("promotion_gate") == "eligible-for-paper-review"
    checklist = {
        "backtest_validated": validation_ready,
        "paper_candidate_created": True,
        "paper_signal_present": paper_candidate.get("signal") in {"long", "short"},
        "operator_review_complete": False,
        "paper_journal_complete": False,
        "regime_review_complete": False,
    }
    blocking_reasons = [key for key, passed in checklist.items() if not passed]
    return {
        "strategy_id": strategy_id,
        "status": "needs-paper-evidence" if validation_ready and paper_ready else "blocked",
        "checklist": checklist,
        "blocking_reasons": blocking_reasons,
        "minimum_requirements": [
            "validated backtest thresholds",
            "paper trade journal with outcomes",
            "regime segmentation review",
            "explicit operator sign-off",
        ],
        "report_context": {
            "return_pct": summary.get("return_pct"),
            "profit_factor": summary.get("profit_factor"),
            "max_drawdown_pct": summary.get("max_drawdown_pct"),
            "total_trades": summary.get("total_trades"),
        },
    }


def build_artifact_id(artifact_type: str, strategy_id: str) -> str:
    return f"{artifact_type}:{strategy_id}:{timestamp_slug()}"


def latest_matching_validation(
    *,
    strategy_id: str,
    report_path: Path,
    report_artifact_id: str | None,
) -> Path | None:
    if not VALIDATIONS_ROOT.exists():
        return None
    matches = sorted(
        (path for path in VALIDATIONS_ROOT.glob(f"{strategy_id}-*.json") if path.is_file()),
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    )
    for path in matches:
        payload = load_json_if_exists(path)
        if payload is None:
            continue
        if payload.get("report_artifact_id") == report_artifact_id:
            return path
        if payload.get("report_path") == str(report_path):
            return path
    return None


def infer_strategy_stage(
    *,
    strategy_id: str,
    latest_report: Path | None,
    latest_validation_payload: dict[str, Any] | None,
    latest_paper_payload: dict[str, Any] | None,
    docs_exists: bool = False,
    backend_module_exists: bool = False,
    registered_for_backtest: bool = False,
) -> str:
    if latest_paper_payload is not None:
        return latest_paper_payload.get("promotion_path", {}).get("current_stage", "paper_candidate")
    if latest_validation_payload is not None and latest_validation_payload.get("status") == "blocked":
        return "validation_blocked"
    if latest_validation_payload is not None and latest_validation_payload.get("status") == "ready-for-paper":
        return "backtest_validated"
    if latest_report is not None:
        return "backtest_complete"
    if registered_for_backtest:
        return "registered_for_backtest"
    if backend_module_exists:
        return "research_package_only"
    if docs_exists:
        return "docs_only"
    return "unknown"


def latest_json(root: Path, prefix: str = "") -> Path | None:
    if not root.exists():
        return None
    matches = sorted((path for path in root.glob(f"{prefix}*.json") if path.is_file()), key=lambda item: item.stat().st_mtime)
    return matches[-1] if matches else None


def load_json_if_exists(path: Path | None) -> dict[str, Any] | None:
    if path is None or not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def path_to_str(path: Path | None) -> str | None:
    return str(path) if path else None


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def now_iso() -> str:
    return datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def timestamp_slug() -> str:
    return datetime.now(tz=timezone.utc).strftime("%Y%m%dT%H%M%SZ")
