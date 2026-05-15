import { useMemo, useState } from "react";
import type { AdmissionListItem } from "../api/types";

interface Props {
  items: AdmissionListItem[];
  total: number;
  selectedRowId: number | null;
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
  onSelect: (rowId: number) => void;
}

function formatOption(item: AdmissionListItem): string {
  return item.subject_id != null ? String(item.subject_id) : `— (row ${item.row_id})`;
}

function placeholderText(
  loading: boolean,
  loadError: string | null,
  filter: string,
  filteredCount: number,
  total: number,
): string {
  if (loading) return "Loading subjects…";
  if (loadError) return "Could not load subjects";
  if (filter.trim() && filteredCount === 0) return "No matches for filter";
  if (filteredCount === 0) return "No subjects available";
  return `Choose subject (${total} in cohort)`;
}

export function AdmissionSelector({
  items,
  total,
  selectedRowId,
  loading,
  loadError,
  onRetry,
  onSelect,
}: Props) {
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.patient_identifier.toLowerCase().includes(q) ||
        String(item.row_id).includes(q) ||
        (item.subject_id != null && String(item.subject_id).includes(q)),
    );
  }, [items, filter]);

  const canSelect = !loading && !loadError && filtered.length > 0;

  return (
    <div className="selector-row admission-selector">
      <label htmlFor="admission-select">Subject ID</label>
      <div className="admission-selector-controls">
        <input
          id="admission-filter"
          type="search"
          className="admission-filter"
          placeholder="Filter list…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          disabled={loading || !!loadError || items.length === 0}
          aria-label="Filter by subject ID or row"
        />
        <select
          id="admission-select"
          className="admission-dropdown"
          data-testid="subject-select"
          value={selectedRowId ?? ""}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v)) onSelect(v);
          }}
          disabled={!canSelect}
        >
          <option value="">
            {placeholderText(loading, loadError, filter, filtered.length, total)}
          </option>
          {filtered.map((item) => (
            <option key={item.row_id} value={item.row_id}>
              {formatOption(item)}
            </option>
          ))}
        </select>
      </div>
      {loadError && (
        <div className="admission-selector-error">
          <span>{loadError}</span>
          <button type="button" className="btn-secondary" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}
      {!loading && !loadError && filter && items.length > 0 && (
        <span className="admission-selector-hint">
          {filtered.length} of {items.length} shown
        </span>
      )}
    </div>
  );
}
