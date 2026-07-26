import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { dhgRecords } from "../../db/schema.js";
import {
  apiError,
  firstFreeSequence,
  isProblemOption,
  isValidDateKey,
  makeLineId,
  parseId,
  type ProblemOption,
} from "../shared/records.js";

const REQUIRED_FIELDS = [
  "systemItem",
  "systemSn",
  "physicalItem",
  "physicalSn",
  "rfid",
  "locator",
  "county",
  "sourceTaskId",
] as const;

type RecordInput = {
  systemItem: string;
  systemSn: string;
  physicalItem: string;
  physicalSn: string;
  rfid: string;
  problemDescription: ProblemOption;
  problemOther: string | null;
  locator: string;
  county: string;
  sourceTaskId: string;
};

function validateRecordInput(body: unknown): RecordInput | null {
  if (!body || typeof body !== "object") return null;
  const input = body as Record<string, unknown>;
  const normalized = {} as Record<string, string>;

  for (const field of REQUIRED_FIELDS) {
    const value = input[field];
    if (typeof value !== "string" || !value.trim()) return null;
    normalized[field] = value.trim();
  }

  if (!isProblemOption(input.problemDescription)) return null;

  const problemOther =
    typeof input.problemOther === "string" ? input.problemOther.trim() : "";
  if (input.problemDescription === "Other" && !problemOther) return null;

  return {
    systemItem: normalized.systemItem,
    systemSn: normalized.systemSn,
    physicalItem: normalized.physicalItem,
    physicalSn: normalized.physicalSn,
    rfid: normalized.rfid,
    problemDescription: input.problemDescription,
    problemOther: input.problemDescription === "Other" ? problemOther : null,
    locator: normalized.locator,
    county: normalized.county,
    sourceTaskId: normalized.sourceTaskId,
  };
}

export default async (request: Request) => {
  const url = new URL(request.url);

  if (request.method === "GET") {
    const date = url.searchParams.get("date");

    if (date) {
      if (!isValidDateKey(date)) return apiError("Invalid record date.", 400);

      const records = await db
        .select()
        .from(dhgRecords)
        .where(eq(dhgRecords.recordDate, date))
        .orderBy(asc(dhgRecords.lineSequence));

      const nextLineId = makeLineId(
        date,
        firstFreeSequence(records.map((item) => ({ sequence: item.lineSequence }))),
      );

      return Response.json({ records, nextLineId });
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

  if (request.method === "POST") {
    const body = await request.json().catch(() => null);
    const recordDate = body?.recordDate;
    const input = validateRecordInput(body);

    if (!isValidDateKey(recordDate) || !input) {
      return apiError("Missing or invalid record data.", 400);
    }

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

      return created;
    });

    return Response.json({ record }, { status: 201 });
  }

  if (request.method === "PUT") {
    const id = parseId(url.searchParams.get("id"));
    const body = await request.json().catch(() => null);
    const input = validateRecordInput(body);

    if (!id || !input) return apiError("Missing or invalid record data.", 400);

    const [record] = await db
      .update(dhgRecords)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(dhgRecords.id, id))
      .returning();

    if (!record) return apiError("Record not found.", 404);
    return Response.json({ record });
  }

  if (request.method === "DELETE") {
    const id = parseId(url.searchParams.get("id"));
    if (!id) return apiError("Invalid record id.", 400);

    const [record] = await db
      .delete(dhgRecords)
      .where(eq(dhgRecords.id, id))
      .returning({ id: dhgRecords.id });

    if (!record) return apiError("Record not found.", 404);
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
