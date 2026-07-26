import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { deletionRequestImages } from "../../db/schema.js";
import { getImageStore } from "../shared/images.js";
import { apiError, parseId } from "../shared/records.js";

export default async (request: Request) => {
  if (request.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET" },
    });
  }

  const id = parseId(new URL(request.url).searchParams.get("id"));
  if (!id) return apiError("Invalid image id.", 400);

  const [image] = await db
    .select()
    .from(deletionRequestImages)
    .where(eq(deletionRequestImages.id, id));

  if (!image) return apiError("Image not found.", 404);

  const data = await getImageStore().get(image.blobKey, { type: "arrayBuffer" });
  if (!data) return apiError("Image not found.", 404);

  return new Response(data, {
    headers: {
      "Content-Type": image.contentType,
      "Content-Length": String(image.byteSize),
      // Blob keys are unique per upload, so a stored image never changes.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
};

export const config = {
  path: "/api/deletion-request-image",
};
