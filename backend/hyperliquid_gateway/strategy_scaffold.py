from __future__ import annotations

import re
from pathlib import Path
from typing import Any


BACKEND_ROOT = Path(__file__).resolve().parent
if BACKEND_ROOT.name == "hyperliquid_gateway" and BACKEND_ROOT.parent.name == "backend":
    REPO_ROOT = BACKEND_ROOT.parents[1]
else:
    REPO_ROOT = BACKEND_ROOT


class StrategyScaffoldError(ValueError):
    pass


def normalize_strategy_id(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "_", value.strip().lower())
    normalized = re.sub(r"_+", "_", normalized).strip("_")
    if not normalized:
        raise StrategyScaffoldError("Strategy ID could not be normalized.")
    if len(normalized) > 120:
        raise StrategyScaffoldError("Strategy ID is too long.")
    return normalized


def display_name_from_strategy_id(strategy_id: str) -> str:
    return strategy_id.replace("_", " ").title()


def _strategy_template_doc(title: str, strategy_id: str) -> str:
    return f"""# {title}

## Name

{title}

## Hypothesis

State the edge in one sentence.

## Market Regime

Describe when this should work and when it should fail.

## Inputs

List required market data and derived features.

## Entry

Define deterministic entry conditions.

## Invalidation

Define what kills the setup.

## Exit

Describe time stop, stop loss, and profit-taking logic.

## Risk

Describe sizing, concurrency limits, and kill switches.

## Costs

State fee and slippage assumptions.

## Validation

Describe research, backtest, replay, and paper plan.

## Failure Modes

List expected failure cases.

## Backend Mapping

- `backend/hyperliquid_gateway/strategies/{strategy_id}/`
"""


def _strategy_template_spec(title: str, docs_id: str) -> str:
    return f"""# {title} - Backend Implementation

Full spec:
- `docs/strategies/{docs_id}.md`

Fill in implementation notes for logic, scoring, risk, paper, and review APIs.
"""


def _strategy_template_logic(strategy_id: str) -> str:
    return f'''"""Deterministic signal logic for {strategy_id}."""\n\n\ndef evaluate_signal(payload: dict) -> dict:\n    return {{"strategy_id": "{strategy_id}", "status": "draft", "input_keys": sorted(payload.keys())}}\n'''


def _strategy_template_scoring(strategy_id: str) -> str:
    return f'''"""Ranking helpers for {strategy_id}."""\n\n\ndef score_setup(payload: dict) -> dict:\n    return {{"strategy_id": "{strategy_id}", "rank_score": 0, "status": "draft"}}\n'''


def _strategy_template_risk(strategy_id: str) -> str:
    return f'''"""Risk helpers for {strategy_id}."""\n\n\ndef build_risk_plan(payload: dict) -> dict:\n    return {{"strategy_id": "{strategy_id}", "allowed": False, "status": "draft"}}\n'''


def _strategy_template_paper(strategy_id: str) -> str:
    return f'''"""Paper helpers for {strategy_id}."""\n\n\ndef paper_candidate(payload: dict) -> dict:\n    return {{"strategy_id": "{strategy_id}", "status": "draft"}}\n'''


def _scaffold_files(
    *,
    strategy_id: str,
    title: str,
    strategy_dir: Path,
    docs_path: Path,
    docs_id: str,
) -> dict[Path, str]:
    return {
        strategy_dir / "__init__.py": f'"""Strategy package for {strategy_id}."""\n',
        strategy_dir / "logic.py": _strategy_template_logic(strategy_id),
        strategy_dir / "scoring.py": _strategy_template_scoring(strategy_id),
        strategy_dir / "risk.py": _strategy_template_risk(strategy_id),
        strategy_dir / "paper.py": _strategy_template_paper(strategy_id),
        strategy_dir / "spec.md": _strategy_template_spec(title, docs_id),
        docs_path: _strategy_template_doc(title, strategy_id),
    }


def preview_strategy_scaffold(
    *,
    title: str,
    strategy_id: str | None = None,
    strategies_root: Path | None = None,
    docs_root: Path | None = None,
) -> dict[str, Any]:
    display_name = title.strip()
    if not display_name:
        raise StrategyScaffoldError("Strategy title is required.")

    normalized_id = normalize_strategy_id(strategy_id or display_name)
    docs_id = normalized_id.replace("_", "-")
    strategy_dir = (strategies_root or (BACKEND_ROOT / "strategies")) / normalized_id
    docs_path = (docs_root or (REPO_ROOT / "docs" / "strategies")) / f"{docs_id}.md"
    files = _scaffold_files(
        strategy_id=normalized_id,
        title=display_name,
        strategy_dir=strategy_dir,
        docs_path=docs_path,
        docs_id=docs_id,
    )
    file_rows = [
        {
            "path": str(path),
            "relativePath": _relative_to_repo(path),
            "exists": path.exists(),
            "wouldWrite": not path.exists(),
        }
        for path in files
    ]
    conflicts = [row["path"] for row in file_rows if row["exists"]]
    return {
        "ok": True,
        "strategyId": normalized_id,
        "displayName": display_name,
        "docsId": docs_id,
        "backendDir": str(strategy_dir),
        "docsPath": str(docs_path),
        "files": file_rows,
        "conflict": bool(conflicts),
        "conflicts": conflicts,
    }


def write_strategy_scaffold(
    *,
    title: str,
    strategy_id: str | None = None,
    strategies_root: Path | None = None,
    docs_root: Path | None = None,
    overwrite: bool = False,
) -> dict[str, Any]:
    preview = preview_strategy_scaffold(
        title=title,
        strategy_id=strategy_id,
        strategies_root=strategies_root,
        docs_root=docs_root,
    )
    strategy_dir = Path(preview["backendDir"])
    docs_path = Path(preview["docsPath"])
    files = _scaffold_files(
        strategy_id=preview["strategyId"],
        title=preview["displayName"],
        strategy_dir=strategy_dir,
        docs_path=docs_path,
        docs_id=preview["docsId"],
    )

    strategy_dir.mkdir(parents=True, exist_ok=True)
    docs_path.parent.mkdir(parents=True, exist_ok=True)

    written_files: list[str] = []
    skipped_files: list[str] = []
    for path, content in files.items():
        if path.exists() and not overwrite:
            skipped_files.append(str(path))
            continue
        path.write_text(content, encoding="utf-8")
        written_files.append(str(path))

    return {
        **preview,
        "ok": True,
        "writtenFiles": written_files,
        "skippedFiles": skipped_files,
    }


def _relative_to_repo(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(REPO_ROOT.resolve()))
    except ValueError:
        return str(path)
