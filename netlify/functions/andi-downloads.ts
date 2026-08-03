import { desc, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { andiDownloads, andiPhotos } from "../../db/schema.js";
import {
  ANDI_MAX_DOWNLOAD_HISTORY,
  downloadLabel,
  isAndiDownloadFormat,
  parsePhotoIds,
  publicDownload,
  serializePhotoIds,
} from "../shared/andi-photos.js";
import { readSelection } from "../shared/export.js";
import { apiError, isValidDateKey } from "../shared/records.js";

/**
 * The download log for the photo buffer: what went out, when, and to which
 * pictures — newest first, because the download someone wants again is almost
 * always the one they just made.
 *
 * It is written after the bytes have actually left, never before: an entry the
 * operator cannot repeat would be worse than no entry at all.
 */
export default async (request: Request) => {
  if (request.method === "GET") {
    const entries = await db
      .select()
      .from(andiDownloads)
      // The id breaks the tie: two downloads inside the same millisecond still
      // have to list in the order they happened.
      .orderBy(desc(andiDownloads.createdAt), desc(andiDownloads.id))
      .limit(ANDI_MAX_DOWNLOAD_HISTORY);

    const wanted = Array.from(
      new Set(entries.flatMap((entry) => parsePhotoIds(entry.photoIds))),
    );

    // Which of the logged pictures are still in the buffer. One query for the
    // whole page rather than one per entry.
    const present = wanted.length
      ? await db
          .select({ id: andiPhotos.id })
          .from(andiPhotos)
          .where(inArray(andiPhotos.id, wanted))
      : [];
    const presentIds = new Set(present.map((photo) => photo.id));

    return Response.json({
      history: entries.map((entry) => publicDownload(entry, presentIds)),
    });
  }

  if (request.method === "POST") {
    const body = (await request.json().catch(() => null)) as {
      date?: unknown;
      format?: unknown;
      fileName?: unknown;
      photoIds?: unknown;
    } | null;
    if (!body) return apiError("Expected a JSON body.", 400);

    if (!isValidDateKey(body.date)) return apiError("Invalid record date.", 400);
    if (!isAndiDownloadFormat(body.format)) {
      return apiError("A download is either jpeg or zip.", 400);
    }

    const selection = readSelection(body.photoIds);
    if ("error" in selection) return apiError(selection.error, selection.status);

    // The size is read off the stored pictures rather than taken on trust, and it
    // is what the entry is worth: it says how much traffic that download cost.
    const photos = await db
      .select({ id: andiPhotos.id, byteSize: andiPhotos.byteSize })
      .from(andiPhotos)
      .where(inArray(andiPhotos.id, selection.ids));

    const known = new Set(photos.map((photo) => photo.id));
    const photoIds = selection.ids.filter((id) => known.has(id));
    if (photoIds.length === 0) return apiError("No images found.", 404);

    const [entry] = await db
      .insert(andiDownloads)
      .values({
        recordDate: body.date,
        format: body.format,
        fileName: downloadLabel(body.fileName, `${photoIds.length} photo`),
        photoIds: serializePhotoIds(photoIds),
        photoCount: photoIds.length,
        byteSize: photos.reduce((total, photo) => total + photo.byteSize, 0),
      })
      .returning();

    return Response.json(
      { entry: publicDownload(entry, known) },
      { status: 201 },
    );
  }

  return new Response("Method not allowed", {
    status: 405,
    headers: { Allow: "GET, POST" },
  });
};

export const config = {
  path: "/api/andi-downloads",
};
