import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { deletionRequestImages, deletionRequests } from "../../db/schema.js";
import { getImageStore } from "./images.js";
import type { Executor } from "./line-ids.js";

export async function loadImages(requestIds: number[], executor: Executor = db) {
  if (requestIds.length === 0) return [];

  return executor
    .select()
    .from(deletionRequestImages)
    .where(inArray(deletionRequestImages.requestId, requestIds))
    .orderBy(asc(deletionRequestImages.slot));
}

export async function discardBlobs(blobKeys: string[]) {
  if (blobKeys.length === 0) return;
  const store = getImageStore();
  await Promise.allSettled(blobKeys.map((blobKey) => store.delete(blobKey)));
}

/** Requests are sent to the client with their image metadata, never the bytes. */
export async function withImages<T extends { id: number }>(records: T[]) {
  const images = await loadImages(records.map((record) => record.id));

  return records.map((record) => ({
    ...record,
    images: images
      .filter((image) => image.requestId === record.id)
      .map(({ id, slot, fileName, contentType, byteSize }) => ({
        id,
        slot,
        fileName,
        contentType,
        byteSize,
      })),
  }));
}

/**
 * Every saved DHG record gets a deletion request carrying the very same Line ID,
 * so the two sheets never disagree about which line a discrepancy belongs to.
 * The request is only seeded here — afterwards it is edited on its own tab, and
 * later DHG edits leave those refinements alone.
 */
export async function seedDeletionRequest(
  executor: Executor,
  record: typeof deletionRequests.$inferInsert,
) {
  await executor
    .insert(deletionRequests)
    .values(record)
    .onConflictDoNothing({ target: deletionRequests.lineId });
}

/** Frees the Line ID on both sheets at once. Returns the orphaned blob keys. */
export async function removeDeletionRequest(executor: Executor, lineId: string) {
  const [request] = await executor
    .select({ id: deletionRequests.id })
    .from(deletionRequests)
    .where(eq(deletionRequests.lineId, lineId));

  if (!request) return [];

  const images = await loadImages([request.id], executor);

  await executor.delete(deletionRequests).where(eq(deletionRequests.id, request.id));

  return images.map((image) => image.blobKey);
}
