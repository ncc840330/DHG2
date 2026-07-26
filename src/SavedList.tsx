import { useCallback, useEffect, useRef, useState } from "react";

export type RowCell = { label: string; value: string };

/**
 * Selection drives the workbook download. Rows that disappear — deleted here or
 * on another device — drop out of the selection on the next refresh.
 */
export function useSelection(records: { id: number }[]) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  useEffect(() => {
    setSelectedIds((current) => {
      const next = current.filter((id) =>
        records.some((record) => record.id === id),
      );
      return next.length === current.length ? current : next;
    });
  }, [records]);

  const allSelected = records.length > 0 && selectedIds.length === records.length;

  const toggle = useCallback((id: number) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds(allSelected ? [] : records.map((record) => record.id));
  }, [allSelected, records]);

  const clear = useCallback(() => setSelectedIds([]), []);

  return { selectedIds, allSelected, toggle, toggleAll, clear };
}

export function SavedToolbar({
  selectedCount,
  allSelected,
  isDownloading,
  onToggleAll,
  onDownload,
}: {
  selectedCount: number;
  allSelected: boolean;
  isDownloading: boolean;
  onToggleAll: () => void;
  onDownload: () => void;
}) {
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedCount > 0 && !allSelected;
    }
  }, [selectedCount, allSelected]);

  return (
    <div className="saved-toolbar">
      <label className="select-all">
        <input
          ref={selectAllRef}
          type="checkbox"
          checked={allSelected}
          onChange={onToggleAll}
        />
        <span>SELECT ALL</span>
      </label>
      <button
        className="download-button"
        type="button"
        disabled={selectedCount === 0 || isDownloading}
        onClick={onDownload}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14" />
        </svg>
        {isDownloading
          ? "BUILDING EXCEL…"
          : `DOWNLOAD ${selectedCount ? `(${selectedCount})` : ""}`}
      </button>
    </div>
  );
}

export function RecordRow({
  lineId,
  cells,
  isSelected,
  onToggle,
  onModify,
  onDelete,
}: {
  lineId: string;
  cells: RowCell[];
  isSelected: boolean;
  onToggle: () => void;
  onModify: () => void;
  onDelete: () => void;
}) {
  return (
    <article className={`data-row ${isSelected ? "is-selected" : ""}`}>
      <label className="row-select">
        <input type="checkbox" checked={isSelected} onChange={onToggle} />
        <span className="visually-hidden">Select {lineId}</span>
      </label>

      <div className="row-cells">
        {cells.map((cell) => (
          <div key={cell.label}>
            <span>{cell.label}</span>
            <strong>{cell.value}</strong>
          </div>
        ))}
      </div>

      <div className="row-actions">
        <button className="modify-button" type="button" onClick={onModify}>
          MODIFY
        </button>
        <button
          className="row-delete"
          type="button"
          onClick={onDelete}
          title={`Delete ${lineId}`}
          aria-label={`Delete ${lineId}`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M5 8h14M10 8V5.5h4V8m-7 0 .9 11.5h8.2L17 8M10.6 11v5.6m2.8-5.6v5.6" />
          </svg>
        </button>
      </div>
    </article>
  );
}
