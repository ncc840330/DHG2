/**
 * Must stay spelled exactly as `netlify/shared/records.ts` has them: the API
 * refuses a record whose problem description is not on its own list, and a
 * near-miss like "Damaged" for "Damaged item" failed every save silently.
 * problem-options.test.js keeps the two in step.
 *
 * The order is the one the operators asked for — most-picked first — so it is
 * theirs to change, but a spelling is not: it is also the value already stored
 * on every saved record.
 */
export const PROBLEM_OPTIONS = [
  "Extra Item",
  "Not Visible SN",
  "Corrosion",
  "Damaged item",
  "Burned item",
  "Item not arrived",
  "SN Discrepancy",
  "Item Discrepancy",
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
  /** A refresh finished. `false` means it failed, so nothing is fresher. */
  onSynced: (isFresh?: boolean) => void;
};

/**
 * Reads a list endpoint. Every one of these requests goes out on the same URL
 * for the same work date, which entitles the browser to answer a SYNC press
 * from its own cache without ever asking the server — no-store is what makes
 * the button mean what it says.
 */
export async function loadJson<T>(url: string, errorMessage: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(errorMessage);
  return (await response.json()) as T;
}

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

/**
 * The API says why it refused. Without this the operator only ever sees "save
 * failed" and has nothing to act on, and neither has whoever they call.
 */
export async function readApiError(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ? `${fallback} (${data.error})` : fallback;
  } catch {
    return fallback;
  }
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
