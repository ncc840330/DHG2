/**
 * Hardware check tasks are created from a spreadsheet or typed in row by row:
 * one import becomes one task, every piece of every row becomes a line, and what
 * finishes a line depends on the task type — two photos for photo upload, a
 * pass or a fail for the yellow seal check. Everything both the API and the
 * export need to agree on lives here.
 */

import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  hwCheckLineImages,
  hwCheckTaskLines,
  hwCheckUploadTasks,
} from "../../db/schema.js";
import { publicImageMeta } from "./images.js";
import { makeLineId } from "./records.js";

/** SN-Bom mismatch is numbered here already so a task code never has to be
 * renamed when it is switched on. */
export const TASK_TYPES = {
  "photo-upload": { label: "Photo upload", prefix: "Photo", isActive: true },
  "yellow-seal": { label: "Yellow seal", prefix: "Yellow_seal_", isActive: true },
  "sn-bom-mismatch": { label: "SN-Bom mismatch", prefix: "SNBom", isActive: false },
} as const;

export type TaskType = keyof typeof TASK_TYPES;

/** Every line of a photo upload task needs a front and a back shot. */
export const PHOTOS_PER_LINE = 2;

/** What the seal label can be: it is either intact or it is not. */
export const SEAL_RESULTS = ["pass", "fail"] as const;

export type SealResult = (typeof SEAL_RESULTS)[number];

export function isSealResult(value: unknown): value is SealResult {
  return typeof value === "string" && SEAL_RESULTS.includes(value as SealResult);
}

/** The warehouse the app is used in, prefilled so nobody has to type it. */
export const WAREHOUSE_CODE = "FXN-GYOR";

export const MAX_TASK_LINES = 500;

const MAX_CELL_LENGTH = 120;

/** A remark is a sentence about a box, not a report. */
const MAX_REMARK_LENGTH = 400;

export type TaskLineInput = {
  item: string;
  sn: string;
  qty: string;
  warehouseCode: string;
  subinvCode: string;
  locator: string;
  /** Read off the box label by the yellow seal check; empty for photo upload. */
  barcode: string;
  /** Yellow seal only, and normally empty: the checker answers in the app. */
  sealResult: string;
  remark: string;
  /** Which piece of the imported row this line is, e.g. 2 of 3. */
  unitIndex: number;
  unitCount: number;
};

export function isTaskType(value: unknown): value is TaskType {
  return typeof value === "string" && value in TASK_TYPES;
}

export function isActiveTaskType(value: unknown): value is TaskType {
  return isTaskType(value) && TASK_TYPES[value].isActive;
}

/**
 * `Photo.20260727.01` for photo upload. The yellow seal check is numbered the
 * way DHG numbers its lines instead — `Yellow_seal_20260727-001` — because that
 * is the numbering the warehouse already reads off the printed sheets.
 */
export function makeTaskCode(
  taskType: TaskType,
  recordDate: string,
  sequence: number,
) {
  if (taskType === "yellow-seal") {
    return `${TASK_TYPES[taskType].prefix}${makeLineId(recordDate, sequence)}`;
  }

  return [
    TASK_TYPES[taskType].prefix,
    recordDate.replaceAll("-", ""),
    String(sequence).padStart(2, "0"),
  ].join(".");
}

function cell(value: unknown, maxLength = MAX_CELL_LENGTH) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim().slice(0, maxLength)
    : "";
}

export function readRemark(value: unknown) {
  return cell(value, MAX_REMARK_LENGTH);
}

/**
 * How many pieces an imported row is. Photos are taken per piece, so a row of
 * qty 3 has to become three task lines — the rule lives here rather than in the
 * browser, so a stale phone cannot create a task with fewer lines than pieces.
 * Anything unreadable counts as a single piece.
 */
export function unitCount(qty: string) {
  const digits = /\d+/.exec(qty);
  const count = digits ? Number.parseInt(digits[0], 10) : 1;
  return count > 1 ? Math.min(count, MAX_TASK_LINES + 1) : 1;
}

/**
 * The rows arrive parsed from the operator's spreadsheet or typed into the
 * upload sheet, so they are checked again here: a row nothing identifies or that
 * says nowhere to go cannot be worked, and a row the browser let through would
 * otherwise become an unworkable task line. What each type insists on differs —
 * photo upload wants a locator and an identifier and splits every piece of a qty
 * into a line of its own, the yellow seal check wants the four cells the printed
 * sheet has a column for and treats every row as one box.
 */
export function readTaskLines(taskType: TaskType, rawRows: unknown) {
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return { error: "The imported file has no rows.", status: 400 } as const;
  }
  if (rawRows.length > MAX_TASK_LINES) {
    return {
      error: `A task carries at most ${MAX_TASK_LINES} rows.`,
      status: 400,
    } as const;
  }

  const lines: TaskLineInput[] = [];

  for (const [index, rawRow] of rawRows.entries()) {
    const row = (rawRow ?? {}) as Record<string, unknown>;
    const values = {
      item: cell(row.item),
      sn: cell(row.sn),
      warehouseCode: cell(row.warehouseCode) || WAREHOUSE_CODE,
      subinvCode: cell(row.subinvCode),
      locator: cell(row.locator),
      barcode: cell(row.barcode),
      sealResult: "",
      remark: "",
    };

    if (taskType === "yellow-seal") {
      // The seal sheet is printed and signed, so every column of it has to say
      // something. The SN is the sheet's Bar Code column, stored as `barcode`;
      // only the remark is the checker's to leave alone.
      if (!values.item || !values.barcode || !values.locator || !values.subinvCode) {
        return {
          error: `Row ${index + 1} needs a From Subinv, a Locator, an Item and an SN.`,
          status: 400,
        } as const;
      }

      // An import is normally a list of boxes nobody has looked at yet, but a
      // sheet that already carries answers keeps them rather than asking the
      // warehouse to check the same boxes twice.
      lines.push({
        ...values,
        sealResult: isSealResult(row.sealResult) ? row.sealResult : "",
        remark: readRemark(row.remark),
        qty: "1",
        unitIndex: 1,
        unitCount: 1,
      });
      continue;
    }

    if ((!values.item && !values.sn) || !values.locator) {
      return {
        error: `Row ${index + 1} needs a locator and an item or SN.`,
        status: 400,
      } as const;
    }

    const pieces = unitCount(cell(row.qty));
    if (lines.length + pieces > MAX_TASK_LINES) {
      return {
        error: `A task carries at most ${MAX_TASK_LINES} rows, and the quantities add up to more.`,
        status: 400,
      } as const;
    }

    for (let piece = 1; piece <= pieces; piece += 1) {
      lines.push({ ...values, qty: "1", unitIndex: piece, unitCount: pieces });
    }
  }

  return { lines } as const;
}

export type TaskProgress = {
  lineCount: number;
  completedLines: number;
  photoCount: number;
  /** Yellow seal only: how the checked boxes came out. */
  passCount: number;
  failCount: number;
};

const emptyProgress = (): TaskProgress => ({
  lineCount: 0,
  completedLines: 0,
  photoCount: 0,
  passCount: 0,
  failCount: 0,
});

/**
 * How far every task has got. A photo upload line is done at two photos and a
 * yellow seal line at a pass or a fail; the task is done when all of its lines
 * are — the list shows both so a half-finished task still reads as progress
 * rather than as nothing.
 */
export async function loadTaskProgress(tasks: { id: number; taskType: string }[]) {
  const progress = new Map<number, TaskProgress>();
  if (tasks.length === 0) return progress;

  const taskIds = tasks.map((task) => task.id);
  const typeById = new Map(tasks.map((task) => [task.id, task.taskType]));

  const rows = await db
    .select({
      taskId: hwCheckTaskLines.taskId,
      sealResult: hwCheckTaskLines.sealResult,
      photoCount: sql<number>`count(${hwCheckLineImages.id})::int`,
    })
    .from(hwCheckTaskLines)
    .leftJoin(
      hwCheckLineImages,
      eq(hwCheckLineImages.lineId, hwCheckTaskLines.id),
    )
    .where(inArray(hwCheckTaskLines.taskId, taskIds))
    .groupBy(
      hwCheckTaskLines.taskId,
      hwCheckTaskLines.id,
      hwCheckTaskLines.sealResult,
    );

  for (const taskId of taskIds) progress.set(taskId, emptyProgress());

  for (const row of rows) {
    const current = progress.get(row.taskId);
    if (!current) continue;

    current.lineCount += 1;
    current.photoCount += row.photoCount;

    if (typeById.get(row.taskId) === "yellow-seal") {
      if (row.sealResult === "pass") current.passCount += 1;
      if (row.sealResult === "fail") current.failCount += 1;
      if (isSealResult(row.sealResult)) current.completedLines += 1;
      continue;
    }

    if (row.photoCount >= PHOTOS_PER_LINE) current.completedLines += 1;
  }

  return progress;
}

export function isTaskComplete(progress: TaskProgress) {
  return progress.lineCount > 0 && progress.completedLines === progress.lineCount;
}

export function publicTask<T extends { id: number }>(
  task: T,
  progress: Map<number, TaskProgress>,
) {
  const taskProgress = progress.get(task.id) ?? emptyProgress();

  return {
    ...task,
    ...taskProgress,
    isComplete: isTaskComplete(taskProgress),
  };
}

/** A task with its rows and the photo metadata already uploaded for them. */
export async function loadTaskDetail(taskId: number) {
  const [task] = await db
    .select()
    .from(hwCheckUploadTasks)
    .where(eq(hwCheckUploadTasks.id, taskId));

  if (!task) return null;

  const lines = await db
    .select()
    .from(hwCheckTaskLines)
    .where(eq(hwCheckTaskLines.taskId, taskId))
    .orderBy(asc(hwCheckTaskLines.rowIndex));

  const images = lines.length
    ? await db
        .select()
        .from(hwCheckLineImages)
        .where(
          inArray(
            hwCheckLineImages.lineId,
            lines.map((line) => line.id),
          ),
        )
        .orderBy(asc(hwCheckLineImages.slot))
    : [];

  const progress = await loadTaskProgress([task]);

  return {
    ...publicTask(task, progress),
    lines: lines.map((line) => ({
      ...line,
      images: images
        .filter((image) => image.lineId === line.id)
        .map(publicImageMeta),
    })),
  };
}
