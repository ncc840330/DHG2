import { asc, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { deletionRequestImages, deletionRequests } from "../../db/schema.js";
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
import { getImageStore } from "../shared/images.js";
import { apiError } from "../shared/records.js";

/** Same layout as the DHG sheet, limited to the fields a request captures. */
const COLUMNS: ExportColumn[] = [
  { label: "Line ID", width: 18, fill: GREEN_HEADER },
  { label: "System item code", width: 16, fill: GREEN_HEADER },
  { label: "System SN", width: 26, fill: GREEN_HEADER },
  { label: "RFID", width: 19, fill: GREEN_HEADER },
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
    .from(deletionRequests)
    .where(inArray(deletionRequests.id, selection.ids))
    .orderBy(asc(deletionRequests.recordDate), asc(deletionRequests.lineId));

  if (records.length === 0) return apiError("No matching records found.", 404);

  const images = await db
    .select()
    .from(deletionRequestImages)
    .where(
      inArray(
        deletionRequestImages.requestId,
        records.map((record) => record.id),
      ),
    )
    .orderBy(asc(deletionRequestImages.slot));

  const download = await buildWorkbookDownload({
    store: getImageStore(),
    fileName: exportFileName(
      "DeletionRequest",
      records.map((record) => record.recordDate),
    ),
    sheetName: "Deletion requests",
    columns: COLUMNS,
    rows: records.map((record) => ({
      id: record.id,
      sheetName: record.lineId,
      cells: [
        record.lineId,
        record.systemItem,
        record.systemSn,
        record.rfid,
        describeProblem(record),
        formatSheetDate(record.recordDate),
        "",
        record.sourceTaskId,
      ],
    })),
    images: images.map((image) => ({
      ownerId: image.requestId,
      slot: image.slot,
      blobKey: image.blobKey,
      contentType: image.contentType,
    })),
  });

  return spreadsheetResponse(download);
};

export const config = {
  path: "/api/deletion-requests/export",
};
