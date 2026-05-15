from __future__ import annotations

import ipaddress
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse, urlunparse

from pydantic import field_validator
from pydantic_settings import BaseSettings, PydanticBaseSettingsSource, SettingsConfigDict

_REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    cohort_parquet_path: Path = _REPO_ROOT / "data" / "mimicii_hf_index_hf_readmit_30d.parquet"
    vllm_base_url: str = "http://127.0.0.1:8000/v1"
    vllm_model: str = "local-model"
    vllm_api_key: str = "EMPTY"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    # Allow any https://<user>.github.io origin (GitHub Pages). Disable if you must lock CORS to cors_origins only.
    cors_allow_github_io_regex: bool = True
    request_timeout_s: float = 600.0
    default_temperature: float = 0.2

    # Shared secret for API + browser UI. When set, all routes except OPTIONS (and /health if
    # readmit_health_public) require Authorization: Bearer <token> or X-API-Key.
    readmit_api_token: str = ""
    # If true, GET /health stays callable without a token (e.g. load balancers). Set false to require token everywhere.
    readmit_health_public: bool = True

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        # Default pydantic-settings order lets process env beat .env — so a stray exported
        # VLLM_BASE_URL=https://ngrok… overrides repo .env. Load .env before env vars.
        return (
            init_settings,
            dotenv_settings,
            env_settings,
            file_secret_settings,
        )

    @field_validator("vllm_base_url")
    @classmethod
    def _local_vllm_must_be_http(cls, v: str) -> str:
        """
        vLLM's OpenAI server is usually plain HTTP on the LAN. Using https:// against a host
        that only speaks HTTP triggers SSL: WRONG_VERSION_NUMBER.

        We downgrade https→http for loopback names and for RFC1918 / private IPs (common on EC2
        when VLLM_BASE_URL is set to https://172.31.x.x:8000 by mistake). Public https URLs
        (e.g. ngrok) are left unchanged.
        """
        raw = (v or "").strip()
        if not raw:
            return raw
        p = urlparse(raw)
        if p.scheme != "https":
            return raw
        host = (p.hostname or "").lower()
        if host in ("127.0.0.1", "localhost", "::1"):
            return urlunparse(
                ("http", p.netloc, p.path, p.params, p.query, p.fragment),
            )
        host_for_ip = host.strip("[]")
        try:
            ip = ipaddress.ip_address(host_for_ip)
        except ValueError:
            return raw
        if ip.is_private or ip.is_loopback or ip.is_link_local:
            return urlunparse(
                ("http", p.netloc, p.path, p.params, p.query, p.fragment),
            )
        return raw

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def cors_origin_regex(self) -> str | None:
        if not self.cors_allow_github_io_regex:
            return None
        # User/org Pages: Origin is https://<login>.github.io (no path).
        return r"https://[a-zA-Z0-9-]+\.github\.io"

    def resolved_cohort_parquet_path(self) -> Path:
        """Use configured path, or repo data/ fallback if placeholder path is missing."""
        p = Path(self.cohort_parquet_path)
        if p.is_file():
            return p
        fallback = _REPO_ROOT / "data" / "mimicii_hf_index_hf_readmit_30d.parquet"
        if fallback.is_file():
            return fallback
        return p


@lru_cache
def get_settings() -> Settings:
    return Settings()
