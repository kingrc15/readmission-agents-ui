import { useCallback, useEffect, useState } from "react";
import {
  getAdmission,
  getApiBaseUrl,
  getDefaultPrompt,
  getReadmitApiToken,
  listAllAdmissions,
  runChat,
  setUnauthorizedHandler,
} from "./api/client";
import type {
  AdmissionDetail,
  AdmissionListItem,
  ChatResponse,
  DatasetKey,
  NoteViewMode,
} from "./api/types";
import { AdmissionSelector } from "./components/AdmissionSelector";
import { ConnectionModal } from "./components/ConnectionModal";
import { NoteViewer } from "./components/NoteViewer";
import { PromptPanel } from "./components/PromptPanel";
import { buildDefaultUserPromptTemplate } from "./buildDefaultUserPrompt";

export default function App() {
  const [dataset, setDataset] = useState<DatasetKey>("mimic-iii");
  const [listItems, setListItems] = useState<AdmissionListItem[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  const [admission, setAdmission] = useState<AdmissionDetail | null>(null);
  const [noteMode, setNoteMode] = useState<NoteViewMode>("both");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [userPrompt, setUserPrompt] = useState("");
  const [chatResult, setChatResult] = useState<ChatResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connModalOpen, setConnModalOpen] = useState(false);
  const [connModalMessage, setConnModalMessage] = useState<string | null>(null);
  /** Bumps when API base or token changes in storage so header re-reads getApiBaseUrl(). */
  const [connRev, setConnRev] = useState(0);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await listAllAdmissions(dataset);
      setListItems(res.items);
      setListTotal(res.total);
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "Failed to load admissions. Start the backend: ./scripts/start-backend.sh";
      setListError(msg);
      setListItems([]);
      setListTotal(0);
    } finally {
      setListLoading(false);
    }
  }, [dataset]);

  useEffect(() => {
    const bump = () => setConnRev((n) => n + 1);
    window.addEventListener("readmit-api-base-changed", bump);
    window.addEventListener("readmit-api-token-changed", bump);
    return () => {
      window.removeEventListener("readmit-api-base-changed", bump);
      window.removeEventListener("readmit-api-token-changed", bump);
    };
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setConnModalMessage(
        "The server rejected the API token (wrong or missing). Set the token below if required.",
      );
      setConnModalOpen(true);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  /** If no token in session/env, probe unauthenticated; 401 means token required. */
  useEffect(() => {
    if (getReadmitApiToken().trim()) return;
    let cancelled = false;
    void (async () => {
      try {
        const base = getApiBaseUrl();
        const q = new URLSearchParams({ dataset, limit: "1" });
        const r = await fetch(`${base}/api/admissions?${q.toString()}`, {
          headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
          },
        });
        if (cancelled || r.status !== 401) return;
        setConnModalMessage("This server requires an API token.");
        setConnModalOpen(true);
      } catch {
        /* network — main list will show error */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connRev, dataset]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadAdmissionAndPrompts = useCallback(async (rowId: number) => {
    setError(null);
    try {
      const [detail, prompts] = await Promise.all([
        getAdmission(rowId, dataset),
        getDefaultPrompt(rowId, dataset),
      ]);
      setAdmission(detail);
      setSystemPrompt(prompts.system_prompt);
      setUserPrompt(buildDefaultUserPromptTemplate(detail.patient_identifier));
      setChatResult(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load admission");
    }
  }, [dataset]);

  const handleSelect = (rowId: number) => {
    setSelectedRowId(rowId);
    void loadAdmissionAndPrompts(rowId);
  };

  const handleDatasetChange = (next: DatasetKey) => {
    setDataset(next);
    setSelectedRowId(null);
    setAdmission(null);
    setSystemPrompt("");
    setUserPrompt("");
    setChatResult(null);
    setError(null);
  };

  const handleResetDefault = () => {
    if (selectedRowId == null) return;
    void loadAdmissionAndPrompts(selectedRowId);
  };

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    setChatResult(null);
    try {
      const result = await runChat({
        system_prompt: systemPrompt,
        user_prompt: userPrompt,
        dataset,
        think_first: true,
        row_id: selectedRowId ?? undefined,
      });
      setChatResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "LLM request failed");
    } finally {
      setRunning(false);
    }
  };

  const apiLine = getApiBaseUrl();
  const showLocalhostBanner =
    import.meta.env.PROD && (apiLine.includes("localhost") || apiLine.includes("127.0.0.1"));

  return (
    <>
      <ConnectionModal
        open={connModalOpen}
        message={connModalMessage}
        onClose={() => {
          setConnModalOpen(false);
          setConnModalMessage(null);
        }}
        onSaved={() => {
          void loadList();
          if (selectedRowId != null) void loadAdmissionAndPrompts(selectedRowId);
        }}
      />

      <header className="app-header">
        <div className="app-header-row">
          <div>
            <h1>Readmit LLM — Clinician Review</h1>
            <p>
              API: {apiLine || "(same-origin)"}
              {" "}
              · Cohort {dataset === "mimic-iv" ? "MIMIC-IV" : "MIMIC-III"}
              {admission && (
                <>
                  {" "}
                  · Patient {admission.patient_identifier}
                  {admission.days_to_readmit != null &&
                    ` · ${admission.days_to_readmit.toFixed(1)} days to readmit`}
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            className="button-header"
            onClick={() => {
              setConnModalMessage(
                "Set your FastAPI base URL (e.g. ngrok https URL) and optional READMIT_API_TOKEN.",
              );
              setConnModalOpen(true);
            }}
          >
            Connection…
          </button>
        </div>
        {showLocalhostBanner ? (
          <p className="app-banner">
            This build still defaults to localhost. Click <strong>Connection…</strong> and enter your
            public API URL (HTTPS), or set{" "}
            <code className="inline-code">VITE_API_BASE_URL</code> in GitHub Actions and redeploy.
          </p>
        ) : null}
      </header>

      <AdmissionSelector
        dataset={dataset}
        onDatasetChange={handleDatasetChange}
        items={listItems}
        total={listTotal}
        selectedRowId={selectedRowId}
        loading={listLoading}
        loadError={listError}
        onRetry={() => void loadList()}
        onSelect={handleSelect}
      />

      <main className="app-main">
        <NoteViewer admission={admission} mode={noteMode} onModeChange={setNoteMode} />
        <PromptPanel
          systemPrompt={systemPrompt}
          userPrompt={userPrompt}
          selectedRowId={selectedRowId}
          onSystemPromptChange={setSystemPrompt}
          onUserPromptChange={setUserPrompt}
          onResetDefault={handleResetDefault}
          onRun={() => void handleRun()}
          running={running}
          chatResult={chatResult}
          error={error}
        />
      </main>
    </>
  );
}
