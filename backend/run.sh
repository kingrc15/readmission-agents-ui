#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PYTHONPATH="${ROOT}/readmission_agent/src:${ROOT}/backend"
cd "${ROOT}/backend"
if [[ -f "${ROOT}/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "${ROOT}/.env"
  set +a
fi
if [[ -x "${ROOT}/.venv/bin/python" ]]; then
  PYTHON="${ROOT}/.venv/bin/python"
else
  PYTHON="$(command -v python3 || command -v python)"
fi
# Default 8001 — vLLM typically uses 8000
exec "${PYTHON}" -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8001}" "$@"
