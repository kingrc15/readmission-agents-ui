export interface AdmissionListItem {
  row_id: number;
  patient_identifier: string;
  subject_id: number | null;
  index_hadm_id: number | null;
  readmit_hadm_id: number | null;
  days_to_readmit: number | null;
}

export interface AdmissionListResponse {
  items: AdmissionListItem[];
  total: number;
  offset: number;
  limit: number;
}

export interface AdmissionDetail extends AdmissionListItem {
  index_discharge_summary: string;
  readmit_discharge_summary: string;
  readmit_admission_note: string;
}

export interface DefaultPromptResponse {
  row_id: number;
  system_prompt: string;
  user_prompt: string;
}

export interface ChatRequest {
  system_prompt: string;
  user_prompt: string;
  row_id?: number;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  think_first?: boolean;
}

export interface ChatResponse {
  model: string;
  raw_content: string;
  thinking: string | null;
  analysis: Record<string, unknown> | null;
  parse_error: string | null;
  usage: Record<string, unknown> | null;
}

export type NoteViewMode = "index" | "readmit" | "both";
