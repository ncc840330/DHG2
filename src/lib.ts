import { useCallback, useEffect, useState } from "react";

export const PROBLEM_OPTIONS = [
  "Item Discrepancy",
  "SN Discrepancy",
  "Item not arrived",
  "Extra Item",
  "Corrosion",
  "Damaged item",
  "Burned item",
  "Not Visible SN",
  "Empty box",
  "SN upload",
  "Other",
];

export type View = "add" | "saved";

export type TabProps = {
  isActive: boolean;
  workDate: string;
  refreshToken: number;
  onCount: (count: number) => void;
  onSynced: () => void;
};

export function getDate(offset = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
}

export function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateKey(dateKey: string) {
  return dateKey.split("-").join(".");
}

export function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function makeLineId(dateKey: string, sequence: number) {
  return `${dateKey.split("-").join("")}-${String(sequence).padStart(3, "0")}`;
}

/**
 * Moves focus to the next control so a barcode scanner's trailing Enter walks
 * down the form instead of submitting it early.
 */
export function focusNextControl(
  form: HTMLFormElement | null,
  event: { key: string; shiftKey: boolean; target: EventTarget | null; preventDefault: () => void },
) {
  if (event.key !== "Enter" || event.shiftKey) return;
  const target = event.target as HTMLElement;
  if (target.tagName === "BUTTON") return;

  const controls = Array.from(
    form?.querySelectorAll<HTMLElement>(
      "input:not([disabled]):not([readonly]):not([type=file]):not([type=checkbox]), select:not([disabled])",
    ) ?? [],
  );
  const currentIndex = controls.indexOf(target);
  if (currentIndex < 0) return;

  event.preventDefault();
  const nextControl = controls[currentIndex + 1];
  if (nextControl) {
    nextControl.focus();
    return;
  }

  form?.querySelector<HTMLButtonElement>(".save-button")?.focus();
}

/** Row selection for the saved sheets: pick a few rows, or tick them all. */
export function useSelection(records: { id: number }[]) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const allSelected = records.length > 0 && selectedIds.length === records.length;

  useEffect(() => {
    setSelectedIds((current) => {
      const next = current.filter((id) =>
        records.some((record) => record.id === id),
      );
      return next.length === current.length ? current : next;
    });
  }, [records]);

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

function readFileName(header: string | null) {
  if (!header) return null;

  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      // Fall back to the plain filename below.
    }
  }

  const plain = /filename="([^"]+)"/i.exec(header);
  return plain ? plain[1] : null;
}

/**
 * Asks the export endpoint for the selected rows and hands the archive to the
 * browser. Returns the file name so the caller can confirm it on screen.
 */
export async function downloadArchive(
  endpoint: string,
  ids: number[],
  fallbackName: string,
) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!response.ok) throw new Error("A letöltés sikertelen.");

  const archive = await response.blob();
  const fileName =
    readFileName(response.headers.get("Content-Disposition")) ?? fallbackName;

  const url = URL.createObjectURL(archive);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  return fileName;
}
