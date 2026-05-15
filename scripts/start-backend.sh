#!/usr/bin/env bash
# Run from anywhere; resolves repo root automatically.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

if [[ ! -f "${ROOT}/.env" ]]; then
  if [[ -f "${ROOT}/.env.example" ]]; then
    cp "${ROOT}/.env.example" "${ROOT}/.env"
    echo "Created .env from .env.example — edit COHORT_PARQUET_PATH before use."
  else
    echo "Missing .env and .env.example in ${ROOT}" >&2
    exit 1
  fi
fi

exec "${ROOT}/backend/run.sh" "$@"
