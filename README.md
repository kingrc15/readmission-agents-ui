# Readmit LLM UI

Web interface for clinicians to review HF readmission pairs, customize prompts, and inspect LLM reasoning and structured JSON output.

- **Frontend**: React + Vite (deploy to GitHub Pages)
- **Backend**: FastAPI (run locally; serves cohort data and proxies vLLM)
- **LLM logic**: Reuses [`readmission_agent`](readmission_agent/) prompt templates and response parsing

## Security (PHI)

- **Never commit** `data/` or `.env` — clinical text stays on your machine.
- GitHub Pages hosts **only** the static UI. The backend must run where the parquet file lives.
- Do not expose the backend on the public internet without authentication.

### API token (recommended before wider access)

Set in the repo root `.env` (same file the backend loads):

- **`READMIT_API_TOKEN`** — when non-empty, every route except `OPTIONS` requires **`Authorization: Bearer <token>`** or **`X-API-Key: <token>`**. **`GET /health`** stays open by default for probes; set **`READMIT_HEALTH_PUBLIC=false`** to require a token there too.
- **`VITE_READMIT_API_TOKEN`** — same string as above so the Vite/React app can call the API. Vite reads env from the repo root (`frontend/vite.config.ts` sets `envDir: ".."`). **The value is embedded in the shipped JS** (shared password for trusted users / VPN — not a substitute for login per user).

Generate a value, e.g. `openssl rand -hex 24`. For GitHub Pages builds, add repository secret **`VITE_READMIT_API_TOKEN`** (and keep **`READMIT_API_TOKEN`** the same on the server).

Example:

```bash
curl -sS -H "Authorization: Bearer $READMIT_API_TOKEN" "http://127.0.0.1:8001/api/admissions?limit=1"
```

If `READMIT_API_TOKEN` is unset, the API stays open (local dev only).

## Prerequisites

- Python 3.10+ recommended (3.9 may work with `PYTHONPATH`; full `pip install -e readmission_agent` needs 3.10+)
- Node.js 18+
- vLLM (or OpenAI-compatible server) on port **8000** (`http://localhost:8000/v1`), or your ngrok URL
- UI backend (FastAPI) on port **8001** — do not use 8000 if vLLM is already there
- Cohort parquet at `data/mimicii_hf_index_hf_readmit_30d.parquet` (or set `COHORT_PARQUET_PATH`)

## Quick start (local)

**Important:** Backend commands must be run from the **repository root** (`Readmit LLM UI/`), not from `frontend/`. If your shell shows `frontend %`, run `cd ..` first.

### 1. Backend

```bash
cd "/path/to/Readmit LLM UI"

python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt pandas pyarrow openai httpx pydantic tenacity pydantic-settings python-dotenv

cp .env.example .env
```

Edit `.env` — set `COHORT_PARQUET_PATH` and `VLLM_BASE_URL`.

```bash
chmod +x backend/run.sh scripts/start-backend.sh
./backend/run.sh --reload
```

Or use the helper (works from any directory):

```bash
chmod +x scripts/start-backend.sh
./scripts/start-backend.sh --reload
```

Verify: `curl http://localhost:8001/health` (should show `cohort_loaded: true`, `cohort_rows: 908`)

The backend uses `PYTHONPATH=readmission_agent/src` (see `backend/run.sh`). With conda, you can skip the venv and `pip install` into your active env instead; `run.sh` falls back to `python3` on your PATH.

### 2. Frontend

```bash
cd "/path/to/Readmit LLM UI/frontend"
npm install
npm run dev
```

Or from repo root: `./scripts/start-frontend.sh`

Open http://localhost:5173 — in dev, Vite proxies `/api` to the UI backend on port **8001**.

Override API URL:

```bash
VITE_API_BASE_URL=http://localhost:8001 npm run dev
```

## vLLM

Set in `.env` (must end with `/v1`). **Local vLLM** (same machine as in your `curl` test):

```env
VLLM_BASE_URL=http://127.0.0.1:8000/v1
VLLM_MODEL=local-model
```

The UI backend defaults to port **8001**; vLLM stays on **8000**.

For **ngrok** or another HTTPS tunnel, use that URL instead. The backend sends `ngrok-skip-browser-warning: true` on outbound requests when needed.

Restart `./scripts/start-backend.sh` after changing `.env`.

**Health check shows `SSL: WRONG_VERSION_NUMBER`:** vLLM on your machine speaks **HTTP**, not HTTPS. Use `http://127.0.0.1:8000/v1` in `.env`, not `https://…` for localhost. If you still see it, an **exported** shell variable may be overriding `.env` — run `echo $VLLM_BASE_URL` and `unset VLLM_BASE_URL` if needed, then restart the backend. **Anaconda / corporate proxy:** if `HTTP_PROXY` or `HTTPS_PROXY` is set, httpx may mis-handle `http://127.0.0.1`; the backend now uses `trust_env=False` for vLLM calls so localhost bypasses those variables. To verify: `env | grep -i proxy`.

## GitHub Pages

1. Push this repo to GitHub.
2. Enable **Pages** → Source: **GitHub Actions**.
3. On push to `main`, `.github/workflows/deploy-pages.yml` builds and deploys `frontend/dist`.
4. Set repository variable or secret **`VITE_API_BASE_URL`** to your UI backend URL (e.g. `http://YOUR_LAN_IP:8001`). If unset, the build uses `http://localhost:8001`.
5. If you use **`READMIT_API_TOKEN`** on the API, add repository secret **`VITE_READMIT_API_TOKEN`** with the **same** value so the static site can authorize requests.
6. Add your Pages origin to backend `CORS_ORIGINS`, e.g. `https://YOUR_USER.github.io`.

The Vite `base` path is derived from `GITHUB_REPOSITORY` so assets load under `https://user.github.io/repo-name/`.

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Cohort + vLLM status |
| GET | `/api/admissions` | List admissions (metadata only) |
| GET | `/api/admissions/{row_id}` | Full discharge texts |
| GET | `/api/prompts/default/{row_id}` | Default system + user prompts |
| POST | `/api/chat` | Custom LLM call |

## UI features

- Search and select among 908 cohort rows
- View index discharge, readmit discharge, or side-by-side
- Edit system/user prompts; reset to default template with discharge placeholders
- Results: reasoning (`<thinking>`), parsed JSON, raw model output
