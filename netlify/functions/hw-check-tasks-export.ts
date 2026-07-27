import { asc, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  hwCheckLineImages,
  hwCheckTaskLines,
  hwCheckUploadTasks,
} from "../../db/schema.js";
import {
  BLUE_HEADER,
  buildWorkbookDownload,
  exportFileName,
  formatSheetDate,
  GREEN_HEADER,
  readSelection,
  spreadsheetResponse,
  type ExportColumn,
} from "../shared/export.js";
import { PHOTOS_PER_LINE } from "../shared/hw-check.js";
import { getHwCheckImageStore } from "../shared/images.js";
import { apiError } from "../shared/records.js";

/** The imported grid, given back with the photo count each row reached. */
const COLUMNS: ExportColumn[] = [
  { label: "Task", width: 20, fill: GREEN_HEADER },
  { label: "Item", width: 18, fill: GREEN_HEADER },
  { label: "SN", width: 26, fill: GREEN_HEADER },
  { label: "Qty", width: 8, fill: GREEN_HEADER },
  { label: "Warehouse Code", width: 18, fill: GREEN_HEADER },
  { label: "Subinv Code", width: 16, fill: GREEN_HEADER },
  { label: "Locator", width: 18, fill: GREEN_HEADER },
  { label: "Photos", width: 10, fill: BLUE_HEADER },
  { label: "Date of sending", width: 16, fill: BLUE_HEADER },
];

export default async (request: Request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  const body = await request.json().catch(() => null);
  const selection = readSelection((body as { ids?: unknown })?.ids);
  if ("error" in selection) return apiError(selection.error, selection.status);

  const tasks = await db
    .select()
    .from(hwCheckUploadTasks)
    .where(inArray(hwCheckUploadTasks.id, selection.ids))
    .orderBy(asc(hwCheckUploadTasks.recordDate), asc(hwCheckUploadTasks.taskCode));

  if (tasks.length === 0) return apiError("No matching tasks found.", 404);

  const lines = await db
    .select()
    .from(hwCheckTaskLines)
    .where(
      inArray(
        hwCheckTaskLines.taskId,
        tasks.map((task) => task.id),
      ),
    )
    .orderBy(asc(hwCheckTaskLines.taskId), asc(hwCheckTaskLines.rowIndex));

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

  const byTaskId = new Map(tasks.map((task) => [task.id, task]));

  const download = await buildWorkbookDownload({
    store: getHwCheckImageStore(),
    fileName: exportFileName(
      "HWCheckTask",
      tasks.map((task) => task.recordDate),
    ),
    sheetName: "HW check tasks",
    columns: COLUMNS,
    rows: lines.map((line) => {
      const task = byTaskId.get(line.taskId);
      const photoCount = images.filter((image) => image.lineId === line.id).length;

      return {
        id: line.id,
        // Each row's photos land on a tab of their own, named after the task and
        // the row it came from so the two can be matched up again.
        lineId: `${task?.taskCode ?? "task"}-${String(line.rowIndex).padStart(3, "0")}`,
        cells: [
          task?.taskCode ?? "",
          line.item,
          line.sn,
          line.qty,
          line.warehouseCode,
          line.subinvCode,
          line.locator,
          `${photoCount}/${PHOTOS_PER_LINE}`,
          task ? formatSheetDate(task.recordDate) : "",
        ],
      };
    }),
    images: images.map((image) => ({
      ownerId: image.lineId,
      slot: image.slot,
      blobKey: image.blobKey,
      contentType: image.contentType,
    })),
  });

  return spreadsheetResponse(download);
};

export const config = {
  path: "/api/hw-check-tasks/export",
};
