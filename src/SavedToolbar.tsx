import { useEffect, useRef } from "react";

type SavedToolbarProps = {
  selectedCount: number;
  allSelected: boolean;
  isDownloading: boolean;
  onToggleAll: () => void;
  onDownload: () => void;
};

export default function SavedToolbar({
  selectedCount,
  allSelected,
  isDownloading,
  onToggleAll,
  onDownload,
}: SavedToolbarProps) {
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
          ? "BUILDING ZIP…"
          : `DOWNLOAD ${selectedCount ? `(${selectedCount})` : ""}`}
      </button>
    </div>
  );
}
