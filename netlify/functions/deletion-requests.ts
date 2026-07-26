import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { deletionRequestImages, deletionRequests } from "../../db/schema.js";
import {
  ALLOWED_IMAGE_TYPES,
  getImageStore,
  MAX_IMAGE_BYTES,
} from "../shared/images.js";
import {
  apiError,
  firstFreeSequence,
  isProblemOption,
  isValidDateKey,
  makeLineId,
  parseId,
  type ProblemOption,
} from "../shared/records.js";

const IMAGE_SLOTS = [1, 2] as const;

type RequestInput = {
  sourceTaskId: string;
  systemItem: string;
  systemSn: string;
  problemDescription: ProblemOption;
  problemOther: string | null;
};

type SlotIntent = {
  slot: number;
  action: "keep" | "empty" | "replace";
  file: File | null;
};

type UploadedImage = {
  slot: number;
  blobKey: string;
  contentType: string;
  fileName: string;
  byteSize: number;
};

function formString(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function validateRequestInput(form: FormData): RequestInput | null {
  const sourceTaskId = formString(form, "sourceTaskId");
  const systemItem = formString(form, "systemItem");
  const systemSn = formString(form, "systemSn");
  const problemDescription = formString(form, "problemDescription");
  const problemOther = formString(form, "problemOther");

  if (!sourceTaskId || !systemItem || !systemSn) return null;
  if (!isProblemOption(problemDescription)) return null;
  if (problemDescription === "Other" && !problemOther) return null;

  return {
    sourceTaskId,
    systemItem,
    systemSn,
    problemDescription,
    problemOther: problemDescription === "Other" ? problemOther : null,
  };
}

/**
 * Each slot carries its own intent so an update can express "leave the stored
 * image alone", "drop it" and "swap it out" without a separate endpoint.
 */
function readSlotIntents(form: FormData): SlotIntent[] | null {
  const intents: SlotIntent[] = [];

  for (const slot of IMAGE_SLOTS) {
    const action = formString(form, `image${slot}Action`) || "empty";
    const file = form.get(`image${slot}`);

    if (action === "keep" || action === "empty") {
      intents.push({ slot, action, file: null });
      continue;
    }

    if (action !== "replace") return null;
    if (!(file instanceof File) || file.size === 0) return null;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return null;
    if (file.size > MAX_IMAGE_BYTES) return null;

    intents.push({ slot, action, file });
  }

  return intents;
}

async function uploadImages(intents: SlotIntent[]): Promise<UploadedImage[]> {
  const store = getImageStore();

  return Promise.all(
    intents
      .filter((intent): intent is SlotIntent & { file: File } => !!intent.file)
      .map(async ({ slot, file }) => {
        const blobKey = `${crypto.randomUUID()}-${slot}`;
        const data = await file.arrayBuffer();
        await store.set(blobKey, data);

        return {
          slot,
          blobKey,
          contentType: file.type,
          fileName: file.name || `image-${slot}`,
          byteSize: data.byteLength,
        };
      }),
  );
}

async function discardBlobs(blobKeys: string[]) {
  if (blobKeys.length === 0) return;
  const store = getImageStore();
  await Promise.allSettled(blobKeys.map((blobKey) => store.delete(blobKey)));
}

async function loadImages(requestIds: number[]) {
  if (requestIds.length === 0) return [];

  return db
    .select()
    .from(deletionRequestImages)
    .where(inArray(deletionRequestImages.requestId, requestIds))
    .orderBy(asc(deletionRequestImages.slot));
}

/** Records are sent to the client with their image metadata, never the bytes. */
async function withImages<T extends { id: number }>(records: T[]) {
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

export default async (request: Request) => {
  const url = new URL(request.url);

  if (request.method === "GET") {
    const date = url.searchParams.get("date");

    if (date) {
      if (!isValidDateKey(date)) return apiError("Invalid record date.", 400);

      const rows = await db
        .select()
        .from(deletionRequests)
        .where(eq(deletionRequests.recordDate, date))
        .orderBy(asc(deletionRequests.lineSequence));

      const nextLineId = makeLineId(
        date,
        firstFreeSequence(rows.map((row) => ({ sequence: row.lineSequence }))),
      );

      return Response.json({ records: await withImages(rows), nextLineId });
    }

    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (!isValidDateKey(from) || !isValidDateKey(to) || from > to) {
      return apiError("Invalid date range.", 400);
    }

    const counts = await db
      .select({
        date: deletionRequests.recordDate,
        count: sql<number>`count(*)::int`,
      })
      .from(deletionRequests)
      .where(
        and(
          gte(deletionRequests.recordDate, from),
          lte(deletionRequests.recordDate, to),
        ),
      )
      .groupBy(deletionRequests.recordDate)
      .orderBy(deletionRequests.recordDate);

    return Response.json({ counts });
  }

  if (request.method === "POST" || request.method === "PUT") {
    const form = await request.formData().catch(() => null);
    if (!form) return apiError("Expected a multipart form submission.", 400);

    const input = validateRequestInput(form);
    const intents = readSlotIntents(form);
    if (!input || !intents) return apiError("Missing or invalid record data.", 400);

    if (request.method === "POST") {
      const recordDate = formString(form, "recordDate");
      if (!isValidDateKey(recordDate)) return apiError("Invalid record date.", 400);

      const uploaded = await uploadImages(intents);

      try {
        const record = await db.transaction(async (transaction) => {
          await transaction.execute(
            sql`select pg_advisory_xact_lock(hashtext(${`deletion:${recordDate}`}))`,
          );

          const usedSequences = await transaction
            .select({ sequence: deletionRequests.lineSequence })
            .from(deletionRequests)
            .where(eq(deletionRequests.recordDate, recordDate))
            .orderBy(asc(deletionRequests.lineSequence));

          const lineSequence = firstFreeSequence(usedSequences);

          const [created] = await transaction
            .insert(deletionRequests)
            .values({
              recordDate,
              lineSequence,
              lineId: makeLineId(recordDate, lineSequence),
              ...input,
            })
            .returning();

          if (uploaded.length > 0) {
            await transaction.insert(deletionRequestImages).values(
              uploaded.map((image) => ({ ...image, requestId: created.id })),
            );
          }

          return created;
        });

        const [withImageMeta] = await withImages([record]);
        return Response.json({ record: withImageMeta }, { status: 201 });
      } catch (error) {
        await discardBlobs(uploaded.map((image) => image.blobKey));
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

    const uploaded = await uploadImages(intents);

    try {
      const record = await db.transaction(async (transaction) => {
        const [updated] = await transaction
          .update(deletionRequests)
          .set({ ...input, updatedAt: new Date() })
          .where(eq(deletionRequests.id, id))
          .returning();

        if (!updated) return null;

        if (replacedSlots.length > 0) {
          await transaction
            .delete(deletionRequestImages)
            .where(
              and(
                eq(deletionRequestImages.requestId, id),
                inArray(deletionRequestImages.slot, replacedSlots),
              ),
            );
        }

        if (uploaded.length > 0) {
          await transaction
            .insert(deletionRequestImages)
            .values(uploaded.map((image) => ({ ...image, requestId: id })));
        }

        return updated;
      });

      if (!record) {
        await discardBlobs(uploaded.map((image) => image.blobKey));
        return apiError("Record not found.", 404);
      }

      await discardBlobs(droppedBlobs);
      const [withImageMeta] = await withImages([record]);
      return Response.json({ record: withImageMeta });
    } catch (error) {
      await discardBlobs(uploaded.map((image) => image.blobKey));
      throw error;
    }
  }

  if (request.method === "DELETE") {
    const id = parseId(url.searchParams.get("id"));
    if (!id) return apiError("Invalid record id.", 400);

    const images = await loadImages([id]);

    const [record] = await db
      .delete(deletionRequests)
      .where(eq(deletionRequests.id, id))
      .returning({ id: deletionRequests.id });

    if (!record) return apiError("Record not found.", 404);

    await discardBlobs(images.map((image) => image.blobKey));
    return new Response(null, { status: 204 });
  }

  return new Response("Method not allowed", {
    status: 405,
    headers: { Allow: "GET, POST, PUT, DELETE" },
  });
};

export const config = {
  path: "/api/deletion-requests",
};
