"""Clinician UI default user prompt: placeholders only (no PHI in the template text).

Kept in the backend so the UI works even when ``readmission_agent`` on PYTHONPATH is a minimal
upstream clone without ``make_hf_readmit_user_prompt_template``.
"""

from __future__ import annotations

# Tokens substituted server-side before calling the LLM (must match frontend hints).
PLACEHOLDER_INDEX_DISCHARGE_SUMMARY = "{index discharge summary}"
PLACEHOLDER_FOLLOWUP_DISCHARGE_SUMMARY = "{follow-up discharge summary}"


def build_default_user_prompt_template(
    patient_identifier: str,
    *,
    think_first: bool = True,
) -> str:
    """Same task framing as the HF readmit pipeline, but discharge texts are placeholders only."""
    body = (
        "The cases presented are patients who had an original admission for heart failure (HF) who were "
        "discharged then readmitted to the ICU for any cause within 30d of original discharge.\n\n"
        "For each patient case, use the previous discharge summary and the current discharge summary to "
        "reason about why that patient was readmitted and what could have been done to prevent it. "
        "Consider yourself an expert heart failure cardiologist, ICU doctor, and health systems thinker.\n\n"
        "Namely, when speculating on how the readmission may have been prevented, consider medical and "
        "nonmedical causes. Possible reasons include medications not being taken, the patient should "
        "never have been dischargedTo the setting they were discharged to, medications and interventions "
        "not being properly given or titrated at the time of discharge, social factors, or something else. "
        "List up to three reasons for why a patient was readmitted but "
        "rank those reasons from most contributory to least contributory. Some cases may very well only "
        "have one reason.\n\n"
        "The output must be a JSON object with exactly these keys:\n"
        '- "patient_identifier": string (use the provided identifier)\n'
        '- "heart_failure_type": string (e.g. systolic, diastolic, EF if known, mixed, unspecified)\n'
        '- "comorbidities": array of strings (other relevant comorbidities)\n'
        '- "readmission_reasons_ranked": array of strings, length 1–3, most contributory first\n'
        '- "prevention_recommendations": string (what could have been done to prevent readmission; '
        "medical and nonmedical; be specific)\n\n"
        "Patient identifier:\n"
        f"{patient_identifier.strip()}\n\n"
        "Previous (index HF admission) discharge summary:\n"
        f"{PLACEHOLDER_INDEX_DISCHARGE_SUMMARY}\n\n"
        "Current (ICU readmission) discharge summary:\n"
        f"{PLACEHOLDER_FOLLOWUP_DISCHARGE_SUMMARY}\n"
    )
    body = body.replace("dischargedTo", "discharged to")
    if think_first:
        body += (
            "\n\nOutput format: first a single <thinking>...</thinking> block with your reasoning, "
            "then exactly one JSON object with the keys above (no markdown code fences around the JSON)."
        )
    return body


def substitute_discharge_placeholders(
    user_prompt: str,
    *,
    index_discharge_summary: str,
    readmit_discharge_summary: str,
) -> str:
    return (
        user_prompt.replace(PLACEHOLDER_INDEX_DISCHARGE_SUMMARY, index_discharge_summary.strip())
        .replace(PLACEHOLDER_FOLLOWUP_DISCHARGE_SUMMARY, readmit_discharge_summary.strip())
    )
