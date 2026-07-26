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
] as const;

export type ProblemOption = (typeof PROBLEM_OPTIONS)[number];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function parseId(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function isProblemOption(value: unknown): value is ProblemOption {
  return (
    typeof value === "string" && PROBLEM_OPTIONS.includes(value as ProblemOption)
  );
}

export function makeLineId(recordDate: string, sequence: number) {
  return `${recordDate.replaceAll("-", "")}-${String(sequence).padStart(3, "0")}`;
}

/**
 * Lowest sequence number that is not taken yet, so a Line ID freed up by a
 * deleted record gets handed out again. `usedSequences` must be ascending.
 */
export function firstFreeSequence(usedSequences: { sequence: number }[]) {
  let lineSequence = 1;
  for (const item of usedSequences) {
    if (item.sequence === lineSequence) lineSequence += 1;
    if (item.sequence > lineSequence) break;
  }
  return lineSequence;
}

export function apiError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
