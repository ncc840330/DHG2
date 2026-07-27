import type { RecordImage } from "./photos";

/**
 * HW check work arrives as a spreadsheet: one import is one task, and the task
 * type decides what has to be done with its rows. Photo upload is the live one;
 * the other two are listed so the operator can see they are coming.
 */
export const TASK_TYPE_OPTIONS = [
  { value: "photo-upload", label: "Photo upload", isActive: true },
  { value: "yellow-seal", label: "Yellow seal", isActive: false },
  { value: "sn-bom-mismatch", label: "SN-Bom mismatch", isActive: false },
] as const;

export type TaskType = (typeof TASK_TYPE_OPTIONS)[number]["value"];

export const PHOTOS_PER_LINE = 2;

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
  lineCount: number;
  completedLines: number;
  photoCount: number;
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
  images: RecordImage[];
};

export type TaskDetail = HwCheckTask & { lines: TaskLine[] };
