from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class AdmissionListItem(BaseModel):
    row_id: int
    patient_identifier: str
    subject_id: Optional[int] = None
    index_hadm_id: Optional[int] = None
    readmit_hadm_id: Optional[int] = None
    days_to_readmit: Optional[float] = None


class AdmissionListResponse(BaseModel):
    items: list[AdmissionListItem]
    total: int
    offset: int
    limit: int


class AdmissionDetail(AdmissionListItem):
    index_discharge_summary: str
    readmit_discharge_summary: str
    readmit_admission_note: str = ""


class DefaultPromptResponse(BaseModel):
    row_id: int
    system_prompt: str
    user_prompt: str


class DefaultPromptQuery(BaseModel):
    readmit_admission_note: str = ""


class ChatRequest(BaseModel):
    system_prompt: str
    user_prompt: str
    row_id: Optional[int] = None
    model: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    think_first: bool = True


class ChatResponse(BaseModel):
    model: str
    raw_content: str
    thinking: Optional[str] = None
    analysis: Optional[dict[str, Any]] = None
    parse_error: Optional[str] = None
    usage: Optional[dict[str, Any]] = None
