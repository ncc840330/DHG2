import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { hwCheckTaskLines, hwCheckUploadTasks } from "../../db/schema.js";
import {
  isSealResult,
  loadTaskDetail,
  MAX_TASK_LINES,
  readRemark,
} from "../shared/hw-check.js";
import { apiError, parseId } from "../shared/records.js";

/**
 * Seal check answers are saved for a whole task at once. A pass or a fail plus a
 * short remark is a few bytes a line, so unlike the photo upload there is nothing
 * to be gained from walking the rows one request at a time — and the checker
 * usually works through a locator before looking up from their phone.
 */

type SealUpdate = { id: number; sealResult: string; remark: string };

function readUpdates(rawLines: unknown) {
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    return { error: "Nothing to save.", status: 400 } as const;
  }
  if (rawLines.length > MAX_TASK_LINES) {
    return { error: `Save at most ${MAX_TASK_LINES} rows at once.`, status: 400 } as const;
  }

  const updates: SealUpdate[] = [];

  for (const rawLine of rawLines) {
    const line = (rawLine ?? {}) as Record<string, unknown>;
    const id = Number(line.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return { error: "Invalid task line id.", status: 400 } as const;
    }

    // An empty result is how a mistaken answer is taken back, so it is allowed;
    // anything that is neither empty nor pass/fail is a stale client.
    const sealResult = typeof line.sealResult === "string" ? line.sealResult : "";
    if (sealResult !== "" && !isSealResult(sealResult)) {
      return { error: "A seal result is either pass or fail.", status: 400 } as const;
    }

    updates.push({ id, sealResult, remark: readRemark(line.remark) });
  }

  return { updates } as const;
}

export default async (request: Request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  const body = (await request.json().catch(() => null)) as {
    taskId?: unknown;
    lines?: unknown;
  } | null;
  if (!body) return apiError("Expected a JSON body.", 400);

  const taskId = parseId(String(body.taskId ?? ""));
  if (!taskId) return apiError("Invalid task id.", 400);

  const selection = readUpdates(body.lines);
  if ("error" in selection) return apiError(selection.error, selection.status);

  const [task] = await db
    .select()
    .from(hwCheckUploadTasks)
    .where(eq(hwCheckUploadTasks.id, taskId));
  if (!task) return apiError("Task not found.", 404);
  if (task.taskType !== "yellow-seal") {
    return apiError("This task is not a yellow seal check.", 400);
  }

  // The line ids come from the browser, so they are matched against the task
  // before anything is written: a stale phone must not answer for another task.
  const owned = await db
    .select({ id: hwCheckTaskLines.id })
    .from(hwCheckTaskLines)
    .where(
      and(
        eq(hwCheckTaskLines.taskId, taskId),
        inArray(
          hwCheckTaskLines.id,
          selection.updates.map((update) => update.id),
        ),
      ),
    );

  const ownedIds = new Set(owned.map((line) => line.id));
  const foreign = selection.updates.filter((update) => !ownedIds.has(update.id));
  if (foreign.length > 0) {
    return apiError("Some rows do not belong to this task.", 400);
  }

  await db.transaction(async (transaction) => {
    for (const update of selection.updates) {
      await transaction
        .update(hwCheckTaskLines)
        .set({ sealResult: update.sealResult, remark: update.remark })
        .where(eq(hwCheckTaskLines.id, update.id));
    }

    // The task list shows when a task was last worked on, which is now.
    await transaction
      .update(hwCheckUploadTasks)
      .set({ updatedAt: new Date() })
      .where(eq(hwCheckUploadTasks.id, taskId));
  });

  return Response.json({ task: await loadTaskDetail(taskId) });
};

export const config = {
  path: "/api/hw-check-task-seals",
};
