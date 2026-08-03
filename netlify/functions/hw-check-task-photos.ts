import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  hwCheckLineImages,
  hwCheckTaskLines,
  hwCheckUploadTasks,
} from "../../db/schema.js";
import { loadTaskProgress, publicTask } from "../shared/hw-check.js";
import {
  discardBlobs,
  getHwCheckImageStore,
  publicImageMeta,
  readSlotIntents,
  uploadImages,
} from "../shared/images.js";
import { apiError, parseId } from "../shared/records.js";

/**
 * Photos are saved one task line at a time. A task can carry hundreds of lines,
 * so the operator's SAVE walks them line by line instead of posting a single
 * request nobody's phone could finish over the warehouse wifi.
 */
export default async (request: Request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  const lineId = parseId(new URL(request.url).searchParams.get("lineId"));
  if (!lineId) return apiError("Invalid task line id.", 400);

  const form = await request.formData().catch(() => null);
  if (!form) return apiError("Expected a multipart form submission.", 400);

  const intents = readSlotIntents(form);
  if (!intents) return apiError("Missing or invalid photo data.", 400);

  const [line] = await db
    .select()
    .from(hwCheckTaskLines)
    .where(eq(hwCheckTaskLines.id, lineId));
  if (!line) return apiError("Task line not found.", 404);

  const existing = await db
    .select()
    .from(hwCheckLineImages)
    .where(eq(hwCheckLineImages.lineId, lineId))
    .orderBy(asc(hwCheckLineImages.slot));

  const replacedSlots = intents
    .filter((intent) => intent.action !== "keep")
    .map((intent) => intent.slot);
  const droppedBlobs = existing
    .filter((image) => replacedSlots.includes(image.slot))
    .map((image) => image.blobKey);

  const store = getHwCheckImageStore();
  const uploaded = await uploadImages(store, intents);

  try {
    const images = await db.transaction(async (transaction) => {
      if (replacedSlots.length > 0) {
        await transaction
          .delete(hwCheckLineImages)
          .where(
            and(
              eq(hwCheckLineImages.lineId, lineId),
              inArray(hwCheckLineImages.slot, replacedSlots),
            ),
          );
      }

      if (uploaded.length > 0) {
        await transaction
          .insert(hwCheckLineImages)
          .values(uploaded.map((image) => ({ ...image, lineId })));
      }

      // The task list shows when a task was last worked on, which is now.
      await transaction
        .update(hwCheckUploadTasks)
        .set({ updatedAt: new Date() })
        .where(eq(hwCheckUploadTasks.id, line.taskId));

      return await transaction
        .select()
        .from(hwCheckLineImages)
        .where(eq(hwCheckLineImages.lineId, lineId))
        .orderBy(asc(hwCheckLineImages.slot));
    });

    await discardBlobs(store, droppedBlobs);

    const [task] = await db
      .select()
      .from(hwCheckUploadTasks)
      .where(eq(hwCheckUploadTasks.id, line.taskId));
    const progress = await loadTaskProgress(task ? [task] : []);

    return Response.json({
      line: { ...line, images: images.map(publicImageMeta) },
      task: task ? publicTask(task, progress) : null,
    });
  } catch (error) {
    await discardBlobs(
      store,
      uploaded.map((image) => image.blobKey),
    );
    throw error;
  }
};

export const config = {
  path: "/api/hw-check-task-photos",
};
