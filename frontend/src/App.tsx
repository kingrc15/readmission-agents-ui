import { useCallback, useEffect, useState } from "react";
import {
  API_BASE,
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
  NoteViewMode,
} from "./api/types";
import { AdmissionSelector } from "./components/AdmissionSelector";
import { NoteViewer } from "./components/NoteViewer";
import { PromptPanel } from "./components/PromptPanel";
import { TokenPromptModal } from "./components/TokenPromptModal";
import { buildDefaultUserPromptTemplate } from "./buildDefaultUserPrompt";

export default function App() {
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
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [tokenModalMessage, setTokenModalMessage] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await listAllAdmissions();
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
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setTokenModalMessage(
        "The server rejected the API token (wrong or missing). Enter the token from READMIT_API_TOKEN.",
      );
      setTokenModalOpen(true);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  /** If nothing is configured yet, ask before failing the main list request. */
  useEffect(() => {
    if (getReadmitApiToken().trim()) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/admissions?limit=1`, {
          headers: { "Content-Type": "application/json" },
        });
        if (cancelled || r.status !== 401) return;
        setTokenModalMessage("This server requires an API token.");
        setTokenModalOpen(true);
      } catch {
        /* network — main list will show error */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadAdmissionAndPrompts = useCallback(async (rowId: number) => {
    setError(null);
    try {
      const [detail, prompts] = await Promise.all([getAdmission(rowId), getDefaultPrompt(rowId)]);
      setAdmission(detail);
      setSystemPrompt(prompts.system_prompt);
      setUserPrompt(buildDefaultUserPromptTemplate(detail.patient_identifier));
      setChatResult(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load admission");
    }
  }, []);

  const handleSelect = (rowId: number) => {
    setSelectedRowId(rowId);
    void loadAdmissionAndPrompts(rowId);
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

  return (
    <>
      <TokenPromptModal
        open={tokenModalOpen}
        message={tokenModalMessage}
        onClose={() => {
          setTokenModalOpen(false);
          setTokenModalMessage(null);
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
              API: {getApiBaseUrl()}
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
              setTokenModalMessage("Paste the same value as READMIT_API_TOKEN on the server.");
              setTokenModalOpen(true);
            }}
          >
            API token…
          </button>
        </div>
      </header>

      <AdmissionSelector
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
