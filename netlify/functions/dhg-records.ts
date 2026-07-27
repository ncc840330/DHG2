import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { dhgRecordImages, dhgRecords } from "../../db/schema.js";
import {
  discardBlobs,
  getDhgImageStore,
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

const REQUIRED_FIELDS = [
  "physicalItem",
  "physicalSn",
  "rfid",
  "locator",
  "sourceTaskId",
] as const;

/** Scanned from the system side when it is available, blank when it is not. */
const OPTIONAL_FIELDS = ["systemItem", "systemSn"] as const;

type RecordInput = {
  systemItem: string;
  systemSn: string;
  physicalItem: string;
  physicalSn: string;
  rfid: string;
  problemDescription: ProblemOption;
  problemOther: string | null;
  locator: string;
  sourceTaskId: string;
};

function formString(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function validateRecordInput(form: FormData): RecordInput | null {
  const normalized = {} as Record<
    (typeof REQUIRED_FIELDS)[number] | (typeof OPTIONAL_FIELDS)[number],
    string
  >;

  for (const field of REQUIRED_FIELDS) {
    const value = formString(form, field);
    if (!value) return null;
    normalized[field] = value;
  }

  for (const field of OPTIONAL_FIELDS) {
    normalized[field] = formString(form, field);
  }

  const problemDescription = formString(form, "problemDescription");
  const problemOther = formString(form, "problemOther");

  if (!isProblemOption(problemDescription)) return null;
  if (problemDescription === "Other" && !problemOther) return null;

  return {
    ...normalized,
    problemDescription,
    problemOther: problemDescription === "Other" ? problemOther : null,
  };
}

async function loadImages(recordIds: number[]) {
  if (recordIds.length === 0) return [];

  return db
    .select()
    .from(dhgRecordImages)
    .where(inArray(dhgRecordImages.recordId, recordIds))
    .orderBy(asc(dhgRecordImages.slot));
}

/** Records are sent to the client with their image metadata, never the bytes. */
async function withImages<T extends { id: number }>(records: T[]) {
  const images = await loadImages(records.map((record) => record.id));

  return records.map((record) => ({
    ...record,
    images: images
      .filter((image) => image.recordId === record.id)
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
        .from(dhgRecords)
        .where(eq(dhgRecords.recordDate, date))
        .orderBy(asc(dhgRecords.lineSequence));

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
        date: dhgRecords.recordDate,
        count: sql<number>`count(*)::int`,
      })
      .from(dhgRecords)
      .where(and(gte(dhgRecords.recordDate, from), lte(dhgRecords.recordDate, to)))
      .groupBy(dhgRecords.recordDate)
      .orderBy(dhgRecords.recordDate);

    return Response.json({ counts });
  }

  if (request.method === "POST" || request.method === "PUT") {
    const form = await request.formData().catch(() => null);
    if (!form) return apiError("Expected a multipart form submission.", 400);

    const input = validateRecordInput(form);
    const intents = readSlotIntents(form);
    if (!input || !intents) return apiError("Missing or invalid record data.", 400);

    const store = getDhgImageStore();

    if (request.method === "POST") {
      const recordDate = formString(form, "recordDate");
      if (!isValidDateKey(recordDate)) return apiError("Invalid record date.", 400);

      const uploaded = await uploadImages(store, intents);

      try {
        const record = await db.transaction(async (transaction) => {
          await transaction.execute(
            sql`select pg_advisory_xact_lock(hashtext(${recordDate}))`,
          );

          const usedSequences = await transaction
            .select({ sequence: dhgRecords.lineSequence })
            .from(dhgRecords)
            .where(eq(dhgRecords.recordDate, recordDate))
            .orderBy(asc(dhgRecords.lineSequence));

          const lineSequence = firstFreeSequence(usedSequences);

          const [created] = await transaction
            .insert(dhgRecords)
            .values({
              recordDate,
              lineSequence,
              lineId: makeLineId(recordDate, lineSequence),
              ...input,
            })
            .returning();

          if (uploaded.length > 0) {
            await transaction
              .insert(dhgRecordImages)
              .values(uploaded.map((image) => ({ ...image, recordId: created.id })));
          }

          return created;
        });

        const [withImageMeta] = await withImages([record]);
        return Response.json({ record: withImageMeta }, { status: 201 });
      } catch (error) {
        await discardBlobs(store, uploaded.map((image) => image.blobKey));
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

    const uploaded = await uploadImages(store, intents);

    try {
      const record = await db.transaction(async (transaction) => {
        const [updated] = await transaction
          .update(dhgRecords)
          .set({ ...input, updatedAt: new Date() })
          .where(eq(dhgRecords.id, id))
          .returning();

        if (!updated) return null;

        if (replacedSlots.length > 0) {
          await transaction
            .delete(dhgRecordImages)
            .where(
              and(
                eq(dhgRecordImages.recordId, id),
                inArray(dhgRecordImages.slot, replacedSlots),
              ),
            );
        }

        if (uploaded.length > 0) {
          await transaction
            .insert(dhgRecordImages)
            .values(uploaded.map((image) => ({ ...image, recordId: id })));
        }

        return updated;
      });

      if (!record) {
        await discardBlobs(store, uploaded.map((image) => image.blobKey));
        return apiError("Record not found.", 404);
      }

      await discardBlobs(store, droppedBlobs);
      const [withImageMeta] = await withImages([record]);
      return Response.json({ record: withImageMeta });
    } catch (error) {
      await discardBlobs(store, uploaded.map((image) => image.blobKey));
      throw error;
    }
  }

  if (request.method === "DELETE") {
    const id = parseId(url.searchParams.get("id"));
    if (!id) return apiError("Invalid record id.", 400);

    const images = await loadImages([id]);

    const [record] = await db
      .delete(dhgRecords)
      .where(eq(dhgRecords.id, id))
      .returning({ id: dhgRecords.id });

    if (!record) return apiError("Record not found.", 404);

    await discardBlobs(
      getDhgImageStore(),
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
  path: "/api/dhg-records",
};
