import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { andiPhotos } from "../../db/schema.js";
import {
  ANDI_MAX_IMAGE_BYTES,
  photoFileName,
  publicPhoto,
} from "../shared/andi-photos.js";
import {
  ALLOWED_IMAGE_TYPES,
  discardBlobs,
  getAndiPhotoStore,
} from "../shared/images.js";
import { apiError, isValidDateKey, parseId } from "../shared/records.js";

/**
 * The Andi gallery: pictures filed under a work day, nothing else attached.
 *
 * They arrive one per request. A phone on warehouse wifi uploading twenty shots
 * in one body would either time out or blow past what a function may be handed,
 * and a batch that breaks off halfway would leave the operator guessing which
 * pictures made it — one request each means the tab can count them off and pick
 * up where it stopped.
 */
export default async (request: Request) => {
  const url = new URL(request.url);

  if (request.method === "GET") {
    const date = url.searchParams.get("date");

    if (date) {
      if (!isValidDateKey(date)) return apiError("Invalid record date.", 400);

      const rows = await db
        .select()
        .from(andiPhotos)
        .where(eq(andiPhotos.recordDate, date))
        // Oldest first: the gallery reads in the order the pictures were taken,
        // which is the order a numbered rename has to follow.
        .orderBy(asc(andiPhotos.id));

      return Response.json({ photos: rows.map(publicPhoto) });
    }

    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (!isValidDateKey(from) || !isValidDateKey(to) || from > to) {
      return apiError("Invalid date range.", 400);
    }

    const counts = await db
      .select({
        date: andiPhotos.recordDate,
        count: sql<number>`count(*)::int`,
      })
      .from(andiPhotos)
      .where(
        and(gte(andiPhotos.recordDate, from), lte(andiPhotos.recordDate, to)),
      )
      .groupBy(andiPhotos.recordDate)
      .orderBy(andiPhotos.recordDate);

    return Response.json({ counts });
  }

  if (request.method === "POST") {
    const form = await request.formData().catch(() => null);
    if (!form) return apiError("Expected a multipart form submission.", 400);

    const date = form.get("date");
    if (!isValidDateKey(date)) return apiError("Invalid record date.", 400);

    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return apiError("The upload carried no image.", 400);
    }
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return apiError("Only JPEG, PNG or WEBP images can be uploaded.", 415);
    }
    if (file.size > ANDI_MAX_IMAGE_BYTES) {
      return apiError(
        `Images must stay under ${Math.round(ANDI_MAX_IMAGE_BYTES / 1024)} KB.`,
        413,
      );
    }

    const data = await file.arrayBuffer();
    const blobKey = crypto.randomUUID();
    const store = getAndiPhotoStore();
    await store.set(blobKey, data);

    try {
      const [photo] = await db
        .insert(andiPhotos)
        .values({
          recordDate: date,
          fileName: photoFileName(
            form.get("name") ?? file.name,
            file.type,
            `andi-${date}`,
          ),
          blobKey,
          contentType: file.type,
          byteSize: data.byteLength,
        })
        .returning();

      return Response.json({ photo: publicPhoto(photo) }, { status: 201 });
    } catch (error) {
      // The row is what makes a blob findable, so a failed insert has to take
      // its bytes with it or they sit in the store forever.
      await discardBlobs(store, [blobKey]);
      throw error;
    }
  }

  if (request.method === "PATCH") {
    const id = parseId(url.searchParams.get("id"));
    if (!id) return apiError("Invalid image id.", 400);

    const body = (await request.json().catch(() => null)) as {
      fileName?: unknown;
    } | null;
    if (!body) return apiError("Expected a JSON body.", 400);

    const [existing] = await db
      .select()
      .from(andiPhotos)
      .where(eq(andiPhotos.id, id));
    if (!existing) return apiError("Image not found.", 404);

    const [photo] = await db
      .update(andiPhotos)
      .set({
        fileName: photoFileName(
          body.fileName,
          existing.contentType,
          `andi-${existing.recordDate}`,
        ),
        updatedAt: new Date(),
      })
      .where(eq(andiPhotos.id, id))
      .returning();

    return Response.json({ photo: publicPhoto(photo) });
  }

  if (request.method === "DELETE") {
    const id = parseId(url.searchParams.get("id"));
    if (!id) return apiError("Invalid image id.", 400);

    const [photo] = await db
      .delete(andiPhotos)
      .where(eq(andiPhotos.id, id))
      .returning({ blobKey: andiPhotos.blobKey });

    if (!photo) return apiError("Image not found.", 404);

    await discardBlobs(getAndiPhotoStore(), [photo.blobKey]);
    return new Response(null, { status: 204 });
  }

  return new Response("Method not allowed", {
    status: 405,
    headers: { Allow: "GET, POST, PATCH, DELETE" },
  });
};

export const config = {
  path: "/api/andi-photos",
};
