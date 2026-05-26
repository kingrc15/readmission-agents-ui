import type {
  AdmissionDetail,
  AdmissionListResponse,
  ChatRequest,
  ChatResponse,
  DatasetKey,
  DefaultPromptResponse,
} from "./types";

const READMIT_API_BASE_LS = "readmit_api_base_url";

/** Value baked in at `vite build` (from VITE_API_BASE_URL) plus non-dev fallback. */
export function getBakedApiBaseUrl(): string {
  return (
    import.meta.env.VITE_API_BASE_URL?.trim() ||
    (import.meta.env.DEV ? "" : "http://localhost:8001")
  ).replace(/\/$/, "");
}

/** localStorage wins so GitHub Pages can override a bad or missing build-time URL without redeploying. */
export function getApiBaseUrl(): string {
  try {
    const ls = localStorage.getItem(READMIT_API_BASE_LS)?.trim();
    if (ls) return ls.replace(/\/$/, "");
  } catch {
    /* private mode */
  }
  return getBakedApiBaseUrl();
}

export function setApiBaseUrl(url: string | null): void {
  try {
    if (url?.trim()) {
      localStorage.setItem(READMIT_API_BASE_LS, url.trim().replace(/\/$/, ""));
    } else {
      localStorage.removeItem(READMIT_API_BASE_LS);
    }
  } catch {
    /* */
  }
  window.dispatchEvent(new CustomEvent("readmit-api-base-changed"));
}

export function hasLocalApiBaseOverride(): boolean {
  try {
    return Boolean(localStorage.getItem(READMIT_API_BASE_LS)?.trim());
  } catch {
    return false;
  }
}

const READMIT_TOKEN_STORAGE_KEY = "readmit_api_token";

const ENV_TOKEN = (import.meta.env.VITE_READMIT_API_TOKEN ?? "").trim();

function readSessionToken(): string {
  try {
    return (sessionStorage.getItem(READMIT_TOKEN_STORAGE_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

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
    /* */
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

function networkErrorMessage(cause: unknown): string {
  const raw = cause instanceof Error ? cause.message : String(cause);
  const base = getApiBaseUrl();
  const isHttpsPage =
    typeof globalThis.location !== "undefined" && globalThis.location.protocol === "https:";
  const isHttpApi = base.startsWith("http:");

  const parts: string[] = [`Failed to fetch API (${base || "same-origin / relative"}).`, `Cause: ${raw}`];

  if (
    !import.meta.env.DEV &&
    (base === "" || base.includes("127.0.0.1") || base.includes("localhost"))
  ) {
    parts.push(
      "Open “Connection” in the header and set your public HTTPS API URL, or fix VITE_API_BASE_URL in GitHub Actions and redeploy.",
    );
  }

  if (isHttpsPage && isHttpApi) {
    parts.push(
      "HTTPS page + http:// API is blocked (mixed content). Serve the API over HTTPS (tunnel or reverse proxy).",
    );
  }

  parts.push(
    "Confirm the backend is reachable and CORS allows this Pages origin. Use the Connection dialog to set your ngrok URL.",
  );

  return parts.join(" ");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBaseUrl();
  const url = `${base}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
        ...authHeaders(),
        ...init?.headers,
      },
    });
  } catch (e) {
    throw new Error(networkErrorMessage(e));
  }
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
  dataset?: DatasetKey;
  search?: string;
  offset?: number;
  limit?: number;
}): Promise<AdmissionListResponse> {
  const q = new URLSearchParams();
  if (params.dataset) q.set("dataset", params.dataset);
  if (params.search) q.set("search", params.search);
  if (params.offset != null) q.set("offset", String(params.offset));
  if (params.limit != null) q.set("limit", String(params.limit));
  const qs = q.toString();
  return request(`/api/admissions${qs ? `?${qs}` : ""}`);
}

export async function listAllAdmissions(dataset: DatasetKey = "mimic-iii"): Promise<AdmissionListResponse> {
  const first = await listAdmissions({ dataset, offset: 0, limit: PAGE_SIZE });
  const all = [...first.items];
  let offset = first.items.length;
  while (offset < first.total) {
    const page = await listAdmissions({ dataset, offset, limit: PAGE_SIZE });
    all.push(...page.items);
    offset += page.items.length;
    if (page.items.length === 0) break;
  }
  return { dataset, items: all, total: first.total, offset: 0, limit: all.length };
}

export function getAdmission(rowId: number, dataset: DatasetKey = "mimic-iii"): Promise<AdmissionDetail> {
  return request(`/api/admissions/${rowId}?dataset=${encodeURIComponent(dataset)}`);
}

export function getDefaultPrompt(
  rowId: number,
  dataset: DatasetKey = "mimic-iii",
): Promise<DefaultPromptResponse> {
  return request(`/api/prompts/default/${rowId}?dataset=${encodeURIComponent(dataset)}`);
}

export function runChat(body: ChatRequest): Promise<ChatResponse> {
  return request("/api/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
