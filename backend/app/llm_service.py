from __future__ import annotations

import http.client
import json
from types import SimpleNamespace
from typing import Any, Optional
from urllib.parse import urlparse

import httpx
from openai import OpenAI

from hf_readmission_review.hf_json_thinking import THINKING_BLOCK_INSTRUCTION, extract_thinking_and_parse_json
from hf_readmission_review.json_utils import openai_assistant_text, parse_json_object

from .config import get_settings


def _normalized_base_url(base_url: str) -> str:
    url = (base_url or "").rstrip("/")
    if not url.endswith("/v1"):
        url = f"{url}/v1"
    return url


def _is_http_scheme(url: str) -> bool:
    try:
        return urlparse(url).scheme.lower() == "http"
    except Exception:
        return False


def _http_request_bytes(
    method: str,
    full_url: str,
    *,
    body: Optional[bytes] = None,
    extra_headers: Optional[dict[str, str]] = None,
    timeout: float = 60.0,
) -> tuple[int, bytes]:
    """Direct HTTP/1.1 via stdlib — no TLS, no httpx, no env proxies (fixes bogus SSL errors to :8000)."""
    p = urlparse(full_url)
    if p.scheme.lower() != "http":
        raise ValueError(f"expected http URL, got {full_url!r}")
    host = p.hostname or "127.0.0.1"
    port = p.port or 80
    path = p.path or "/"
    if p.query:
        path = f"{path}?{p.query}"
    headers: dict[str, str] = {
        "Host": f"{host}:{port}" if port != 80 else host,
        "Connection": "close",
        "ngrok-skip-browser-warning": "true",
    }
    if extra_headers:
        headers.update(extra_headers)
    conn = http.client.HTTPConnection(host, port, timeout=timeout)
    try:
        conn.request(method, path, body=body, headers=headers)
        res = conn.getresponse()
        return res.status, res.read()
    finally:
        conn.close()


def _vllm_get_json_http(full_url: str, *, timeout: float = 10.0) -> dict[str, Any]:
    status, raw = _http_request_bytes("GET", full_url, timeout=timeout)
    text = raw.decode("utf-8", errors="replace")
    if status != 200:
        raise RuntimeError(f"HTTP {status}: {text[:800]}")
    return json.loads(text)


def _vllm_get_json_https(full_url: str, *, timeout: float = 10.0) -> dict[str, Any]:
    with httpx.Client(
        timeout=timeout,
        headers={"ngrok-skip-browser-warning": "true"},
        trust_env=False,
    ) as client:
        r = client.get(full_url)
        r.raise_for_status()
        return r.json()


def _vllm_get_json(full_url: str, *, timeout: float = 10.0) -> dict[str, Any]:
    if _is_http_scheme(full_url):
        return _vllm_get_json_http(full_url, timeout=timeout)
    return _vllm_get_json_https(full_url, timeout=timeout)


def _resolve_vllm_model_id(base_url: str, requested: str) -> str:
    base_url = base_url.rstrip("/")
    url = f"{base_url}/models"
    try:
        payload = _vllm_get_json(url, timeout=10.0)
        data = payload.get("data", []) if isinstance(payload, dict) else []
        for m in data:
            if isinstance(m, dict) and m.get("id") == requested:
                return requested
        for m in data:
            if isinstance(m, dict) and m.get("root") == requested:
                mid = m.get("id")
                return str(mid) if mid else requested
    except Exception:
        pass
    return requested


def _usage_to_dict(usage: Any) -> Optional[dict[str, Any]]:
    if usage is None:
        return None
    if isinstance(usage, dict):
        return usage
    try:
        if hasattr(usage, "model_dump"):
            return usage.model_dump()
        if hasattr(usage, "dict"):
            return usage.dict()  # type: ignore[no-any-return]
    except Exception:
        return None
    return None


def _message_adapter(msg: Any) -> Any:
    if isinstance(msg, dict):
        return SimpleNamespace(
            content=msg.get("content"),
            reasoning=msg.get("reasoning"),
            model_extra=msg,
        )
    return msg


def _openai_client() -> OpenAI:
    settings = get_settings()
    base_url = _normalized_base_url(settings.vllm_base_url)
    http_client = httpx.Client(
        timeout=settings.request_timeout_s,
        headers={"ngrok-skip-browser-warning": "true"},
        trust_env=False,
    )
    return OpenAI(
        base_url=base_url,
        api_key=settings.vllm_api_key,
        timeout=settings.request_timeout_s,
        http_client=http_client,
    )


def check_vllm_health() -> dict[str, Any]:
    settings = get_settings()
    base_url = _normalized_base_url(settings.vllm_base_url)
    probe = f"{base_url}/models"
    transport = "http.client" if _is_http_scheme(probe) else "httpx"
    try:
        data = _vllm_get_json(probe, timeout=10.0)
        models = data.get("data", data) if isinstance(data, dict) else data
        ids = []
        if isinstance(models, list):
            for m in models:
                if isinstance(m, dict) and m.get("id"):
                    ids.append(m["id"])
        return {
            "reachable": True,
            "models": ids[:20],
            "probe_url": probe,
            "transport": transport,
        }
    except Exception as e:
        return {
            "reachable": False,
            "error": str(e),
            "probe_url": probe,
            "transport": transport,
        }


def _post_chat_via_http_client(
    base_url: str,
    api_key: str,
    payload: dict[str, Any],
    *,
    timeout: float,
) -> dict[str, Any]:
    url = f"{base_url.rstrip('/')}/chat/completions"
    body = json.dumps(payload).encode("utf-8")
    status, raw = _http_request_bytes(
        "POST",
        url,
        body=body,
        extra_headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        timeout=timeout,
    )
    text = raw.decode("utf-8", errors="replace")
    if status != 200:
        raise RuntimeError(f"vLLM HTTP {status}: {text[:2000]}")
    return json.loads(text)


def run_chat(
    *,
    system_prompt: str,
    user_prompt: str,
    model: Optional[str] = None,
    temperature: Optional[float] = None,
    max_tokens: Optional[int] = None,
    think_first: bool = True,
) -> dict[str, Any]:
    settings = get_settings()
    base_url = _normalized_base_url(settings.vllm_base_url)
    requested_model = model or settings.vllm_model
    resolved_model = _resolve_vllm_model_id(base_url, requested_model)
    temp = settings.default_temperature if temperature is None else temperature

    system_content = system_prompt
    if think_first and THINKING_BLOCK_INSTRUCTION not in system_content:
        system_content = system_content.rstrip() + "\n\n" + THINKING_BLOCK_INSTRUCTION

    messages = [
        {"role": "system", "content": system_content},
        {"role": "user", "content": user_prompt},
    ]

    api_payload: dict[str, Any] = {
        "model": resolved_model,
        "messages": messages,
        "temperature": temp,
    }
    if not think_first:
        api_payload["response_format"] = {"type": "json_object"}
    if max_tokens is not None:
        api_payload["max_tokens"] = max_tokens

    timeout_s = settings.request_timeout_s

    if _is_http_scheme(base_url):
        try:
            data = _post_chat_via_http_client(
                base_url, settings.vllm_api_key, api_payload, timeout=timeout_s
            )
        except Exception as e1:
            api_payload.pop("response_format", None)
            try:
                data = _post_chat_via_http_client(
                    base_url, settings.vllm_api_key, api_payload, timeout=timeout_s
                )
            except Exception as e2:
                raise RuntimeError(
                    f"LLM chat.completions failed (model={resolved_model!r}, base_url={base_url!r}): {e2!s} "
                    f"(first attempt: {e1!s})"
                ) from e2

        if not data.get("choices"):
            raise RuntimeError("LLM response had no choices (empty completion).")
        msg = data["choices"][0].get("message")
        content = openai_assistant_text(_message_adapter(msg))
        usage = _usage_to_dict(data.get("usage"))
        result: dict[str, Any] = {
            "model": data.get("model") or resolved_model,
            "raw_content": content,
            "thinking": None,
            "analysis": None,
            "parse_error": None,
            "usage": usage,
        }
        try:
            if think_first:
                thinking, obj = extract_thinking_and_parse_json(content)
                result["thinking"] = thinking
                result["analysis"] = obj
            else:
                result["analysis"] = parse_json_object(content)
        except Exception as e:
            result["parse_error"] = str(e)
        return result

    client = _openai_client()
    try:
        resp = client.chat.completions.create(**api_payload)
    except Exception as e1:
        api_payload.pop("response_format", None)
        try:
            resp = client.chat.completions.create(**api_payload)
        except Exception as e2:
            raise RuntimeError(
                f"LLM chat.completions failed (model={resolved_model!r}, base_url={base_url!r}): {e2!s} "
                f"(first attempt: {e1!s})"
            ) from e2

    if not getattr(resp, "choices", None):
        raise RuntimeError("LLM response had no choices (empty completion).")

    msg0 = resp.choices[0].message
    content = openai_assistant_text(msg0)
    usage = _usage_to_dict(getattr(resp, "usage", None))
    result = {
        "model": getattr(resp, "model", None) or resolved_model,
        "raw_content": content,
        "thinking": None,
        "analysis": None,
        "parse_error": None,
        "usage": usage,
    }

    try:
        if think_first:
            thinking, obj = extract_thinking_and_parse_json(content)
            result["thinking"] = thinking
            result["analysis"] = obj
        else:
            result["analysis"] = parse_json_object(content)
    except Exception as e:
        result["parse_error"] = str(e)

    return result
