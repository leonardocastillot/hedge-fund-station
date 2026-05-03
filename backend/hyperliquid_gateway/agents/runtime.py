from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

try:
    from ..ai_provider import configured_provider_order, provider_status
except ImportError:
    from ai_provider import configured_provider_order, provider_status


RuntimeMode = str
PACKAGE_ROOT = Path(__file__).resolve().parents[1]
if PACKAGE_ROOT.name == "hyperliquid_gateway" and PACKAGE_ROOT.parent.name == "backend":
    REPO_ROOT = PACKAGE_ROOT.parents[1]
else:
    REPO_ROOT = PACKAGE_ROOT
CODEX_CONFIG_PATH = Path.home() / ".codex" / "config.toml"
CODEX_TIMEOUT_SECONDS = int(os.getenv("HF_AGENT_CODEX_TIMEOUT_SECONDS", "180"))


def agent_runtime_status() -> dict[str, Any]:
    codex_path = shutil.which("codex")
    login_probe = probe_codex_login(codex_path)
    codex_model = read_codex_default_model()
    ai_status = provider_status()
    selected = choose_runtime("auto", ai_status=ai_status, codex_status=login_probe)
    return {
        "codexAvailable": bool(codex_path),
        "codexPath": codex_path,
        "codexAuthenticated": login_probe["authenticated"],
        "codexStatus": login_probe,
        "defaultModel": codex_model,
        "runtimeMode": selected,
        "apiProviderAvailable": api_provider_available(ai_status),
        "apiProviderStatus": ai_status,
    }


def choose_runtime(
    requested: RuntimeMode,
    *,
    ai_status: dict[str, Any] | None = None,
    codex_status: dict[str, Any] | None = None,
) -> RuntimeMode:
    requested = (requested or "auto").strip().lower().replace("_", "-")
    if requested in {"codex", "codex-local"}:
        return "codex-local"
    if requested in {"api", "api-provider"}:
        return "api-provider"
    if requested in {"deterministic", "none"}:
        return "deterministic"
    if requested != "auto":
        raise ValueError("runtime must be auto, codex-local, api-provider, or deterministic")

    codex_status = codex_status or probe_codex_login(shutil.which("codex"))
    if codex_status.get("available") and codex_status.get("authenticated"):
        return "codex-local"

    ai_status = ai_status or provider_status()
    if api_provider_available(ai_status):
        return "api-provider"

    return "deterministic"


def api_provider_available(status: dict[str, Any] | None = None) -> bool:
    status = status or provider_status()
    return status.get("activeProvider") not in {None, "deterministic"}


def probe_codex_login(codex_path: str | None) -> dict[str, Any]:
    if not codex_path:
        return {
            "available": False,
            "authenticated": False,
            "exitCode": None,
            "stdout": "",
            "stderr": "codex command not found",
        }
    try:
        completed = subprocess.run(
            [codex_path, "login", "status"],
            check=False,
            capture_output=True,
            text=True,
            timeout=10,
        )
        stdout = completed.stdout.strip()
        stderr = completed.stderr.strip()
        return {
            "available": True,
            "authenticated": completed.returncode == 0,
            "exitCode": completed.returncode,
            "stdout": stdout[:500],
            "stderr": stderr[:500],
        }
    except Exception as exc:
        return {
            "available": True,
            "authenticated": False,
            "exitCode": None,
            "stdout": "",
            "stderr": str(exc),
        }


def read_codex_default_model() -> str | None:
    try:
        text = CODEX_CONFIG_PATH.read_text(encoding="utf-8")
    except OSError:
        return None
    match = re.search(r'(?m)^model\s*=\s*"([^"]+)"', text)
    return match.group(1) if match else None


def run_codex_synthesis(
    *,
    prompt: str,
    schema: dict[str, Any],
    output_dir: Path,
    model: str | None = None,
    codex_profile: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    codex_path = shutil.which("codex")
    status = probe_codex_login(codex_path)
    if not codex_path or not status.get("authenticated"):
        raise RuntimeError(status.get("stderr") or "Codex CLI is not authenticated.")

    output_dir.mkdir(parents=True, exist_ok=True)
    schema_path = output_dir / "codex-output-schema.json"
    message_path = output_dir / "codex-final-message.json"
    schema_path.write_text(json.dumps(schema, indent=2), encoding="utf-8")

    args = [
        codex_path,
        "exec",
        "--cd",
        str(REPO_ROOT),
        "--sandbox",
        "read-only",
        "--output-schema",
        str(schema_path),
        "--output-last-message",
        str(message_path),
    ]
    if model:
        args.extend(["--model", model])
    if codex_profile:
        args.extend(["--profile", codex_profile])
    args.append(prompt)

    completed = subprocess.run(
        args,
        check=False,
        capture_output=True,
        text=True,
        timeout=CODEX_TIMEOUT_SECONDS,
    )
    if completed.returncode != 0:
        raise RuntimeError((completed.stderr or completed.stdout or "Codex synthesis failed.")[:1200])

    raw = message_path.read_text(encoding="utf-8").strip()
    parsed = parse_jsonish(raw)
    meta = {
        "provider": "codex-local",
        "model": model or read_codex_default_model(),
        "profile": codex_profile,
        "fallbackUsed": False,
        "errors": [],
        "stdout": completed.stdout[-1200:],
        "stderr": completed.stderr[-1200:],
    }
    return parsed, meta


def parse_jsonish(raw: str) -> dict[str, Any]:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()
    parsed = json.loads(cleaned)
    if not isinstance(parsed, dict):
        raise ValueError("Codex synthesis must return a JSON object.")
    return parsed


def configured_runtime_order() -> list[str]:
    order = ["codex-local"]
    if configured_provider_order():
        order.append("api-provider")
    order.append("deterministic")
    return order
