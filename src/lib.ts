export const PROBLEM_OPTIONS = [
  "Extra item",
  "Corrosion",
  "Damaged",
  "Item discrepancy",
  "SN discrepancy",
  "Item no arrived",
  "Burned item",
  "Not Visible SN",
  "Empty box",
  "SN upload",
  "Other",
];

export const DAY_OFFSETS = Array.from({ length: 15 }, (_, index) => index - 14);

export type View = "add" | "saved";

export type RecordCount = {
  date: string;
  count: number;
};

export type TabProps = {
  isActive: boolean;
  selectedDate: string;
  rangeFrom: string;
  rangeTo: string;
  refreshToken: number;
  onCounts: (counts: Record<string, number>) => void;
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

export function formatShortDate(date: Date) {
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

export function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function makeLineId(dateKey: string, sequence: number) {
  return `${dateKey.split("-").join("")}-${String(sequence).padStart(3, "0")}`;
}

export function toCountMap(counts: RecordCount[]) {
  return Object.fromEntries(counts.map((item) => [item.date, item.count]));
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
 * Asks the export endpoint for the workbook of the selected lines and hands it
 * to the browser. Returns the file name that was saved.
 */
export async function downloadSelection(
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
