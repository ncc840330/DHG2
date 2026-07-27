import { asc, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { hwCheckTaskImages, hwCheckTasks } from "../../db/schema.js";
import {
  BLUE_HEADER,
  buildWorkbookDownload,
  describeProblem,
  exportFileName,
  formatSheetDate,
  GREEN_HEADER,
  readSelection,
  spreadsheetResponse,
  type ExportColumn,
} from "../shared/export.js";
import { getHwCheckImageStore } from "../shared/images.js";
import { apiError } from "../shared/records.js";

/** Same layout as the deletion request sheet, plus the locator to check at. */
const COLUMNS: ExportColumn[] = [
  { label: "Line ID", width: 18, fill: GREEN_HEADER },
  { label: "System item code", width: 16, fill: GREEN_HEADER },
  { label: "System SN", width: 26, fill: GREEN_HEADER },
  { label: "RFID", width: 19, fill: GREEN_HEADER },
  { label: "Locator", width: 16, fill: GREEN_HEADER },
  { label: "Problem description", width: 29, fill: GREEN_HEADER },
  { label: "Date of sending", width: 16, fill: GREEN_HEADER },
  { label: "Contract", width: 25, fill: BLUE_HEADER },
  { label: "Source task ID", width: 21, fill: BLUE_HEADER },
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

  const records = await db
    .select()
    .from(hwCheckTasks)
    .where(inArray(hwCheckTasks.id, selection.ids))
    .orderBy(asc(hwCheckTasks.recordDate), asc(hwCheckTasks.lineId));

  if (records.length === 0) return apiError("No matching records found.", 404);

  const images = await db
    .select()
    .from(hwCheckTaskImages)
    .where(
      inArray(
        hwCheckTaskImages.taskId,
        records.map((record) => record.id),
      ),
    )
    .orderBy(asc(hwCheckTaskImages.slot));

  const download = await buildWorkbookDownload({
    store: getHwCheckImageStore(),
    fileName: exportFileName(
      "HWCheckRequest",
      records.map((record) => record.recordDate),
    ),
    sheetName: "HW check requests",
    columns: COLUMNS,
    rows: records.map((record) => ({
      id: record.id,
      lineId: record.lineId,
      cells: [
        record.lineId,
        record.systemItem,
        record.systemSn,
        record.rfid,
        record.locator,
        describeProblem(record),
        formatSheetDate(record.recordDate),
        "",
        record.sourceTaskId,
      ],
    })),
    images: images.map((image) => ({
      ownerId: image.taskId,
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
