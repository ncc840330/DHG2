import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { andiPhotos } from "../../db/schema.js";
import { asciiFileName } from "../shared/export.js";
import { getAndiPhotoStore } from "../shared/images.js";
import { apiError, parseId } from "../shared/records.js";

/**
 * One picture, either to look at in the gallery or to save. `download=1` is what
 * separates the two: the same bytes, but named and offered as a file so a single
 * JPEG needs no archive around it.
 */
export default async (request: Request) => {
  if (request.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET" },
    });
  }

  const url = new URL(request.url);
  const id = parseId(url.searchParams.get("id"));
  if (!id) return apiError("Invalid image id.", 400);

  const [photo] = await db.select().from(andiPhotos).where(eq(andiPhotos.id, id));
  if (!photo) return apiError("Image not found.", 404);

  const data = await getAndiPhotoStore().get(photo.blobKey, {
    type: "arrayBuffer",
  });
  if (!data) return apiError("Image not found.", 404);

  const headers: Record<string, string> = {
    "Content-Type": photo.contentType,
    "Content-Length": String(photo.byteSize),
    // The bytes behind an id never change — only the name they go out under.
    "Cache-Control": "private, max-age=31536000, immutable",
  };

  if (url.searchParams.get("download") === "1") {
    headers["Content-Disposition"] =
      `attachment; filename="${asciiFileName(photo.fileName)}"; ` +
      `filename*=UTF-8''${encodeURIComponent(photo.fileName)}`;
    // A rename changes the file name this answers with, so the saved copy must
    // not come from a cache that still remembers the old one.
    headers["Cache-Control"] = "no-store";
  }

  return new Response(data, { headers });
};

export const config = {
  path: "/api/andi-photo",
};
