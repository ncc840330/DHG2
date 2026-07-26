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
