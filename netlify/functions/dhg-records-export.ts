import { asc, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { dhgRecords } from "../../db/schema.js";
import { buildArchiveResponse, parseSelection } from "../shared/export.js";
import { apiError } from "../shared/records.js";

export default async (request: Request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  const body = await request.json().catch(() => null);
  const selection = parseSelection(body);
  if (selection.error) return apiError(selection.error, 400);

  const records = await db
    .select()
    .from(dhgRecords)
    .where(inArray(dhgRecords.id, selection.ids))
    .orderBy(asc(dhgRecords.sourceTaskId), asc(dhgRecords.lineId));

  if (records.length === 0) return apiError("No matching records found.", 404);

  // DHG records carry no photos of their own — the workbook is the whole archive.
  return buildArchiveResponse({
    records,
    images: [],
    sheetName: "DHG Records",
    bundlePrefix: "dhg-records",
  });
};

export const config = {
  path: "/api/dhg-records/export",
};
