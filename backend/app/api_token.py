from __future__ import annotations

import secrets
from typing import Callable

from fastapi import FastAPI
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from .config import get_settings

_UNAUTHORIZED = JSONResponse(
    status_code=401,
    content={
        "detail": "Invalid or missing API token. Send Authorization: Bearer <token> or X-API-Key: <token>."
    },
)


def _extract_token(request: Request) -> str:
    auth = (request.headers.get("authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return (request.headers.get("x-api-key") or "").strip()


def _token_matches(provided: str, expected: str) -> bool:
    if not provided or not expected:
        return False
    try:
        return secrets.compare_digest(provided, expected)
    except (TypeError, ValueError):
        return False


def add_api_token_middleware(app: FastAPI) -> None:
    """When READMIT_API_TOKEN is set, require it on all routes except OPTIONS and optionally /health."""

    class _ApiTokenMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next: Callable) -> Response:
            settings = get_settings()
            token = (settings.readmit_api_token or "").strip()
            if not token:
                return await call_next(request)

            path = request.url.path
            if request.method == "OPTIONS":
                return await call_next(request)
            if settings.readmit_health_public and path == "/health":
                return await call_next(request)

            provided = _extract_token(request)
            if not _token_matches(provided, token):
                return _UNAUTHORIZED
            return await call_next(request)

    app.add_middleware(_ApiTokenMiddleware)
