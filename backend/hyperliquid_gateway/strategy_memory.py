from __future__ import annotations

import hashlib
import json
import math
import re
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:  # Package import when loaded as backend.hyperliquid_gateway.strategy_memory.
    from .backtesting.workflow import (
        AUDITS_ROOT,
        DATA_ROOT,
        DOCS_STRATEGIES_ROOT,
        PAPER_ROOT,
        REPORTS_ROOT,
        REPO_ROOT,
        VALIDATIONS_ROOT,
    )
except ImportError:  # Script import when uvicorn starts from backend/hyperliquid_gateway.
    from backtesting.workflow import (
        AUDITS_ROOT,
        DATA_ROOT,
        DOCS_STRATEGIES_ROOT,
        PAPER_ROOT,
        REPORTS_ROOT,
        REPO_ROOT,
        VALIDATIONS_ROOT,
    )


MAX_CHUNK_TOKENS = 3000
MAX_CANONICAL_CHARS = 50_000
MAX_JSON_FIELD_CHARS = 2400
MAX_SNIPPET_CHARS = 520
DB_FILENAME = "strategy_memory.db"

SKIPPED_JSON_KEYS = {
    "candles",
    "checkpoints",
    "equity_curve",
    "events",
    "logs",
    "messages",
    "raw",
    "rows",
    "samples",
    "snapshots",
    "timeline",
    "trades",
    "transcript",
}

SUMMARY_JSON_KEYS = [
    "summary",
    "robust_assessment",
    "validation_summary",
    "paper_candidate",
    "candidate",
    "audit",
    "checks",
    "gate_checks",
    "blocking_reasons",
    "blockers",
    "recommended_next_steps",
    "notes",
    "latest_signal",
    "decision",
    "outcome",
    "lesson",
    "rule_change",
    "next_action",
]

COMMON_ENTITY_WORDS = {
    "AND",
    "API",
    "CSV",
    "DATA",
    "HTTP",
    "JSON",
    "MAX",
    "MIN",
    "NOT",
    "PAPER",
    "READY",
    "THE",
    "USD",
}


@dataclass(frozen=True)
class StrategyMemorySourceRoots:
    repo_root: Path = REPO_ROOT
    data_root: Path = DATA_ROOT
    docs_strategies_root: Path = DOCS_STRATEGIES_ROOT
    reports_root: Path = REPORTS_ROOT
    validations_root: Path = VALIDATIONS_ROOT
    paper_root: Path = PAPER_ROOT
    audits_root: Path = AUDITS_ROOT
    agent_runs_root: Path = DATA_ROOT / "agent_runs"
    progress_root: Path = REPO_ROOT / "progress"
    learning_root: Path | None = None


@dataclass(frozen=True)
class StrategyMemorySource:
    path: Path
    source_type: str


def now_ms() -> int:
    return int(time.time() * 1000)


def normalize_strategy_id(value: str | None) -> str | None:
    candidate = str(value or "").strip().lower().replace("-", "_").replace(" ", "_")
    candidate = re.sub(r"[^a-z0-9_]+", "_", candidate)
    candidate = re.sub(r"_+", "_", candidate).strip("_")
    return candidate or None


def strategy_memory_root() -> Path:
    return DATA_ROOT / "strategy_memory"


def strategy_memory_db_path(memory_root: Path | None = None) -> Path:
    return (memory_root or strategy_memory_root()) / DB_FILENAME


def connect_memory_db(memory_root: Path | None = None) -> sqlite3.Connection:
    db_path = strategy_memory_db_path(memory_root)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    return connection


def initialize_strategy_memory(memory_root: Path | None = None) -> dict[str, Any]:
    with connect_memory_db(memory_root) as connection:
        apply_schema(connection)
        return strategy_memory_status(memory_root, connection=connection)


def apply_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS strategy_memory_schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at_ms INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS strategy_memory_sources (
            source_key TEXT PRIMARY KEY,
            source_type TEXT NOT NULL,
            strategy_id TEXT,
            title TEXT NOT NULL,
            path TEXT NOT NULL,
            content_sha256 TEXT NOT NULL,
            updated_at_ms INTEGER NOT NULL,
            indexed_at_ms INTEGER NOT NULL,
            metadata_json TEXT NOT NULL DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS strategy_memory_chunks (
            chunk_id TEXT PRIMARY KEY,
            source_key TEXT NOT NULL,
            source_type TEXT NOT NULL,
            strategy_id TEXT,
            title TEXT NOT NULL,
            path TEXT NOT NULL,
            seq INTEGER NOT NULL,
            token_count INTEGER NOT NULL,
            content TEXT NOT NULL,
            snippet TEXT NOT NULL,
            content_sha256 TEXT NOT NULL,
            lifecycle_status TEXT NOT NULL DEFAULT 'indexed',
            score REAL NOT NULL DEFAULT 0,
            entities_json TEXT NOT NULL DEFAULT '[]',
            created_at_ms INTEGER NOT NULL,
            updated_at_ms INTEGER NOT NULL,
            FOREIGN KEY(source_key) REFERENCES strategy_memory_sources(source_key) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS strategy_memory_jobs (
            job_id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            dedupe_key TEXT NOT NULL UNIQUE,
            payload_json TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'queued',
            attempts INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            available_at_ms INTEGER NOT NULL,
            started_at_ms INTEGER,
            completed_at_ms INTEGER,
            created_at_ms INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS strategy_memory_summaries (
            strategy_id TEXT PRIMARY KEY,
            summary TEXT NOT NULL,
            chunk_count INTEGER NOT NULL,
            source_count INTEGER NOT NULL,
            updated_at_ms INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_strategy_memory_chunks_source
            ON strategy_memory_chunks(source_key);
        CREATE INDEX IF NOT EXISTS idx_strategy_memory_chunks_strategy
            ON strategy_memory_chunks(strategy_id, score DESC);
        CREATE INDEX IF NOT EXISTS idx_strategy_memory_jobs_status
            ON strategy_memory_jobs(status, available_at_ms, created_at_ms);
        CREATE INDEX IF NOT EXISTS idx_strategy_memory_sources_strategy
            ON strategy_memory_sources(strategy_id, source_type);

        INSERT OR IGNORE INTO strategy_memory_schema_migrations(version, applied_at_ms)
        VALUES (1, strftime('%s','now') * 1000);
        """
    )
    try:
        connection.execute(
            """
            CREATE VIRTUAL TABLE IF NOT EXISTS strategy_memory_chunks_fts
            USING fts5(chunk_id UNINDEXED, content, title, path, strategy_id UNINDEXED)
            """
        )
    except sqlite3.Error:
        pass


def fts_available(connection: sqlite3.Connection) -> bool:
    try:
        row = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'strategy_memory_chunks_fts'"
        ).fetchone()
        return bool(row)
    except sqlite3.Error:
        return False


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def approx_token_count(text: str) -> int:
    if not text:
        return 0
    return max(1, math.ceil(len(text) / 4))


def compact_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def truncate_text(value: str, max_chars: int) -> str:
    if len(value) <= max_chars:
        return value
    return value[: max_chars - 26].rstrip() + "\n\n[truncated for index]\n"


def chunk_markdown(markdown: str, max_tokens: int = MAX_CHUNK_TOKENS) -> list[str]:
    text = markdown.strip()
    if not text:
        return []

    max_chars = max_tokens * 4
    paragraphs = re.split(r"\n{2,}", text)
    chunks: list[str] = []
    current: list[str] = []
    current_chars = 0

    def flush() -> None:
        nonlocal current, current_chars
        if current:
            chunks.append("\n\n".join(current).strip())
        current = []
        current_chars = 0

    for paragraph in paragraphs:
        item = paragraph.strip()
        if not item:
            continue
        if len(item) > max_chars:
            flush()
            words = item.split()
            piece: list[str] = []
            piece_chars = 0
            for word in words:
                extra = len(word) + (1 if piece else 0)
                if piece and piece_chars + extra > max_chars:
                    chunks.append(" ".join(piece).strip())
                    piece = []
                    piece_chars = 0
                piece.append(word)
                piece_chars += extra
            if piece:
                chunks.append(" ".join(piece).strip())
            continue
        separator_chars = 2 if current else 0
        if current and current_chars + separator_chars + len(item) > max_chars:
            flush()
        current.append(item)
        current_chars += separator_chars + len(item)

    flush()
    return [chunk for chunk in chunks if chunk]


def deterministic_chunk_id(source_key: str, seq: int, content: str) -> str:
    return sha256_text(f"{source_key}\n{seq}\n{sha256_text(content)}")[:32]


def path_for_index(path: Path, repo_root: Path = REPO_ROOT) -> str:
    resolved = path.expanduser()
    try:
        return resolved.resolve().relative_to(repo_root.resolve()).as_posix()
    except ValueError:
        return resolved.as_posix()
    except FileNotFoundError:
        return resolved.as_posix()


def source_key_for(path: Path, source_type: str, repo_root: Path = REPO_ROOT) -> str:
    return f"{source_type}:{path_for_index(path, repo_root)}"


def safe_load_json(path: Path) -> Any | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeDecodeError):
        return None


def discover_strategy_memory_sources(
    *,
    memory_root: Path | None = None,
    source_roots: StrategyMemorySourceRoots | None = None,
    limit: int | None = None,
) -> list[StrategyMemorySource]:
    roots = source_roots or StrategyMemorySourceRoots()
    learning_root = roots.learning_root or memory_root or strategy_memory_root()
    sources: list[StrategyMemorySource] = []

    def add_many(root: Path, pattern: str, source_type: str, recursive: bool = False) -> None:
        if not root.exists():
            return
        paths = root.rglob(pattern) if recursive else root.glob(pattern)
        for path in sorted(paths):
            if path.is_file():
                sources.append(StrategyMemorySource(path=path, source_type=source_type))

    add_many(roots.docs_strategies_root, "*.md", "strategy_doc")
    add_many(roots.repo_root / "backend" / "hyperliquid_gateway" / "strategies", "spec.md", "backend_strategy_spec", recursive=True)
    add_many(roots.reports_root, "*.json", "backtest_report")
    add_many(roots.validations_root, "*.json", "validation_report")
    add_many(roots.paper_root, "*.json", "paper_candidate")
    add_many(roots.audits_root, "*.json", "audit_report")
    add_many(roots.agent_runs_root, "*.json", "agent_run")
    add_many(roots.progress_root, "*.md", "progress_handoff")
    add_many(learning_root, "*.json", "learning_event", recursive=True)

    unique: dict[str, StrategyMemorySource] = {}
    for source in sources:
        key = source_key_for(source.path, source.source_type, roots.repo_root)
        unique[key] = source
    ordered = list(unique.values())
    return ordered[:limit] if limit is not None else ordered


def title_from_markdown(text: str, path: Path) -> str:
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            return stripped.lstrip("#").strip()[:160] or path.stem
    return path.stem.replace("-", " ").replace("_", " ").title()


def infer_strategy_id_from_path(path: Path) -> str | None:
    stem = path.stem
    if stem == "spec" and path.parent.name:
        stem = path.parent.name
    return normalize_strategy_id(stem.split("-20")[0].split("-smoke")[0].split("-initial")[0])


def extract_strategy_id_from_payload(payload: Any, path: Path) -> str | None:
    if isinstance(payload, dict):
        for key in ("strategy_id", "strategyId", "strategy", "strategy_key", "strategyKey"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return normalize_strategy_id(value)
        nested = payload.get("paper_candidate")
        if isinstance(nested, dict):
            nested_id = extract_strategy_id_from_payload(nested, path)
            if nested_id:
                return nested_id
    return infer_strategy_id_from_path(path)


def scalar_line(label: str, value: Any) -> str | None:
    if value is None or isinstance(value, (dict, list)):
        return None
    text = str(value).strip()
    if not text:
        return None
    return f"- {label}: {text}"


def json_block(value: Any, max_chars: int = MAX_JSON_FIELD_CHARS) -> str:
    text = json.dumps(value, indent=2, sort_keys=True, default=str)
    return truncate_text(text, max_chars)


def render_json_sections(payload: dict[str, Any]) -> list[str]:
    sections: list[str] = []
    scalar_keys = [
        "artifact_type",
        "artifact_id",
        "strategy_id",
        "generated_at",
        "status",
        "stage",
        "gate_status",
        "kind",
        "outcome",
        "title",
        "summary",
        "lesson",
        "rule_change",
        "next_action",
    ]
    scalars = [line for key in scalar_keys if (line := scalar_line(key, payload.get(key)))]
    if scalars:
        sections.append("## Key Fields\n\n" + "\n".join(scalars))

    for key in SUMMARY_JSON_KEYS:
        if key not in payload or key in scalar_keys:
            continue
        value = payload.get(key)
        if value in (None, "", [], {}):
            continue
        heading = key.replace("_", " ").title()
        if isinstance(value, str):
            sections.append(f"## {heading}\n\n{truncate_text(value.strip(), MAX_JSON_FIELD_CHARS)}")
        else:
            sections.append(f"## {heading}\n\n```json\n{json_block(value)}\n```")

    skipped_counts = []
    for key in sorted(SKIPPED_JSON_KEYS):
        value = payload.get(key)
        if isinstance(value, list):
            skipped_counts.append(f"- {key}: {len(value)} rows")
        elif isinstance(value, dict):
            skipped_counts.append(f"- {key}: {len(value)} keys")
    if skipped_counts:
        sections.append("## Omitted Heavy Fields\n\n" + "\n".join(skipped_counts))

    evidence_paths = payload.get("evidence_paths") or payload.get("evidencePaths")
    if isinstance(evidence_paths, list) and evidence_paths:
        items = [f"- {str(item)}" for item in evidence_paths[:20]]
        sections.append("## Evidence Paths\n\n" + "\n".join(items))

    return sections


def canonicalize_source(
    source: StrategyMemorySource,
    *,
    source_roots: StrategyMemorySourceRoots | None = None,
) -> dict[str, Any] | None:
    roots = source_roots or StrategyMemorySourceRoots()
    path = source.path
    repo_path = path_for_index(path, roots.repo_root)
    try:
        mtime_ms = int(path.stat().st_mtime * 1000)
    except OSError:
        return None

    if path.suffix.lower() == ".md":
        try:
            raw = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            return None
        title = title_from_markdown(raw, path)
        strategy_id = infer_strategy_id_from_path(path) if source.source_type in {"strategy_doc", "backend_strategy_spec"} else None
        markdown = "\n\n".join(
            [
                f"# {title}",
                f"- Source type: {source.source_type}",
                f"- Source path: {repo_path}",
                f"- Strategy: {strategy_id or 'n/a'}",
                raw.strip(),
            ]
        )
    else:
        payload = safe_load_json(path)
        if not isinstance(payload, dict):
            return None
        strategy_id = extract_strategy_id_from_payload(payload, path)
        title = str(
            payload.get("title")
            or payload.get("artifact_type")
            or payload.get("artifact_id")
            or source.source_type
        ).replace("_", " ").title()
        header = [
            f"# {title}",
            f"- Source type: {source.source_type}",
            f"- Source path: {repo_path}",
            f"- Strategy: {strategy_id or 'n/a'}",
        ]
        sections = render_json_sections(payload)
        markdown = "\n\n".join(["\n".join(header), *sections])

    markdown = truncate_text(markdown.strip() + "\n", MAX_CANONICAL_CHARS)
    content_sha = sha256_text(markdown)
    return {
        "source_key": source_key_for(path, source.source_type, roots.repo_root),
        "source_type": source.source_type,
        "strategy_id": strategy_id,
        "title": title,
        "path": repo_path,
        "absolute_path": str(path.expanduser()),
        "updated_at_ms": mtime_ms,
        "content": markdown,
        "content_sha256": content_sha,
        "metadata": {
            "absolutePath": str(path.expanduser()),
            "repoPath": repo_path,
        },
    }


def make_chunk_records(record: dict[str, Any], indexed_at_ms: int) -> list[dict[str, Any]]:
    chunks = chunk_markdown(str(record["content"]))
    rows: list[dict[str, Any]] = []
    for index, content in enumerate(chunks):
        snippet = compact_whitespace(content)[:MAX_SNIPPET_CHARS]
        content_sha = sha256_text(content)
        rows.append(
            {
                "chunk_id": deterministic_chunk_id(record["source_key"], index, content),
                "source_key": record["source_key"],
                "source_type": record["source_type"],
                "strategy_id": record.get("strategy_id"),
                "title": record["title"],
                "path": record["path"],
                "seq": index,
                "token_count": approx_token_count(content),
                "content": content,
                "snippet": snippet,
                "content_sha256": content_sha,
                "created_at_ms": indexed_at_ms,
                "updated_at_ms": indexed_at_ms,
            }
        )
    return rows


def sync_strategy_memory(
    *,
    memory_root: Path | None = None,
    source_roots: StrategyMemorySourceRoots | None = None,
    dry_run: bool = False,
    process_jobs: bool = True,
    limit: int | None = None,
) -> dict[str, Any]:
    roots = source_roots or StrategyMemorySourceRoots()
    sources = discover_strategy_memory_sources(memory_root=memory_root, source_roots=roots, limit=limit)
    indexed_at_ms = now_ms()
    records = [
        record
        for source in sources
        if (record := canonicalize_source(source, source_roots=roots)) is not None
    ]
    chunk_count = sum(len(chunk_markdown(str(record["content"]))) for record in records)
    if dry_run:
        return {
            "ok": True,
            "dryRun": True,
            "updatedAt": indexed_at_ms,
            "sourceCount": len(records),
            "chunkCount": chunk_count,
            "changedSources": 0,
            "unchangedSources": 0,
            "queuedJobs": 0,
            "processedJobs": 0,
            "memoryRoot": str(memory_root or strategy_memory_root()),
        }

    with connect_memory_db(memory_root) as connection:
        apply_schema(connection)
        has_fts = fts_available(connection)
        changed_sources = 0
        unchanged_sources = 0
        queued_jobs = 0
        with connection:
            for record in records:
                existing = connection.execute(
                    "SELECT content_sha256 FROM strategy_memory_sources WHERE source_key = ?",
                    (record["source_key"],),
                ).fetchone()
                if existing and existing["content_sha256"] == record["content_sha256"]:
                    unchanged_sources += 1
                    continue

                changed_sources += 1
                connection.execute(
                    """
                    INSERT INTO strategy_memory_sources(
                        source_key, source_type, strategy_id, title, path, content_sha256,
                        updated_at_ms, indexed_at_ms, metadata_json
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(source_key) DO UPDATE SET
                        source_type = excluded.source_type,
                        strategy_id = excluded.strategy_id,
                        title = excluded.title,
                        path = excluded.path,
                        content_sha256 = excluded.content_sha256,
                        updated_at_ms = excluded.updated_at_ms,
                        indexed_at_ms = excluded.indexed_at_ms,
                        metadata_json = excluded.metadata_json
                    """,
                    (
                        record["source_key"],
                        record["source_type"],
                        record.get("strategy_id"),
                        record["title"],
                        record["path"],
                        record["content_sha256"],
                        record["updated_at_ms"],
                        indexed_at_ms,
                        json.dumps(record["metadata"], sort_keys=True),
                    ),
                )
                if has_fts:
                    chunk_ids = [
                        row["chunk_id"]
                        for row in connection.execute(
                            "SELECT chunk_id FROM strategy_memory_chunks WHERE source_key = ?",
                            (record["source_key"],),
                        ).fetchall()
                    ]
                    for chunk_id in chunk_ids:
                        connection.execute("DELETE FROM strategy_memory_chunks_fts WHERE chunk_id = ?", (chunk_id,))
                connection.execute("DELETE FROM strategy_memory_chunks WHERE source_key = ?", (record["source_key"],))

                for chunk in make_chunk_records(record, indexed_at_ms):
                    connection.execute(
                        """
                        INSERT INTO strategy_memory_chunks(
                            chunk_id, source_key, source_type, strategy_id, title, path, seq,
                            token_count, content, snippet, content_sha256, lifecycle_status,
                            score, entities_json, created_at_ms, updated_at_ms
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'indexed', 0, '[]', ?, ?)
                        """,
                        (
                            chunk["chunk_id"],
                            chunk["source_key"],
                            chunk["source_type"],
                            chunk["strategy_id"],
                            chunk["title"],
                            chunk["path"],
                            chunk["seq"],
                            chunk["token_count"],
                            chunk["content"],
                            chunk["snippet"],
                            chunk["content_sha256"],
                            chunk["created_at_ms"],
                            chunk["updated_at_ms"],
                        ),
                    )
                    if has_fts:
                        connection.execute(
                            "INSERT INTO strategy_memory_chunks_fts(chunk_id, content, title, path, strategy_id) VALUES (?, ?, ?, ?, ?)",
                            (
                                chunk["chunk_id"],
                                chunk["content"],
                                chunk["title"],
                                chunk["path"],
                                chunk["strategy_id"] or "",
                            ),
                        )
                    queued_jobs += enqueue_strategy_memory_job(
                        connection,
                        kind="score_chunk",
                        dedupe_key=f"score_chunk:{chunk['chunk_id']}",
                        payload={"chunk_id": chunk["chunk_id"]},
                    )
                strategy_id = record.get("strategy_id")
                if strategy_id:
                    queued_jobs += enqueue_strategy_memory_job(
                        connection,
                        kind="summarize_strategy",
                        dedupe_key=f"summarize_strategy:{strategy_id}",
                        payload={"strategy_id": strategy_id},
                    )

        processed = process_strategy_memory_jobs(memory_root=memory_root, limit=500) if process_jobs else {"processedJobs": 0}
        status = strategy_memory_status(memory_root)
        return {
            "ok": True,
            "dryRun": False,
            "updatedAt": indexed_at_ms,
            "sourceCount": len(records),
            "chunkCount": chunk_count,
            "changedSources": changed_sources,
            "unchangedSources": unchanged_sources,
            "queuedJobs": queued_jobs,
            "processedJobs": int(processed.get("processedJobs", 0)),
            "status": status,
            "memoryRoot": str(memory_root or strategy_memory_root()),
        }


def enqueue_strategy_memory_job(
    connection: sqlite3.Connection,
    *,
    kind: str,
    dedupe_key: str,
    payload: dict[str, Any],
) -> int:
    job_id = sha256_text(f"{kind}:{dedupe_key}")[:32]
    created_at_ms = now_ms()
    existing = connection.execute(
        "SELECT job_id FROM strategy_memory_jobs WHERE dedupe_key = ?",
        (dedupe_key,),
    ).fetchone()
    connection.execute(
        """
        INSERT INTO strategy_memory_jobs(
            job_id, kind, dedupe_key, payload_json, status, attempts,
            available_at_ms, created_at_ms
        )
        VALUES (?, ?, ?, ?, 'queued', 0, ?, ?)
        ON CONFLICT(dedupe_key) DO UPDATE SET
            payload_json = excluded.payload_json,
            status = 'queued',
            attempts = 0,
            last_error = NULL,
            available_at_ms = excluded.available_at_ms,
            started_at_ms = NULL,
            completed_at_ms = NULL
        """,
        (job_id, kind, dedupe_key, json.dumps(payload, sort_keys=True), created_at_ms, created_at_ms),
    )
    return 0 if existing else 1


def claim_strategy_memory_job(connection: sqlite3.Connection) -> sqlite3.Row | None:
    current_ms = now_ms()
    row = connection.execute(
        """
        SELECT * FROM strategy_memory_jobs
        WHERE status IN ('queued', 'failed') AND available_at_ms <= ?
        ORDER BY created_at_ms ASC
        LIMIT 1
        """,
        (current_ms,),
    ).fetchone()
    if not row:
        return None
    connection.execute(
        """
        UPDATE strategy_memory_jobs
        SET status = 'running', started_at_ms = ?, attempts = attempts + 1
        WHERE job_id = ?
        """,
        (current_ms, row["job_id"]),
    )
    return connection.execute("SELECT * FROM strategy_memory_jobs WHERE job_id = ?", (row["job_id"],)).fetchone()


def process_strategy_memory_jobs(*, memory_root: Path | None = None, limit: int = 500) -> dict[str, Any]:
    processed = 0
    failed = 0
    with connect_memory_db(memory_root) as connection:
        apply_schema(connection)
        for _ in range(max(0, limit)):
            with connection:
                job = claim_strategy_memory_job(connection)
            if job is None:
                break
            try:
                payload = json.loads(job["payload_json"])
                if job["kind"] == "score_chunk":
                    score_memory_chunk(connection, str(payload["chunk_id"]))
                elif job["kind"] == "summarize_strategy":
                    summarize_strategy_memory(connection, str(payload["strategy_id"]))
                else:
                    raise ValueError(f"unknown strategy memory job kind: {job['kind']}")
                with connection:
                    connection.execute(
                        """
                        UPDATE strategy_memory_jobs
                        SET status = 'completed', completed_at_ms = ?, last_error = NULL
                        WHERE job_id = ?
                        """,
                        (now_ms(), job["job_id"]),
                    )
                processed += 1
            except Exception as exc:  # pragma: no cover - defensive durability path
                with connection:
                    connection.execute(
                        """
                        UPDATE strategy_memory_jobs
                        SET status = 'failed', last_error = ?, available_at_ms = ?
                        WHERE job_id = ?
                        """,
                        (str(exc)[:500], now_ms() + 1000, job["job_id"]),
                    )
                failed += 1
    return {"ok": failed == 0, "processedJobs": processed, "failedJobs": failed}


def extract_entities(text: str) -> list[str]:
    entities: set[str] = set()
    for ticker in re.findall(r"\b[A-Z]{2,8}\b", text):
        if ticker not in COMMON_ENTITY_WORDS:
            entities.add(ticker)
    for strategy in re.findall(r"\b[a-z][a-z0-9]+(?:_[a-z0-9]+)+\b", text):
        entities.add(strategy)
    for keyword in ("backtest", "validation", "paper", "risk", "lesson", "regime", "funding", "open_interest", "liquidation"):
        if keyword.replace("_", " ") in text.lower() or keyword in text.lower():
            entities.add(keyword)
    return sorted(entities)[:24]


def score_memory_chunk(connection: sqlite3.Connection, chunk_id: str) -> None:
    row = connection.execute(
        "SELECT source_type, content FROM strategy_memory_chunks WHERE chunk_id = ?",
        (chunk_id,),
    ).fetchone()
    if row is None:
        return
    content = str(row["content"])
    lower = content.lower()
    base_by_source = {
        "learning_event": 10,
        "validation_report": 9,
        "paper_candidate": 9,
        "backtest_report": 8,
        "audit_report": 8,
        "agent_run": 7,
        "strategy_doc": 6,
        "backend_strategy_spec": 6,
        "progress_handoff": 4,
    }
    score = float(base_by_source.get(str(row["source_type"]), 3))
    for keyword, weight in {
        "ready-for-paper": 4,
        "blocked": 3,
        "lesson": 3,
        "rule_change": 3,
        "validation": 2,
        "paper": 2,
        "backtest": 2,
        "risk": 2,
        "anti-regime": 2,
        "failure": 1,
    }.items():
        if keyword in lower:
            score += weight
    score += min(3.0, approx_token_count(content) / 1200)
    entities = extract_entities(content)
    with connection:
        connection.execute(
            """
            UPDATE strategy_memory_chunks
            SET lifecycle_status = 'scored', score = ?, entities_json = ?, updated_at_ms = ?
            WHERE chunk_id = ?
            """,
            (score, json.dumps(entities), now_ms(), chunk_id),
        )


def summarize_strategy_memory(connection: sqlite3.Connection, strategy_id: str) -> None:
    chunks = connection.execute(
        """
        SELECT source_type, title, snippet, path
        FROM strategy_memory_chunks
        WHERE strategy_id = ?
        ORDER BY score DESC, updated_at_ms DESC
        LIMIT 6
        """,
        (strategy_id,),
    ).fetchall()
    source_count = connection.execute(
        "SELECT COUNT(*) FROM strategy_memory_sources WHERE strategy_id = ?",
        (strategy_id,),
    ).fetchone()[0]
    chunk_count = connection.execute(
        "SELECT COUNT(*) FROM strategy_memory_chunks WHERE strategy_id = ?",
        (strategy_id,),
    ).fetchone()[0]
    lines = [f"# {strategy_id.replace('_', ' ').title()} Memory Summary"]
    for row in chunks:
        lines.append(f"- {row['source_type']} / {row['title']}: {row['snippet']} ({row['path']})")
    summary = "\n".join(lines)
    with connection:
        connection.execute(
            """
            INSERT INTO strategy_memory_summaries(strategy_id, summary, chunk_count, source_count, updated_at_ms)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(strategy_id) DO UPDATE SET
                summary = excluded.summary,
                chunk_count = excluded.chunk_count,
                source_count = excluded.source_count,
                updated_at_ms = excluded.updated_at_ms
            """,
            (strategy_id, summary, int(chunk_count or 0), int(source_count or 0), now_ms()),
        )


def query_terms(query: str) -> list[str]:
    terms = [term.lower() for term in re.findall(r"[A-Za-z0-9_]{2,}", query)]
    seen: set[str] = set()
    unique: list[str] = []
    for term in terms:
        if term not in seen:
            unique.append(term)
            seen.add(term)
    return unique[:8]


def fts_query_from_terms(terms: list[str]) -> str:
    return " OR ".join(f'"{term}"' for term in terms)


def build_snippet(content: str, terms: list[str], max_chars: int = MAX_SNIPPET_CHARS) -> str:
    compact = compact_whitespace(content)
    lower = compact.lower()
    position = -1
    for term in terms:
        position = lower.find(term.lower())
        if position >= 0:
            break
    if position < 0:
        return compact[:max_chars]
    start = max(0, position - 160)
    end = min(len(compact), start + max_chars)
    if end - start < max_chars:
        start = max(0, end - max_chars)
    prefix = "..." if start > 0 else ""
    suffix = "..." if end < len(compact) else ""
    return f"{prefix}{compact[start:end].strip()}{suffix}"


def row_to_memory_result(row: sqlite3.Row, terms: list[str]) -> dict[str, Any]:
    try:
        entities = json.loads(row["entities_json"] or "[]")
    except json.JSONDecodeError:
        entities = []
    return {
        "chunkId": row["chunk_id"],
        "sourceKey": row["source_key"],
        "sourceType": row["source_type"],
        "strategyId": row["strategy_id"],
        "title": row["title"],
        "path": row["path"],
        "seq": row["seq"],
        "tokenCount": row["token_count"],
        "snippet": build_snippet(row["content"], terms) or row["snippet"],
        "score": row["score"],
        "lifecycleStatus": row["lifecycle_status"],
        "entities": entities if isinstance(entities, list) else [],
    }


def query_strategy_memory(
    query: str,
    *,
    strategy_id: str | None = None,
    limit: int = 8,
    memory_root: Path | None = None,
) -> dict[str, Any]:
    bounded_limit = max(1, min(int(limit), 40))
    normalized_strategy_id = normalize_strategy_id(strategy_id) if strategy_id else None
    terms = query_terms(query)
    backend = "sqlite-like"
    rows: list[sqlite3.Row] = []
    with connect_memory_db(memory_root) as connection:
        apply_schema(connection)
        if terms and fts_available(connection):
            fts_query = fts_query_from_terms(terms)
            try:
                if normalized_strategy_id:
                    rows = connection.execute(
                        """
                        SELECT c.*, bm25(strategy_memory_chunks_fts) AS rank
                        FROM strategy_memory_chunks_fts
                        JOIN strategy_memory_chunks c ON c.chunk_id = strategy_memory_chunks_fts.chunk_id
                        WHERE strategy_memory_chunks_fts MATCH ? AND c.strategy_id = ?
                        ORDER BY c.score DESC, rank ASC
                        LIMIT ?
                        """,
                        (fts_query, normalized_strategy_id, bounded_limit),
                    ).fetchall()
                else:
                    rows = connection.execute(
                        """
                        SELECT c.*, bm25(strategy_memory_chunks_fts) AS rank
                        FROM strategy_memory_chunks_fts
                        JOIN strategy_memory_chunks c ON c.chunk_id = strategy_memory_chunks_fts.chunk_id
                        WHERE strategy_memory_chunks_fts MATCH ?
                        ORDER BY c.score DESC, rank ASC
                        LIMIT ?
                        """,
                        (fts_query, bounded_limit),
                    ).fetchall()
                backend = "sqlite-fts5"
            except sqlite3.Error:
                rows = []
        if not rows:
            params: list[Any] = []
            where = []
            if normalized_strategy_id:
                where.append("strategy_id = ?")
                params.append(normalized_strategy_id)
            if terms:
                like_parts = []
                for term in terms:
                    like_parts.append("(lower(content) LIKE ? OR lower(title) LIKE ? OR lower(path) LIKE ?)")
                    value = f"%{term.lower()}%"
                    params.extend([value, value, value])
                where.append("(" + " OR ".join(like_parts) + ")")
            where_sql = f"WHERE {' AND '.join(where)}" if where else ""
            rows = connection.execute(
                f"""
                SELECT *
                FROM strategy_memory_chunks
                {where_sql}
                ORDER BY score DESC, updated_at_ms DESC
                LIMIT ?
                """,
                (*params, bounded_limit),
            ).fetchall()

    return {
        "updatedAt": now_ms(),
        "query": query,
        "strategyId": normalized_strategy_id,
        "count": len(rows),
        "backend": backend,
        "results": [row_to_memory_result(row, terms) for row in rows],
    }


def strategy_memory_status(
    memory_root: Path | None = None,
    *,
    connection: sqlite3.Connection | None = None,
) -> dict[str, Any]:
    root = memory_root or strategy_memory_root()
    db_path = strategy_memory_db_path(root)
    close_connection = False
    if connection is None:
        if not db_path.exists():
            return {
                "available": False,
                "updatedAt": now_ms(),
                "memoryRoot": str(root),
                "dbPath": str(db_path),
                "sourceCount": 0,
                "chunkCount": 0,
                "queuedJobCount": 0,
                "failedJobCount": 0,
                "summaryCount": 0,
                "latestIndexedAt": None,
                "ftsAvailable": False,
                "lifecycleCounts": {},
            }
        connection = connect_memory_db(root)
        close_connection = True
    try:
        apply_schema(connection)
        source_count = int(connection.execute("SELECT COUNT(*) FROM strategy_memory_sources").fetchone()[0])
        chunk_count = int(connection.execute("SELECT COUNT(*) FROM strategy_memory_chunks").fetchone()[0])
        queued_count = int(connection.execute("SELECT COUNT(*) FROM strategy_memory_jobs WHERE status = 'queued'").fetchone()[0])
        failed_count = int(connection.execute("SELECT COUNT(*) FROM strategy_memory_jobs WHERE status = 'failed'").fetchone()[0])
        summary_count = int(connection.execute("SELECT COUNT(*) FROM strategy_memory_summaries").fetchone()[0])
        latest = connection.execute("SELECT MAX(indexed_at_ms) FROM strategy_memory_sources").fetchone()[0]
        lifecycle_rows = connection.execute(
            "SELECT lifecycle_status, COUNT(*) AS count FROM strategy_memory_chunks GROUP BY lifecycle_status"
        ).fetchall()
        return {
            "available": True,
            "updatedAt": now_ms(),
            "memoryRoot": str(root),
            "dbPath": str(db_path),
            "sourceCount": source_count,
            "chunkCount": chunk_count,
            "queuedJobCount": queued_count,
            "failedJobCount": failed_count,
            "summaryCount": summary_count,
            "latestIndexedAt": int(latest) if latest is not None else None,
            "ftsAvailable": fts_available(connection),
            "lifecycleCounts": {row["lifecycle_status"]: int(row["count"]) for row in lifecycle_rows},
        }
    finally:
        if close_connection and connection is not None:
            connection.close()
