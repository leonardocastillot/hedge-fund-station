from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

try:
    from .strategy_scaffold import StrategyScaffoldError, normalize_strategy_id, write_strategy_scaffold
except ImportError:
    from strategy_scaffold import StrategyScaffoldError, normalize_strategy_id, write_strategy_scaffold


BACKEND_ROOT = Path(__file__).resolve().parent
REPO_ROOT = BACKEND_ROOT.parents[1]
CLAIMS_PATH = REPO_ROOT / "progress" / "strategy_claims.json"
TASKS_PATH = REPO_ROOT / "agent_tasks.json"
CURRENT_PATH = REPO_ROOT / "progress" / "current.md"
HISTORY_PATH = REPO_ROOT / "progress" / "history.md"
VALID_CLAIM_STATUSES = {"in_progress", "review", "done", "blocked"}
ACTIVE_CLAIM_STATUSES = {"in_progress", "review"}
CLOSED_CLAIM_STATUSES = {"done", "blocked"}


class StrategyClaimError(ValueError):
    pass


class StrategyClaimConflictError(StrategyClaimError):
    pass


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def normalize_asset_symbol(value: str | None) -> str:
    normalized = re.sub(r"[^A-Z0-9]+", "", (value or "BTC").strip().upper())
    if not normalized:
        raise StrategyClaimError("Asset symbol is required.")
    if len(normalized) > 24:
        raise StrategyClaimError("Asset symbol is too long.")
    return normalized


def docs_id(strategy_id: str) -> str:
    return strategy_id.replace("_", "-")


def repo_relative(path: Path, *, repo_root: Path = REPO_ROOT) -> str:
    try:
        return str(path.resolve().relative_to(repo_root.resolve()))
    except ValueError:
        return str(path)


def strategy_backend_dir(strategy_id: str, *, repo_root: Path = REPO_ROOT) -> Path:
    return repo_root / "backend" / "hyperliquid_gateway" / "strategies" / strategy_id


def strategy_docs_path(strategy_id: str, *, repo_root: Path = REPO_ROOT) -> Path:
    return repo_root / "docs" / "strategies" / f"{docs_id(strategy_id)}.md"


def progress_impl_path(strategy_id: str, *, repo_root: Path = REPO_ROOT) -> Path:
    return repo_root / "progress" / f"impl_{strategy_id}.md"


def _empty_claim_state() -> dict[str, Any]:
    return {"version": 1, "updated_at": now_iso(), "claims": []}


def compact_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def next_claim_id(claims: list[dict[str, Any]], strategy_id: str) -> str:
    existing_ids = {str(claim.get("claim_id") or "") for claim in claims}
    if strategy_id not in existing_ids:
        return strategy_id
    candidate = f"{strategy_id}-{compact_stamp()}"
    suffix = 2
    while candidate in existing_ids:
        candidate = f"{strategy_id}-{compact_stamp()}-{suffix}"
        suffix += 1
    return candidate


def load_claim_state(path: Path = CLAIMS_PATH) -> dict[str, Any]:
    if not path.exists():
        return _empty_claim_state()
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise StrategyClaimError(f"Invalid strategy claims JSON: {exc}") from exc
    if not isinstance(payload, dict):
        raise StrategyClaimError("Strategy claims file must contain a JSON object.")
    claims = payload.get("claims")
    if not isinstance(claims, list):
        raise StrategyClaimError("Strategy claims file must contain a claims array.")
    return {
        "version": int(payload.get("version") or 1),
        "updated_at": str(payload.get("updated_at") or now_iso()),
        "claims": [claim for claim in claims if isinstance(claim, dict)],
    }


def write_claim_state(state: dict[str, Any], path: Path = CLAIMS_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    state["version"] = int(state.get("version") or 1)
    state["updated_at"] = now_iso()
    path.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")


def load_tasks(path: Path = TASKS_PATH) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise StrategyClaimError(f"Missing task queue: {path}") from exc
    except json.JSONDecodeError as exc:
        raise StrategyClaimError(f"Invalid task queue JSON: {exc}") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("tasks"), list):
        raise StrategyClaimError("agent_tasks.json must contain a tasks array.")
    return payload


def write_tasks(payload: dict[str, Any], path: Path = TASKS_PATH) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def active_claims(claims: Iterable[dict[str, Any]], *, asset_symbol: str | None = None) -> list[dict[str, Any]]:
    asset = normalize_asset_symbol(asset_symbol) if asset_symbol else None
    active = [claim for claim in claims if claim.get("status") in ACTIVE_CLAIM_STATUSES]
    if asset:
        active = [claim for claim in active if normalize_asset_symbol(str(claim.get("asset_symbol") or "")) == asset]
    return active


def _task_scope(strategy_id: str, *, repo_root: Path = REPO_ROOT) -> list[str]:
    return [
        "agent_tasks.json",
        "progress/current.md",
        "progress/history.md",
        "progress/strategy_claims.json",
        repo_relative(progress_impl_path(strategy_id, repo_root=repo_root), repo_root=repo_root),
        repo_relative(strategy_docs_path(strategy_id, repo_root=repo_root), repo_root=repo_root),
        repo_relative(strategy_backend_dir(strategy_id, repo_root=repo_root), repo_root=repo_root) + "/",
        "backend/hyperliquid_gateway/backtesting/registry.py",
        f"tests/test_{strategy_id}.py",
    ]


def _task_acceptance(strategy_id: str, asset_symbol: str) -> list[str]:
    return [
        f"A single active Strategy Mission Lock exists for {asset_symbol} and strategy_id {strategy_id}.",
        f"The assigned strategy is documented at docs/strategies/{docs_id(strategy_id)}.md.",
        f"Deterministic backend strategy work stays under backend/hyperliquid_gateway/strategies/{strategy_id}/.",
        "The agent does not create a second strategy_id in the same mission.",
        "Backtest, validation, paper candidate, and live-gate rules follow docs/operations/agents/strategy-harness.md.",
        "Any live or production path remains blocked behind research, backtest, validation, paper evidence, risk review, operator sign-off, and a production runbook.",
        "A progress handoff records files, commands, verification, risks, and next action.",
    ]


def _task_verification(strategy_id: str) -> list[str]:
    return [
        "rtk npm run agent:check",
        f"rtk python3 -m unittest tests.test_strategy_catalog tests.test_{strategy_id}",
        f"rtk npm run hf:backtest -- --strategy {strategy_id}",
        f"rtk npm run hf:validate -- --strategy {strategy_id}",
        f"rtk npm run hf:paper -- --strategy {strategy_id} # only when validation allows",
        "rtk git diff --check",
    ]


def _task_notes(strategy_id: str, asset_symbol: str) -> str:
    return (
        f"Strategy Mission Lock claimed for {asset_symbol}/{strategy_id}. "
        "One LLM mission owns this strategy_id until released. No live routing, "
        "credential changes, production promotion, or operator sign-off bypass is allowed."
    )


def upsert_strategy_task(
    *,
    strategy_id: str,
    asset_symbol: str,
    title: str,
    owner: str,
    status: str,
    tasks_path: Path = TASKS_PATH,
    repo_root: Path = REPO_ROOT,
    handoff_path: str | None = None,
    evidence_paths: list[str] | None = None,
    notes: str | None = None,
) -> dict[str, Any]:
    payload = load_tasks(tasks_path)
    tasks = payload["tasks"]
    existing = next((task for task in tasks if isinstance(task, dict) and task.get("id") == strategy_id), None)
    merged_evidence = [
        repo_relative(strategy_docs_path(strategy_id, repo_root=repo_root), repo_root=repo_root),
        repo_relative(strategy_backend_dir(strategy_id, repo_root=repo_root), repo_root=repo_root) + "/",
    ]
    if handoff_path:
        merged_evidence.append(handoff_path)
    if evidence_paths:
        merged_evidence.extend(evidence_paths)
    if existing and isinstance(existing.get("evidence_paths"), list):
        merged_evidence.extend(str(path) for path in existing["evidence_paths"])
    deduped_evidence = list(dict.fromkeys(path for path in merged_evidence if path))

    task_payload = {
        "id": strategy_id,
        "title": title,
        "mission_class": "strategy research",
        "priority": 0,
        "scope": _task_scope(strategy_id, repo_root=repo_root),
        "acceptance": _task_acceptance(strategy_id, asset_symbol),
        "verification": _task_verification(strategy_id),
        "status": status,
        "owner": owner,
        "parallelizable": False,
        "strategy_id": strategy_id,
        "asset_symbol": asset_symbol,
        "evidence_paths": deduped_evidence if status in CLOSED_CLAIM_STATUSES else [],
        "notes": notes or _task_notes(strategy_id, asset_symbol),
    }

    if existing:
        existing.update(task_payload)
        task_payload = existing
    else:
        tasks.append(task_payload)
    write_tasks(payload, tasks_path)
    return task_payload


def write_current_session(
    *,
    strategy_id: str,
    asset_symbol: str,
    title: str,
    owner: str,
    status: str,
    repo_root: Path = REPO_ROOT,
    current_path: Path = CURRENT_PATH,
) -> None:
    backend_dir = repo_relative(strategy_backend_dir(strategy_id, repo_root=repo_root), repo_root=repo_root)
    docs_path = repo_relative(strategy_docs_path(strategy_id, repo_root=repo_root), repo_root=repo_root)
    current_path.parent.mkdir(parents=True, exist_ok=True)
    current_path.write_text(
        "\n".join(
            [
                "# Current Agent Session",
                "",
                f"- Task: {strategy_id}",
                f"- Status: {status}",
                f"- Last updated: {datetime.now(timezone.utc).date().isoformat()}",
                f"- Owner: {owner}",
                f"- Asset: {asset_symbol}",
                f"- Strategy ID: {strategy_id}",
                "",
                "## Summary",
                "",
                f"Strategy Mission Lock active for `{strategy_id}`. The assigned mission is `{title}`.",
                "",
                "## Active Scope",
                "",
                f"- `{docs_path}`",
                f"- `{backend_dir}/`",
                "- `progress/strategy_claims.json`",
                f"- `progress/impl_{strategy_id}.md`",
                "",
                "## Guardrails",
                "",
                "- Create or modify exactly this strategy_id.",
                "- Do not create a second strategy in this mission.",
                "- No live trading, credential changes, production promotion, or non-dry-run supervisor start.",
                "- Release the claim with `rtk npm run hf:strategy:release` when the handoff is ready.",
                "",
            ]
        ),
        encoding="utf-8",
    )


def write_no_active_current(current_path: Path = CURRENT_PATH) -> None:
    current_path.parent.mkdir(parents=True, exist_ok=True)
    current_path.write_text(
        "\n".join(
            [
                "# Current Agent Session",
                "",
                "- Task: none",
                "- Status: idle",
                f"- Last updated: {datetime.now(timezone.utc).date().isoformat()}",
                "- Owner: none",
                "",
                "## Summary",
                "",
                "No active agent task is claimed.",
                "",
            ]
        ),
        encoding="utf-8",
    )


def claim_strategy(
    *,
    strategy_id: str,
    title: str,
    asset_symbol: str = "BTC",
    owner: str = "strategy-factory",
    repo_root: Path = REPO_ROOT,
    claims_path: Path = CLAIMS_PATH,
    tasks_path: Path = TASKS_PATH,
    current_path: Path = CURRENT_PATH,
) -> dict[str, Any]:
    try:
        normalized_strategy_id = normalize_strategy_id(strategy_id)
    except StrategyScaffoldError as exc:
        raise StrategyClaimError(str(exc)) from exc
    normalized_asset = normalize_asset_symbol(asset_symbol)
    display_title = title.strip() or normalized_strategy_id.replace("_", " ").title()
    state = load_claim_state(claims_path)
    claims = state["claims"]
    active_for_asset = active_claims(claims, asset_symbol=normalized_asset)
    active_same = next((claim for claim in active_for_asset if claim.get("strategy_id") == normalized_strategy_id), None)
    active_other = [claim for claim in active_for_asset if claim.get("strategy_id") != normalized_strategy_id]
    if active_other:
        claimed = ", ".join(str(claim.get("strategy_id")) for claim in active_other)
        raise StrategyClaimConflictError(f"Active strategy claim for {normalized_asset} already exists: {claimed}")

    try:
        scaffold = write_strategy_scaffold(
            strategy_id=normalized_strategy_id,
            title=display_title,
            strategies_root=repo_root / "backend" / "hyperliquid_gateway" / "strategies",
            docs_root=repo_root / "docs" / "strategies",
        )
    except StrategyScaffoldError:
        raise

    task = upsert_strategy_task(
        strategy_id=normalized_strategy_id,
        asset_symbol=normalized_asset,
        title=display_title,
        owner=owner,
        status="in_progress",
        tasks_path=tasks_path,
        repo_root=repo_root,
    )
    stamp = now_iso()
    claim_id = str(active_same.get("claim_id")) if active_same else next_claim_id(claims, normalized_strategy_id)
    claim_payload = {
        "claim_id": claim_id,
        "strategy_id": normalized_strategy_id,
        "asset_symbol": normalized_asset,
        "title": display_title,
        "status": "in_progress",
        "owner": owner,
        "task_id": normalized_strategy_id,
        "backend_dir": repo_relative(strategy_backend_dir(normalized_strategy_id, repo_root=repo_root), repo_root=repo_root),
        "docs_path": repo_relative(strategy_docs_path(normalized_strategy_id, repo_root=repo_root), repo_root=repo_root),
        "handoff_path": repo_relative(progress_impl_path(normalized_strategy_id, repo_root=repo_root), repo_root=repo_root),
        "evidence_paths": [],
        "created_at": active_same.get("created_at") if active_same else stamp,
        "updated_at": stamp,
        "released_at": None,
        "release_notes": None,
    }
    if active_same:
        active_same.update(claim_payload)
    else:
        claims.append(claim_payload)
    write_claim_state(state, claims_path)
    write_current_session(
        strategy_id=normalized_strategy_id,
        asset_symbol=normalized_asset,
        title=display_title,
        owner=owner,
        status="in_progress",
        repo_root=repo_root,
        current_path=current_path,
    )
    return {"ok": True, "claim": active_same or claim_payload, "task": task, "scaffold": scaffold, "idempotent": bool(active_same)}


def list_strategy_claims(
    *,
    asset_symbol: str | None = None,
    include_closed: bool = True,
    claims_path: Path = CLAIMS_PATH,
) -> dict[str, Any]:
    state = load_claim_state(claims_path)
    asset = normalize_asset_symbol(asset_symbol) if asset_symbol else None
    rows = []
    for claim in state["claims"]:
        if asset and normalize_asset_symbol(str(claim.get("asset_symbol") or "")) != asset:
            continue
        if not include_closed and claim.get("status") not in ACTIVE_CLAIM_STATUSES:
            continue
        rows.append({**claim, "active": claim.get("status") in ACTIVE_CLAIM_STATUSES})
    rows.sort(key=lambda item: str(item.get("updated_at") or ""), reverse=True)
    return {
        "ok": True,
        "updated_at": state.get("updated_at"),
        "active_count": sum(1 for claim in rows if claim.get("active")),
        "claims": rows,
    }


def release_strategy_claim(
    *,
    strategy_id: str,
    status: str,
    owner: str = "strategy-factory",
    handoff_path: str | None = None,
    evidence_paths: list[str] | None = None,
    notes: str | None = None,
    claims_path: Path = CLAIMS_PATH,
    tasks_path: Path = TASKS_PATH,
    current_path: Path = CURRENT_PATH,
    repo_root: Path = REPO_ROOT,
) -> dict[str, Any]:
    try:
        normalized_strategy_id = normalize_strategy_id(strategy_id)
    except StrategyScaffoldError as exc:
        raise StrategyClaimError(str(exc)) from exc
    if status not in {"done", "blocked", "review"}:
        raise StrategyClaimError("Release status must be done, blocked, or review.")
    state = load_claim_state(claims_path)
    claim = next(
        (
            item
            for item in state["claims"]
            if item.get("strategy_id") == normalized_strategy_id and item.get("status") in ACTIVE_CLAIM_STATUSES
        ),
        None,
    )
    if not claim:
        raise StrategyClaimError(f"No active strategy claim found for {normalized_strategy_id}.")
    asset_symbol = normalize_asset_symbol(str(claim.get("asset_symbol") or "BTC"))
    title = str(claim.get("title") or normalized_strategy_id.replace("_", " ").title())
    next_evidence = list(dict.fromkeys([*(claim.get("evidence_paths") or []), *(evidence_paths or [])]))
    if handoff_path:
        next_evidence = list(dict.fromkeys([*next_evidence, handoff_path]))
    claim.update(
        {
            "status": status,
            "owner": owner or claim.get("owner") or "strategy-factory",
            "updated_at": now_iso(),
            "released_at": now_iso() if status in CLOSED_CLAIM_STATUSES else None,
            "release_notes": notes,
            "handoff_path": handoff_path or claim.get("handoff_path"),
            "evidence_paths": next_evidence,
        }
    )
    task = upsert_strategy_task(
        strategy_id=normalized_strategy_id,
        asset_symbol=asset_symbol,
        title=title,
        owner=owner or str(claim.get("owner") or "strategy-factory"),
        status=status,
        tasks_path=tasks_path,
        repo_root=repo_root,
        handoff_path=handoff_path or str(claim.get("handoff_path") or ""),
        evidence_paths=next_evidence,
        notes=notes or _task_notes(normalized_strategy_id, asset_symbol),
    )
    write_claim_state(state, claims_path)
    if status in CLOSED_CLAIM_STATUSES:
        remaining_active = active_claims(state["claims"])
        if remaining_active:
            next_claim = remaining_active[0]
            write_current_session(
                strategy_id=str(next_claim["strategy_id"]),
                asset_symbol=normalize_asset_symbol(str(next_claim.get("asset_symbol") or "BTC")),
                title=str(next_claim.get("title") or next_claim["strategy_id"]),
                owner=str(next_claim.get("owner") or "strategy-factory"),
                status=str(next_claim.get("status") or "in_progress"),
                repo_root=repo_root,
                current_path=current_path,
            )
        else:
            write_no_active_current(current_path)
    else:
        write_current_session(
            strategy_id=normalized_strategy_id,
            asset_symbol=asset_symbol,
            title=title,
            owner=owner or str(claim.get("owner") or "strategy-factory"),
            status=status,
            repo_root=repo_root,
            current_path=current_path,
        )
    return {"ok": True, "claim": claim, "task": task}
