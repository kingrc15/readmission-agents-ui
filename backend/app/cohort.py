from __future__ import annotations

from functools import lru_cache
from typing import Any, Optional

import pandas as pd

from .config import get_settings

LIST_COLUMNS = [
    "row_id",
    "patient_identifier",
    "subject_id",
    "index_hadm_id",
    "readmit_hadm_id",
    "days_to_readmit",
]

TEXT_COLUMNS = [
    "index_discharge_summary",
    "readmit_discharge_summary",
]


@lru_cache
def load_cohort() -> pd.DataFrame:
    path = get_settings().resolved_cohort_parquet_path()
    if not path.is_file():
        raise FileNotFoundError(f"Cohort parquet not found: {path}")
    df = pd.read_parquet(path)
    if "readmit_admission_note" not in df.columns:
        df["readmit_admission_note"] = ""
    return df


def _row_to_list_item(row: pd.Series) -> dict[str, Any]:
    return {
        "row_id": int(row["row_id"]),
        "patient_identifier": str(row["patient_identifier"]),
        "subject_id": int(row["subject_id"]) if pd.notna(row.get("subject_id")) else None,
        "index_hadm_id": int(row["index_hadm_id"]) if pd.notna(row.get("index_hadm_id")) else None,
        "readmit_hadm_id": int(row["readmit_hadm_id"]) if pd.notna(row.get("readmit_hadm_id")) else None,
        "days_to_readmit": float(row["days_to_readmit"]) if pd.notna(row.get("days_to_readmit")) else None,
    }


def list_admissions(
    *,
    search: Optional[str] = None,
    offset: int = 0,
    limit: int = 50,
) -> tuple[list[dict[str, Any]], int]:
    df = load_cohort()
    if search:
        q = search.strip().lower()
        mask = (
            df["patient_identifier"].astype(str).str.lower().str.contains(q, na=False)
            | df["row_id"].astype(str).str.contains(q, na=False)
        )
        df = df[mask]
    total = len(df)
    page = df.iloc[offset : offset + limit]
    items = [_row_to_list_item(row) for _, row in page.iterrows()]
    return items, total


def get_admission(row_id: int) -> Optional[dict[str, Any]]:
    df = load_cohort()
    matches = df[df["row_id"] == row_id]
    if matches.empty:
        return None
    row = matches.iloc[0]
    item = _row_to_list_item(row)
    item["index_discharge_summary"] = str(row["index_discharge_summary"] or "")
    item["readmit_discharge_summary"] = str(row["readmit_discharge_summary"] or "")
    item["readmit_admission_note"] = str(row.get("readmit_admission_note") or "")
    return item
