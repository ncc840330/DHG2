import { asc, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { dhgRecordImages, dhgRecords } from "../../db/schema.js";
import {
  buildTaskDownload,
  describeProblem,
  readSelection,
  zipResponse,
  type ExportColumn,
} from "../shared/export.js";
import { getDhgImageStore } from "../shared/images.js";
import { apiError } from "../shared/records.js";

const COLUMNS: ExportColumn[] = [
  { label: "Line ID", width: 16 },
  { label: "Source Task ID", width: 20 },
  { label: "System Item", width: 26 },
  { label: "System SN", width: 22 },
  { label: "Physical Item", width: 26 },
  { label: "Physical SN", width: 22 },
  { label: "RFID", width: 22 },
  { label: "Problem Description", width: 34 },
  { label: "Locator", width: 18 },
  { label: "County", width: 18 },
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
    .from(dhgRecords)
    .where(inArray(dhgRecords.id, selection.ids))
    .orderBy(asc(dhgRecords.sourceTaskId), asc(dhgRecords.lineId));

  if (records.length === 0) return apiError("No matching records found.", 404);

  const images = await db
    .select()
    .from(dhgRecordImages)
    .where(
      inArray(
        dhgRecordImages.recordId,
        records.map((record) => record.id),
      ),
    )
    .orderBy(asc(dhgRecordImages.slot));

  const download = await buildTaskDownload({
    store: getDhgImageStore(),
    sheetName: "DHG Records",
    columns: COLUMNS,
    bundleName: "dhg-records",
    rows: records.map((record) => ({
      id: record.id,
      lineId: record.lineId,
      systemSn: record.systemSn,
      sourceTaskId: record.sourceTaskId,
      cells: [
        record.lineId,
        record.sourceTaskId,
        record.systemItem,
        record.systemSn,
        record.physicalItem,
        record.physicalSn,
        record.rfid,
        describeProblem(record),
        record.locator,
        record.county,
      ],
    })),
    images: images.map((image) => ({
      ownerId: image.recordId,
      slot: image.slot,
      blobKey: image.blobKey,
      contentType: image.contentType,
    })),
  });

  return zipResponse(download);
};

export const config = {
  path: "/api/dhg-records/export",
};
