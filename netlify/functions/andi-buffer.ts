import { sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { andiDownloads, andiPhotos } from "../../db/schema.js";
import { discardBlobs, getAndiPhotoStore } from "../shared/images.js";

/**
 * The photo buffer as one thing: how much of it there is, and the one press that
 * empties it.
 *
 * Pictures are imported to be handed straight back out again, so the store is a
 * buffer and not an archive — everything in it has already been downloaded by the
 * time it is in the way. Emptying is therefore all-or-nothing and covers every
 * work day at once: the operator should not have to walk fifteen dates to get
 * their space and their upload allowance back.
 */
export default async (request: Request) => {
  if (request.method === "GET") {
    const [photos] = await db
      .select({
        count: sql<number>`count(*)::int`,
        // Summed as a double rather than an int: a buffer left to grow for a
        // month is allowed to pass the two gigabytes an int4 stops at.
        bytes: sql<number>`coalesce(sum(${andiPhotos.byteSize}), 0)::double precision`,
        oldest: sql<string | null>`min(${andiPhotos.recordDate})::text`,
        newest: sql<string | null>`max(${andiPhotos.recordDate})::text`,
      })
      .from(andiPhotos);

    const [downloads] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(andiDownloads);

    return Response.json({
      buffer: {
        photoCount: photos?.count ?? 0,
        byteSize: photos?.bytes ?? 0,
        oldestDate: photos?.oldest ?? null,
        newestDate: photos?.newest ?? null,
        downloadCount: downloads?.count ?? 0,
      },
    });
  }

  if (request.method === "DELETE") {
    // The rows go first: a row is what makes a blob findable, so a purge that
    // dies halfway leaves bytes without references rather than references
    // without bytes — and the sweep below picks those up next time.
    const removed = await db
      .delete(andiPhotos)
      .returning({ blobKey: andiPhotos.blobKey, byteSize: andiPhotos.byteSize });

    const clearedHistory = await db
      .delete(andiDownloads)
      .returning({ id: andiDownloads.id });

    const store = getAndiPhotoStore();

    // Chunked: a day of shooting is a few hundred blobs, and firing every delete
    // at the store at once is how a function runs out of sockets.
    for (let index = 0; index < removed.length; index += 20) {
      await discardBlobs(
        store,
        removed.slice(index, index + 20).map((photo) => photo.blobKey),
      );
    }

    // The store holds nothing but these pictures, so whatever is left in it after
    // the rows are gone is an orphan from an upload that broke — the point of the
    // press is that the space is actually free afterwards.
    let sweptKeys = 0;
    try {
      const { blobs } = await store.list();
      const keys = blobs.map((blob) => blob.key);
      for (let index = 0; index < keys.length; index += 20) {
        await discardBlobs(store, keys.slice(index, index + 20));
      }
      sweptKeys = keys.length;
    } catch {
      // A store that cannot be listed still had its known blobs deleted above.
    }

    return Response.json({
      cleared: {
        photoCount: removed.length,
        byteSize: removed.reduce((total, photo) => total + photo.byteSize, 0),
        downloadCount: clearedHistory.length,
        orphanCount: sweptKeys,
      },
    });
  }

  return new Response("Method not allowed", {
    status: 405,
    headers: { Allow: "GET, DELETE" },
  });
};

export const config = {
  path: "/api/andi-buffer",
};
