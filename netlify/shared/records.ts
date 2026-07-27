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

/**
 * Newest line on top: the saved lists are read from the bottom of the shift, so
 * the row that was just written should not need scrolling for.
 */
export function newestFirst<T extends { id: number; createdAt: Date | string }>(
  rows: T[],
) {
  return [...rows].sort((left, right) => {
    const byDate =
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    return byDate !== 0 ? byDate : right.id - left.id;
  });
}

export function apiError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
