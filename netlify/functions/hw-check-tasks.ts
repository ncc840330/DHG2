import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  hwCheckLineImages,
  hwCheckTaskLines,
  hwCheckUploadTasks,
} from "../../db/schema.js";
import {
  isActiveTaskType,
  loadTaskDetail,
  loadTaskProgress,
  makeTaskCode,
  publicTask,
  readTaskLines,
  TASK_TYPES,
  type TaskType,
} from "../shared/hw-check.js";
import { discardBlobs, getHwCheckImageStore } from "../shared/images.js";
import {
  apiError,
  firstFreeSequence,
  isValidDateKey,
  newestFirst,
  parseId,
} from "../shared/records.js";

const MAX_FILE_NAME_LENGTH = 160;

/** The code the next import of each live task type will be filed under. */
async function nextTaskCodes(recordDate: string) {
  const rows = await db
    .select({
      taskType: hwCheckUploadTasks.taskType,
      taskSequence: hwCheckUploadTasks.taskSequence,
    })
    .from(hwCheckUploadTasks)
    .where(eq(hwCheckUploadTasks.recordDate, recordDate))
    .orderBy(asc(hwCheckUploadTasks.taskSequence));

  const codes: Record<string, string> = {};

  for (const [taskType, definition] of Object.entries(TASK_TYPES)) {
    if (!definition.isActive) continue;
    const used = rows
      .filter((row) => row.taskType === taskType)
      .map((row) => ({ sequence: row.taskSequence }));
    codes[taskType] = makeTaskCode(
      taskType as TaskType,
      recordDate,
      firstFreeSequence(used),
    );
  }

  return codes;
}

async function createTask(body: {
  recordDate: string;
  taskType: TaskType;
  sourceFileName: string;
  lines: {
    item: string;
    sn: string;
    qty: string;
    warehouseCode: string;
    subinvCode: string;
    locator: string;
  }[];
}) {
  return db.transaction(async (transaction) => {
    // Two operators pressing SEND TASK on the same second would otherwise both
    // read the same free sequence and fight over the task code.
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`hw-check-task:${body.recordDate}:${body.taskType}`}))`,
    );

    const used = await transaction
      .select({ sequence: hwCheckUploadTasks.taskSequence })
      .from(hwCheckUploadTasks)
      .where(
        and(
          eq(hwCheckUploadTasks.recordDate, body.recordDate),
          eq(hwCheckUploadTasks.taskType, body.taskType),
        ),
      )
      .orderBy(asc(hwCheckUploadTasks.taskSequence));

    const taskSequence = firstFreeSequence(used);

    const [task] = await transaction
      .insert(hwCheckUploadTasks)
      .values({
        recordDate: body.recordDate,
        taskType: body.taskType,
        taskSequence,
        taskCode: makeTaskCode(body.taskType, body.recordDate, taskSequence),
        sourceFileName: body.sourceFileName,
      })
      .returning();

    await transaction.insert(hwCheckTaskLines).values(
      body.lines.map((line, index) => ({
        ...line,
        taskId: task.id,
        rowIndex: index + 1,
      })),
    );

    return task;
  });
}

export default async (request: Request) => {
  const url = new URL(request.url);

  if (request.method === "GET") {
    const id = parseId(url.searchParams.get("id"));
    if (id) {
      const task = await loadTaskDetail(id);
      if (!task) return apiError("Task not found.", 404);
      return Response.json({ task });
    }

    const date = url.searchParams.get("date");

    if (date) {
      if (!isValidDateKey(date)) return apiError("Invalid record date.", 400);

      const rows = await db
        .select()
        .from(hwCheckUploadTasks)
        .where(eq(hwCheckUploadTasks.recordDate, date))
        .orderBy(asc(hwCheckUploadTasks.taskSequence));

      const progress = await loadTaskProgress(rows.map((row) => row.id));

      return Response.json({
        tasks: newestFirst(rows).map((task) => publicTask(task, progress)),
        nextTaskCodes: await nextTaskCodes(date),
      });
    }

    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (!isValidDateKey(from) || !isValidDateKey(to) || from > to) {
      return apiError("Invalid date range.", 400);
    }

    const counts = await db
      .select({
        date: hwCheckUploadTasks.recordDate,
        count: sql<number>`count(*)::int`,
      })
      .from(hwCheckUploadTasks)
      .where(
        and(
          gte(hwCheckUploadTasks.recordDate, from),
          lte(hwCheckUploadTasks.recordDate, to),
        ),
      )
      .groupBy(hwCheckUploadTasks.recordDate)
      .orderBy(hwCheckUploadTasks.recordDate);

    return Response.json({ counts });
  }

  if (request.method === "POST") {
    const body = (await request.json().catch(() => null)) as {
      recordDate?: unknown;
      taskType?: unknown;
      fileName?: unknown;
      rows?: unknown;
    } | null;
    if (!body) return apiError("Expected a JSON body.", 400);

    if (!isValidDateKey(body.recordDate)) {
      return apiError("Invalid record date.", 400);
    }
    if (!isActiveTaskType(body.taskType)) {
      return apiError("Pick a task type that is already available.", 400);
    }

    const selection = readTaskLines(body.rows);
    if ("error" in selection) return apiError(selection.error, selection.status);

    const sourceFileName =
      typeof body.fileName === "string"
        ? body.fileName.trim().slice(0, MAX_FILE_NAME_LENGTH)
        : "";
    if (!sourceFileName) return apiError("The imported file has no name.", 400);

    const task = await createTask({
      recordDate: body.recordDate,
      taskType: body.taskType,
      sourceFileName,
      lines: selection.lines,
    });

    const progress = await loadTaskProgress([task.id]);
    return Response.json({ task: publicTask(task, progress) }, { status: 201 });
  }

  if (request.method === "DELETE") {
    const id = parseId(url.searchParams.get("id"));
    if (!id) return apiError("Invalid task id.", 400);

    // Read the blob keys first: the cascade takes the image rows with the task,
    // and an orphaned photo in the store can never be found again.
    const images = await db
      .select({ blobKey: hwCheckLineImages.blobKey })
      .from(hwCheckLineImages)
      .innerJoin(
        hwCheckTaskLines,
        eq(hwCheckTaskLines.id, hwCheckLineImages.lineId),
      )
      .where(eq(hwCheckTaskLines.taskId, id));

    const [task] = await db
      .delete(hwCheckUploadTasks)
      .where(eq(hwCheckUploadTasks.id, id))
      .returning({ id: hwCheckUploadTasks.id });

    if (!task) return apiError("Task not found.", 404);

    await discardBlobs(
      getHwCheckImageStore(),
      images.map((image) => image.blobKey),
    );
    return new Response(null, { status: 204 });
  }

  return new Response("Method not allowed", {
    status: 405,
    headers: { Allow: "GET, POST, DELETE" },
  });
};

export const config = {
  path: "/api/hw-check-tasks",
};
