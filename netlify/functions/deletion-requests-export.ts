import { asc, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { deletionRequestImages, deletionRequests } from "../../db/schema.js";
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
    .from(deletionRequests)
    .where(inArray(deletionRequests.id, selection.ids))
    .orderBy(asc(deletionRequests.sourceTaskId), asc(deletionRequests.lineId));

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

  return buildArchiveResponse({
    records,
    images: images.map((image) => ({
      recordId: image.requestId,
      slot: image.slot,
      blobKey: image.blobKey,
      contentType: image.contentType,
    })),
    sheetName: "Deletion Requests",
    bundlePrefix: "deletion-requests",
  });
};

export const config = {
  path: "/api/deletion-requests/export",
};
