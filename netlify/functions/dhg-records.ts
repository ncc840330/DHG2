import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { dhgRecords } from "../../db/schema.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export default async (request: Request) => {
  if (request.method === "GET") {
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (!isValidDateKey(from) || !isValidDateKey(to) || from > to) {
      return Response.json({ error: "Invalid date range." }, { status: 400 });
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

    if (!isValidDateKey(recordDate)) {
      return Response.json({ error: "Invalid record date." }, { status: 400 });
    }

    await db.insert(dhgRecords).values({ recordDate });

    const [summary] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(dhgRecords)
      .where(eq(dhgRecords.recordDate, recordDate));

    return Response.json(
      { date: recordDate, count: summary?.count ?? 1 },
      { status: 201 },
    );
  }

  return new Response("Method not allowed", {
    status: 405,
    headers: { Allow: "GET, POST" },
  });
};

export const config = {
  path: "/api/dhg-records",
};
