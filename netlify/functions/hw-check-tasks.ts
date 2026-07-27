import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { hwCheckTaskImages, hwCheckTasks } from "../../db/schema.js";
import {
  discardBlobs,
  getHwCheckImageStore,
  publicImageMeta,
  readSlotIntents,
  uploadImages,
} from "../shared/images.js";
import {
  apiError,
  firstFreeSequence,
  isProblemOption,
  isValidDateKey,
  makeLineId,
  newestFirst,
  parseId,
  type ProblemOption,
} from "../shared/records.js";

type TaskInput = {
  sourceTaskId: string;
  systemItem: string;
  systemSn: string;
  rfid: string;
  locator: string;
  problemDescription: ProblemOption;
  problemOther: string | null;
};

function formString(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function validateTaskInput(form: FormData): TaskInput | null {
  const sourceTaskId = formString(form, "sourceTaskId");
  const systemItem = formString(form, "systemItem");
  const systemSn = formString(form, "systemSn");
  const rfid = formString(form, "rfid");
  const locator = formString(form, "locator");
  const problemDescription = formString(form, "problemDescription");
  const problemOther = formString(form, "problemOther");

  if (!sourceTaskId || !systemItem || !systemSn || !rfid || !locator) return null;
  if (!isProblemOption(problemDescription)) return null;
  if (problemDescription === "Other" && !problemOther) return null;

  return {
    sourceTaskId,
    systemItem,
    systemSn,
    rfid,
    locator,
    problemDescription,
    problemOther: problemDescription === "Other" ? problemOther : null,
  };
}

async function loadImages(taskIds: number[]) {
  if (taskIds.length === 0) return [];

  return db
    .select()
    .from(hwCheckTaskImages)
    .where(inArray(hwCheckTaskImages.taskId, taskIds))
    .orderBy(asc(hwCheckTaskImages.slot));
}

/** Tasks are sent to the client with their image metadata, never the bytes. */
async function withImages<T extends { id: number }>(tasks: T[]) {
  const images = await loadImages(tasks.map((task) => task.id));

  return tasks.map((task) => ({
    ...task,
    images: images
      .filter((image) => image.taskId === task.id)
      .map(publicImageMeta),
  }));
}

export default async (request: Request) => {
  const url = new URL(request.url);

  if (request.method === "GET") {
    const date = url.searchParams.get("date");

    if (date) {
      if (!isValidDateKey(date)) return apiError("Invalid record date.", 400);

      const rows = await db
        .select()
        .from(hwCheckTasks)
        .where(eq(hwCheckTasks.recordDate, date))
        .orderBy(asc(hwCheckTasks.lineSequence));

      const nextLineId = makeLineId(
        date,
        firstFreeSequence(rows.map((row) => ({ sequence: row.lineSequence }))),
      );

      return Response.json({
        records: await withImages(newestFirst(rows)),
        nextLineId,
      });
    }

    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (!isValidDateKey(from) || !isValidDateKey(to) || from > to) {
      return apiError("Invalid date range.", 400);
    }

    const counts = await db
      .select({
        date: hwCheckTasks.recordDate,
        count: sql<number>`count(*)::int`,
      })
      .from(hwCheckTasks)
      .where(
        and(
          gte(hwCheckTasks.recordDate, from),
          lte(hwCheckTasks.recordDate, to),
        ),
      )
      .groupBy(hwCheckTasks.recordDate)
      .orderBy(hwCheckTasks.recordDate);

    return Response.json({ counts });
  }

  if (request.method === "POST" || request.method === "PUT") {
    const form = await request.formData().catch(() => null);
    if (!form) return apiError("Expected a multipart form submission.", 400);

    const input = validateTaskInput(form);
    const intents = readSlotIntents(form);
    if (!input || !intents) return apiError("Missing or invalid record data.", 400);

    if (request.method === "POST") {
      const recordDate = formString(form, "recordDate");
      if (!isValidDateKey(recordDate)) return apiError("Invalid record date.", 400);

      const uploaded = await uploadImages(getHwCheckImageStore(), intents);

      try {
        const record = await db.transaction(async (transaction) => {
          await transaction.execute(
            sql`select pg_advisory_xact_lock(hashtext(${`hw-check:${recordDate}`}))`,
          );

          const usedSequences = await transaction
            .select({ sequence: hwCheckTasks.lineSequence })
            .from(hwCheckTasks)
            .where(eq(hwCheckTasks.recordDate, recordDate))
            .orderBy(asc(hwCheckTasks.lineSequence));

          const lineSequence = firstFreeSequence(usedSequences);

          const [created] = await transaction
            .insert(hwCheckTasks)
            .values({
              recordDate,
              lineSequence,
              lineId: makeLineId(recordDate, lineSequence),
              ...input,
            })
            .returning();

          if (uploaded.length > 0) {
            await transaction.insert(hwCheckTaskImages).values(
              uploaded.map((image) => ({ ...image, taskId: created.id })),
            );
          }

          return created;
        });

        const [withImageMeta] = await withImages([record]);
        return Response.json({ record: withImageMeta }, { status: 201 });
      } catch (error) {
        await discardBlobs(
          getHwCheckImageStore(),
          uploaded.map((image) => image.blobKey),
        );
        throw error;
      }
    }

    const id = parseId(url.searchParams.get("id"));
    if (!id) return apiError("Invalid record id.", 400);

    const existing = await loadImages([id]);
    const replacedSlots = intents
      .filter((intent) => intent.action !== "keep")
      .map((intent) => intent.slot);
    const droppedBlobs = existing
      .filter((image) => replacedSlots.includes(image.slot))
      .map((image) => image.blobKey);

    const uploaded = await uploadImages(getHwCheckImageStore(), intents);

    try {
      const record = await db.transaction(async (transaction) => {
        const [updated] = await transaction
          .update(hwCheckTasks)
          .set({ ...input, updatedAt: new Date() })
          .where(eq(hwCheckTasks.id, id))
          .returning();

        if (!updated) return null;

        if (replacedSlots.length > 0) {
          await transaction
            .delete(hwCheckTaskImages)
            .where(
              and(
                eq(hwCheckTaskImages.taskId, id),
                inArray(hwCheckTaskImages.slot, replacedSlots),
              ),
            );
        }

        if (uploaded.length > 0) {
          await transaction
            .insert(hwCheckTaskImages)
            .values(uploaded.map((image) => ({ ...image, taskId: id })));
        }

        return updated;
      });

      if (!record) {
        await discardBlobs(
          getHwCheckImageStore(),
          uploaded.map((image) => image.blobKey),
        );
        return apiError("Record not found.", 404);
      }

      await discardBlobs(getHwCheckImageStore(), droppedBlobs);
      const [withImageMeta] = await withImages([record]);
      return Response.json({ record: withImageMeta });
    } catch (error) {
      await discardBlobs(
        getHwCheckImageStore(),
        uploaded.map((image) => image.blobKey),
      );
      throw error;
    }
  }

  if (request.method === "DELETE") {
    const id = parseId(url.searchParams.get("id"));
    if (!id) return apiError("Invalid record id.", 400);

    const images = await loadImages([id]);

    const [record] = await db
      .delete(hwCheckTasks)
      .where(eq(hwCheckTasks.id, id))
      .returning({ id: hwCheckTasks.id });

    if (!record) return apiError("Record not found.", 404);

    await discardBlobs(
      getHwCheckImageStore(),
      images.map((image) => image.blobKey),
    );
    return new Response(null, { status: 204 });
  }

  return new Response("Method not allowed", {
    status: 405,
    headers: { Allow: "GET, POST, PUT, DELETE" },
  });
};

export const config = {
  path: "/api/hw-check-tasks",
};
