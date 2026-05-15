import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  getApiBaseUrl,
  getBakedApiBaseUrl,
  getReadmitApiToken,
  hasLocalApiBaseOverride,
  hasSessionStoredToken,
  setApiBaseUrl,
  setReadmitApiToken,
} from "../api/client";

type Props = {
  open: boolean;
  message: string | null;
  onClose: () => void;
  onSaved: () => void;
};

export function ConnectionModal({ open, message, onClose, onSaved }: Props) {
  const id = useId();
  const hadOverrideOnOpen = useRef(false);
  const [apiUrl, setApiUrl] = useState("");
  const [token, setToken] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLocalError(null);
    hadOverrideOnOpen.current = hasLocalApiBaseOverride();
    setApiUrl(hadOverrideOnOpen.current ? getApiBaseUrl() : "");
    setToken("");
  }, [open]);

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const urlRaw = apiUrl.trim();
    const tok = token.trim();

    if (urlRaw) {
      try {
        const u = new URL(urlRaw);
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          setLocalError("URL must start with http:// or https://");
          return;
        }
      } catch {
        setLocalError("Enter a valid URL (e.g. https://your-tunnel.ngrok-free.dev)");
        return;
      }
      setApiBaseUrl(urlRaw.replace(/\/$/, ""));
    } else if (hadOverrideOnOpen.current) {
      setApiBaseUrl(null);
    }

    if (tok) {
      setReadmitApiToken(tok);
    }

    setLocalError(null);
    onSaved();
    onClose();
  };

  const handleClearToken = () => {
    setReadmitApiToken(null);
    setToken("");
    setLocalError(null);
    onSaved();
    onClose();
  };

  const baked = getBakedApiBaseUrl();

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onClick={(ev) => ev.stopPropagation()}
      >
        <h2 id={`${id}-title`} className="modal-title">
          API connection
        </h2>
        {(message || localError) && (
          <p className="modal-hint">{localError || message}</p>
        )}
        <p className="modal-meta">
          Override is saved in this browser only (<code className="inline-code">localStorage</code>).
          Use your public FastAPI URL (ngrok, etc.). Build-time{" "}
          <code className="inline-code">VITE_API_BASE_URL</code>:{" "}
          <code className="inline-code">{baked || "(empty — same-origin in dev)"}</code>
        </p>
        <form onSubmit={handleSubmit}>
          <label htmlFor={`${id}-base`} className="modal-label">
            API base URL
          </label>
          <input
            id={`${id}-base`}
            type="url"
            className="modal-input"
            autoComplete="off"
            placeholder={`e.g. https://…ngrok-free.dev (leave blank to use build default: ${baked || "—"})`}
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
          />
          <label htmlFor={`${id}-token`} className="modal-label">
            API token (optional)
          </label>
          <input
            id={`${id}-token`}
            type="password"
            className="modal-input"
            autoComplete="off"
            placeholder="Same as READMIT_API_TOKEN if the server requires it"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <div className="modal-actions">
            <button type="submit" className="button-primary">
              Save and retry
            </button>
            <button type="button" className="button-secondary" onClick={onClose}>
              Cancel
            </button>
            {hasSessionStoredToken() ? (
              <button type="button" className="button-text" onClick={handleClearToken}>
                Clear saved token
              </button>
            ) : null}
          </div>
        </form>
        {hasLocalApiBaseOverride() || getReadmitApiToken().trim() ? (
          <p className="modal-foot">
            Current requests use <code className="inline-code">{getApiBaseUrl() || "—"}</code> and
            {getReadmitApiToken().trim() ? " a bearer token." : " no bearer token."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
