/**
 * Hardware check tasks are created from a spreadsheet, not typed in: one import
 * becomes one task, every piece of every row becomes a line, and every line
 * needs two photos before the task counts as done. Everything both the API and
 * the export need to agree on lives here.
 */

import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  hwCheckLineImages,
  hwCheckTaskLines,
  hwCheckUploadTasks,
} from "../../db/schema.js";
import { publicImageMeta } from "./images.js";

/** Only photo upload is live; the other two are numbered here already so a
 * task code never has to be renamed when they are switched on. */
export const TASK_TYPES = {
  "photo-upload": { label: "Photo upload", prefix: "Photo", isActive: true },
  "yellow-seal": { label: "Yellow seal", prefix: "Yellow", isActive: false },
  "sn-bom-mismatch": { label: "SN-Bom mismatch", prefix: "SNBom", isActive: false },
} as const;

export type TaskType = keyof typeof TASK_TYPES;

/** Every line of a photo upload task needs a front and a back shot. */
export const PHOTOS_PER_LINE = 2;

/** The warehouse the app is used in, prefilled so nobody has to type it. */
export const WAREHOUSE_CODE = "FXN-GYOR";

export const MAX_TASK_LINES = 500;

const MAX_CELL_LENGTH = 120;

export type TaskLineInput = {
  item: string;
  sn: string;
  qty: string;
  warehouseCode: string;
  subinvCode: string;
  locator: string;
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

/** `Photo.20260727.01` — the type's own prefix, the work date, the sequence. */
export function makeTaskCode(
  taskType: TaskType,
  recordDate: string,
  sequence: number,
) {
  return [
    TASK_TYPES[taskType].prefix,
    recordDate.replaceAll("-", ""),
    String(sequence).padStart(2, "0"),
  ].join(".");
}

function cell(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim().slice(0, MAX_CELL_LENGTH)
    : "";
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
 * The rows arrive parsed from the operator's spreadsheet, so they are checked
 * again here: a row nothing identifies or that says nowhere to go cannot be
 * photographed, and a row the browser let through would otherwise become an
 * unworkable task line. Every piece of a qty becomes a line of its own.
 */
export function readTaskLines(rawRows: unknown) {
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
    };

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
};

/**
 * How far every task has got. A line is done at two photos, and the task is
 * done when all of its lines are — the list shows both so a half-finished task
 * still reads as progress rather than as nothing.
 */
export async function loadTaskProgress(taskIds: number[]) {
  const progress = new Map<number, TaskProgress>();
  if (taskIds.length === 0) return progress;

  const rows = await db
    .select({
      taskId: hwCheckTaskLines.taskId,
      photoCount: sql<number>`count(${hwCheckLineImages.id})::int`,
    })
    .from(hwCheckTaskLines)
    .leftJoin(
      hwCheckLineImages,
      eq(hwCheckLineImages.lineId, hwCheckTaskLines.id),
    )
    .where(inArray(hwCheckTaskLines.taskId, taskIds))
    .groupBy(hwCheckTaskLines.taskId, hwCheckTaskLines.id);

  for (const taskId of taskIds) {
    progress.set(taskId, { lineCount: 0, completedLines: 0, photoCount: 0 });
  }

  for (const row of rows) {
    const current = progress.get(row.taskId);
    if (!current) continue;
    current.lineCount += 1;
    current.photoCount += row.photoCount;
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
  const taskProgress =
    progress.get(task.id) ?? { lineCount: 0, completedLines: 0, photoCount: 0 };

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

  const progress = await loadTaskProgress([taskId]);

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
