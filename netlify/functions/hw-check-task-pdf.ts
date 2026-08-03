import { asc, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { hwCheckTaskLines, hwCheckUploadTasks } from "../../db/schema.js";
import { pdfResponse, readSelection } from "../shared/export.js";
import { isTaskComplete, loadTaskProgress } from "../shared/hw-check.js";
import { buildSealSheetPdf } from "../shared/seal-sheet.js";
import { apiError } from "../shared/records.js";

/**
 * A finished yellow seal check leaves the app as the sheet the warehouse prints
 * and signs, so this endpoint hands back a PDF rather than a workbook. It refuses
 * a task that still has boxes nobody has looked at: a half-answered sheet would
 * be filed as though the whole locator had been checked.
 */
export default async (request: Request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  const body = await request.json().catch(() => null);
  const selection = readSelection((body as { ids?: unknown })?.ids);
  if ("error" in selection) return apiError(selection.error, selection.status);

  const tasks = await db
    .select()
    .from(hwCheckUploadTasks)
    .where(inArray(hwCheckUploadTasks.id, selection.ids))
    .orderBy(asc(hwCheckUploadTasks.recordDate), asc(hwCheckUploadTasks.taskCode));

  if (tasks.length === 0) return apiError("No matching tasks found.", 404);

  const wrongType = tasks.filter((task) => task.taskType !== "yellow-seal");
  if (wrongType.length > 0) {
    return apiError("Only a yellow seal check prints as a PDF.", 400);
  }

  const progress = await loadTaskProgress(tasks);
  const unfinished = tasks.filter((task) => {
    const taskProgress = progress.get(task.id);
    return !taskProgress || !isTaskComplete(taskProgress);
  });
  if (unfinished.length > 0) {
    return apiError(
      `${unfinished
        .map((task) => task.taskCode)
        .join(", ")} still has rows without a Pass or a Fail.`,
      409,
    );
  }

  const lines = await db
    .select()
    .from(hwCheckTaskLines)
    .where(
      inArray(
        hwCheckTaskLines.taskId,
        tasks.map((task) => task.id),
      ),
    )
    .orderBy(asc(hwCheckTaskLines.taskId), asc(hwCheckTaskLines.rowIndex));

  const data = buildSealSheetPdf(
    tasks.map((task) => ({
      taskCode: task.taskCode,
      recordDate: task.recordDate,
      checkedBy: task.checkedBy,
      confirmedBy: task.confirmedBy,
      signature: task.signature,
      lines: lines
        .filter((line) => line.taskId === task.id)
        .map((line) => ({
          rowIndex: line.rowIndex,
          subinvCode: line.subinvCode,
          locator: line.locator,
          item: line.item,
          barcode: line.barcode,
          sealResult: line.sealResult,
          remark: line.remark,
        })),
    })),
  );

  // One task is the normal case and is named after itself, so the printed sheet
  // and the task in the app carry the same number.
  const fileName =
    tasks.length === 1
      ? `${tasks[0].taskCode}.pdf`
      : `Yellow_seal_${String(tasks[0].recordDate).slice(0, 10)}.pdf`;

  return pdfResponse({ fileName, data });
};

export const config = {
  path: "/api/hw-check-tasks/pdf",
};
