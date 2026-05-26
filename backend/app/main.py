from __future__ import annotations

import logging
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from hf_readmission_review.hf_json_thinking import THINKING_BLOCK_INSTRUCTION
from hf_readmission_review.hf_readmit_prompts import HF_ICU_READMIT_SYSTEM

from .clinician_prompt import (
    PLACEHOLDER_FOLLOWUP_DISCHARGE_SUMMARY,
    PLACEHOLDER_INDEX_DISCHARGE_SUMMARY,
    build_default_user_prompt_template,
    substitute_discharge_placeholders,
)

from .api_token import add_api_token_middleware
from .cohort import get_admission, list_admissions
from .config import get_settings
from .llm_service import check_vllm_health, run_chat
from .schemas import (
    AdmissionDetail,
    AdmissionListResponse,
    ChatRequest,
    ChatResponse,
    DatasetKey,
    DefaultPromptResponse,
)

# Bump when /health payload or vLLM probe behavior changes (verify deploy: curl /health → this field).
HEALTH_API_REVISION = 2

app = FastAPI(title="Readmit LLM API", version="0.1.0")
_log = logging.getLogger("uvicorn.error")

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
add_api_token_middleware(app)


@app.on_event("startup")
def _startup_banner() -> None:
    s = get_settings()
    tok = (s.readmit_api_token or "").strip()
    if tok:
        hp = "open without token" if s.readmit_health_public else "requires token too"
        _log.warning(
            "readmit-api READMIT_API_TOKEN is set — Bearer or X-API-Key required; /health %s",
            hp,
        )
    else:
        _log.warning("readmit-api READMIT_API_TOKEN is not set — API is open")
    _log.warning(
        "readmit-api startup health_api_revision=%s vllm_base_url=%s loaded_from=%s",
        HEALTH_API_REVISION,
        s.vllm_base_url,
        __file__,
    )


@app.get("/health")
def health() -> dict:
    vllm = check_vllm_health()
    cohort_status: dict[str, dict[str, object]] = {}
    try:
        from .cohort import load_cohort

        for dataset in ("mimic-iii", "mimic-iv"):
            try:
                df = load_cohort(dataset)
                cohort_status[dataset] = {"loaded": True, "rows": len(df), "error": None}
            except Exception as e:
                cohort_status[dataset] = {"loaded": False, "rows": 0, "error": str(e)}
    except Exception as e:
        cohort_status = {"mimic-iii": {"loaded": False, "rows": 0, "error": str(e)}}
    cohort_ok = all(bool(s["loaded"]) for s in cohort_status.values())
    return {
        "status": "ok",
        "health_api_revision": HEALTH_API_REVISION,
        "cohort_loaded": cohort_ok,
        "cohort_rows": int(cohort_status.get("mimic-iii", {}).get("rows") or 0),
        "cohort_error": cohort_status.get("mimic-iii", {}).get("error"),
        "cohorts": cohort_status,
        # Helps debug mistaken https:// on private IPs vs stale backend code (older /health omits probe_url).
        "vllm_base_url": settings.vllm_base_url,
        "vllm": vllm,
    }


@app.get("/api/admissions", response_model=AdmissionListResponse)
def api_list_admissions(
    dataset: DatasetKey = Query("mimic-iii"),
    search: Optional[str] = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=1000),
) -> AdmissionListResponse:
    items, total = list_admissions(dataset=dataset, search=search, offset=offset, limit=limit)
    return AdmissionListResponse(
        dataset=dataset,
        items=items,
        total=total,
        offset=offset,
        limit=limit,
    )


@app.get("/api/admissions/{row_id}", response_model=AdmissionDetail)
def api_get_admission(
    row_id: int,
    dataset: DatasetKey = Query("mimic-iii"),
) -> AdmissionDetail:
    row = get_admission(row_id, dataset=dataset)
    if row is None:
        raise HTTPException(status_code=404, detail=f"Admission row_id={row_id} not found in {dataset}")
    return AdmissionDetail(**row)


@app.get("/api/prompts/default/{row_id}", response_model=DefaultPromptResponse)
def api_default_prompt(
    row_id: int,
    dataset: DatasetKey = Query("mimic-iii"),
) -> DefaultPromptResponse:
    row = get_admission(row_id, dataset=dataset)
    if row is None:
        raise HTTPException(status_code=404, detail=f"Admission row_id={row_id} not found in {dataset}")

    system_prompt = HF_ICU_READMIT_SYSTEM + "\n\n" + THINKING_BLOCK_INSTRUCTION
    user_prompt = build_default_user_prompt_template(
        patient_identifier=row["patient_identifier"],
        think_first=True,
    )
    return DefaultPromptResponse(
        dataset=dataset,
        row_id=row_id,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
    )


@app.post("/api/chat", response_model=ChatResponse)
def api_chat(body: ChatRequest) -> ChatResponse:
    if not body.system_prompt.strip() or not body.user_prompt.strip():
        raise HTTPException(status_code=400, detail="system_prompt and user_prompt are required")

    user_for_llm = body.user_prompt
    needs_placeholders = (
        PLACEHOLDER_INDEX_DISCHARGE_SUMMARY in user_for_llm
        or PLACEHOLDER_FOLLOWUP_DISCHARGE_SUMMARY in user_for_llm
    )

    if needs_placeholders:
        if body.row_id is None:
            raise HTTPException(
                status_code=400,
                detail="row_id is required when the user prompt contains "
                "{index discharge summary} or {follow-up discharge summary}",
            )
        row = get_admission(body.row_id, dataset=body.dataset)
        if row is None:
            raise HTTPException(
                status_code=404,
                detail=f"Admission row_id={body.row_id} not found in {body.dataset}",
            )
        user_for_llm = substitute_discharge_placeholders(
            user_for_llm,
            index_discharge_summary=row["index_discharge_summary"],
            readmit_discharge_summary=row["readmit_discharge_summary"],
        )

    try:
        result = run_chat(
            system_prompt=body.system_prompt,
            user_prompt=user_for_llm,
            model=body.model,
            temperature=body.temperature,
            max_tokens=body.max_tokens,
            think_first=body.think_first,
        )
        return ChatResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
