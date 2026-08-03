import type { RecordImage } from "./photos";

/**
 * HW check work arrives as a spreadsheet or is typed in row by row: one import is
 * one task, and the task type decides what has to be done with its rows. Photo
 * upload wants two shots per piece, the yellow seal check a Pass or a Fail per
 * box; SN-Bom mismatch is listed so the operator can see it is coming.
 */
export const TASK_TYPE_OPTIONS = [
  { value: "photo-upload", label: "Photo upload", isActive: true },
  { value: "yellow-seal", label: "Yellow seal", isActive: true },
  { value: "sn-bom-mismatch", label: "SN-Bom mismatch", isActive: false },
] as const;

export type TaskType = (typeof TASK_TYPE_OPTIONS)[number]["value"];

export const PHOTOS_PER_LINE = 2;

/** What the seal label can be: it is either intact or it is not. */
export const SEAL_OPTIONS = [
  { value: "pass", label: "Pass" },
  { value: "fail", label: "Fail" },
] as const;

export function taskTypeLabel(taskType: string) {
  return (
    TASK_TYPE_OPTIONS.find((option) => option.value === taskType)?.label ?? taskType
  );
}

/** A task as the list shows it: identity plus how far its rows have got. */
export type HwCheckTask = {
  id: number;
  recordDate: string;
  taskType: string;
  taskCode: string;
  sourceFileName: string;
  /** Yellow seal only: the names the printed sheet repeats on every row. */
  checkedBy: string;
  confirmedBy: string;
  signature: string;
  lineCount: number;
  completedLines: number;
  photoCount: number;
  /** Yellow seal only: how the checked boxes came out. */
  passCount: number;
  failCount: number;
  isComplete: boolean;
};

export type TaskLine = {
  id: number;
  rowIndex: number;
  item: string;
  sn: string;
  qty: string;
  /** Which piece of an imported qty this line is, e.g. 2 of 3. */
  unitIndex: number;
  unitCount: number;
  warehouseCode: string;
  subinvCode: string;
  locator: string;
  /** Yellow seal only: the code on the box label and what its seal looked like. */
  barcode: string;
  sealResult: string;
  remark: string;
  images: RecordImage[];
};

export type TaskDetail = HwCheckTask & { lines: TaskLine[] };
