import type {
  AdmissionDetail,
  AdmissionListResponse,
  ChatRequest,
  ChatResponse,
  DefaultPromptResponse,
} from "./types";

/** In dev, default to same-origin so Vite proxies /api to the backend. */
export const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "" : "http://localhost:8001")
).replace(/\/$/, "");

const READMIT_TOKEN_STORAGE_KEY = "readmit_api_token";

const ENV_TOKEN = (import.meta.env.VITE_READMIT_API_TOKEN ?? "").trim();

function readSessionToken(): string {
  try {
    return (sessionStorage.getItem(READMIT_TOKEN_STORAGE_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

/** Session token overrides VITE_READMIT_API_TOKEN so users can paste without rebuilding. */
export function getReadmitApiToken(): string {
  const s = readSessionToken();
  if (s) return s;
  return ENV_TOKEN;
}

export function hasSessionStoredToken(): boolean {
  return readSessionToken().length > 0;
}

export function setReadmitApiToken(token: string | null): void {
  try {
    if (token && token.trim()) {
      sessionStorage.setItem(READMIT_TOKEN_STORAGE_KEY, token.trim());
    } else {
      sessionStorage.removeItem(READMIT_TOKEN_STORAGE_KEY);
    }
  } catch {
    /* private / blocked storage */
  }
  window.dispatchEvent(new CustomEvent("readmit-api-token-changed"));
}

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

function authHeaders(): Record<string, string> {
  const t = getReadmitApiToken();
  if (!t) return {};
  return { Authorization: `Bearer ${t}` };
}

function formatRequestError(path: string, status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { detail?: unknown };
    if (status === 404 && parsed.detail === "Not Found" && path.startsWith("/api")) {
      return (
        "UI backend not reachable (got vLLM on port 8000?). " +
        "Start it with: ./scripts/start-backend.sh — default port 8001."
      );
    }
    if (status === 401 && typeof parsed.detail === "string") return parsed.detail;
    if (status === 401) {
      return "Invalid or missing API token. Enter the token in the dialog or set READMIT_API_TOKEN / VITE_READMIT_API_TOKEN.";
    }
  } catch {
    /* not JSON */
  }
  return body || `Request failed: ${status}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) {
      unauthorizedHandler?.();
    }
    throw new Error(formatRequestError(path, res.status, text));
  }
  return res.json() as Promise<T>;
}

const PAGE_SIZE = 500;

export function listAdmissions(params: {
  search?: string;
  offset?: number;
  limit?: number;
}): Promise<AdmissionListResponse> {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.offset != null) q.set("offset", String(params.offset));
  if (params.limit != null) q.set("limit", String(params.limit));
  const qs = q.toString();
  return request(`/api/admissions${qs ? `?${qs}` : ""}`);
}

/** Fetch every admission row (paginated) for the dropdown. */
export async function listAllAdmissions(): Promise<AdmissionListResponse> {
  const first = await listAdmissions({ offset: 0, limit: PAGE_SIZE });
  const all = [...first.items];
  let offset = first.items.length;
  while (offset < first.total) {
    const page = await listAdmissions({ offset, limit: PAGE_SIZE });
    all.push(...page.items);
    offset += page.items.length;
    if (page.items.length === 0) break;
  }
  return { items: all, total: first.total, offset: 0, limit: all.length };
}

export function getAdmission(rowId: number): Promise<AdmissionDetail> {
  return request(`/api/admissions/${rowId}`);
}

export function getDefaultPrompt(rowId: number): Promise<DefaultPromptResponse> {
  return request(`/api/prompts/default/${rowId}`);
}

export function runChat(body: ChatRequest): Promise<ChatResponse> {
  return request("/api/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getApiBaseUrl(): string {
  return API_BASE;
}
