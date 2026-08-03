import { asc, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { andiPhotos } from "../../db/schema.js";
import {
  ANDI_MAX_ZIP_ENTRIES,
  uniqueEntryNames,
} from "../shared/andi-photos.js";
import { readSelection, zipStreamResponse } from "../shared/export.js";
import { getAndiPhotoStore } from "../shared/images.js";
import { apiError } from "../shared/records.js";
import { streamZip, type ZipSource } from "../shared/zip.js";

/**
 * The selected pictures as one ZIP, named after the day they belong to. The
 * archive is written as the store gives the photos back rather than assembled
 * first: a day's worth of pictures is more than a function should hold, and the
 * operator gets bytes moving instead of a spinner.
 */
export default async (request: Request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  const body = (await request.json().catch(() => null)) as {
    ids?: unknown;
  } | null;
  if (!body) return apiError("Expected a JSON body.", 400);

  const selection = readSelection(body.ids);
  if ("error" in selection) return apiError(selection.error, selection.status);
  if (selection.ids.length > ANDI_MAX_ZIP_ENTRIES) {
    return apiError(
      `Select at most ${ANDI_MAX_ZIP_ENTRIES} images for one ZIP.`,
      400,
    );
  }

  const photos = await db
    .select()
    .from(andiPhotos)
    .where(inArray(andiPhotos.id, selection.ids))
    .orderBy(asc(andiPhotos.id));

  if (photos.length === 0) return apiError("No images found.", 404);

  const store = getAndiPhotoStore();
  const names = uniqueEntryNames(photos.map((photo) => photo.fileName));
  const sources: ZipSource[] = photos.map((photo, index) => ({
    name: names[index],
    read: async () => {
      const data = await store.get(photo.blobKey, { type: "arrayBuffer" });
      return data ? new Uint8Array(data) : null;
    },
  }));

  const days = photos
    .map((photo) => String(photo.recordDate).slice(0, 10))
    .sort();

  return zipStreamResponse(`Andi_${days[0]}.zip`, streamZip(sources));
};

export const config = {
  path: "/api/andi-photos/export",
};
