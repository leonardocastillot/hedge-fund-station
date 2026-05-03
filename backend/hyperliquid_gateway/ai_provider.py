from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx


DEFAULT_PROVIDER_ORDER = "deepseek,openai"
DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash"
DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1"
DEFAULT_OPENAI_MODEL = "gpt-5.4-mini"
AI_TIMEOUT_SECONDS = float(os.getenv("AI_PROVIDER_TIMEOUT_SECONDS", "30"))


def load_local_env() -> None:
    module_path = Path(__file__).resolve()
    candidate_paths = [
        Path.cwd() / ".env",
        module_path.parents[2] / ".env" if len(module_path.parents) > 2 else module_path.parent / ".env",
        module_path.parent / ".env",
    ]

    for env_path in candidate_paths:
        if not env_path.exists():
            continue
        try:
            for line in env_path.read_text(encoding="utf-8").splitlines():
                stripped = line.strip()
                if not stripped or stripped.startswith("#") or "=" not in stripped:
                    continue
                key, value = stripped.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
        except OSError:
            continue


load_local_env()


@dataclass
class AIProviderResult:
    provider: str
    model: str
    content: str
    raw: dict[str, Any]


class AIProviderError(RuntimeError):
    def __init__(self, provider: str, message: str):
        super().__init__(message)
        self.provider = provider
        self.message = message


def configured_provider_order() -> list[str]:
    raw = os.getenv("AI_PROVIDER_ORDER", DEFAULT_PROVIDER_ORDER)
    providers = [item.strip().lower() for item in raw.split(",") if item.strip()]
    return providers or ["deepseek", "openai"]


def provider_status() -> dict[str, Any]:
    order = configured_provider_order()
    deepseek_configured = bool(os.getenv("DEEPSEEK_API_KEY"))
    openai_configured = bool(os.getenv("OPENAI_API_KEY"))
    active = next(
        (
            provider
            for provider in order
            if (provider == "deepseek" and deepseek_configured) or (provider == "openai" and openai_configured)
        ),
        "deterministic",
    )
    model = None
    if active == "deepseek":
        model = os.getenv("DEEPSEEK_MODEL", DEFAULT_DEEPSEEK_MODEL)
    elif active == "openai":
        model = configured_openai_model()

    return {
        "providerOrder": order,
        "activeProvider": active,
        "activeModel": model,
        "deepseek": {
            "configured": deepseek_configured,
            "baseUrl": os.getenv("DEEPSEEK_BASE_URL", DEFAULT_DEEPSEEK_BASE_URL),
            "model": os.getenv("DEEPSEEK_MODEL", DEFAULT_DEEPSEEK_MODEL),
        },
        "openai": {
            "configured": openai_configured,
            "model": configured_openai_model(),
        },
    }


def configured_openai_model() -> str:
    return (
        os.getenv("OPENAI_AGENT_MODEL")
        or os.getenv("OPENAI_MODEL")
        or os.getenv("OPENAI_CALENDAR_MODEL")
        or DEFAULT_OPENAI_MODEL
    )


async def complete_json(
    *,
    system_prompt: str,
    user_payload: dict[str, Any],
    max_tokens: int = 1400,
) -> tuple[dict[str, Any], dict[str, Any]]:
    errors: list[dict[str, str]] = []
    for provider in configured_provider_order():
        try:
            result = await complete_text(provider, system_prompt=system_prompt, user_payload=user_payload, max_tokens=max_tokens)
            parsed = parse_json_content(result.content)
            meta = {
                "provider": result.provider,
                "model": result.model,
                "fallbackUsed": bool(errors),
                "errors": errors,
            }
            return parsed, meta
        except AIProviderError as exc:
            errors.append({"provider": exc.provider, "message": exc.message})

    raise AIProviderError("all", "; ".join(f"{item['provider']}: {item['message']}" for item in errors) or "No AI provider configured.")


async def complete_text(
    provider: str,
    *,
    system_prompt: str,
    user_payload: dict[str, Any],
    max_tokens: int,
) -> AIProviderResult:
    if provider == "deepseek":
        return await complete_deepseek(system_prompt=system_prompt, user_payload=user_payload, max_tokens=max_tokens)
    if provider == "openai":
        return await complete_openai(system_prompt=system_prompt, user_payload=user_payload, max_tokens=max_tokens)
    raise AIProviderError(provider, "Unsupported AI provider.")


async def complete_deepseek(*, system_prompt: str, user_payload: dict[str, Any], max_tokens: int) -> AIProviderResult:
    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        raise AIProviderError("deepseek", "DEEPSEEK_API_KEY is not configured.")

    base_url = os.getenv("DEEPSEEK_BASE_URL", DEFAULT_DEEPSEEK_BASE_URL).rstrip("/")
    model = os.getenv("DEEPSEEK_MODEL", DEFAULT_DEEPSEEK_MODEL)
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(user_payload, ensure_ascii=True)},
        ],
        "thinking": {"type": "disabled"},
        "response_format": {"type": "json_object"},
        "stream": False,
        "max_tokens": max_tokens,
    }
    return await post_chat_completion(
        provider="deepseek",
        model=model,
        url=f"{base_url}/chat/completions",
        api_key=api_key,
        payload=payload,
    )


async def complete_openai(*, system_prompt: str, user_payload: dict[str, Any], max_tokens: int) -> AIProviderResult:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise AIProviderError("openai", "OPENAI_API_KEY is not configured.")

    base_url = os.getenv("OPENAI_BASE_URL", DEFAULT_OPENAI_BASE_URL).rstrip("/")
    model = configured_openai_model()
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(user_payload, ensure_ascii=True)},
        ],
        "response_format": {"type": "json_object"},
        "stream": False,
        "max_tokens": max_tokens,
    }
    return await post_chat_completion(
        provider="openai",
        model=model,
        url=f"{base_url}/chat/completions",
        api_key=api_key,
        payload=payload,
    )


async def post_chat_completion(
    *,
    provider: str,
    model: str,
    url: str,
    api_key: str,
    payload: dict[str, Any],
) -> AIProviderResult:
    try:
        async with httpx.AsyncClient(timeout=AI_TIMEOUT_SECONDS) as client:
            response = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        if response.status_code >= 400:
            detail = response.text[:240]
            raise AIProviderError(provider, f"HTTP {response.status_code}: {detail}")
        body = response.json()
        content = (
            body.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        )
        if not content:
            raise AIProviderError(provider, "Provider returned an empty response.")
        return AIProviderResult(provider=provider, model=model, content=content, raw=body)
    except AIProviderError:
        raise
    except Exception as exc:
        raise AIProviderError(provider, str(exc)) from exc


def parse_json_content(content: str) -> dict[str, Any]:
    stripped = content.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        if stripped.lower().startswith("json"):
            stripped = stripped[4:].strip()
    try:
        parsed = json.loads(stripped)
    except json.JSONDecodeError as exc:
        raise AIProviderError("json", f"AI response was not valid JSON: {exc}") from exc
    if not isinstance(parsed, dict):
        raise AIProviderError("json", "AI response JSON must be an object.")
    return parsed
