import { useState } from "react";
import type { ChatResponse } from "../api/types";
import { PLACEHOLDER_FOLLOWUP, PLACEHOLDER_INDEX } from "../buildDefaultUserPrompt";

type ResultTab = "reasoning" | "evidence" | "json" | "raw";

type EvidenceItem = {
  source_note: string;
  excerpt: string;
  relevance: string;
};

interface Props {
  systemPrompt: string;
  userPrompt: string;
  selectedRowId: number | null;
  onSystemPromptChange: (v: string) => void;
  onUserPromptChange: (v: string) => void;
  onResetDefault: () => void;
  onRun: () => void;
  running: boolean;
  chatResult: ChatResponse | null;
  error: string | null;
}

function needsRowForPlaceholders(userPrompt: string): boolean {
  return userPrompt.includes(PLACEHOLDER_INDEX) || userPrompt.includes(PLACEHOLDER_FOLLOWUP);
}

function asText(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function evidenceItems(result: ChatResponse | null): EvidenceItem[] {
  const raw = result?.analysis?.clinical_note_evidence;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (typeof item === "string") {
        return { source_note: "", excerpt: item, relevance: "" };
      }
      if (item == null || typeof item !== "object") return null;
      const obj = item as Record<string, unknown>;
      return {
        source_note: asText(obj.source_note),
        excerpt: asText(obj.excerpt),
        relevance: asText(obj.relevance),
      };
    })
    .filter((item): item is EvidenceItem => item != null && Boolean(item.excerpt || item.relevance));
}

export function PromptPanel({
  systemPrompt,
  userPrompt,
  selectedRowId,
  onSystemPromptChange,
  onUserPromptChange,
  onResetDefault,
  onRun,
  running,
  chatResult,
  error,
}: Props) {
  const runBlockedByPlaceholders = needsRowForPlaceholders(userPrompt) && selectedRowId == null;
  const [resultTab, setResultTab] = useState<ResultTab>("reasoning");
  const evidence = evidenceItems(chatResult);

  return (
    <div className="panel">
      <div className="panel-header">
        <span style={{ fontWeight: 600 }}>Prompt &amp; LLM</span>
      </div>
      <div className="panel-body">
        {error && <div className="error-banner" data-testid="app-error">{error}</div>}

        <div className="prompt-field">
          <label htmlFor="system-prompt">System prompt</label>
          <textarea
            id="system-prompt"
            value={systemPrompt}
            onChange={(e) => onSystemPromptChange(e.target.value)}
            rows={6}
          />
        </div>

        <div className="prompt-field">
          <label htmlFor="user-prompt">User prompt</label>
          <p className="prompt-hint">
            Use <code>{PLACEHOLDER_INDEX}</code> and <code>{PLACEHOLDER_FOLLOWUP}</code> for the selected
            case; full text is inserted when you run the model (not shown here).
          </p>
          <textarea
            id="user-prompt"
            data-testid="user-prompt"
            value={userPrompt}
            onChange={(e) => onUserPromptChange(e.target.value)}
            rows={14}
          />
        </div>

        <div className="prompt-actions">
          <button type="button" className="btn-secondary" onClick={onResetDefault}>
            Reset to default
          </button>
          <button
            type="button"
            className="btn-primary"
            data-testid="run-llm"
            onClick={onRun}
            disabled={
              running ||
              !systemPrompt.trim() ||
              !userPrompt.trim() ||
              runBlockedByPlaceholders
            }
          >
            {running ? "Running LLM…" : "Run LLM"}
          </button>
        </div>

        {chatResult && (
          <div className="results-panel" data-testid="llm-results">
            <div className="tab-group" style={{ marginBottom: "0.75rem" }}>
              {(
                [
                  ["reasoning", "Reasoning"],
                  ["evidence", "Evidence"],
                  ["json", "JSON"],
                  ["raw", "Raw"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`tab ${resultTab === id ? "active" : ""}`}
                  onClick={() => setResultTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {resultTab === "reasoning" && (
              <pre className="results-pre">
                {chatResult.thinking?.trim() || "(No <thinking> block parsed)"}
              </pre>
            )}
            {resultTab === "evidence" && (
              <div className="evidence-list">
                {evidence.length > 0 ? (
                  evidence.map((item, idx) => (
                    <article className="evidence-card" key={`${idx}-${item.excerpt.slice(0, 20)}`}>
                      <div className="evidence-card-header">
                        Evidence {idx + 1}
                        {item.source_note ? <span>{item.source_note}</span> : null}
                      </div>
                      {item.excerpt ? <blockquote>{item.excerpt}</blockquote> : null}
                      {item.relevance ? <p>{item.relevance}</p> : null}
                    </article>
                  ))
                ) : (
                  <p className="results-empty">
                    No <code>clinical_note_evidence</code> items parsed in this response.
                  </p>
                )}
              </div>
            )}
            {resultTab === "json" && (
              <pre className="results-pre">
                {chatResult.parse_error
                  ? `Parse error: ${chatResult.parse_error}\n\n${JSON.stringify(
                      chatResult.analysis,
                      null,
                      2,
                    )}`
                  : JSON.stringify(chatResult.analysis, null, 2)}
              </pre>
            )}
            {resultTab === "raw" && (
              <pre className="results-pre">{chatResult.raw_content}</pre>
            )}
            <p className="meta-chip" style={{ marginTop: "0.5rem" }}>
              Model: {chatResult.model}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
