import { useId, useState, type FormEvent } from "react";
import { getReadmitApiToken, hasSessionStoredToken, setReadmitApiToken } from "../api/client";

type Props = {
  open: boolean;
  message: string | null;
  onClose: () => void;
  onSaved: () => void;
};

export function TokenPromptModal({ open, message, onClose, onSaved }: Props) {
  const id = useId();
  const [value, setValue] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const t = value.trim();
    if (!t) {
      setLocalError("Enter the API token from your administrator or .env (READMIT_API_TOKEN).");
      return;
    }
    setLocalError(null);
    setReadmitApiToken(t);
    setValue("");
    onSaved();
    onClose();
  };

  const handleClear = () => {
    setReadmitApiToken(null);
    setValue("");
    setLocalError(null);
    onSaved();
    onClose();
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onClick={(ev) => ev.stopPropagation()}
      >
        <h2 id={`${id}-title`} className="modal-title">
          API token required
        </h2>
        {(message || localError) && (
          <p className="modal-hint">{localError || message}</p>
        )}
        <p className="modal-meta">
          Stored only in this browser tab (session). Matches server{" "}
          <code className="inline-code">READMIT_API_TOKEN</code>.
        </p>
        <form onSubmit={handleSubmit}>
          <label htmlFor={`${id}-token`} className="modal-label">
            Token
          </label>
          <input
            id={`${id}-token`}
            type="password"
            className="modal-input"
            autoComplete="off"
            placeholder="Paste bearer token"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <div className="modal-actions">
            <button type="submit" className="button-primary">
              Save and retry
            </button>
            <button type="button" className="button-secondary" onClick={onClose}>
              Cancel
            </button>
            {hasSessionStoredToken() ? (
              <button type="button" className="button-text" onClick={handleClear}>
                Clear saved token
              </button>
            ) : null}
          </div>
        </form>
        {!getReadmitApiToken().trim() ? (
          <p className="modal-foot">
            No token in this session yet. After saving, requests use{" "}
            <code className="inline-code">Authorization: Bearer …</code>.
          </p>
        ) : null}
      </div>
    </div>
  );
}
