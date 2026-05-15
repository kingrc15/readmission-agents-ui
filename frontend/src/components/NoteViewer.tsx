import type { AdmissionDetail, NoteViewMode } from "../api/types";

interface Props {
  admission: AdmissionDetail | null;
  mode: NoteViewMode;
  onModeChange: (mode: NoteViewMode) => void;
}

const MODES: { id: NoteViewMode; label: string }[] = [
  { id: "index", label: "Index discharge" },
  { id: "readmit", label: "Readmit discharge" },
  { id: "both", label: "Side by side" },
];

export function NoteViewer({ admission, mode, onModeChange }: Props) {
  return (
    <div className="panel">
      <div className="panel-header">
        <span style={{ fontWeight: 600 }}>Clinical notes</span>
        <div className="tab-group">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`tab ${mode === m.id ? "active" : ""}`}
              onClick={() => onModeChange(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="panel-body">
        {!admission ? (
          <p className="loading">Select an admission to view notes.</p>
        ) : mode === "index" ? (
          <div className="note-panel">{admission.index_discharge_summary}</div>
        ) : mode === "readmit" ? (
          <div className="note-panel">{admission.readmit_discharge_summary}</div>
        ) : (
          <div className="side-by-side">
            <section>
              <h3>Index HF discharge</h3>
              <div className="note-scroll note-panel">
                {admission.index_discharge_summary}
              </div>
            </section>
            <section>
              <h3>Readmit discharge</h3>
              <div className="note-scroll note-panel">
                {admission.readmit_discharge_summary}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
